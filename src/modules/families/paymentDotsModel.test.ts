import { chargeState, paymentDotPeriods } from './paymentDotsModel';

test('dots cover two previous months and the current one, across the new year', () => {
  expect(paymentDotPeriods(new Date(2026, 9, 29))).toEqual([{ month: 8, year: 2026 }, { month: 9, year: 2026 }, { month: 10, year: 2026 }]);
  expect(paymentDotPeriods(new Date(2027, 0, 5))).toEqual([{ month: 11, year: 2026 }, { month: 12, year: 2026 }, { month: 1, year: 2027 }]);
});

test('charge status maps to dot colour; cancelled counts as no charge', () => {
  expect(chargeState('paid')).toBe('paid');
  expect(chargeState('overpaid')).toBe('paid');
  expect(chargeState('partial')).toBe('partial');
  expect(chargeState('unpaid')).toBe('unpaid');
  expect(chargeState('cancelled')).toBe('none');
});
