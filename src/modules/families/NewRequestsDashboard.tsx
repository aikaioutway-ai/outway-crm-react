import { requestStage, isRequestOnBoard, isRequestOverdue } from './requestWorkflow';
import React, { useMemo, useState } from 'react';
import type { FamilyListRow } from '../../services/crmV2Service';
import SchoolDashboardTable from './SchoolDashboardTable';

export const REQUEST_DAY_PERIODS = Array.from({ length: 11 }, (_, index) => ({
  key: String(index + 1), month: index + 1, year: 0, label: index === 10 ? '10+' : String(index + 1),
}));

export function requestMatchesDay(createdAt: string | null, day: string, now = new Date()): boolean {
  if (day === 'ALL') return true;
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime()) || created > now) return false;
  const calendarDay = (date: Date) => Date.parse(`${date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bishkek', year: 'numeric', month: '2-digit', day: '2-digit' })}T00:00:00Z`);
  const age = Math.round((calendarDay(now) - calendarDay(created)) / 86400000) + 1;
  return day === '11' ? age > 10 : age === Number(day);
}

type CountKey = 'newRequests' | 'inWork' | 'waiting' | 'overdue';
const STAGE_COUNT_KEY = { new: 'newRequests', in_work: 'inWork', waiting: 'waiting' } as const;

/** Сколько у каждой школы заявок «—», «!», «?» и сколько из них красных (отказы на доске не считаем). */
export function countRequestsBySchool(rows: FamilyListRow[], day: string, now = new Date()): Map<string, Record<CountKey, number>> {
  const counts = new Map<string, Record<CountKey, number>>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.rowId) || row.rowId.endsWith('_empty') || !isRequestOnBoard(row) || !requestMatchesDay(row.childCreatedAt, day, now)) continue;
    seen.add(row.rowId);
    const stage = requestStage(row);
    if (stage === 'rejected') continue;
    const count = counts.get(row.branchFilter) ?? { newRequests: 0, inWork: 0, waiting: 0, overdue: 0 };
    count[STAGE_COUNT_KEY[stage]]++;
    if (isRequestOverdue(row, now.getTime())) count.overdue++;
    counts.set(row.branchFilter, count);
  }
  return counts;
}

export default function NewRequestsDashboard({ rows, schools, day, onSelectSchool, splitView }: {
  splitView?: boolean;
  rows: FamilyListRow[]; schools: { key: string; label: string; color: string; logo?: string }[]; day: string; onSelectSchool: (key: string) => void;
}) {
  const [sort, setSort] = useState<{ key: string; ascending: boolean }>({ key: 'newRequests', ascending: false });
  const stats = useMemo(() => {
    const counts = countRequestsBySchool(rows, day);
    return schools.map(school => ({ ...school, values: counts.get(school.key) ?? { newRequests: 0, inWork: 0, waiting: 0, overdue: 0 } }));
  }, [rows, schools, day]);
  const sorted = [...stats].sort((a, b) => {
    const comparison = sort.key === 'school' ? a.label.localeCompare(b.label) : a.values[sort.key as CountKey] - b.values[sort.key as CountKey];
    return sort.ascending ? comparison : -comparison;
  });
  const total = (key: CountKey) => stats.reduce((sum, row) => sum + row.values[key], 0);
  return <SchoolDashboardTable splitView={splitView} commentScope="families/ManagerOverview:requests" commentContext={day}
    columns={[
      { key: 'school', label: 'Школа', total: schools.length, color: '#64748B' },
      { key: 'newRequests', label: splitView ? 'Новые' : 'Новые (—)', total: total('newRequests'), color: '#378ADD' },
      { key: 'inWork', label: splitView ? 'В работе' : 'В работе (!)', total: total('inWork'), color: '#2563EB' },
      { key: 'waiting', label: splitView ? 'Ожидание' : 'Ожидание (?)', total: total('waiting'), color: '#B45309' },
      { key: 'overdue', label: 'Просрочено', total: total('overdue'), color: '#DC2626' },
    ].filter(column => !splitView || column.key === 'newRequests' || column.key === 'inWork')} rows={sorted} sortKey={sort.key} ascending={sort.ascending}
    onSort={key => setSort(previous => ({ key, ascending: previous.key === key ? !previous.ascending : key === 'school' }))}
    onSelect={onSelectSchool} />;
}
