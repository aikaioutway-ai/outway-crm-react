import { computeDirectoryStats } from './DirectorySchoolDashboard';

const branch = (branchCode: string, branchName: string, counts: { applications: number; newRequests: number; boarded: number; rejected: number }) => ({
  branchId: branchCode, branchCode, branchShort: branchCode, branchName, ...counts,
});

test('directory counts boarding separately and excludes hidden schools from totals', () => {
  const stats = computeDirectoryStats([
    branch('EDI', 'Edison', { applications: 4, newRequests: 1, boarded: 1, rejected: 1 }),
    branch('BJ', 'Билим Жолу', { applications: 1, newRequests: 0, boarded: 1, rejected: 0 }),
  ]);
  expect(stats.find(s => s.key === 'EDI')).toMatchObject({ applications: 4, newRequests: 1, boarded: 1, rejected: 1 });
  expect(stats.some(s => s.key === 'BJ')).toBe(false);
  expect(stats.reduce((sum, s) => sum + s.applications, 0)).toBe(4);
  expect(computeDirectoryStats([], ['TIS']).map(s => s.key)).toEqual(['TIS']);
});

