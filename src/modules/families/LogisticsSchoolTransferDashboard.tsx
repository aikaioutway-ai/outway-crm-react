import React, { useEffect, useMemo, useState } from 'react';
import { fetchV2FamiliesTableCached, getCachedV2FamiliesTable, FamilyListRow } from '../../services/crmV2Service';

interface LogisticsSchoolTransferDashboardProps {
  schoolKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

const TRANSFER_COUNT = 15;

export const VEHICLE_COLOR: Record<string, string> = {
  microbus: '#2DD4BF',
  minivan: '#10B981',
  sedan: '#687C54',
};

function vehicleShort(vehicleType?: string): string {
  if (vehicleType === 'microbus') return 'МКР';
  if (vehicleType === 'minivan') return 'MINI';
  if (vehicleType === 'sedan') return 'CAR';
  return '';
}

export default function LogisticsSchoolTransferDashboard({ schoolKey, rightReserveWidth = 78, selectedKey = '', onSelect }: LogisticsSchoolTransferDashboardProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(() => getCachedV2FamiliesTable());

  useEffect(() => {
    fetchV2FamiliesTableCached()
      .then(setRows)
      .catch(() => setRows(prev => prev ?? []));
  }, []);

  const allSchoolRows = useMemo(() => (
    (rows ?? []).filter(row => row.branchFilter === schoolKey)
  ), [rows, schoolKey]);
  const schoolRows = useMemo(() => allSchoolRows.filter(row => row.status !== 'rejected'), [allSchoolRows]);

  if (rows === null) return null;

  const transferCells = Array.from({ length: TRANSFER_COUNT }, (_, i) => {
    const number = String(i + 1);
    const transferRows = schoolRows.filter(row => row.transferNumber === number);
    return {
      filterKey: number,
      label: `#${number}`,
      count: transferRows.length,
      vehicleType: transferRows.find(row => row.vehicleType === 'microbus')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'sedan')?.vehicleType,
    };
  });

  const noTransferCount = schoolRows.filter(row => !row.transferNumber).length;
  const rejectedCount = allSchoolRows.filter(row => row.status === 'rejected').length;
  const cells = [
    ...transferCells,
    { filterKey: 'empty', label: '—', count: noTransferCount, vehicleType: '' },
    { filterKey: 'rejected', label: '×', count: rejectedCount, vehicleType: '', color: '#64748B' },
    { filterKey: '', label: '≡', count: schoolRows.length, vehicleType: '' },
  ];

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      flexShrink: 0,
      padding: '10px 0 0',
      paddingRight: rightReserveWidth,
      transition: 'padding-right .18s ease',
    }}>
      {cells.map(cell => {
        const active = cell.count > 0;
        const isSelected = selectedKey === cell.filterKey;
        const activeColor = 'color' in cell && cell.color
          ? cell.color
          : cell.vehicleType
            ? (VEHICLE_COLOR[cell.vehicleType] ?? '#2DD4BF')
            : '#2DD4BF';
        return (
          <button
            key={cell.filterKey || 'all'}
            onClick={() => onSelect?.(isSelected ? '' : cell.filterKey)}
            title={active ? `Учеников: ${cell.count}` : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '8px 4px',
              borderRadius: 12,
              background: isSelected
                ? activeColor
                : active
                  ? '#fff'
                  : 'repeating-linear-gradient(-45deg, #F5FAFB 0, #F5FAFB 6px, #E7EFF2 6px, #E7EFF2 8px)',
              border: `1px solid ${isSelected || active ? activeColor : '#E1E8EA'}`,
              boxShadow: isSelected ? `0 0 10px ${activeColor}99` : 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2' }}>
              {active ? cell.count : ''}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2' }}>
              {cell.label}{cell.vehicleType ? ` ${vehicleShort(cell.vehicleType)}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
