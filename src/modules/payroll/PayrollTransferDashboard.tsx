import TransferCell, { transferCellColor } from '../../core/dashboard/TransferCell';
import TransferBarPages, { transferCellCount } from '../../core/dashboard/TransferBarPages';
import { useMemo } from 'react';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { PAYROLL_OFFICE_KEY } from '../expenses/timesheetTypes';
import { payrollSchoolRows, payrollTransferNumbers } from './payrollStats';

interface PayrollTransferDashboardProps {
  schoolKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}




export default function PayrollTransferDashboard({ schoolKey, rightReserveWidth = 0, selectedKey = '', onSelect }: PayrollTransferDashboardProps) {
  const { data: rows = null } = useDriversTable();

  const isOffice = schoolKey === PAYROLL_OFFICE_KEY;
  const schoolRows = useMemo(() => isOffice ? [] : payrollSchoolRows(rows ?? [], schoolKey), [isOffice, rows, schoolKey]);

  if (rows === null || isOffice) return null;

  const transferCells = Array.from({ length: transferCellCount(schoolRows.flatMap(payrollTransferNumbers), selectedKey) }, (_, index) => {
    const number = String(index + 1);
    const transferRows = schoolRows.filter(row => payrollTransferNumbers(row).includes(number));
    return {
      filterKey: number,
      label: number,
      count: transferRows.length,
      vehicleType: transferRows.find(row => row.vehicleType === 'microbus')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'sedan')?.vehicleType,
    };
  });

  const noTransferCount = schoolRows.filter(row => row.transferCount === 0).length;
  const cells = [
    ...transferCells,
    { filterKey: 'empty', label: '—', count: noTransferCount, vehicleType: '', color: '#B45309' },
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
          active={cell.count > 0}
          selected={selectedKey === cell.filterKey}
          value={cell.count}
          onClick={() => onSelect?.(selectedKey === cell.filterKey ? '' : cell.filterKey)}
          title={cell.count > 0 ? `Водителей: ${cell.count}` : undefined}
        />
      ))}
      </TransferBarPages>
    </div>
  );
}
