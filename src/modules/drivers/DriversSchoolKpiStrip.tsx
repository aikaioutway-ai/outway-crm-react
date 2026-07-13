import React, { useEffect, useMemo, useState } from 'react';
import { Bus, Car, FileWarning, UserCheck, UserX } from 'lucide-react';
import { fetchV2DriversTable, getCachedV2DriversTable, V2DriverTableRow } from '../../services/crmV2Service';
import { SCHOOL_TABS } from '../families/constants';
import { KpiChip, SchoolAvatar } from '../families/ManagerOverview';
import { DRIVER_RESERVE_KEY, isReserveDriver } from './DriversOverview';

interface DriversSchoolKpiStripProps {
  schoolKey: string;
  rightReserveWidth?: number;
}

const COLORS = {
  school: '#626C8B',
  active: 'var(--success)',
  inactive: '#EF7168',
  microbus: '#1D6FA4',
  minivan: '#15803D',
  sedan: '#BA7517',
  documents: '#B45309',
};

function driverMatchesSchool(driver: V2DriverTableRow, schoolKey: string): boolean {
  const school = SCHOOL_TABS.find(item => item.key === schoolKey);
  if (!school) return false;
  return driver.branchCodes.includes(school.key)
    || driver.branchShorts.includes(school.label)
    || driver.branchNames.includes(school.label);
}

export default function DriversSchoolKpiStrip({ schoolKey, rightReserveWidth = 78 }: DriversSchoolKpiStripProps) {
  const [rows, setRows] = useState<V2DriverTableRow[] | null>(() => getCachedV2DriversTable());

  useEffect(() => {
    let cancelled = false;
    fetchV2DriversTable()
      .then(next => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setRows(prev => prev ?? []); });
    return () => { cancelled = true; };
  }, []);

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
        label="Школа"
        value={title}
        color={COLORS.school}
      />
      <KpiChip icon={<UserCheck size={18} color="#fff" />} label="Активные" value={String(stats.activeCount)} color={COLORS.active} />
      <KpiChip icon={<UserX size={18} color="#fff" />} label="Неактивные" value={String(stats.inactiveCount)} color={COLORS.inactive} />
      <KpiChip icon={<Bus size={18} color="#fff" />} label="Микробусы" value={String(stats.microbusCount)} color={COLORS.microbus} />
      <KpiChip icon={<Car size={18} color="#fff" />} label="Минивэны" value={String(stats.minivanCount)} color={COLORS.minivan} />
      <KpiChip icon={<Car size={18} color="#fff" />} label="Седаны" value={String(stats.sedanCount)} color={COLORS.sedan} />
      <KpiChip icon={<FileWarning size={18} color="#fff" />} label="Документы" value={String(stats.incompleteDocumentsCount)} color={COLORS.documents} />
    </div>
  );
}
