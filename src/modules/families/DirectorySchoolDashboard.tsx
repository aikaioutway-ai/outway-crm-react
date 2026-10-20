import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchChargesForPeriod, FamilyListRow } from '../../services/crmV2Service';
import { SCHOOL_TABS, SCHOOL_TIER_2_KEYS, isSchoolAllowed } from './constants';
import SchoolDashboardTable from './SchoolDashboardTable';

/** Дети, у которых есть начисление за текущий месяц (Бишкек). Пока данные грузятся — undefined. */
export function useCurrentMonthChargedChildIds(): Set<string> | undefined {
  const [year, month] = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bishkek' }).split('-').map(Number);
  const { data } = useQuery({
    queryKey: ['current-month-charged-children', year, month],
    queryFn: async () => {
      const stats = await fetchChargesForPeriod(month, year, null);
      return new Set(stats.filter(item => item.childId && item.charged > 0).map(item => item.childId));
    },
  });
  return data;
}

/** «В трансфере, не посажены»: ребёнок в трансфере (не отказ), но без начисления за текущий месяц.
 * Пока начисления не загружены, считаем по статусу. */
export function isInTransferWithoutCharge(row: Pick<FamilyListRow, 'rowId' | 'status' | 'transferNumber'>, chargedChildIds?: Set<string>): boolean {
  if (!row.transferNumber || row.status === 'rejected') return false;
  return chargedChildIds ? !chargedChildIds.has(row.rowId) : row.status !== 'boarded';
}

export function computeDirectoryStats(rows: Pick<FamilyListRow, 'rowId' | 'branchFilter' | 'status' | 'transferNumber'>[], allowedSchools?: string[], chargedChildIds?: Set<string>) {
  return SCHOOL_TABS.filter(s => s.key !== 'ALL' && !SCHOOL_TIER_2_KEYS.includes(s.key) && isSchoolAllowed(s.key, allowedSchools)).map(school => {
    const children = rows.filter(row => row.branchFilter === school.key);
    return { ...school, applications: children.length, newRequests: children.filter(row => row.status === 'new' && !row.transferNumber).length, boarded: children.filter(row => row.status === 'boarded').length, rejected: children.filter(row => row.status === 'rejected').length, unboarded: children.filter(row => isInTransferWithoutCharge(row, chargedChildIds)).length };
  });
}

export const DIRECTORY_COLORS = { label: '#64748B', applications: '#7C3AED', newRequests: '#2563EB', boarded: '#059669', rejected: '#DC2626', unboarded: '#D97706' };

const columns = [
  ['label', 'Школа'], ['applications', 'К-во заявок'], ['newRequests', 'Новые заявки'], ['boarded', 'Посажены'], ['rejected', 'Отказ'], ['unboarded', 'В трансфере, не посажены'],
] as const;
type SortKey = typeof columns[number][0];

export default function DirectorySchoolDashboard({ rows, allowedSchools, onSelectSchool }: { rows: FamilyListRow[]; allowedSchools?: string[]; onSelectSchool: (key: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'label', asc: true });
  const chargedChildIds = useCurrentMonthChargedChildIds();
  const stats = useMemo(() => computeDirectoryStats(rows, allowedSchools, chargedChildIds), [rows, allowedSchools, chargedChildIds]);
  const sorted = [...stats].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    const comparison = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
    return sort.asc ? comparison : -comparison;
  });
  return <SchoolDashboardTable
    columns={columns.map(([key, label]) => ({ key, label, color: DIRECTORY_COLORS[key], total: key === 'label' ? stats.length : stats.reduce((sum, school) => sum + school[key], 0) }))}
    rows={sorted.map(school => ({ key: school.key, label: school.label, logo: school.logo, values: { applications: school.applications, newRequests: school.newRequests, boarded: school.boarded, rejected: school.rejected, unboarded: school.unboarded } }))}
    sortKey={sort.key}
    ascending={sort.asc}
    onSort={key => setSort({ key: key as SortKey, asc: sort.key === key ? !sort.asc : key === 'label' })}
    onSelect={onSelectSchool}
  />;
}
