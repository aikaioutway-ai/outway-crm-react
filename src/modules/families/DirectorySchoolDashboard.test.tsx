import { computeDirectoryStats } from './DirectorySchoolDashboard';

test('directory counts boarding separately and excludes hidden schools from totals', () => {
  const stats = computeDirectoryStats([
    { branchFilter: 'EDI', status: 'new', transferNumber: null },
    { branchFilter: 'EDI', status: 'new', transferNumber: '1' },
    { branchFilter: 'EDI', status: 'boarded', transferNumber: '1' },
    { branchFilter: 'EDI', status: 'rejected', transferNumber: '1' },
    { branchFilter: 'BJ', status: 'boarded', transferNumber: '2' },
  ]);
  expect(stats.find(s => s.key === 'EDI')).toMatchObject({ applications: 4, newRequests: 1, boarded: 1, rejected: 1 });
  expect(stats.some(s => s.key === 'BJ')).toBe(false);
  expect(stats.reduce((sum, s) => sum + s.applications, 0)).toBe(4);
  expect(computeDirectoryStats([], ['TIS']).map(s => s.key)).toEqual(['TIS']);
});

