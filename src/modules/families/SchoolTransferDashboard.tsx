import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import TransferCell from '../../core/dashboard/TransferCell';
import { ManagerMode } from './ManagerModeTabs';
import TransferBarPages, { transferCellCount } from '../../core/dashboard/TransferBarPages';
import React from 'react';
import { FamilyListRow, PeriodChargeStats } from '../../services/crmV2Service';
import { useFamiliesTable, usePeriodChargeStats, useSchoolTransferNumbers, useSchoolTransferStats } from '../../hooks/useCrmQueries';
import { isSchoolAllowed } from './constants';
import type { SchoolTier } from './SchoolTierTabs';
import { isNewUnassignedRow, matchesVehicleTypes } from './familiesRowHelpers';
import type { VehicleType } from '../../types';

interface SchoolTransferDashboardProps {
  schoolKey: string;
  topPadding?: number;
  mode?: ManagerMode;
  periodKey?: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  allowedSchools?: string[];
  schoolTier?: SchoolTier;
  /** Показывать только трансферы этих типов машин (пусто — все). Работает в финансовых вкладках. */
  vehicleTypes?: readonly VehicleType[];
}


const STATUS_CELL_TONE: Record<string, string> = {
  new: '#1A7F80',
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

export default function SchoolTransferDashboard({ mode = 'directory', periodKey = 'ALL', topPadding = 10, schoolKey, rightReserveWidth = 0, selectedKey = '', onSelect, allowedSchools, schoolTier = '1.0', vehicleTypes }: SchoolTransferDashboardProps) {
  // В «Справочнике» плашки считает база; таблица семей с деньгами нужна только финансовым вкладкам.
  const isDirectory = mode === 'directory';
  const { data: familyRows } = useFamiliesTable({ enabled: !isDirectory });
  const { data: transferStats } = useSchoolTransferStats(schoolKey, { enabled: isDirectory });
  const schoolTransferNumbers = useSchoolTransferNumbers(schoolKey);
  const periodDebtsQuery = usePeriodChargeStats(periodKey, { enabled: mode === 'charges' && periodKey !== 'ALL' });
  const periodDebts: PeriodChargeStats[] = mode === 'charges' && periodKey !== 'ALL' ? periodDebtsQuery.data ?? [] : [];


  if (!isSchoolAllowed(schoolKey, allowedSchools, schoolTier)) return null;
  if (isDirectory ? !transferStats : !familyRows) return null;

  const allSchoolRows = (familyRows ?? []).filter(r => r.branchFilter === schoolKey && matchesVehicleTypes(r, vehicleTypes));
  const schoolRows = allSchoolRows.filter(r => r.status !== 'rejected');
  const serverGroup = (key: string) => transferStats?.[key] ?? { children: 0, debtSum: 0 };
  const groupOf = (key: string, groupRows: () => FamilyListRow[]) => {
    if (isDirectory) return { debtSum: serverGroup(key).debtSum, childCount: serverGroup(key).children };
    const selected = groupRows();
    return { debtSum: debtSumOf(selected), childCount: childCountOf(selected) };
  };
  const usedTransferNumbers = isDirectory
    ? Object.keys(transferStats ?? {}).filter(key => /^\d+$/.test(key))
    : schoolRows.map(row => row.transferNumber);

  const transferCells = Array.from({ length: transferCellCount([...usedTransferNumbers, ...schoolTransferNumbers], selectedKey) }, (_, i) => {
    const number = String(i + 1);
    const assignedRows = schoolRows.filter(r => r.transferNumber === number);
    return {
      filterKey: number,
      label: number,
      ...groupOf(number, () => assignedRows),
      // Красный счётчик показывается только в финансовых вкладках.
      unboardedCount: isDirectory
        ? 0
        : new Set(assignedRows.filter(row => periodKey === 'ALL'
          ? (row.childDebtAmount ?? row.debtAmount) > 0
          : periodDebts.some(debt => debt.debt > 0 && (debt.childId ? debt.childId === row.rowId : debt.familyId === row.familyId)))
          .map(row => row.familyId)).size,
      tone: null as string | null,
    };
  });

  const statusCells = [
    { filterKey: 'new', label: '?', ...groupOf('new', () => allSchoolRows.filter(isNewUnassignedRow)), tone: STATUS_CELL_TONE.new },
    { filterKey: 'rejected', label: '×', ...groupOf('rejected', () => allSchoolRows.filter(r => r.status === 'rejected')), tone: STATUS_CELL_TONE.rejected },
    // «Все» — рабочие дети без отказников: отказники видны только по своей фишке.
    { filterKey: '', label: '≡', ...groupOf('all', () => schoolRows), tone: STATUS_CELL_TONE.all },
  ];

  // С фильтром по машинам показываем только трансферы, где есть дети нужного типа.
  const visibleTransferCells = vehicleTypes?.length && !isDirectory
    ? transferCells.filter(cell => usedTransferNumbers.includes(cell.filterKey))
    : transferCells;
  const cells = [...visibleTransferCells, ...statusCells];
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
      <TransferBarPages scopeKey={schoolKey} selectedKey={selectedKey} counts={visibleTransferCells.map(cell => cell.childCount)} >
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
