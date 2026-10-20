import { computeDirectoryStats } from './DirectorySchoolDashboard';

test('directory counts boarding separately and excludes hidden schools from totals', () => {
  const stats = computeDirectoryStats([
    { rowId: 'a', branchFilter: 'EDI', status: 'new', transferNumber: null },
    { rowId: 'b', branchFilter: 'EDI', status: 'new', transferNumber: '1' },
    { rowId: 'c', branchFilter: 'EDI', status: 'boarded', transferNumber: '1' },
    { rowId: 'd', branchFilter: 'EDI', status: 'rejected', transferNumber: '1' },
    { rowId: 'e', branchFilter: 'BJ', status: 'boarded', transferNumber: '2' },
  ]);
  expect(stats.find(s => s.key === 'EDI')).toMatchObject({ applications: 4, newRequests: 1, boarded: 1, rejected: 1, unboarded: 1 });
  expect(stats.some(s => s.key === 'BJ')).toBe(false);
  expect(stats.reduce((sum, s) => sum + s.applications, 0)).toBe(4);
  expect(computeDirectoryStats([], ['TIS']).map(s => s.key)).toEqual(['TIS']);
});

test('«в трансфере, не посажены» — в трансфере, но без начисления за текущий месяц', () => {
  const rows = [
    { rowId: 'charged', branchFilter: 'EDI', status: 'boarded', transferNumber: '1' },
    { rowId: 'boarded-no-charge', branchFilter: 'EDI', status: 'boarded', transferNumber: '1' },
    { rowId: 'new-no-charge', branchFilter: 'EDI', status: 'new', transferNumber: '2' },
    { rowId: 'rejected', branchFilter: 'EDI', status: 'rejected', transferNumber: '2' },
    { rowId: 'no-transfer', branchFilter: 'EDI', status: 'new', transferNumber: null },
  ];
  const stats = computeDirectoryStats(rows, undefined, new Set(['charged']));
  expect(stats.find(s => s.key === 'EDI')?.unboarded).toBe(2);
});
