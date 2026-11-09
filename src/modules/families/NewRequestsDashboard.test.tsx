import { requestMatchesDay } from './NewRequestsDashboard';

const now = new Date('2026-11-09T12:00:00+06:00');
test('uses Bishkek calendar days rather than elapsed 24-hour periods', () => {
  expect(requestMatchesDay('2026-11-08T23:59:00+06:00', '2', now)).toBe(true);
  expect(requestMatchesDay('2026-11-09T00:01:00+06:00', '1', now)).toBe(true);
});
test('keeps day 10 separate from older requests and rejects invalid dates', () => {
  expect(requestMatchesDay('2026-10-31T12:00:00+06:00', '10', now)).toBe(true);
  expect(requestMatchesDay('2026-10-31T12:00:00+06:00', '11', now)).toBe(false);
  expect(requestMatchesDay('2026-10-30T12:00:00+06:00', '11', now)).toBe(true);
  expect(requestMatchesDay(null, '1', now)).toBe(false);
  expect(requestMatchesDay('invalid', '1', now)).toBe(false);
  expect(requestMatchesDay('2026-11-10T12:00:00+06:00', '1', now)).toBe(false);
});
