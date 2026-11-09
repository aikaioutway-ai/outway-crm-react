import { requestStage, isRequestOnBoard } from './requestWorkflow';
import React, { useMemo, useState } from 'react';
import type { FamilyListRow } from '../../services/crmV2Service';
import type { SchoolStat } from './ManagerOverview';
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

export default function NewRequestsDashboard({ rows, schools, day, onSelectSchool }: {
  rows: FamilyListRow[]; schools: SchoolStat[]; day: string; onSelectSchool: (key: string) => void;
}) {
  const [sort, setSort] = useState({ key: 'newRequests', ascending: false });
  const stats = useMemo(() => {
    const counts = new Map<string, { newRequests: number; inWork: number }>();
    const seen = new Set<string>();
    const now = new Date();
    for (const row of rows) {
      if (seen.has(row.rowId) || !requestMatchesDay(row.childCreatedAt, day, now)) continue;
      seen.add(row.rowId);
      const count = counts.get(row.branchFilter) ?? { newRequests: 0, inWork: 0 };
      if (isRequestOnBoard(row) && requestStage(row) === 'new') count.newRequests++;
      if (isRequestOnBoard(row) && requestStage(row) === 'in_work') count.inWork++;
      counts.set(row.branchFilter, count);
    }
    return schools.map(school => ({ ...school, values: counts.get(school.key) ?? { newRequests: 0, inWork: 0 } }));
  }, [rows, schools, day]);
  const sorted = [...stats].sort((a, b) => {
    const comparison = sort.key === 'school' ? a.label.localeCompare(b.label) : a.values[sort.key as 'newRequests' | 'inWork'] - b.values[sort.key as 'newRequests' | 'inWork'];
    return sort.ascending ? comparison : -comparison;
  });
  return <SchoolDashboardTable commentScope="families/ManagerOverview:requests" commentContext={day}
    columns={[
      { key: 'school', label: 'Школа', total: schools.length, color: '#64748B' },
      { key: 'newRequests', label: 'К-во новых заявок', total: stats.reduce((sum, row) => sum + row.values.newRequests, 0), color: '#378ADD' },
      { key: 'inWork', label: 'В работе', total: stats.reduce((sum, row) => sum + row.values.inWork, 0), color: '#B45309' },
    ]} rows={sorted} sortKey={sort.key} ascending={sort.ascending}
    onSort={key => setSort(previous => ({ key, ascending: previous.key === key ? !previous.ascending : key === 'school' }))}
    onSelect={onSelectSchool} />;
}
