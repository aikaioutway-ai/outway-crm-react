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

import { countRequestsBySchool } from './NewRequestsDashboard';
test('school counts split new, in work and waiting; rejected and boarded are left out', () => {
  const row = (rowId: string, extra: object) => ({ rowId, branchFilter: 'ABL2', childCreatedAt: '2026-11-08T10:00:00Z', transferNumber: null, status: 'new', transferMark: null, ...extra }) as any;
  const counts = countRequestsBySchool([
    row('a', {}), row('b', { transferMark: 'in_work' }), row('c', { transferMark: 'waiting' }),
    row('d', { status: 'rejected' }), row('e', { status: 'boarded', transferNumber: '3' }),
  ], 'ALL', now);
  expect(counts.get('ABL2')).toEqual({ newRequests: 1, inWork: 1, waiting: 1, overdue: 0 });
});
