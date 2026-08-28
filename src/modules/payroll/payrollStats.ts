import { V2DriverAdvance, V2DriverTableRow, V2PayrollEntry } from '../../services/crmV2Service';
import { Employee } from '../../types';
import { PAYROLL_OFFICE_COLOR, PAYROLL_OFFICE_KEY, PAYROLL_OFFICE_LABEL, TimesheetPayrollSummary } from '../expenses/timesheetTypes';
import { SCHOOL_TABS } from '../families/constants';

export type PayrollMoneySummary = TimesheetPayrollSummary;
export type PayrollApprovalMoneySummary = { pendingAmount: number; approvedAmount: number };

export interface PayrollSchoolStat extends PayrollMoneySummary {
  key: string;
  label: string;
  color: string;
  logo?: string;
  driverCount: number;
  microbusCount: number;
  minivanCount: number;
  transferCount: number;
  noTransferCount: number;
}

export const PAYROLL_SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

export const PAYROLL_COLORS = {
  school: '#626C8B',
  accruedAmount: '#0C7A74',
  advanceAmount: '#B45309',
  salaryAmount: '#1D6FA4',
  paidAmount: '#15803D',
  remainingAmount: '#EF4444',
};

export const EMPTY_PAYROLL_SUMMARY: PayrollMoneySummary = {
  accruedAmount: 0,
  advanceAmount: 0,
  salaryAmount: 0,
  paidAmount: 0,
  remainingAmount: 0,
};

export function payrollTransferNumbers(driver: V2DriverTableRow): string[] {
  return driver.transferNumbers
    .split(',')
    .map(item => item.replace(/[^\d]/g, ''))
    .filter(Boolean);
}

export function payrollDriverMatchesSchool(driver: V2DriverTableRow, schoolKey: string): boolean {
  const tab = SCHOOL_TABS.find(item => item.key === schoolKey);
  if (!tab) return false;
  return driver.branchCodes.some(code => tab.codes.includes(code))
    || driver.branchShorts.some(short => short === tab.key || short === tab.label)
    || driver.branchNames.some(name => tab.branches.includes(name) || name === tab.label);
}

export function payrollSchoolRows(rows: V2DriverTableRow[], schoolKey: string): V2DriverTableRow[] {
  return rows.filter(row => row.status === 'active' && payrollDriverMatchesSchool(row, schoolKey));
}

export function payrollStatFromRows(
  key: string,
  label: string,
  color: string,
  rows: V2DriverTableRow[],
  summary: PayrollMoneySummary = EMPTY_PAYROLL_SUMMARY,
  logo?: string,
): PayrollSchoolStat {
  const transfers = new Set<string>();
  rows.forEach(row => payrollTransferNumbers(row).forEach(number => transfers.add(number)));
  return {
    key,
    label,
    color,
    logo,
    driverCount: rows.length,
    microbusCount: rows.filter(row => row.vehicleType === 'microbus').length,
    minivanCount: rows.filter(row => row.vehicleType === 'minivan').length,
    transferCount: transfers.size,
    noTransferCount: rows.filter(row => row.transferCount === 0).length,
    ...summary,
  };
}

/** Строит реальную сводку по школам из данных, сохранённых в v2_payroll_entries —
 * в отличие от сессионного кэша (заполняется только при заходе в школу), здесь
 * данные видны сразу по всем школам за выбранный период. */
export function buildPayrollSummaryBySchool(
  entries: V2PayrollEntry[],
  advances: V2DriverAdvance[],
  drivers: V2DriverTableRow[],
  employees: Employee[],
): Record<string, PayrollMoneySummary> {
  const advanceByDriver: Record<string, number> = {};
  advances.forEach(advance => {
    advanceByDriver[advance.driverId] = (advanceByDriver[advance.driverId] ?? 0) + advance.amount;
  });

  const driverById = new Map(drivers.map(d => [d.driverId, d]));
  const employeeById = new Map(employees.map(e => [e.id, e]));
  const schoolTabs = SCHOOL_TABS.filter(tab => tab.key !== 'ALL');

  const summary: Record<string, PayrollMoneySummary> = {};
  const addTo = (key: string, accrued: number, advance: number, salary: number, paid: number) => {
    const current = summary[key] ?? EMPTY_PAYROLL_SUMMARY;
    summary[key] = {
      accruedAmount: current.accruedAmount + accrued,
      advanceAmount: current.advanceAmount + advance,
      salaryAmount: current.salaryAmount + salary,
      paidAmount: current.paidAmount + paid,
      remainingAmount: current.remainingAmount + (accrued - paid),
    };
  };

  entries.forEach(entry => {
    const accrued = entry.accruedAmount ?? entry.days * entry.rate;
    if (entry.subjectType === 'driver') {
      const driver = driverById.get(entry.subjectId);
      if (!driver || driver.status !== 'active') return;
      const tab = schoolTabs.find(t => payrollDriverMatchesSchool(driver, t.key));
      if (!tab) return;
      const advanceAmount = advanceByDriver[entry.subjectId] ?? 0;
      addTo(tab.key, accrued, advanceAmount, entry.salaryAmount, advanceAmount + entry.salaryAmount);
    } else {
      const employee = employeeById.get(entry.subjectId);
      if (!employee || employee.status !== 'active' || employee.role === 'driver') return;
      addTo(PAYROLL_OFFICE_KEY, accrued, 0, entry.salaryAmount, entry.salaryAmount);
    }
  });

  return summary;
}

export function buildPayrollApprovalSummaryBySchool(
  entries: V2PayrollEntry[],
  drivers: V2DriverTableRow[],
  employees: Employee[],
): Record<string, PayrollApprovalMoneySummary> {
  const driverById = new Map(drivers.map(driver => [driver.driverId, driver]));
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));
  const schoolTabs = SCHOOL_TABS.filter(tab => tab.key !== 'ALL');
  const summary: Record<string, PayrollApprovalMoneySummary> = {};

  entries.forEach(entry => {
    let schoolKey = '';
    if (entry.subjectType === 'driver') {
      const driver = driverById.get(entry.subjectId);
      if (!driver || driver.status !== 'active') return;
      schoolKey = schoolTabs.find(tab => payrollDriverMatchesSchool(driver, tab.key))?.key ?? '';
    } else {
      const employee = employeeById.get(entry.subjectId);
      if (!employee || employee.status !== 'active' || employee.role === 'driver') return;
      schoolKey = PAYROLL_OFFICE_KEY;
    }
    if (!schoolKey) return;
    const amount = entry.accruedAmount ?? entry.days * entry.rate;
    const current = summary[schoolKey] ?? { pendingAmount: 0, approvedAmount: 0 };
    if (entry.approvalStatus === 'pending') current.pendingAmount += amount;
    if (entry.approvalStatus === 'approved') current.approvedAmount += amount;
    summary[schoolKey] = current;
  });
  return summary;
}

export function computePayrollStats(rows: V2DriverTableRow[], summaryBySchool: Record<string, PayrollMoneySummary> = {}): PayrollSchoolStat[] {
  const schoolStats = SCHOOL_TABS.filter(tab => tab.key !== 'ALL').map((tab, index) => (
    payrollStatFromRows(
      tab.key,
      tab.label,
      PAYROLL_SCHOOL_COLORS[index % PAYROLL_SCHOOL_COLORS.length],
      payrollSchoolRows(rows, tab.key),
      summaryBySchool[tab.key] ?? EMPTY_PAYROLL_SUMMARY,
      tab.logo,
    )
  ));
  return [
    ...schoolStats,
    payrollStatFromRows(
      PAYROLL_OFFICE_KEY,
      PAYROLL_OFFICE_LABEL,
      PAYROLL_OFFICE_COLOR,
      [],
      summaryBySchool[PAYROLL_OFFICE_KEY] ?? EMPTY_PAYROLL_SUMMARY,
    ),
  ];
}
