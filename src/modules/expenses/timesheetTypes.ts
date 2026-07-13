import type React from 'react';

export type PayrollSchoolTab = 'timesheet' | 'advance' | 'salary';

export const PAYROLL_OFFICE_KEY = 'OFFICE';
export const PAYROLL_OFFICE_LABEL = 'Офис';
export const PAYROLL_OFFICE_COLOR = '#687C54';

export interface TimesheetPayrollSummary {
  accruedAmount: number;
  advanceAmount: number;
  salaryAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

export interface TimesheetPayrollHeaderRenderArgs {
  calculator: React.ReactNode;
}
