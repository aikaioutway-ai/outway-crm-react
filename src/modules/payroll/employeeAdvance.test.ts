import { buildPayrollSummaryBySchool } from './payrollStats';
import { PAYROLL_OFFICE_KEY } from '../expenses/timesheetTypes';
import type { V2PayrollEntry } from '../../services/crmV2Service';
import type { Employee } from '../../types';
import type { EmployeeAdvance } from '../../services/employeeService';

test('employee advance reduces salary balance in assigned month, not payment month', () => {
  const entry = { subjectId: 'employee', subjectType: 'employee', periodMonth: 9, periodYear: 2026, accruedAmount: 30000, salaryAmount: 5000 } as V2PayrollEntry;
  const employee = { id: 'employee', status: 'active', role: 'manager' } as Employee;
  const advance = { employeeId: 'employee', periodMonth: 9, periodYear: 2026, date: '2026-08-30', amount: 10000 } as EmployeeAdvance;
  const summary = buildPayrollSummaryBySchool([entry], [], [], [employee], [advance])[PAYROLL_OFFICE_KEY];
  expect(summary.advanceAmount).toBe(10000);
  expect(summary.paidAmount).toBe(15000);
  expect(summary.remainingAmount).toBe(15000);
  const otherMonth = buildPayrollSummaryBySchool([{ ...entry, periodMonth: 8 }], [], [], [employee], [advance])[PAYROLL_OFFICE_KEY];
  expect(otherMonth.advanceAmount).toBe(0);
  expect(otherMonth.remainingAmount).toBe(25000);
});
