import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import TransferCell, { transferCellColor } from '../../core/dashboard/TransferCell';
import TransferBarPages, { transferCellCount } from '../../core/dashboard/TransferBarPages';
import React, { useMemo } from 'react';
import { V2DriverTableRow } from '../../services/crmV2Service';
import { useDriversTable, useSchoolTransferNumbers } from '../../hooks/useCrmQueries';
import { VT_LABEL } from '../families/constants';
import { DRIVER_RESERVE_KEY, isReserveDriver } from './DriversOverview';
import { driverMatchesSchool } from './driverSchoolVisibility';

interface DriversTransferDashboardProps {
  schoolKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}





export function driverMatchesTransfer(driver: V2DriverTableRow, transferNumber: string): boolean {
  return driver.transferNumbers
    .split(',')
    .map(item => item.replace(/[^\d]/g, ''))
    .filter(Boolean)
    .includes(transferNumber);
}

export default function DriversTransferDashboard({ schoolKey, rightReserveWidth = 0, selectedKey = '', onSelect }: DriversTransferDashboardProps) {
  const { data: rows = null } = useDriversTable();
  const schoolTransferNumbers = useSchoolTransferNumbers(schoolKey);

  const isReserve = schoolKey === DRIVER_RESERVE_KEY;
  const schoolRows = useMemo(() => (
    (rows ?? []).filter(row => (
      isReserve
        ? isReserveDriver(row)
        : !isReserveDriver(row) && driverMatchesSchool(row, schoolKey)
    ))
  ), [isReserve, rows, schoolKey]);

  if (rows === null || isReserve) return null;

  const transferCells = Array.from({ length: transferCellCount([...schoolRows.flatMap(row => row.transferNumbers.split(',').map(number => number.replace(/[^\d]/g, ''))), ...schoolTransferNumbers], selectedKey) }, (_, index) => {
    const number = String(index + 1);
    const transferRows = schoolRows.filter(row => driverMatchesTransfer(row, number));
    return {
      filterKey: number,
      label: number,
      count: transferRows.length,
      temporary: transferRows.some(row => /^Временный водитель №\d+$/.test(row.fullName.trim())),
      vehicleType: transferRows.find(row => row.vehicleType === 'microbus')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'sedan')?.vehicleType,
    };
  });

  const noTransferCount = schoolRows.filter(row => row.transferCount === 0).length;
  const inactiveCount = schoolRows.filter(row => row.status !== 'active').length;
  const cells = [
    ...transferCells,
    { filterKey: 'empty', label: '—', count: noTransferCount, vehicleType: '' },
    { filterKey: 'inactive', label: '×', count: inactiveCount, vehicleType: '', color: '#64748B' },
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
      <TransferBarPages scopeKey={schoolKey} selectedKey={selectedKey} counts={transferCells.map(cell => cell.count)} >
      {cells.map(cell => (
        <TransferCell
          key={cell.filterKey || 'all'}
          label={cell.label}
          color={transferCellColor(cell)}
          alert={'temporary' in cell && Boolean(cell.temporary)}
          active={cell.count > 0}
          selected={selectedKey === cell.filterKey}
          value={cell.count}
          onClick={() => onSelect?.(selectedKey === cell.filterKey ? '' : cell.filterKey)}
          onContextMenu={event=>showTaskContextMenu(event,/^\d+$/.test(cell.filterKey)?{type:'transfer',id:'',schoolKey,transferNumber:Number(cell.filterKey),label:`Трансфер № ${cell.filterKey}`} : ['empty','new','rejected'].includes(cell.filterKey)?{type:'group',id:`${schoolKey}:${cell.filterKey==='rejected'?'rejected':'new'}`,schoolKey,group:cell.filterKey==='rejected'?'rejected':'new',label:cell.filterKey==='rejected'?'Отказные заявки':'Новые заявки'}:{type:'school',id:schoolKey,schoolKey,label:schoolKey})}
          title={cell.count > 0 ? `Водителей: ${cell.count}${'temporary' in cell && cell.temporary ? ' · Временный водитель' : ''}${cell.vehicleType ? ` · ${VT_LABEL[cell.vehicleType] ?? cell.vehicleType}` : ''}` : undefined}
        />
      ))}
      </TransferBarPages>
    </div>
  );
}
