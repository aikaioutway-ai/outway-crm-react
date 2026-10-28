import { DIRECTORY_COLORS, directoryCountsForSchool } from './DirectorySchoolDashboard';
import { ManagerMode } from './ManagerModeTabs';
import React, { useMemo } from 'react';
import { useBranchStats, useSchoolDirectoryStats } from '../../hooks/useCrmQueries';
import { computeSchoolStatsFromBranches, KPI_COLORS } from './ManagerOverview';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { money } from '../../utils/pricing';
import { isSchoolAllowed } from './constants';
import type { SchoolTier } from './SchoolTierTabs';

interface SchoolKpiStripProps {
  schoolKey: string;
  mode?: ManagerMode;
  rightReserveWidth?: number;
  allowedSchools?: string[];
  schoolTier?: SchoolTier;
}

export default function SchoolKpiStrip({ mode = 'charges', schoolKey, rightReserveWidth = 0, allowedSchools, schoolTier = '1.0' }: SchoolKpiStripProps) {
  const { data: branches } = useBranchStats();
  const directoryQuery = useSchoolDirectoryStats();

  const stat = useMemo(() => (
    branches ? computeSchoolStatsFromBranches(branches, schoolTier).find(s => s.key === schoolKey) : undefined
  ), [branches, schoolKey, schoolTier]);

  if (!isSchoolAllowed(schoolKey, allowedSchools, schoolTier) || !stat) return null;

  if (mode === 'directory') {
    const counts = directoryCountsForSchool(directoryQuery.data ?? [], schoolKey);
    const metrics = [
      ['applications', 'К-во заявок', counts.applications],
      ['newRequests', 'Новые заявки', counts.newRequests],
      ['boarded', 'Посажены', counts.boarded],
      ['rejected', 'Отказ', counts.rejected],
    ] as const;
    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, paddingRight: rightReserveWidth }}>
      <KpiChip iconBackground="transparent" icon={<SchoolAvatar logo={stat.logo} label={stat.label} color={stat.color} />} label="Школа" value={stat.label} color={stat.color} />
      {metrics.map(([key, label, count]) => <KpiChip key={key} icon={null} label={label} value={String(count)} color={DIRECTORY_COLORS[key]} />)}
    </div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 12, flexShrink: 0, padding: '10px 0 0', paddingRight: rightReserveWidth, transition: 'padding-right .18s ease' }}>
      <KpiChip
        iconBackground="transparent"
        icon={<SchoolAvatar logo={stat.logo} label={stat.label} color={stat.color} size={38} radius={11} fontSize={12} />}
        label="Школа"
        value={stat.label}
        color={stat.color}
      />
      <KpiChip icon={null} label="К-во всех детей" value={String(stat.childrenCount)} color={KPI_COLORS.childrenCount} />
      <KpiChip icon={null} label="Новые заявки" value={String(stat.newRequests)} color={KPI_COLORS.newRequests} />
      <KpiChip icon={null} label="Начислено" value={money(stat.charged)} color={KPI_COLORS.charged} />
      <KpiChip icon={null} label="Оплачено" value={money(stat.paid)} color={KPI_COLORS.paid} />
      <KpiChip icon={null} label="Сумма долга" value={money(stat.debtSum)} color={KPI_COLORS.debtSum} />
      <KpiChip icon={null} label="Баланс" value={stat.balance.toLocaleString('ru-RU')} color={KPI_COLORS.balance} />
    </div>
  );
}
