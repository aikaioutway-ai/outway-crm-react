import { DIRECTORY_COLORS, directoryCountsForSchool } from './DirectorySchoolDashboard';
import { ManagerMode } from './ManagerModeTabs';
import React, { useMemo } from 'react';
import { useBranchStats, useFamiliesTable, usePeriodChargeStats, useSchoolDirectoryStats, useSchoolTransferStats } from '../../hooks/useCrmQueries';
import { managerSchoolKpi, rowsForTransferSelection } from './schoolKpiStats';
import { computeSchoolStatsFromBranches, KPI_COLORS } from './ManagerOverview';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { money } from '../../utils/pricing';
import { isSchoolAllowed } from './constants';
import type { SchoolTier } from './SchoolTierTabs';
import type { VehicleType } from '../../types';
import { matchesVehicleTypes } from './familiesRowHelpers';

interface SchoolKpiStripProps {
  schoolKey: string;
  mode?: ManagerMode;
  rightReserveWidth?: number;
  allowedSchools?: string[];
  schoolTier?: SchoolTier;
  /** Выбранный месяц ('ALL' — за всё время) и фишка трансфера ('' — все). */
  periodKey?: string;
  selectedKey?: string;
  /** Считать только детей в трансферах этих типов машин (пусто — все). */
  vehicleTypes?: readonly VehicleType[];
}

type DirectoryCounts = ReturnType<typeof directoryCountsForSchool>;

/** Справочник по выбранной фишке: номер трансфера — все его дети ездят; «?» — новые; Х — отказ. */
function directoryForSelection(counts: DirectoryCounts, groups: Record<string, { children: number }> | undefined, selectedKey: string): DirectoryCounts {
  if (!selectedKey) return counts;
  const children = groups?.[selectedKey === 'empty' ? 'new' : selectedKey]?.children ?? 0;
  if (selectedKey === 'rejected') return { ...counts, applications: children, newRequests: 0, boarded: 0, rejected: children };
  if (selectedKey === 'new' || selectedKey === 'empty') return { ...counts, applications: children, newRequests: children, boarded: 0, rejected: 0 };
  return { ...counts, applications: children, newRequests: 0, boarded: children, rejected: 0 };
}

export default function SchoolKpiStrip({ mode = 'charges', schoolKey, rightReserveWidth = 0, allowedSchools, schoolTier = '1.0', periodKey = 'ALL', selectedKey = '', vehicleTypes }: SchoolKpiStripProps) {
  const { data: branches } = useBranchStats();
  const directoryQuery = useSchoolDirectoryStats();
  const isDirectory = mode === 'directory';
  // Те же данные, что у полосы трансферов и таблицы: отдельных запросов не добавляется.
  const { data: familyRows } = useFamiliesTable({ enabled: !isDirectory });
  const periodQuery = usePeriodChargeStats(periodKey, { enabled: !isDirectory });
  const { data: transferStats } = useSchoolTransferStats(schoolKey, { enabled: isDirectory });
  const kpi = useMemo(() => {
    if (isDirectory || !familyRows || !periodQuery.data) return null;
    const schoolRows = familyRows.filter(row => row.branchFilter === schoolKey && matchesVehicleTypes(row, vehicleTypes));
    return managerSchoolKpi(rowsForTransferSelection(schoolRows, selectedKey), periodQuery.data);
  }, [isDirectory, familyRows, periodQuery.data, schoolKey, selectedKey, vehicleTypes]);

  const stat = useMemo(() => (
    branches ? computeSchoolStatsFromBranches(branches, schoolTier).find(s => s.key === schoolKey) : undefined
  ), [branches, schoolKey, schoolTier]);

  if (!isSchoolAllowed(schoolKey, allowedSchools, schoolTier) || !stat) return null;

  if (mode === 'directory') {
    const counts = directoryForSelection(directoryCountsForSchool(directoryQuery.data ?? [], schoolKey), transferStats, selectedKey);
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
      <KpiChip icon={null} label="К-во всех детей" value={kpi ? String(kpi.childrenCount) : '…'} color={KPI_COLORS.childrenCount} />
      <KpiChip icon={null} label="Новые заявки" value={kpi ? String(kpi.newRequests) : '…'} color={KPI_COLORS.newRequests} />
      <KpiChip icon={null} label="Начислено" value={kpi ? money(kpi.charged) : '…'} color={KPI_COLORS.charged} />
      <KpiChip icon={null} label="Оплачено" value={kpi ? money(kpi.paid) : '…'} color={KPI_COLORS.paid} />
      <KpiChip icon={null} label="Сумма долга" value={kpi ? money(kpi.debtSum) : '…'} color={KPI_COLORS.debtSum} />
      <KpiChip icon={null} label="Баланс" value={kpi ? kpi.balance.toLocaleString('ru-RU') : '…'} color={KPI_COLORS.balance} />
    </div>
  );
}
