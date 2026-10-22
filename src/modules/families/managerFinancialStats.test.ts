import { managerFinancialStats } from './managerFinancialStats';
import type { FamilyListRow, PeriodChargeStats } from '../../services/crmV2Service';
import type { SchoolStat } from './ManagerOverview';

const stats = [{ key: 'AES', charged: 900, paid: 100, debtSum: 800 }, { key: 'ERU', charged: 700, paid: 200, debtSum: 500 }] as SchoolStat[];
const rows = [
  { rowId: 'a', familyId: 'shared', branchFilter: 'AES', status: 'boarded', transferNumber: '1', childDebtAmount: 800 },
  { rowId: 'b', familyId: 'shared', branchFilter: 'ERU', status: 'boarded', transferNumber: '2', childDebtAmount: 500 },
  { rowId: 'c', familyId: 'other', branchFilter: 'AES', status: 'new', transferNumber: '1' },
  { rowId: 'd', familyId: 'other', branchFilter: 'AES', status: 'new', transferNumber: null },
  { rowId: 'e', familyId: 'other', branchFilter: 'AES', status: 'rejected', transferNumber: '1' },
] as FamilyListRow[];
const charges = [{ childId: 'a', familyId: 'shared', charged: 100, paid: 40, debt: 60 }, { childId: 'b', familyId: 'shared', charged: 0, paid: 0, debt: 0 }] as PeriodChargeStats[];

test('counts children, matches charges by child across schools, and excludes unassigned and refused children from missing charges', () => {
  const [aes, eru] = managerFinancialStats(stats, rows, charges, false);
  expect(aes).toMatchObject({ boarded: 1, charged: 100, paid: 40, debtSum: 60, debtorsCount: 1, uncharged: 1 });
  expect(eru).toMatchObject({ boarded: 1, charged: 0, debtorsCount: 0, uncharged: 0 });
});

test('empty month has zero finances and counts all active assigned children without charges', () => {
  expect(managerFinancialStats(stats, rows, [], false)[0]).toMatchObject({ charged: 0, paid: 0, debtSum: 0, debtorsCount: 0, uncharged: 2 });
});

test('all periods retains aggregate money and uses child debt and charge existence', () => {
  expect(managerFinancialStats(stats, rows, charges, true)[0]).toMatchObject({ charged: 900, debtSum: 800, debtorsCount: 1, uncharged: 1 });
});

test('refused children keep their charges but do not count in school month totals or debtors', () => {
  const refusedCharge = { childId: 'e', familyId: 'other', charged: 6500, paid: 0, debt: 6500 } as PeriodChargeStats;
  const refusedRows = rows.map(row => row.rowId === 'e' ? { ...row, childDebtAmount: 6500 } : row);
  const [aes] = managerFinancialStats(stats, refusedRows, [...charges, refusedCharge], false);
  expect(aes).toMatchObject({ charged: 100, paid: 40, debtSum: 60, debtorsCount: 1 });
  expect(managerFinancialStats(stats, refusedRows, [...charges, refusedCharge], true)[0]).toMatchObject({ debtorsCount: 1 });
});
