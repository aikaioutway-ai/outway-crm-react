import { salaryExpensePeriods } from './salaryExpensePeriods';

test('covers both halves of each month September through May', () => {
  const periods = salaryExpensePeriods(2026);
  expect(periods).toHaveLength(18);
  expect(periods[0]).toEqual({ key: '2026-09-1', label: 'Сентябрь 2026 · 1–15' });
  expect(periods[1]).toEqual({ key: '2026-09-2', label: 'Сентябрь 2026 · 16–30' });
  expect(periods[8].key).toBe('2027-01-1');
  expect(periods[17]).toEqual({ key: '2027-05-2', label: 'Май 2027 · 16–31' });
  expect(new Set(periods.map(period => period.key)).size).toBe(18);
});

test('uses leap year length for the second half of February', () => {
  expect(salaryExpensePeriods(2027).find(period => period.key === '2028-02-2')?.label).toBe('Февраль 2028 · 16–29');
});
