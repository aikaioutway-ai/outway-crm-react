export interface SalaryPaymentSubject {
  subjectId: string;
  subjectType: 'driver' | 'employee';
  name: string;
  remainingAmount: number;
}

export interface SalaryRecipientOption {
  id: string;
  name: string;
}

export function salaryPaymentTotal(subjects: SalaryPaymentSubject[]): number {
  return subjects.reduce((sum, subject) => sum + Math.max(0, subject.remainingAmount), 0);
}

export function salaryRemainingAmount(accrued: number, advance: number, salaryPaid: number): number {
  return Math.max(0, accrued - advance - salaryPaid);
}
