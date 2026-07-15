import React from 'react';
import { FamilyListRow } from '../../services/crmV2Service';
import { useFamiliesTable } from '../../hooks/useCrmQueries';

interface SchoolTransferDashboardProps {
  schoolKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

const TRANSFER_COUNT = 15;

const STATUS_CELL_TONE: Record<string, string> = {
  new: '#31A4A5',
  rejected: '#64748B',
  all: '#2DD4BF',
};

function uniqueByFamily(rows: FamilyListRow[]): FamilyListRow[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (seen.has(row.familyId)) return false;
    seen.add(row.familyId);
    return true;
  });
}

function debtSumOf(rows: FamilyListRow[]): number {
  return uniqueByFamily(rows).reduce((sum, row) => sum + Math.max(0, row.debtAmount), 0);
}

function compactMoney(value: number): string {
  const amount = Math.round(value);
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}м`;
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 1000)}к`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}к`;
  return amount.toLocaleString('ru-RU');
}

export default function SchoolTransferDashboard({ schoolKey, rightReserveWidth = 78, selectedKey = '', onSelect }: SchoolTransferDashboardProps) {
  const { data: rows } = useFamiliesTable(false);

  if (!rows) return null;

  const allSchoolRows = rows.filter(r => r.branchFilter === schoolKey);
  const schoolRows = allSchoolRows.filter(r => r.status !== 'rejected');

  const transferCells = Array.from({ length: TRANSFER_COUNT }, (_, i) => {
    const number = String(i + 1);
    return {
      filterKey: number,
      label: `#${number}`,
      debtSum: debtSumOf(schoolRows.filter(r => r.transferNumber === number)),
      tone: null as string | null,
    };
  });

  const statusCells = [
    { filterKey: 'new', label: '?', debtSum: debtSumOf(allSchoolRows.filter(r => r.status === 'new')), tone: STATUS_CELL_TONE.new },
    { filterKey: 'rejected', label: '×', debtSum: debtSumOf(allSchoolRows.filter(r => r.status === 'rejected')), tone: STATUS_CELL_TONE.rejected },
    { filterKey: '', label: '≡', debtSum: debtSumOf(allSchoolRows), tone: STATUS_CELL_TONE.all },
  ];

  const cells = [...transferCells, ...statusCells];

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
        const active = cell.debtSum > 0;
        const isSelected = selectedKey === cell.filterKey;
        const activeColor = cell.tone ?? '#2DD4BF';
        return (
          <button
            key={cell.filterKey || 'all'}
            onClick={() => onSelect?.(isSelected ? '' : cell.filterKey)}
            title={active ? `Долг: ${cell.debtSum.toLocaleString('ru-RU')} сом` : undefined}
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
            <span style={{
              fontSize: 13,
              fontWeight: 800,
              color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}>
              {active ? compactMoney(cell.debtSum) : ''}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2' }}>
              {cell.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
