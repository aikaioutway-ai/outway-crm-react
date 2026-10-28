import React, { useMemo, useState } from 'react';
import { SchoolDirectoryBranchStat } from '../../services/crmV2Service';
import { getBranchFilter, isSchoolAllowed, schoolTabsForTier } from './constants';
import type { SchoolTier } from './SchoolTierTabs';
import SchoolDashboardTable from './SchoolDashboardTable';

/** Цифры по школе = сумма цифр её филиалов (та же группировка getBranchFilter, что у вкладок). */
export function directoryCountsForSchool(branches: SchoolDirectoryBranchStat[], schoolKey: string) {
  return branches
    .filter(branch => getBranchFilter(branch.branchName, branch.branchCode) === schoolKey)
    .reduce((acc, branch) => ({
      applications: acc.applications + branch.applications,
      newRequests: acc.newRequests + branch.newRequests,
      boarded: acc.boarded + branch.boarded,
      rejected: acc.rejected + branch.rejected,
    }), { applications: 0, newRequests: 0, boarded: 0, rejected: 0 });
}

export function computeDirectoryStats(branches: SchoolDirectoryBranchStat[], allowedSchools?: string[], tier: SchoolTier = '1.0') {
  return schoolTabsForTier(tier).filter(s => s.key !== 'ALL' && isSchoolAllowed(s.key, allowedSchools, tier)).map(school => ({
    ...school,
    ...directoryCountsForSchool(branches, school.key),
  }));
}

export const DIRECTORY_COLORS = { label: '#64748B', applications: '#7C3AED', newRequests: '#2563EB', boarded: '#059669', rejected: '#DC2626' };

const columns = [
  ['label', 'Школа'], ['applications', 'К-во заявок'], ['newRequests', 'Новые заявки'], ['boarded', 'Посажены'], ['rejected', 'Отказ'],
] as const;
type SortKey = typeof columns[number][0];

export default function DirectorySchoolDashboard({ branches, allowedSchools, schoolTier = '1.0', onSelectSchool }: { branches: SchoolDirectoryBranchStat[]; allowedSchools?: string[]; schoolTier?: SchoolTier; onSelectSchool: (key: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'label', asc: true });
  const stats = useMemo(() => computeDirectoryStats(branches, allowedSchools, schoolTier), [branches, allowedSchools, schoolTier]);
  const sorted = [...stats].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key];
    const comparison = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
    return sort.asc ? comparison : -comparison;
  });
  return <SchoolDashboardTable commentScope="families/DirectorySchoolDashboard:overview"
    columns={columns.map(([key, label]) => ({ key, label, color: DIRECTORY_COLORS[key], total: key === 'label' ? stats.length : stats.reduce((sum, school) => sum + school[key], 0) }))}
    rows={sorted.map(school => ({ key: school.key, label: school.label, logo: school.logo, values: { applications: school.applications, newRequests: school.newRequests, boarded: school.boarded, rejected: school.rejected } }))}
    sortKey={sort.key}
    ascending={sort.asc}
    onSort={key => setSort({ key: key as SortKey, asc: sort.key === key ? !sort.asc : key === 'label' })}
    onSelect={onSelectSchool}
  />;
}
