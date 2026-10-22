import React, { useMemo } from 'react';
import { Bus, Car, FileWarning, UserCheck, UserX } from 'lucide-react';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { SCHOOL_TABS } from '../families/constants';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { DRIVER_RESERVE_KEY, isReserveDriver } from './DriversOverview';
import { driverMatchesSchool } from './driverSchoolVisibility';

interface DriversSchoolKpiStripProps {
  schoolKey: string;
  rightReserveWidth?: number;
}

const COLORS = {
  school: 'var(--text-2)',
  active: 'var(--success)',
  inactive: '#EF7168',
  microbus: '#1D6FA4',
  minivan: '#15803D',
  sedan: '#2563EB',
  documents: '#B45309',
};


export default function DriversSchoolKpiStrip({ schoolKey, rightReserveWidth = 0 }: DriversSchoolKpiStripProps) {
  const { data: rows = null } = useDriversTable();

  const school = SCHOOL_TABS.find(item => item.key === schoolKey);
  const isReserve = schoolKey === DRIVER_RESERVE_KEY;
  const title = isReserve ? 'Резерв' : school?.label ?? 'Школа';
  const logo = isReserve ? undefined : school?.logo;

  const stats = useMemo(() => {
    const sourceRows = rows ?? [];
    const schoolRows = sourceRows.filter(row => (
      isReserve
        ? isReserveDriver(row)
        : !isReserveDriver(row) && driverMatchesSchool(row, schoolKey)
    ));
    return {
      activeCount: schoolRows.filter(row => row.status === 'active').length,
      inactiveCount: schoolRows.filter(row => row.status !== 'active').length,
      microbusCount: schoolRows.filter(row => row.vehicleType === 'microbus').length,
      minivanCount: schoolRows.filter(row => row.vehicleType === 'minivan').length,
      sedanCount: schoolRows.filter(row => row.vehicleType === 'sedan').length,
      incompleteDocumentsCount: schoolRows.filter(row => row.hasIncompleteDocuments).length,
    };
  }, [isReserve, rows, schoolKey]);

  if ((!school && !isReserve) || rows === null) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 12, flexShrink: 0, padding: '10px 0 0', paddingRight: rightReserveWidth, transition: 'padding-right .18s ease' }}>
      <KpiChip
        icon={<SchoolAvatar logo={logo} label={title} color={COLORS.school} size={38} radius={11} fontSize={12} />}
        iconBackground="transparent"
        label="Школа"
        value={title}
        color={COLORS.school}
      />
      <KpiChip icon={null} label="Активные" value={String(stats.activeCount)} color={COLORS.active} />
      <KpiChip icon={null} label="Неактивные" value={String(stats.inactiveCount)} color={COLORS.inactive} />
      <KpiChip icon={null} label="Микробусы" value={String(stats.microbusCount)} color={COLORS.microbus} />
      <KpiChip icon={null} label="Минивэны" value={String(stats.minivanCount)} color={COLORS.minivan} />
      <KpiChip icon={null} label="Седаны" value={String(stats.sedanCount)} color={COLORS.sedan} />
      <KpiChip icon={null} label="Документы" value={String(stats.incompleteDocumentsCount)} color={COLORS.documents} />
    </div>
  );
}
