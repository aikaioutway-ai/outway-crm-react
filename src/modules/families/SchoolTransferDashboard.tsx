import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import TransferCell from '../../core/dashboard/TransferCell';
import { ManagerMode } from './ManagerModeTabs';
import { ALL_PERIODS } from './constants';
import TransferBarPages, { transferCellCount } from '../../core/dashboard/TransferBarPages';
import React, { useEffect, useState } from 'react';
import { FamilyListRow, PeriodChargeStats, fetchChargesForPeriod } from '../../services/crmV2Service';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed } from './constants';
import { isNewUnassignedRow } from './familiesRowHelpers';

interface SchoolTransferDashboardProps {
  schoolKey: string;
  topPadding?: number;
  mode?: ManagerMode;
  periodKey?: string;
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

export default function SchoolTransferDashboard({ mode = 'directory', periodKey = 'ALL', topPadding = 10, schoolKey, rightReserveWidth = 0, selectedKey = '', onSelect, allowedSchools }: SchoolTransferDashboardProps) {
  const { data: rows } = useFamiliesTable();
  const [periodDebts, setPeriodDebts] = useState<PeriodChargeStats[]>([]);
  useEffect(() => {
    setPeriodDebts([]);
    if (mode !== 'charges' || periodKey === 'ALL') return;
    const period = ALL_PERIODS.find(item => item.key === periodKey);
    if (!period) return;
    let cancelled = false;
    const deposit = period.key === 'deposit';
    fetchChargesForPeriod(deposit ? null : period.month, deposit ? null : period.year, deposit ? 'deposit' : null)
      .then(data => { if (!cancelled) setPeriodDebts(data); }).catch(console.error);
    return () => { cancelled = true; };
  }, [mode, periodKey]);


  if (!isSchoolAllowed(schoolKey, allowedSchools) || !rows) return null;

  const allSchoolRows = rows.filter(r => r.branchFilter === schoolKey);
  const schoolRows = allSchoolRows.filter(r => r.status !== 'rejected');

  const transferCells = Array.from({ length: transferCellCount(schoolRows.map(row => row.transferNumber), selectedKey) }, (_, i) => {
    const number = String(i + 1);
    const assignedRows = schoolRows.filter(r => r.transferNumber === number);
    return {
      filterKey: number,
      label: number,
      debtSum: debtSumOf(assignedRows),
      childCount: childCountOf(assignedRows),
      unboardedCount: mode === 'directory'
        ? assignedRows.filter(row => row.status !== 'boarded').length
        : new Set(assignedRows.filter(row => periodKey === 'ALL'
          ? (row.childDebtAmount ?? row.debtAmount) > 0
          : periodDebts.some(debt => debt.debt > 0 && (debt.childId ? debt.childId === row.rowId : debt.familyId === row.familyId)))
          .map(row => row.familyId)).size,
      tone: null as string | null,
    };
  });

  const statusCells = [
    { filterKey: 'new', label: '?', debtSum: debtSumOf(allSchoolRows.filter(isNewUnassignedRow)), childCount: childCountOf(allSchoolRows.filter(isNewUnassignedRow)), tone: STATUS_CELL_TONE.new },
    { filterKey: 'rejected', label: '×', debtSum: debtSumOf(allSchoolRows.filter(r => r.status === 'rejected')), childCount: childCountOf(allSchoolRows.filter(r => r.status === 'rejected')), tone: STATUS_CELL_TONE.rejected },
    { filterKey: '', label: '≡', debtSum: debtSumOf(allSchoolRows), childCount: childCountOf(allSchoolRows), tone: STATUS_CELL_TONE.all },
  ];

  const cells = [...transferCells, ...statusCells];
  const badgeLabel = mode === 'charges' ? 'Должников' : 'Посадка не подтверждена';

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      flexShrink: 0,
      padding: `${topPadding}px 0 0`,
      paddingRight: rightReserveWidth,
      transition: 'padding-right .18s ease',
    }}>
      <TransferBarPages scopeKey={schoolKey} selectedKey={selectedKey} counts={transferCells.map(cell => cell.childCount)} >
      {cells.map(cell => {
        const isTransfer = 'unboardedCount' in cell;
        return <TransferCell
          key={cell.filterKey || 'all'}
          label={cell.label}
          // В справочнике маркер трансфера показывает, сколько всего в нём детей;
          // в оплатах — красный счётчик должников.
          value={isTransfer && mode !== 'directory' ? cell.unboardedCount : cell.childCount}
          alert={isTransfer && mode !== 'directory'}
          color={cell.tone ?? '#2DD4BF'}
          active={cell.childCount > 0}
          selected={selectedKey === cell.filterKey}
          onClick={() => onSelect?.(selectedKey === cell.filterKey ? '' : cell.filterKey)}
          onContextMenu={event=>showTaskContextMenu(event,/^\d+$/.test(cell.filterKey)?{type:'transfer',id:'',schoolKey,transferNumber:Number(cell.filterKey),label:`Трансфер № ${cell.filterKey}`} : ['empty','new','rejected'].includes(cell.filterKey)?{type:'group',id:`${schoolKey}:${cell.filterKey==='rejected'?'rejected':'new'}`,schoolKey,group:cell.filterKey==='rejected'?'rejected':'new',label:cell.filterKey==='rejected'?'Отказные заявки':'Новые заявки'}:{type:'school',id:schoolKey,schoolKey,label:schoolKey})}
          title={cell.childCount > 0 ? `${cell.childCount} детей · долг ${cell.debtSum.toLocaleString('ru-RU')}${isTransfer && mode !== 'directory' ? ` · ${badgeLabel}: ${cell.unboardedCount}` : ''}` : undefined}
        />;
      })}
      </TransferBarPages>
    </div>
  );
}
