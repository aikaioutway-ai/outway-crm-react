import { fetchExpenses } from '../../services/expenseService';
import {
  fetchV2DriverAdvancesForPeriod,
  fetchV2DriversTable,
  fetchV2PayrollEntriesForPeriod,
  V2DriverAdvance,
  V2DriverTableRow,
  V2PayrollEntry,
} from '../../services/crmV2Service';
import { fetchAllEmployeeAdvances, fetchEmployees } from '../../services/employeeService';
import { Employee } from '../../types';
import { ExpenseRecord } from './expenseTypes';

// Расходы за период собираются из ручных записей, зарплат, авансов водителей
// и авансов сотрудников. Один источник для полной и мобильной версии, чтобы
// суммы на телефоне совпадали с компьютером.

export function periodBounds(month: number, year: number) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { first, last: `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}` };
}

function payrollPeriodDate(month: number, year: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function systemExpenseRows(
  entries: V2PayrollEntry[],
  advances: V2DriverAdvance[],
  drivers: V2DriverTableRow[],
  employees: Employee[],
): ExpenseRecord[] {
  const driverById = new Map(drivers.map(driver => [driver.driverId, driver]));
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));

  const salaryRows = entries.filter(entry => entry.salaryAmount > 0).map(entry => {
    const person = entry.subjectType === 'driver'
      ? driverById.get(entry.subjectId)?.fullName
      : employeeById.get(entry.subjectId)?.fullName;
    const updatedDate = entry.updatedAt?.slice(0, 10) ?? '';
    const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate)
      ? updatedDate
      : payrollPeriodDate(entry.periodMonth, entry.periodYear);
    return {
      id: `salary-${entry.id}`,
      name: `Зарплата — ${person || 'сотрудник'}`,
      category: entry.subjectType === 'driver' ? 'school' as const : 'office' as const,
      subcategory: 'Зарплата',
      unitPrice: entry.salaryAmount,
      quantity: 1,
      amount: entry.salaryAmount,
      expenseDate,
      paymentMethod: 'cashless' as const,
      comment: `Системная выплата за ${String(entry.periodMonth).padStart(2, '0')}.${entry.periodYear}`,
      createdAt: entry.updatedAt,
      source: 'salary' as const,
    };
  });

  const advanceRows = advances.filter(advance => advance.amount > 0).map(advance => ({
    id: `advance-${advance.id}`,
    name: `Аванс — ${driverById.get(advance.driverId)?.fullName || 'водитель'}`,
    category: 'school' as const,
    subcategory: 'Аванс',
    unitPrice: advance.amount,
    quantity: 1,
    amount: advance.amount,
    expenseDate: advance.date,
    paymentMethod: advance.paymentMethod === 'cash' ? 'cash' as const : 'cashless' as const,
    paymentOrderNumber: advance.paymentOrderNumber,
    comment: advance.comment || 'Системная выплата из раздела «Зарплата»',
    createdAt: advance.createdAt,
    source: 'advance' as const,
  }));

  return [...salaryRows, ...advanceRows];
}

export async function loadExpenseRows(
  bounds: { first: string; last: string },
  periods: { month: number; year: number }[],
  sessionToken?: string,
): Promise<ExpenseRecord[]> {
  const [manualRows, payrollEntries, advances, drivers, employees, employeeAdvances] = await Promise.all([
    fetchExpenses(bounds.first, bounds.last, sessionToken),
    Promise.all(periods.map(period => fetchV2PayrollEntriesForPeriod(period.month, period.year, sessionToken))).then(result => result.flat()),
    Promise.all(periods.map(period => fetchV2DriverAdvancesForPeriod(period.month, period.year))).then(result => result.flat()),
    fetchV2DriversTable(),
    fetchEmployees(),
    fetchAllEmployeeAdvances(),
  ]);
  return [
    ...manualRows.map(row => ({ ...row, source: 'manual' as const })),
    ...systemExpenseRows(payrollEntries, advances, drivers, employees),
    ...employeeAdvances.filter(row => row.date >= bounds.first && row.date <= bounds.last).map(row => ({
      id: `employee-advance-${row.id}`, name: `Аванс — ${employees.find(employee => employee.id === row.employeeId)?.fullName || 'сотрудник'}`,
      category: row.schoolKey && row.schoolKey !== 'OFFICE' ? 'school' as const : 'office' as const, subcategory: 'Аванс',
      unitPrice: row.amount, quantity: 1, amount: row.amount, expenseDate: row.date,
      paymentMethod: row.paymentMethod === 'cash' ? 'cash' as const : 'cashless' as const, paymentOrderNumber: row.paymentOrderNumber,
      comment: `За ${String(row.periodMonth).padStart(2, '0')}.${row.periodYear} · ${row.comment}`, createdAt: row.createdAt, source: 'advance' as const,
    })),
  ].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt));
}
