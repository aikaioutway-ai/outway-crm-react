import { computeSummaryRows, DEFAULT_WORKING_DAYS, sumSummaryRows, workingDaysFor } from './summaryForecast';
import { canAccessSection, getAllowedSections, MARKET_OWNER_EMPLOYEE_ID } from '../../core/bars/Sidebar';

test('forecast: COGS = microbuses × 4000 × days, tax 4%, gross profit', () => {
  const rows = computeSummaryRows([
    { branchId: '1', branchCode: 'TIS', branchName: 'Тенсай', revenue: 1_000_000, microbusCount: 10 },
  ], 20);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ key: 'TIS', revenue: 1_000_000, cogs: 800_000, revenueTax: 40_000, grossProfit: 160_000 });
});

test('forecast: branches of one school are summed, no charges means zero revenue', () => {
  const rows = computeSummaryRows([
    { branchId: '1', branchCode: 'GEN2', branchName: 'Гениум Чуйкова', revenue: 0, microbusCount: 2 },
    { branchId: '2', branchCode: 'GEN2', branchName: 'Гениум Чуйкова', revenue: 0, microbusCount: 1 },
  ], 14);
  const totals = sumSummaryRows(rows);
  expect(totals.revenue).toBe(0);
  expect(totals.cogs).toBe(3 * 4000 * 14);
  expect(totals.grossProfit).toBe(-(3 * 4000 * 14));
});

test('working days default to 20 when the month is not set', () => {
  expect(workingDaysFor([], 2026, 11)).toBe(DEFAULT_WORKING_DAYS);
  expect(workingDaysFor([{ year: 2026, month: 11, days: 18 }], 2026, 11)).toBe(18);
});

test('Summary is visible only to the owner and the general director', () => {
  expect(canAccessSection('admin', 'summary', MARKET_OWNER_EMPLOYEE_ID)).toBe(true);
  expect(canAccessSection('gen_director', 'summary', 'general-director')).toBe(true);
  expect(canAccessSection('admin', 'summary', 'another-admin')).toBe(false);
  expect(getAllowedSections('director', 'director')).not.toContain('summary');
  expect(getAllowedSections('cashier', 'cashier')).not.toContain('summary');
  expect(getAllowedSections('manager', 'manager')).not.toContain('summary');
});
