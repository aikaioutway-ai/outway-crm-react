import { canViewEmployeePayroll } from './payrollVisibility';
import { buildPayrollSummaryBySchool } from './payrollStats';
import { PAYROLL_OFFICE_KEY } from '../expenses/timesheetTypes';
import type { Employee } from '../../types';
import type { V2PayrollEntry } from '../../services/crmV2Service';

describe('payroll visibility', () => {
  test.each(['director', 'senior_logist'] as const)(
    '%s cannot see director or senior logist payroll',
    viewerRole => {
      expect(canViewEmployeePayroll(viewerRole, 'director')).toBe(false);
      expect(canViewEmployeePayroll(viewerRole, 'senior_logist')).toBe(false);
      expect(canViewEmployeePayroll(viewerRole, 'manager')).toBe(true);
      expect(canViewEmployeePayroll(viewerRole, 'logist')).toBe(true);
    },
  );

  test.each(['admin', 'gen_director', 'cashier'] as const)(
    '%s keeps full payroll visibility',
    viewerRole => {
      expect(canViewEmployeePayroll(viewerRole, 'director')).toBe(true);
      expect(canViewEmployeePayroll(viewerRole, 'senior_logist')).toBe(true);
    },
  );

  test('restricted office salaries are excluded from payroll totals', () => {
    const employees = [
      { id: 'manager-1', role: 'manager', status: 'active' },
      { id: 'director-1', role: 'director', status: 'active' },
      { id: 'senior-logist-1', role: 'senior_logist', status: 'active' },
    ] as Employee[];
    const entries = employees.map((employee, index) => ({
      subjectId: employee.id,
      subjectType: 'employee',
      periodMonth: 9,
      periodYear: 2026,
      days: 1,
      rate: (index + 1) * 10_000,
      accruedAmount: (index + 1) * 10_000,
      salaryAmount: 0,
    })) as V2PayrollEntry[];

    const restricted = buildPayrollSummaryBySchool(entries, [], [], employees, [], 'director');
    const unrestricted = buildPayrollSummaryBySchool(entries, [], [], employees, [], 'admin');

    expect(restricted[PAYROLL_OFFICE_KEY].accruedAmount).toBe(10_000);
    expect(unrestricted[PAYROLL_OFFICE_KEY].accruedAmount).toBe(60_000);
  });
});
