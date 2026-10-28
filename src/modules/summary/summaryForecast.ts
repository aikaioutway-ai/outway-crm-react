import type { SummaryBranchForecast, SummaryWorkingDays } from '../../services/summaryService';
import { getBranchFilter, SCHOOL_DIRECTORY } from '../families/constants';

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
