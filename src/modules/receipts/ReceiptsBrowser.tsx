import React, { useMemo, useRef, useState } from 'react';
import { Pin, ChevronLeft, Link2, RotateCcw, Users } from 'lucide-react';
import { QK } from '../../services/queryClient';
import { useQueries } from '@tanstack/react-query';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import TransferCell, { transferCellColor } from '../../core/dashboard/TransferCell';
import TransferBarPages from '../../core/dashboard/TransferBarPages';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import { ALL_PERIODS, MAX_TRANSFER_NUMBER, isSchoolInTier, SCHOOL_DIRECTORY } from '../families/constants';
import type { SchoolTier } from '../families/SchoolTierTabs';
import { useIncomingReceiptsSummary, useSchoolTransferVehicleTypes } from '../../hooks/useCrmQueries';
import { fetchIncomingReceiptsSummary, ReceiptCounts, ReceiptTransferSummary } from '../../services/incomingReceiptService';
import ReceiptsModule from './ReceiptsModule';
import GroupPickerModal from './GroupPickerModal';
import './ReceiptsModule.css';

const receiptMonths = ALL_PERIODS.filter(period => period.month > 0);
function monthDates(key: string) {
  const period = receiptMonths.find(month => month.key === key);
  if (!period) return {};
  const next = new Date(Date.UTC(period.year, period.month, 1));
  return { dateFrom: `${period.year}-${String(period.month).padStart(2, '0')}-01`, dateTo: next.toISOString().slice(0, 10) };
}

const UNASSIGNED = '__unassigned';

const COLUMNS = (first: string, totals: ReceiptCounts & { count: number }, groupColumn: boolean) => [
  { key: 'name', label: first, total: totals.count, color: '#64748B' },
  ...(groupColumn ? [{ key: 'group', label: 'Группа WhatsApp', total: '', color: '#0F6E56' }] : []),
  { key: 'review', label: 'Нужно разобрать', total: totals.review, color: '#B45309' },
  { key: 'duplicates', label: 'Дубли', total: totals.duplicates, color: '#A32D2D' },
  { key: 'other', label: 'Другие файлы', total: totals.other, color: '#7F77DD' },
  { key: 'total', label: 'Всего чеков', total: totals.total, color: '#185FA5' },
];

function sum(rows: ReceiptCounts[]): ReceiptCounts {
  return rows.reduce((acc, row) => ({ review: acc.review + row.review, duplicates: acc.duplicates + row.duplicates, other: acc.other + row.other, total: acc.total + row.total }), { review: 0, duplicates: 0, other: 0, total: 0 });
}

function useSort(initial: string) {
  const [sort, setSort] = useState({ key: initial, ascending: initial === 'name' });
  const onSort = (key: string) => setSort(prev => prev.key === key ? { key, ascending: !prev.ascending } : { key, ascending: key === 'name' });
  const compare = (a: { label: string; values: Record<string, string | number> }, b: typeof a) => {
    const left = sort.key === 'name' ? a.label : a.values[sort.key];
    const right = sort.key === 'name' ? b.label : b.values[sort.key];
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'ru', { numeric: true });
    return sort.ascending ? result : -result;
  };
  return { ...sort, onSort, compare };
}

/**
 * Вкладка «Чеки» в «Менеджере»: школы → трансферы школы → чеки группы WhatsApp трансфера.
 * schoolKey приходит из общей навигации менеджера (выбранная школа).
 */
export default function ReceiptsBrowser({ sessionToken, userName, allowedSchools, schoolKey, schoolTier = '1.0', onSelectSchool, onOpenFamily, canDelete = false }: {
  canDelete?: boolean;
  sessionToken?: string;
  userName?: string;
  allowedSchools?: string[];
  schoolKey: string | null;
  schoolTier?: SchoolTier;
  onSelectSchool: (key: string) => void;
  onOpenFamily: (familyId: string) => Promise<void>;
}) {
  const groupTransferDialog = useRef<HTMLDialogElement>(null);
  const [periodKey, setPeriodKey] = useState('ALL');
  const monthlySummaries = useQueries({ queries: receiptMonths.map(month => ({
    queryKey: [...QK.incomingReceiptsSummary(sessionToken), month.key, month.year],
    queryFn: () => fetchIncomingReceiptsSummary(sessionToken, monthDates(month.key)),
    refetchInterval: 60_000,
    enabled: Boolean(sessionToken && schoolKey && schoolKey !== 'ALL'),
  })) });
  const summary = useIncomingReceiptsSummary(sessionToken);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [picking, setPicking] = useState<ReceiptTransferSummary | null>(null);
  const schoolSort = useSort('review');
  const common = { sessionToken, userName, allowedSchools, onOpenFamily, canDelete };

  const periodSummary = periodKey === 'ALL' ? summary : monthlySummaries[receiptMonths.findIndex(month => month.key === periodKey)];
  const schoolTransfers = useMemo(() => (periodSummary?.data?.transfers ?? []).filter(row => row.schoolKey === schoolKey), [periodSummary?.data, schoolKey]);
  const selectedTransfer = schoolTransfers.find(row => row.transferId === transferId) ?? null;
  const vehicleTypes = useSchoolTransferVehicleTypes(schoolKey ?? '');
  const schoolLabel = SCHOOL_DIRECTORY.find(school => school.key === schoolKey)?.label ?? schoolKey ?? '';

  if (schoolKey === 'ALL') return <ReceiptsModule {...common} title="Все чеки" />;

  if (!schoolKey && unassignedOpen) {
    return <ReceiptsModule {...common} scope={{ unassigned: true }}
      title={<button type="button" className="receipts-back" onClick={() => setUnassignedOpen(false)}><ChevronLeft size={16} aria-hidden="true" />Без трансфера</button>} />;
  }

  if (summary.isLoading) return <div className="receipts-state">Загружаем чеки…</div>;
  if (summary.isError) {
    return <div className="receipts-state" role="alert">
      <span>{summary.error instanceof Error ? summary.error.message : 'Не удалось загрузить чеки'}</span>
      <button type="button" className="ow-btn ow-btn--sm" onClick={() => void summary.refetch()}><RotateCcw size={13} aria-hidden="true" /> Повторить</button>
    </div>;
  }

  if (!schoolKey) {
    const schools = (summary.data?.schools ?? []).filter(row => isSchoolInTier(row.key, schoolTier));
    const unassigned = summary.data?.unassigned ?? { review: 0, duplicates: 0, other: 0, total: 0 };
    const rows = schools.map(row => {
      const school = SCHOOL_DIRECTORY.find(item => item.key === row.key);
      return { key: row.key, label: school?.label ?? row.key, logo: school?.logo, values: { review: row.review, duplicates: row.duplicates, other: row.other, total: row.total } };
    }).sort(schoolSort.compare);
    const unassignedRow = unassigned.total + unassigned.other > 0
      ? [{ key: UNASSIGNED, label: 'Без трансфера', values: { review: unassigned.review, duplicates: unassigned.duplicates, other: unassigned.other, total: unassigned.total } }]
      : [];
    return <SchoolDashboardTable splitView compactTotals className="receipts-dashboard"
      columns={COLUMNS('Школа', { ...sum([...schools, unassigned]), count: schools.length }, false).filter(column => column.key === 'review')}
      rows={[...unassignedRow, ...rows]}
      sortKey={schoolSort.key === 'name' ? 'name' : schoolSort.key} ascending={schoolSort.ascending} onSort={schoolSort.onSort}
      onSelect={key => key === UNASSIGNED ? setUnassignedOpen(true) : onSelectSchool(key)} />;
  }

  const counts = Array.from({ length: MAX_TRANSFER_NUMBER }, (_, index) => schoolTransfers
    .filter(transfer => transfer.transferNumber === index + 1).reduce((total, transfer) => total + transfer.review, 0));
  const schoolReview = schoolTransfers.reduce((total, transfer) => total + transfer.review, 0);
  const dates = monthDates(periodKey);
  const transferNumbers = Array.from({ length: MAX_TRANSFER_NUMBER }, (_, index) => index + 1);
  return <div className="receipts-school-workspace">
    <DashboardTopPanel>
      <div className="receipts-group-actions">
        <button type="button" className="ow-btn ow-btn--sm receipts-group" onClick={() => {
          if (selectedTransfer) setPicking(selectedTransfer);
          else groupTransferDialog.current?.showModal();
        }}><Users size={15} aria-hidden="true" />{selectedTransfer?.groupName ?? 'Привязать группу'}<Link2 size={14} aria-hidden="true" /></button>
      </div>
      <div className="manager-period-tiles manager-period-tiles--months" role="group" aria-label="Период чеков">
        {[{ key: 'ALL', label: 'Все' }, ...receiptMonths].map(period => {
          const data = period.key === 'ALL' ? summary.data : monthlySummaries[receiptMonths.findIndex(month => month.key === period.key)]?.data;
          const count = data?.transfers.filter(transfer => transfer.schoolKey === schoolKey).reduce((total, transfer) => total + transfer.review, 0);
          return <button type="button" key={period.key} aria-pressed={periodKey === period.key} onClick={() => setPeriodKey(period.key)} title={period.label}>
            <span>{period.key === 'ALL' ? 'Все' : period.label.slice(0, 3)}</span>
            <strong>{count === undefined ? '—' : count}</strong>
          </button>;
        })}
      </div>
      <div className="ow-transfer-bar" role="group" aria-label="Трансферы чеков">
        <TransferBarPages scopeKey={schoolKey ?? ''} selectedKey={String(selectedTransfer?.transferNumber ?? '')} counts={counts}>
          {transferNumbers.map(number => {
            const transfer = schoolTransfers.find(item => item.transferNumber === number);
            return <TransferCell key={number} label={String(number)} value={counts[number - 1]} active={Boolean(transfer)}
              badge={transfer?.chatId ? <Pin size={10} aria-label="Группа WhatsApp привязана" /> : undefined}
              title={transfer?.chatId ? `Трансфер №${number} · ${transfer.groupName ?? 'Группа WhatsApp привязана'}` : `Трансфер №${number}`}
              color={transferCellColor({ vehicleType: vehicleTypes[String(number)] })}
              selected={Boolean(transfer && transferId === transfer.transferId)}
              onClick={transfer ? () => setTransferId(transfer.transferId) : undefined} />;
          })}
          <TransferCell label="≡" value={schoolReview} active selected={!transferId} onClick={() => setTransferId(null)} />
        </TransferBarPages>
      </div>
    </DashboardTopPanel>
    {periodSummary?.isPending ? <div className="receipts-state">Загружаем чеки…</div>
      : periodSummary?.isError ? <div role="alert" className="receipts-state">Не удалось загрузить период. <button type="button" onClick={() => void periodSummary.refetch()}>Повторить</button></div>
      : <ReceiptsModule key={schoolKey + ':' + (transferId ?? 'ALL') + ':' + periodKey} {...common}
        scope={{ schoolKey: schoolKey ?? undefined, transferId: transferId ?? undefined, ...dates }}
        title={selectedTransfer ? `${schoolLabel} · Трансфер ${selectedTransfer.transferNumber ?? '—'}` : `${schoolLabel} · Все трансферы`}
      />}
    <dialog ref={groupTransferDialog} className="receipts-transfer-picker" aria-label="Выбор трансфера для группы WhatsApp">
      <header><h3>Группа WhatsApp</h3><button type="button" className="ow-btn ow-btn--ghost" onClick={() => groupTransferDialog.current?.close()}>Закрыть</button></header>
      <p>Выберите трансфер для привязки группы.</p>
      <div className="receipts-family-results">
        {schoolTransfers.map(transfer => <button type="button" key={transfer.transferId} onClick={() => {
          groupTransferDialog.current?.close();
          setPicking(transfer);
        }}>
          <strong>Трансфер {transfer.transferNumber ?? '—'}</strong>
          <span>{transfer.groupName ?? 'Группа не привязана'}</span>
        </button>)}
      </div>
      {!schoolTransfers.length && <p>В школе нет действующих трансферов.</p>}
    </dialog>
    {picking && <GroupPickerModal sessionToken={sessionToken} transfer={picking} onClose={() => setPicking(null)} />}
  </div>;
}
