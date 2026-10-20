import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import TransferBarPages, { transferCellCount } from '../../core/dashboard/TransferBarPages';
import TransferCell from '../../core/dashboard/TransferCell';
import { useMemo } from 'react';
import { PaymentTableRow } from '../../services/crmV2Service';
import { usePaymentsTable } from '../../hooks/useCrmQueries';
import { CASHIER_PERIODS, SCHOOL_TABS } from './constants';

interface CashierSchoolTransferDashboardProps {
  schoolKey: string;
  periodKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  statusFilter?: 'pending' | 'confirmed';
}


function paymentDate(row: PaymentTableRow): Date | null {
  const raw = row.actualPaymentDate || row.paymentDate || row.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesPeriod(row: PaymentTableRow, periodKey: string): boolean {
  const period = CASHIER_PERIODS.find(item => item.key === periodKey);
  const date = paymentDate(row);
  if (!period || !date) return false;
  return date.getMonth() + 1 === period.month && date.getFullYear() === period.year;
}

function isPending(row: PaymentTableRow): boolean {
  const status = String(row.status ?? '').toLowerCase();
  return status === 'pending' || status.includes('провер');
}

function isConfirmed(row: PaymentTableRow): boolean {
  const status = String(row.status ?? '').toLowerCase();
  return status === 'paid' || status === 'confirmed' || status.includes('оплач') || status.includes('подтверж');
}

function rowMatchesSchool(row: PaymentTableRow, schoolKey: string): boolean {
  const tab = SCHOOL_TABS.find(item => item.key === schoolKey);
  if (!tab) return false;
  const branch = row.branchShort.toLowerCase();
  return branch === tab.key.toLowerCase() || branch === tab.label.toLowerCase();
}

export default function CashierSchoolTransferDashboard({ schoolKey, periodKey, rightReserveWidth = 0, selectedKey = '', onSelect, statusFilter = 'pending' }: CashierSchoolTransferDashboardProps) {
  const { data: rows = null } = usePaymentsTable();
  const statusPredicate = statusFilter === 'confirmed' ? isConfirmed : isPending;

  const schoolRows = useMemo(() => (
    (rows ?? []).filter(row => rowMatchesSchool(row, schoolKey) && matchesPeriod(row, periodKey) && statusPredicate(row))
  ), [periodKey, rows, schoolKey, statusPredicate]);

  if (rows === null) return null;

  const transferCells = Array.from({ length: transferCellCount(schoolRows.map(row => row.transferNumber), selectedKey) }, (_, i) => {
    const number = String(i + 1);
    const transferRows = schoolRows.filter(row => row.transferNumber === number);
    return {
      filterKey: number,
      label: number,
      count: transferRows.length,
    };
  });

  const allCount = schoolRows.length;
  const noTransferCount = schoolRows.filter(row => !row.transferNumber).length;
  const cells = [
    ...transferCells,
    { filterKey: 'empty', label: '—', count: noTransferCount },
    { filterKey: '', label: '≡', count: allCount },
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
          active={cell.count > 0}
          selected={selectedKey === cell.filterKey}
          value={cell.count}
          alert={/^\d+$/.test(cell.filterKey) && statusFilter === 'pending'}
          onClick={() => onSelect?.(selectedKey === cell.filterKey ? '' : cell.filterKey)}
          onContextMenu={event=>showTaskContextMenu(event,/^\d+$/.test(cell.filterKey)?{type:'transfer',id:'',schoolKey,transferNumber:Number(cell.filterKey),label:`Трансфер № ${cell.filterKey}`} : ['empty','new','rejected'].includes(cell.filterKey)?{type:'group',id:`${schoolKey}:${cell.filterKey==='rejected'?'rejected':'new'}`,schoolKey,group:cell.filterKey==='rejected'?'rejected':'new',label:cell.filterKey==='rejected'?'Отказные заявки':'Новые заявки'}:{type:'school',id:schoolKey,schoolKey,label:schoolKey})}
          title={cell.count > 0 ? `${statusFilter === 'confirmed' ? 'Подтверждено' : 'На проверке'}: ${cell.count}` : undefined}
        />
      ))}
      </TransferBarPages>
    </div>
  );
}
