import type { SummaryBranchForecast, SummaryWorkingDays } from '../../services/summaryService';
import type { FamilyListRow, PeriodChargeStats } from '../../services/crmV2Service';
import { getBranchFilter, SCHOOL_DIRECTORY } from '../families/constants';
import { isInTestTransfer } from '../families/testTransfers';

// Прогноз считается только по микроавтобусам (решение владельца 2026-10-28).
export const COGS_PER_MICROBUS_DAY = 4000;
export const REVENUE_TAX_RATE = 0.04;
export const DEFAULT_WORKING_DAYS = 20;
export const WORKING_DAYS_OPTIONS = Array.from({ length: 11 }, (_, index) => 14 + index);

export interface SummarySchoolRow {
  key: string;
  label: string;
  logo?: string;
  microbusCount: number;
  revenue: number;
  cogs: number;
  revenueTax: number;
  grossProfit: number;
}

export function workingDaysFor(list: SummaryWorkingDays[] | undefined, year: number, month: number): number {
  return list?.find(item => item.year === year && item.month === month)?.days ?? DEFAULT_WORKING_DAYS;
}

/** Филиалы складываются в строку школы так же, как на экранах менеджера (getBranchFilter). */
export function computeSummaryRows(branches: SummaryBranchForecast[], workingDays: number): SummarySchoolRow[] {
  const bySchool = new Map<string, { label: string; logo?: string; revenue: number; microbusCount: number }>();
  branches.forEach(branch => {
    const key = getBranchFilter(branch.branchName, branch.branchCode);
    const school = SCHOOL_DIRECTORY.find(item => item.key === key);
    const current = bySchool.get(key) ?? { label: school?.label ?? branch.branchName, logo: school?.logo, revenue: 0, microbusCount: 0 };
    current.revenue += branch.revenue;
    current.microbusCount += branch.microbusCount;
    bySchool.set(key, current);
  });
  return Array.from(bySchool, ([key, school]) => {
    const cogs = school.microbusCount * COGS_PER_MICROBUS_DAY * workingDays;
    const revenueTax = Math.round(school.revenue * REVENUE_TAX_RATE);
    return {
      key,
      label: school.label,
      logo: school.logo,
      microbusCount: school.microbusCount,
      revenue: school.revenue,
      cogs,
      revenueTax,
      grossProfit: school.revenue - cogs - revenueTax,
    };
  });
}

export function sumSummaryRows(rows: SummarySchoolRow[]) {
  return rows.reduce((acc, row) => ({
    microbusCount: acc.microbusCount + row.microbusCount,
    revenue: acc.revenue + row.revenue,
    cogs: acc.cogs + row.cogs,
    revenueTax: acc.revenueTax + row.revenueTax,
    grossProfit: acc.grossProfit + row.grossProfit,
  }), { microbusCount: 0, revenue: 0, cogs: 0, revenueTax: 0, grossProfit: 0 });
}

// ─── 2.0: минивэны и седаны ──────────────────────────────────────────────────
// Ставок водителям за минивэн и седан пока нет, поэтому COGS, оплата водителю,
// остаток и Gross Profit не считаются. Revenue — начисления за месяц детям,
// которые сидят в минивэнах и седанах (без отказников и тестовых трансферов).
export const LIGHT_VEHICLE_TYPES: readonly string[] = ['minivan', 'sedan'];

export interface LightChildRow {
  childId: string;
  familyId: string;
  childName: string;
  parentName: string;
  transferNumber: string;
  charged: number;
  tax: number;
}

export function isLightTransferChild(row: FamilyListRow): boolean {
  return Boolean(row.transferNumber) && row.status !== 'rejected' && !isInTestTransfer(row) && LIGHT_VEHICLE_TYPES.includes(row.vehicleType);
}

export function chargedByChild(charges: PeriodChargeStats[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  (charges ?? []).forEach(item => {
    if (item.childId) map.set(item.childId, (map.get(item.childId) ?? 0) + item.charged);
  });
  return map;
}

export function lightSchoolChildren(rows: FamilyListRow[], schoolKey: string, charged: Map<string, number>): LightChildRow[] {
  return rows
    .filter(row => row.branchFilter === schoolKey && isLightTransferChild(row))
    .map(row => {
      const amount = charged.get(row.rowId) ?? 0;
      return {
        childId: row.rowId,
        familyId: row.familyId,
        childName: row.childName,
        parentName: row.parentName,
        transferNumber: row.transferNumber ?? '',
        charged: amount,
        tax: Math.round(amount * REVENUE_TAX_RATE),
      };
    })
    .sort((a, b) => Number(a.transferNumber) - Number(b.transferNumber) || a.childName.localeCompare(b.childName, 'ru'));
}

export function lightRevenueBySchool(rows: FamilyListRow[], charged: Map<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach(row => {
    if (!row.branchFilter || !isLightTransferChild(row)) return;
    map.set(row.branchFilter, (map.get(row.branchFilter) ?? 0) + (charged.get(row.rowId) ?? 0));
  });
  return map;
}
