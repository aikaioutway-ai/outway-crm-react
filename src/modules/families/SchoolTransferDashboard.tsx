import TransferBarPages, { transferCellCount } from '../../core/dashboard/TransferBarPages';
import React from 'react';
import { FamilyListRow } from '../../services/crmV2Service';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed } from './constants';
import { isNewUnassignedRow } from './familiesRowHelpers';

interface SchoolTransferDashboardProps {
  schoolKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  allowedSchools?: string[];
}


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

function childCountOf(rows: FamilyListRow[]): number {
  return rows.length;
}

export default function SchoolTransferDashboard({ schoolKey, rightReserveWidth = 0, selectedKey = '', onSelect, allowedSchools }: SchoolTransferDashboardProps) {
  const { data: rows } = useFamiliesTable();

  if (!isSchoolAllowed(schoolKey, allowedSchools) || !rows) return null;

  const allSchoolRows = rows.filter(r => r.branchFilter === schoolKey);
  const schoolRows = allSchoolRows.filter(r => r.status !== 'rejected');

  const transferCells = Array.from({ length: transferCellCount(schoolRows.map(row => row.transferNumber), selectedKey) }, (_, i) => {
    const number = String(i + 1);
    const assignedRows = schoolRows.filter(r => r.transferNumber === number);
    return {
      filterKey: number,
      label: `#${number}`,
      debtSum: debtSumOf(assignedRows),
      childCount: childCountOf(assignedRows),
      unboardedCount: assignedRows.filter(row => row.status !== 'boarded').length,
      tone: null as string | null,
    };
  });

  const statusCells = [
    { filterKey: 'new', label: '?', debtSum: debtSumOf(allSchoolRows.filter(isNewUnassignedRow)), childCount: childCountOf(allSchoolRows.filter(isNewUnassignedRow)), tone: STATUS_CELL_TONE.new },
    { filterKey: 'rejected', label: '×', debtSum: debtSumOf(allSchoolRows.filter(r => r.status === 'rejected')), childCount: childCountOf(allSchoolRows.filter(r => r.status === 'rejected')), tone: STATUS_CELL_TONE.rejected },
    { filterKey: '', label: '≡', debtSum: debtSumOf(allSchoolRows), childCount: childCountOf(allSchoolRows), tone: STATUS_CELL_TONE.all },
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
      <TransferBarPages scopeKey={schoolKey} selectedKey={selectedKey} counts={transferCells.map(cell => cell.childCount)} >
      {cells.map(cell => {
        const active = cell.childCount > 0;
        const isSelected = selectedKey === cell.filterKey;
        const unboardedCount = 'unboardedCount' in cell ? cell.unboardedCount : 0;
        const activeColor = cell.tone ?? '#2DD4BF';
        return (
          <button
            className="dock-hover-card dock-hover-card--compact"
            key={cell.filterKey || 'all'}
            onClick={() => onSelect?.(isSelected ? '' : cell.filterKey)}
            title={active ? `${cell.childCount} детей · долг ${cell.debtSum.toLocaleString('ru-RU')} сом${unboardedCount ? ` · Посадка не подтверждена: ${unboardedCount}` : ''}` : undefined}
            style={{
              position: 'relative',
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
            {unboardedCount > 0 && (
              <span
                aria-label={`Посадка не подтверждена: ${unboardedCount}`}
                style={{ position: 'absolute', top: -5, right: -3, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box', borderRadius: 9, background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}
              >
                ! {unboardedCount}
              </span>
            )}
            <span style={{
              fontSize: 13,
              fontWeight: 800,
              color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}>
              {active ? cell.childCount : ''}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2' }}>
              {cell.label}
            </span>
          </button>
        );
      })}
      </TransferBarPages>
    </div>
  );
}
