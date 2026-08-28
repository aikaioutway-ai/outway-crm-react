import { salaryPaymentTotal, salaryRemainingAmount } from './salaryPayment';

describe('salary payments', () => {
  it('calculates the remaining amount without allowing a negative balance', () => {
    expect(salaryRemainingAmount(20_000, 5_000, 8_000)).toBe(7_000);
    expect(salaryRemainingAmount(10_000, 4_000, 8_000)).toBe(0);
  });

  it('adds every selected employee to a bulk payout total', () => {
    expect(salaryPaymentTotal([
      { subjectId: '1', subjectType: 'driver', name: 'Первый', remainingAmount: 5_000 },
      { subjectId: '2', subjectType: 'driver', name: 'Второй', remainingAmount: 7_500 },
      { subjectId: '3', subjectType: 'driver', name: 'Третий', remainingAmount: 0 },
    ])).toBe(12_500);
  });
});
