import React, { useMemo } from 'react';
import { Bus, Car, Inbox } from 'lucide-react';
import { FamilyListRow } from '../../services/crmV2Service';
import { useLogisticsTable } from '../../hooks/useCrmQueries';
import { SCHOOL_TABS } from './constants';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { isNewUnassignedRow, transferIdentityKey } from './familiesRowHelpers';
import { isInTestTransfer, useTestTransfers } from './testTransfers';
import { rowsForTransferSelection } from './schoolKpiStats';

interface LogisticsSchoolKpiStripProps {
  schoolKey: string;
  /** Фишка трансфера: '' — все, номер, 'empty' — без трансфера, 'rejected' — Х. */
  selectedKey?: string;
  rightReserveWidth?: number;
}

const COLORS = {
  school: 'var(--text-2)',
  newRequests: '#378ADD',
  average: '#2563EB',
  transfers: '#2DD4BF',
  microbus: '#1D6FA4',
  light: '#15803D',
};

// Тестовые трансферы — черновики логиста: в статистику трансферов не входят.
function workRows(rows: FamilyListRow[]): FamilyListRow[] {
  return rows.filter(row => row.status !== 'rejected' && !isInTestTransfer(row));
}

function transferStats(rows: FamilyListRow[]) {
  const transferMap = new Map<string, { vehicleType: string; count: number }>();
  workRows(rows).forEach(row => {
    const key = transferIdentityKey(row);
    if (!key) return;
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

export default function LogisticsSchoolKpiStrip({ schoolKey, rightReserveWidth = 0, selectedKey = '' }: LogisticsSchoolKpiStripProps) {
  const { data: rows } = useLogisticsTable();
  const testMarks = useTestTransfers();

  const school = SCHOOL_TABS.find(item => item.key === schoolKey);
  const stats = useMemo(() => {
    const schoolRows = rowsForTransferSelection((rows ?? []).filter(row => row.branchFilter === schoolKey), selectedKey);
    return {
      newRequests: schoolRows.filter(row => isNewUnassignedRow(row) || isInTestTransfer(row)).length,
      ...transferStats(schoolRows),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- testMarks: пересчёт при смене тестовых отметок
  }, [rows, schoolKey, selectedKey, testMarks]);

  if (!school || !rows) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, flexShrink: 0, padding: '10px 0 0', paddingRight: rightReserveWidth, transition: 'padding-right .18s ease' }}>
      <KpiChip
        icon={<SchoolAvatar logo={school.logo} label={school.label} color={COLORS.school} size={38} radius={11} fontSize={12} />}
        iconBackground="transparent"
        label="Школа"
        value={school.label}
        color={COLORS.school}
      />
      <KpiChip icon={null} label="Новые заявки" value={String(stats.newRequests)} color={COLORS.newRequests} />
      <KpiChip icon={null} label="Средний по МКР" value={stats.microbusAverage.toFixed(1)} color={COLORS.average} />
      <KpiChip icon={null} label="К-во трансферов" value={String(stats.transferCount)} color={COLORS.transfers} />
      <KpiChip icon={null} label="Микробусы" value={String(stats.microbusCount)} color={COLORS.microbus} />
      <KpiChip icon={null} label="Легковые" value={String(stats.lightVehicleCount)} color={COLORS.light} />
    </div>
  );
}
