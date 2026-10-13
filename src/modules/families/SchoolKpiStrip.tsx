import { DIRECTORY_COLORS } from './DirectorySchoolDashboard';
import { ManagerMode } from './ManagerModeTabs';
import React, { useMemo } from 'react';
import { useBranchStats, useFamiliesTable } from '../../hooks/useCrmQueries';
import { computeSchoolStatsFromBranches, KPI_COLORS } from './ManagerOverview';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { money } from '../../utils/pricing';
import { isSchoolAllowed } from './constants';

interface SchoolKpiStripProps {
  schoolKey: string;
  mode?: ManagerMode;
  rightReserveWidth?: number;
  allowedSchools?: string[];
}

export default function SchoolKpiStrip({ mode = 'charges', schoolKey, rightReserveWidth = 0, allowedSchools }: SchoolKpiStripProps) {
  const { data: branches } = useBranchStats();
  const { data: rows } = useFamiliesTable();

  const stat = useMemo(() => (
    branches ? computeSchoolStatsFromBranches(branches).find(s => s.key === schoolKey) : undefined
  ), [branches, schoolKey]);

  if (!isSchoolAllowed(schoolKey, allowedSchools) || !stat) return null;

  if (mode === 'directory') {
    const children = (rows ?? []).filter(row => row.branchFilter === schoolKey);
    const metrics = [
      ['applications', 'К-во заявок', children.length],
      ['newRequests', 'Новые заявки', children.filter(row => row.status === 'new' && !row.transferNumber).length],
      ['boarded', 'Посажены', children.filter(row => row.status === 'boarded').length],
      ['rejected', 'Отказ', children.filter(row => row.status === 'rejected').length],
      ['unboarded', 'В трансфере, не посажены', children.filter(row => !!row.transferNumber && row.status !== 'boarded' && row.status !== 'rejected').length],
    ] as const;
    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, paddingRight: rightReserveWidth }}>
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
