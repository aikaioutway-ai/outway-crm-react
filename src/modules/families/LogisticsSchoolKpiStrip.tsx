import React, { useMemo } from 'react';
import { Bus, Car, Inbox } from 'lucide-react';
import { FamilyListRow } from '../../services/crmV2Service';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { SCHOOL_TABS } from './constants';
import { KpiChip, SchoolAvatar } from './ManagerOverview';

interface LogisticsSchoolKpiStripProps {
  schoolKey: string;
  rightReserveWidth?: number;
}

const COLORS = {
  school: '#626C8B',
  newRequests: '#378ADD',
  average: '#BA7517',
  transfers: '#2DD4BF',
  microbus: '#1D6FA4',
  light: '#15803D',
};

function workRows(rows: FamilyListRow[]): FamilyListRow[] {
  return rows.filter(row => row.status !== 'rejected');
}

function transferStats(rows: FamilyListRow[]) {
  const transferMap = new Map<string, { vehicleType: string; count: number }>();
  workRows(rows).forEach(row => {
    if (!row.transferNumber) return;
    const branchKey = row.branchId ?? row.branchFilter ?? row.branchShort ?? row.branchName ?? 'school';
    const key = `${branchKey}:${row.transferNumber}`;
    const prev = transferMap.get(key);
    transferMap.set(key, {
      vehicleType: prev?.vehicleType ?? row.vehicleType,
      count: (prev?.count ?? 0) + 1,
    });
  });

  const transfers = Array.from(transferMap.values());
  const microbusTransfers = transfers.filter(item => item.vehicleType === 'microbus');
  const microbusStudents = microbusTransfers.reduce((sum, item) => sum + item.count, 0);
  return {
    transferCount: transfers.length,
    microbusAverage: microbusTransfers.length ? microbusStudents / microbusTransfers.length : 0,
    microbusCount: microbusTransfers.length,
    lightVehicleCount: transfers.filter(item => item.vehicleType === 'minivan' || item.vehicleType === 'sedan').length,
  };
}

export default function LogisticsSchoolKpiStrip({ schoolKey, rightReserveWidth = 78 }: LogisticsSchoolKpiStripProps) {
  const { data: rows } = useFamiliesTable(false);

  const school = SCHOOL_TABS.find(item => item.key === schoolKey);
  const stats = useMemo(() => {
    const schoolRows = (rows ?? []).filter(row => row.branchFilter === schoolKey);
    return {
      newRequests: schoolRows.filter(row => row.status === 'new').length,
      ...transferStats(schoolRows),
    };
  }, [rows, schoolKey]);

  if (!school || !rows) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, flexShrink: 0, padding: '10px 0 0', paddingRight: rightReserveWidth, transition: 'padding-right .18s ease' }}>
      <KpiChip
        icon={<SchoolAvatar logo={school.logo} label={school.label} color={COLORS.school} size={38} radius={11} fontSize={12} />}
        label="Школа"
        value={school.label}
        color={COLORS.school}
      />
      <KpiChip icon={<Inbox size={18} color="#fff" />} label="Новые заявки" value={String(stats.newRequests)} color={COLORS.newRequests} />
      <KpiChip icon={<Bus size={18} color="#fff" />} label="Средний по МКР" value={stats.microbusAverage.toFixed(1)} color={COLORS.average} />
      <KpiChip icon={<Bus size={18} color="#fff" />} label="К-во трансферов" value={String(stats.transferCount)} color={COLORS.transfers} />
      <KpiChip icon={<Bus size={18} color="#fff" />} label="Микробусы" value={String(stats.microbusCount)} color={COLORS.microbus} />
      <KpiChip icon={<Car size={18} color="#fff" />} label="Легковые" value={String(stats.lightVehicleCount)} color={COLORS.light} />
    </div>
  );
}
