// Просроченные новые заявки — то же правило, что в канбане CRM
// (src/modules/families/requestWorkflow.ts): больше 2 дней в «Новых» (от даты заявки),
// 3 в «В работе» и 5 в «Ожидании» (от переноса). Только школы сводки — уровень 1.0.
import { SCHOOL_TABS } from './schools.ts';

const DAY = 86400000;
const OVERDUE_DAYS: Record<string, number> = { new: 2, in_work: 3, waiting: 5 };
// Зеркало SCHOOL_TIER_2_KEYS из src/modules/families/constants.ts.
const TIER_2_KEYS = new Set(['BJ', 'LA_P', 'ING_W']);

export function branchSchool(raw: any): { key: string; label: string } | null {
  const branch = Array.isArray(raw) ? raw[0] : raw;
  if (!branch) return null;
  const tab = SCHOOL_TABS.find(row => row.key !== 'ALL' && (row.key === branch.short_name || row.label === branch.short_name || row.branches.includes(branch.name)))
    ?? SCHOOL_TABS.find(row => row.key !== 'ALL' && row.codes.includes(branch.code) && !row.branches.length)
    ?? SCHOOL_TABS.find(row => row.key !== 'ALL' && row.codes.includes(branch.code));
  return tab ? { key: tab.key, label: tab.label } : null;
}

export function isOverdue(row: { transfer_mark: string | null; transfer_mark_at: string | null; transfer_comment_at: string | null; created_at: string | null }, now: number): boolean {
  const stage = row.transfer_mark === 'in_work' ? 'in_work' : row.transfer_mark === 'waiting' ? 'waiting' : 'new';
  const since = Date.parse((stage === 'new' ? row.created_at : row.transfer_mark_at ?? row.transfer_comment_at ?? row.created_at) ?? '');
  return Number.isFinite(since) && now - since > OVERDUE_DAYS[stage] * DAY;
}

/** Сколько просроченных заявок по школам сводки: [{ key, label, count, new, inWork, waiting }] по убыванию. */
export type SchoolOverdue = { key: string; label: string; count: number; new: number; inWork: number; waiting: number };
export function overdueBySchool(rows: any[], now: number): SchoolOverdue[] {
  const counts = new Map<string, SchoolOverdue>();
  for (const row of rows) {
    const school = branchSchool(row.v2_school_branches);
    if (!school || TIER_2_KEYS.has(school.key) || !isOverdue(row, now)) continue;
    const current = counts.get(school.key) ?? { key: school.key, label: school.label, count: 0, new: 0, inWork: 0, waiting: 0 };
    current.count++;
    if (row.transfer_mark === 'in_work') current.inWork++;
    else if (row.transfer_mark === 'waiting') current.waiting++;
    else current.new++;
    counts.set(school.key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}
