import { paymentQuarter } from './paymentQuarter';

test.each([
  ['2026-10', 1, ['2026-09', '2026-10', '2026-11']],
  ['2026-12', 2, ['2026-12', '2027-01', '2027-02']],
  ['2027-01', 2, ['2026-12', '2027-01', '2027-02']],
  ['2027-02', 2, ['2026-12', '2027-01', '2027-02']],
  ['2027-04', 3, ['2027-03', '2027-04', '2027-05']],
  ['2027-08', 4, ['2027-06', '2027-07', '2027-08']],
])('%s uses the correct three-month page', (month, number, months) => {
  expect(paymentQuarter(month)).toEqual({ number, months });
});
