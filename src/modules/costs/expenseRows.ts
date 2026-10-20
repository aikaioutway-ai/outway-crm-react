import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { SCHOOL_TABS } from '../families/constants';
import { fetchExpenses } from '../../services/expenseService';
import {
  fetchV2DriverAdvancesForPeriod,
  fetchV2DriversTable,
  V2DriverAdvance,
  V2DriverTableRow,
} from '../../services/crmV2Service';
import { fetchAllEmployeeAdvances, fetchEmployees } from '../../services/employeeService';
import { ExpenseRecord } from './expenseTypes';

// Расходы за период собираются из ручных записей, зарплат, авансов водителей
// и авансов сотрудников. Один источник для полной и мобильной версии, чтобы
// суммы на телефоне совпадали с компьютером.

export function periodBounds(month: number, year: number) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { first, last: `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}` };
}

function systemExpenseRows(
  advances: V2DriverAdvance[],
  drivers: V2DriverTableRow[],
): ExpenseRecord[] {
  const driverById = new Map(drivers.map(driver => [driver.driverId, driver]));
  const advanceRows = advances.filter(advance => advance.amount > 0).map(advance => ({
    salaryPeriodKey: advance.salaryPeriodKey,
    recipientType: 'driver' as const,
    id: `advance-${advance.id}`,
    schoolKey: advance.schoolKey || (() => {
      const driver = driverById.get(advance.driverId);
      const schools = SCHOOL_TABS.filter(school => school.key !== 'ALL' && school.codes.some(code => driver?.branchCodes.includes(code)));
      return schools.length === 1 ? schools[0].key : undefined;
    })(),
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

  return advanceRows;
}

export async function loadExpenseRows(
  bounds: { first: string; last: string },
  periods: { month: number; year: number }[],
  sessionToken?: string,
): Promise<ExpenseRecord[]> {
  const [manualRows, advances, drivers, employees, employeeAdvances] = await Promise.all([
    fetchExpenses(bounds.first, bounds.last, sessionToken),
    Promise.all(periods.map(period => fetchV2DriverAdvancesForPeriod(period.month, period.year))).then(result => result.flat()),
    fetchV2DriversTable(),
    fetchEmployees(),
    fetchAllEmployeeAdvances(),
  ]);
  return [
    ...manualRows.map(row => ({ ...row, source: 'manual' as const })),
    ...systemExpenseRows(advances, drivers),
    ...employeeAdvances.filter(row => row.date >= bounds.first && row.date <= bounds.last).map(row => ({
      departmentKey: EMPLOYEE_DEPARTMENTS.find(department => department.roles.includes(employees.find(employee => employee.id === row.employeeId)?.role ?? ''))?.key,
      salaryPeriodKey: row.salaryPeriodKey,
      recipientType: 'employee' as const, schoolKey: row.schoolKey, id: `employee-advance-${row.id}`, name: `Аванс — ${employees.find(employee => employee.id === row.employeeId)?.fullName || 'сотрудник'}`,
      category: row.schoolKey && row.schoolKey !== 'OFFICE' ? 'school' as const : 'office' as const, subcategory: 'Аванс',
      unitPrice: row.amount, quantity: 1, amount: row.amount, expenseDate: row.date,
      paymentMethod: row.paymentMethod === 'cash' ? 'cash' as const : 'cashless' as const, paymentOrderNumber: row.paymentOrderNumber,
      comment: `За ${String(row.periodMonth).padStart(2, '0')}.${row.periodYear} · ${row.comment}`, createdAt: row.createdAt, source: 'advance' as const,
    })),
  ].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt));
}
