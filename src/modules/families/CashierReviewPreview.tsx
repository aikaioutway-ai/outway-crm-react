import React, { useMemo, useState } from 'react';
import { ExternalLink, FileText, School, UserRound, X } from 'lucide-react';
import DataTable, { ColumnDef } from '../../core/tables/DataTable';
import { usePaymentsTable, useRefundsTable } from '../../hooks/useCrmQueries';
import { PaymentTableRow, RefundTableRow } from '../../services/crmV2Service';
import { money } from '../../utils/pricing';
import { phoneMatchesQuery } from '../../utils/format';
import { isSchoolAllowed, SCHOOL_TABS } from './constants';
import { isConfirmed, isPending, isQr, matchesPeriod, paymentDate, refundDate, refundMatchesPeriod, refundMatchesSchool, rowMatchesSchool } from './CashierOverview';
import ReceiptModal, { isPdfReceipt } from './ReceiptModal';
import '../spending/SpendingModule.css';
import '../costs/ExpensesModule.css';
import './CashierReviewPreview.css';

// Тестовый вид кассы в стиле «Расходов»: только просмотр, подтверждение — по-прежнему в карточке семьи.
type Status = 'pending' | 'confirmed' | 'refunds';
type Row = { id: string; familyId: string; parentName: string; childrenNames: string; phone: string; schoolKey: string; transferNumber: string | null; amount: number; date: string; method: string; receiptUrl: string | null; note: string; statusLabel: string };

const STATUSES: { key: Status; label: string }[] = [
  { key: 'pending', label: 'На проверке' },
  { key: 'confirmed', label: 'Подтверждённые' },
  { key: 'refunds', label: 'Возвраты' },
];
const schools = SCHOOL_TABS.filter(tab => tab.key !== 'ALL');
const dayLabel = (date: Date | null) => date ? date.toLocaleDateString('ru-RU') : '—';
const receiptWord = (count: number, refunds: boolean) => {
  const tens = count % 100, ones = count % 10;
  const [one, few, many] = refunds ? ['возврат', 'возврата', 'возвратов'] : ['чек', 'чека', 'чеков'];
  return tens >= 11 && tens <= 14 ? many : ones === 1 ? one : ones >= 2 && ones <= 4 ? few : many;
};

function paymentRow(row: PaymentTableRow, schoolKey: string): Row {
  return { id: row.id, familyId: row.familyId, parentName: row.parentName, childrenNames: row.childrenNames, phone: row.phone, schoolKey, transferNumber: row.transferNumber, amount: row.amount, date: dayLabel(paymentDate(row)), method: isQr(row) ? 'АйКай Мбанк' : 'Наличные', receiptUrl: row.receiptUrl, note: row.receiptCode || '', statusLabel: isPending(row) ? 'На проверке' : 'Подтверждён' };
}
function refundRow(row: RefundTableRow, schoolKey: string): Row {
  return { id: row.id, familyId: row.familyId, parentName: row.parentName, childrenNames: row.childrenNames, phone: row.phone, schoolKey, transferNumber: row.transferNumber, amount: row.amount, date: dayLabel(refundDate(row)), method: '', receiptUrl: null, note: row.comment, statusLabel: row.status === 'pending' ? 'Ожидает' : row.status === 'confirmed' ? 'Подтверждён' : 'Отклонён' };
}

export default function CashierReviewPreview({ periodKey, searchQuery = '', allowedSchools, onOpenFamily }: { periodKey: string; searchQuery?: string; allowedSchools?: string[]; onOpenFamily?: (familyId: string) => Promise<void> }) {
  const { data: payments, isLoading: paymentsLoading, error: paymentsError, refetch: refetchPayments } = usePaymentsTable();
  const { data: refunds, isLoading: refundsLoading, error: refundsError, refetch: refetchRefunds } = useRefundsTable();
  const [status, setStatus] = useState<Status>('pending');
  const [schoolKey, setSchoolKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [openError, setOpenError] = useState('');

  const visibleSchools = useMemo(() => schools.filter(tab => isSchoolAllowed(tab.key, allowedSchools)), [allowedSchools]);
  const query = searchQuery.trim().toLocaleLowerCase('ru-RU');
  const matchesQuery = (row: Row) => !query || `${row.parentName} ${row.childrenNames} ${row.amount}`.toLocaleLowerCase('ru-RU').includes(query) || phoneMatchesQuery(searchQuery, row.phone);

  // Строки по статусу, уже разложенные по школам, с учётом периода, доступа и поиска.
  const rowsByStatus = useMemo(() => {
    const periodPayments = (payments ?? []).filter(row => matchesPeriod(row, periodKey));
    const periodRefunds = (refunds ?? []).filter(row => refundMatchesPeriod(row, periodKey) && (row.status === 'pending' || row.status === 'confirmed'));
    const result: Record<Status, Row[]> = { pending: [], confirmed: [], refunds: [] };
    for (const tab of visibleSchools) {
      for (const row of periodPayments) if (rowMatchesSchool(row, tab)) {
        if (isPending(row)) result.pending.push(paymentRow(row, tab.key));
        else if (isConfirmed(row)) result.confirmed.push(paymentRow(row, tab.key));
      }
      for (const row of periodRefunds) if (refundMatchesSchool(row, tab)) result.refunds.push(refundRow(row, tab.key));
    }
    return result;
  }, [payments, refunds, periodKey, visibleSchools]);

  const filtered = (key: Status) => rowsByStatus[key].filter(matchesQuery);
  const current = filtered(status);
  const tableRows = schoolKey ? current.filter(row => row.schoolKey === schoolKey) : current;
  const sum = (rows: Row[]) => rows.reduce((total, row) => total + row.amount, 0);
  const isRefunds = status === 'refunds';
  const loading = paymentsLoading || refundsLoading;
  const error = paymentsError || refundsError;
  const showTable = !!schoolKey || !!query;

  const chooseStatus = (key: Status) => { setStatus(key); setSelected(null); };
  const openFamily = async (familyId: string) => {
    setOpenError('');
    try { await onOpenFamily?.(familyId); } catch { setOpenError('Не удалось открыть карточку семьи.'); }
  };

  const columns: ColumnDef<Row>[] = [
    { key: 'parentName', label: 'Родитель', type: 'text', width: 200 },
    { key: 'childrenNames', label: 'Дети', type: 'text', width: 220 },
    { key: 'transferNumber', label: 'Трансфер', type: 'text', width: 100, render: value => value ? `№${value}` : '—' },
    { key: 'amount', label: 'Сумма', type: 'currency', width: 120, render: value => <strong className="finance-amount">{Number(value).toLocaleString('ru-RU')}</strong> },
    { key: 'date', label: 'Дата', type: 'text', width: 110 },
    ...(isRefunds
      ? [{ key: 'statusLabel', label: 'Статус', type: 'text' as const, width: 120 }, { key: 'note', label: 'Комментарий', type: 'text' as const, width: 260 }]
      : [{ key: 'method', label: 'Оплата', type: 'text' as const, width: 130 }, { key: 'receiptUrl', label: 'Чек', type: 'text' as const, width: 70, render: (value: unknown) => value ? <FileText size={15} aria-label="Есть чек" /> : '—' }]),
  ];

  return <section className="spending-module spending-split-view is-embedded cashier-review-preview" aria-label="Касса в стиле расходов (тест)">
    <p className="cashier-review-note">Тестовый вид — только просмотр. Подтвердить или отклонить чек можно в карточке семьи.</p>
    {error && <p role="alert" className="spending-error">Не удалось загрузить оплаты. <button type="button" onClick={() => { void refetchPayments(); void refetchRefunds(); }}>Повторить</button></p>}
    <div className="spending-split-layout">
      <div className="spending-categories">
        {STATUSES.map(item => { const rows = filtered(item.key); return <button key={item.key} type="button" aria-pressed={status === item.key} onClick={() => chooseStatus(item.key)}>
          <span className="spending-category-name">{item.label}</span>
          <strong>{loading ? '—' : money(sum(rows))}</strong>
          <small>{rows.length} {receiptWord(rows.length, item.key === 'refunds')}</small>
        </button>; })}
      </div>
      <div className="spending-workspace">
        {!showTable ? <div className="spending-register spending-register-schools">
          <div className="spending-register-heading"><h2>{STATUSES.find(item => item.key === status)!.label}</h2></div>
          <div className="spending-school-overview">
            {loading ? <p className="spending-empty">Загрузка оплат…</p> : <div className="spending-school-strip spending-school-expenses" role="group" aria-label="Школы">
              {visibleSchools.map(tab => { const rows = current.filter(row => row.schoolKey === tab.key); return <button type="button" key={tab.key} className={rows.length ? undefined : 'is-empty'} onClick={() => { setSchoolKey(tab.key); setSelected(null); }}>
                <span className="spending-school-logo">{tab.logo ? <img src={tab.logo} alt="" /> : <School size={28} aria-hidden="true" />}</span>
                <span className="spending-school-name">{tab.label}</span>
                <strong>{money(sum(rows))}</strong>
                {rows.length > 0 && <span className="cashier-review-count">{rows.length} {receiptWord(rows.length, isRefunds)}</span>}
              </button>; })}
            </div>}
          </div>
        </div> : <div className={`cashier-review-records${selected ? ' has-panel' : ''}`}>
          <section className="spending-records-table finance-workspace" aria-label="Чеки школы">
            <DataTable<Row> columns={columns} data={tableRows} rowKey="id" storageKey={`cashier_review_preview_${status}_v1`} onRowOpen={row => setSelected(row)} onRowClick={row => setSelected(row)} canManageProperties={false}
              toolbarExtra={<div className="expenses-table-heading"><button type="button" className="expenses-view-button" onClick={() => { setSchoolKey(null); setSelected(null); }}>К сводке</button><strong>{schoolKey ? schools.find(tab => tab.key === schoolKey)?.label : 'Все школы'}</strong><span>{tableRows.length} {receiptWord(tableRows.length, isRefunds)} на сумму <b>{money(sum(tableRows))}</b></span></div>}
              emptyText={isRefunds ? 'За выбранный период возвратов нет' : status === 'pending' ? 'Чеков на проверке нет' : 'Подтверждённых оплат за период нет'} />
          </section>
          {selected && <aside className="cashier-review-panel" aria-label="Подробности оплаты">
            <header><div><span className="payment-composer-kicker">{isRefunds ? 'ВОЗВРАТ' : 'ОПЛАТА'} · {selected.statusLabel}</span><h3>{money(selected.amount)}</h3></div><button type="button" className="payment-close" aria-label="Закрыть подробности" onClick={() => setSelected(null)}><X size={18} /></button></header>
            {!isRefunds && (selected.receiptUrl
              ? isPdfReceipt(selected.receiptUrl)
                ? <button type="button" className="cashier-review-receipt is-pdf" onClick={() => setReceiptOpen(true)}><FileText size={28} />PDF-чек — открыть</button>
                : <button type="button" className="cashier-review-receipt" onClick={() => setReceiptOpen(true)} aria-label="Открыть чек крупно"><img src={selected.receiptUrl} alt="Чек оплаты" /></button>
              : <p className="cashier-review-no-receipt">Чек не приложен</p>)}
            <dl className="payment-summary">
              <dt>Родитель</dt><dd>{selected.parentName || '—'}</dd>
              <dt>Дети</dt><dd>{selected.childrenNames || '—'}</dd>
              <dt>Школа · трансфер</dt><dd>{schools.find(tab => tab.key === selected.schoolKey)?.label || selected.schoolKey}{selected.transferNumber ? ` · №${selected.transferNumber}` : ''}</dd>
              <dt>Дата</dt><dd>{selected.date}</dd>
              {!isRefunds && <><dt>Способ оплаты</dt><dd>{selected.method}</dd></>}
              {selected.note && <><dt>{isRefunds ? 'Комментарий' : 'Код чека'}</dt><dd>{selected.note}</dd></>}
            </dl>
            {openError && <p role="alert" className="spending-error">{openError}</p>}
            <button type="button" className="spending-primary" disabled={!onOpenFamily} onClick={() => void openFamily(selected.familyId)}><UserRound size={16} />Открыть карточку семьи<ExternalLink size={14} /></button>
          </aside>}
        </div>}
      </div>
    </div>
    {receiptOpen && selected?.receiptUrl && <ReceiptModal receiptUrl={selected.receiptUrl} subtitle={selected.parentName} onClose={() => setReceiptOpen(false)} />}
  </section>;
}
