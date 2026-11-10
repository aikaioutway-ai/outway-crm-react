import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Upload, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useReconciliationPayments } from '../../hooks/useCrmQueries';
import { QK } from '../../services/queryClient';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import { CASHIER_PERIODS, currentReconciliationMonth } from './constants';
import './cashierReconciliation.css';
import ReceiptModal from './ReceiptModal';
import FilterableTable from '../../core/tables/FilterableTable';
import { confirmFamilyPayment, fetchFamilyPayment, type fetchReconciliationPayments } from '../../services/financeService';
import { mergeStatements, readBankStatement, reconcileBankStatement, type StatementEntry } from './statementReconciliation';

type ReconciliationPayment = Awaited<ReturnType<typeof fetchReconciliationPayments>>[number];
type Result = ReturnType<typeof reconcileBankStatement<ReconciliationPayment>>[number];
type Statement = { name: string; entries: StatementEntry[]; uploadedMonth?: string; range?: { from: string; to: string } };

function statementRange(statement: Statement) {
  if (statement.range) return statement.range;
  const dates = statement.entries.map(entry => entry.postingDate).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

const groups = [
  { key: '1', label: 'Есть: код и сумма совпали' },
  { key: '2', label: 'Частично: код совпал, а сумма нет, или совпали только сумма и дата' },
  { key: 'Д', label: 'Дубли: один чек привязан к нескольким платежам CRM' },
  { key: 'Х', label: 'Нет: поступление без платежа в CRM' },
] as const;
const statuses = [
  { key: 'На проверке', label: 'На проверке' },
  { key: 'Подтверждено', label: 'Подтверждённые' },
] as const;
type PaymentStatus = typeof statuses[number]['key'];
const PAGE_SIZE = 20;
type Group = typeof groups[number]['key'];

const headers = ['Родитель', 'Сумма CRM', 'Сумма выписки', 'Код чека CRM', 'Код чека выписки',
  'Дата CRM', 'Дата выписки', '№ поручения', 'Комментарий', 'Статус'];
const columnWidths = [180, 100, 115, 105, 135, 100, 105, 100, 180, 200];

function correspondentName(entry: StatementEntry) {
  const fields = new Map(entry.source?.map(cell => [cell.label, cell.value]));
  const purpose = fields.get('Назначение платежа') ?? '';
  const correspondent = fields.get('Наименование корреспондента') ?? '';
  const isName = (value: string) => /^[\p{L}’'-]+(?: +[\p{L}’'-]+){1,4}$/u.test(value) &&
    !/^(?:ОАО|ОсОО|ЗАО|ИП|банк) /iu.test(value);
  return [...purpose.split('//').slice(1), ...correspondent.split('//').reverse()]
    .map(value => value.trim().replace(/\s+/g, ' '))
    .find(isName);
}

const sourceHeaders = ['Документ', 'Дата операции', 'Наименование корреспондента', 'ИНН корреспондента',
  'Оборот Дт', 'Оборот Кт', 'Назначение платежа'];
const unmatchedHeaders = sourceHeaders.filter(label => label !== 'Оборот Дт');
const unmatchedWidths = [160, 110, 225, 155, 105, 430];
const collator = new Intl.Collator('ru', { numeric: true });

function paymentDate(date: string) {
  return date.split('-').reverse().join('.');
}

function paymentRange(entries: StatementEntry[]) {
  const dates = entries.flatMap(entry => [entry.operationDate ?? entry.postingDate, entry.postingDate]).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

// Платёж из одной строки выписки уже подтверждён — остальные платежи с этим же чеком подтверждать нельзя.
function duplicateOfConfirmed(row: Result, payment: ReconciliationPayment) {
  return row.group === 'Д' && row.candidates.some(item => item.id !== payment.id && item.status === 'Подтверждено');
}

export default function CashierReconciliation({ userId, userName, period, setPeriod, onOpenFamily }: {
  userId: string; userName?: string; period: string; setPeriod: (period: string) => void;
  onOpenFamily?: (familyId: string) => Promise<void> | void;
}) {
  const storageKey = `cashier-reconciliation:v1:${userId}`;
  const [history, setHistory] = useState<Statement[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey) ?? 'null');
      return Array.isArray(saved) ? saved : saved?.entries?.length ? [saved] : [];
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState<PaymentStatus>('На проверке');
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; id: string; parent: string } | null>(null);
  const [source, setSource] = useState<StatementEntry | null>(null);
  const [editing, setEditing] = useState<{ number: number; paymentId: string; date: string } | null>(null);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const filesDialog = useRef<HTMLDialogElement>(null);
  const [group, setGroup] = useState<Group>('1');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ index: number; descending: boolean } | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const selectedPeriod = CASHIER_PERIODS.find(item => item.key === period);
  const month = selectedPeriod && `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}`;
  // Все загруженные выписки сверяются как одна; фильтр месяца сверху оставляет поступления этого месяца.
  const allEntries = useMemo(() => mergeStatements(history), [history]);
  const entries = useMemo(() => month ? allEntries.filter(entry => entry.postingDate.startsWith(month)) : allEntries,
    [allEntries, month]);
  const range = useMemo(() => entries.length ? paymentRange(entries) : null, [entries]);
  const paymentsQuery = useReconciliationPayments(range);
  const results: Result[] = useMemo(() => entries.length && paymentsQuery.data
    ? reconcileBankStatement(entries, paymentsQuery.data) : [], [entries, paymentsQuery.data]);
  const busy = reading || (entries.length > 0 && paymentsQuery.isPending);
  const fileInput = useRef<HTMLInputElement>(null);
  const confirmationLock = useRef(false);

  useEffect(() => {
    if (!history.length) return;
    try {
      if (localStorage.getItem(storageKey) === null) {
        localStorage.setItem(storageKey, JSON.stringify(history));
      }
    } catch {
      // The current tab can still show the available history.
    }
  }, [history, storageKey]);

  function resetView() {
    setPage(1);
    setExpandedComment(null);
    setSort(null);
    setEditing(null);
  }

  async function upload(file: File) {
    setReading(true);
    setError('');
    try {
      const uploadedMonth = currentReconciliationMonth();
      const next = { name: file.name, uploadedMonth, ...await readBankStatement(file) };
      const nextHistory = [next, ...history.filter(item => item.name !== next.name || item.uploadedMonth !== uploadedMonth ||
        JSON.stringify(item.entries) !== JSON.stringify(next.entries))];
      setHistory(nextHistory);
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextHistory));
      } catch {
        setError('Браузер не смог сохранить выписку для повторного открытия.');
      }
      const lastMonth = statementRange(next).to.slice(0, 7);
      setPeriod(CASHIER_PERIODS.find(item => `${item.year}-${String(item.month).padStart(2, '0')}` === lastMonth)?.key ?? 'ALL');
      resetView();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать выписку.');
    } finally {
      setReading(false);
    }
  }

  function deleteStatement(item: Statement) {
    const next = history.filter(saved => saved !== item);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setError('Браузер не смог удалить выписку из истории.');
      return;
    }
    setHistory(next);
    resetView();
  }

  async function confirm(row: Result, payment: ReconciliationPayment) {
    if (confirmationLock.current || payment.status !== 'На проверке' ||
        editing?.number !== row.entry.number || editing.paymentId !== payment.id || !editing.date) return;
    const actualPaymentDate = editing.date;
    if (duplicateOfConfirmed(row, payment)) return;
    if (row.group === 'Д' && !window.confirm(
      `Этот чек привязан к ${row.candidates.length} платежам CRM. Подтвердить только платёж ${payment.parentName || payment.familyId} на ${payment.amount.toLocaleString('ru-RU')} сом?`
    )) return;
    if (row.group === '2' && !window.confirm(
      `Подтвердить платёж CRM на ${payment.amount.toLocaleString('ru-RU')} сом? Сумма в выписке: ${row.entry.amount.toLocaleString('ru-RU')} сом.`
    )) return;
    confirmationLock.current = true;
    setConfirming(true);
    setError('');
    try {
      const fresh = await fetchFamilyPayment(payment.id);
      if (fresh.status !== 'Подтверждено') {
        if (fresh.status !== 'На проверке' || fresh.amount !== payment.amount ||
            fresh.receiptCode !== payment.receiptCode || fresh.paymentType !== payment.paymentType ||
            fresh.paymentDate !== payment.paymentDate || fresh.actualPaymentDate !== payment.actualPaymentDate) {
          throw new Error('Платёж изменился. Откройте сверку заново и проверьте строку.');
        }
        await confirmFamilyPayment({ payment: fresh, charges: [], confirmedBy: userName, actualPaymentDate });
      }
      const savedDate = fresh.status === 'Подтверждено' ? fresh.actualPaymentDate : actualPaymentDate;
      setEditing(null);
      if (range) queryClient.setQueryData<ReconciliationPayment[]>(QK.reconciliationPayments(range.from, range.to), (list: ReconciliationPayment[] | undefined) =>
        list?.map((item: ReconciliationPayment) => item.id === payment.id ? { ...item, status: 'Подтверждено', actualPaymentDate: savedDate } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подтвердить платёж.');
    } finally {
      confirmationLock.current = false;
      setConfirming(false);
    }
  }

  const statementOnly = group === 'Х';
  const tableHeaders = statementOnly ? unmatchedHeaders : headers;
  const widths = statementOnly ? unmatchedWidths : columnWidths;
  // Строки с платежом показываем по статусу платежа; поступления без платежа (Х) статуса не имеют.
  // Дубли показываем все сразу, независимо от статуса: так видно, какой из них уже подтверждён.
  const rowsFor = (row: Result) => row.group === 'Х' ? [undefined]
    : row.group === 'Д' ? row.candidates : row.candidates.filter(payment => payment.status === status);
  const counts = { 1: 0, 2: 0, Д: 0, Х: 0 };
  for (const row of results) counts[row.group] += rowsFor(row).length;
  const visibleRows = results.filter(row => row.group === group).flatMap(row => {
    const { entry } = row;
    return rowsFor(row).map(payment => {
      const crmCodes = payment?.receiptCode?.split('/').map(code => code.toLowerCase().replace(/[-\s]/g, '')) ?? [];
      const matchingCode = row.matchingCodes.find(code => crmCodes.some(crmCode => crmCode.includes(code)));
      const shortCode = (matchingCode ?? crmCodes[crmCodes.length - 1])?.slice(-8);
      const parent = payment?.parentName || payment?.familyId || '—';
      const crmDate = payment?.actualPaymentDate ?? payment?.paymentDate;
      const orderNumber = entry.document.match(/№\s*(\d+)/)?.[1];
      const comment = correspondentName(entry);
      const bankCodes = matchingCode ? [matchingCode] : [];
      const raw = new Map(entry.source?.map(cell => [cell.label, cell.value]));
      const statementValues = [entry.document, paymentDate(entry.postingDate), raw.get('Наименование корреспондента'),
        raw.get('ИНН корреспондента'), raw.get('Оборот Кт') ?? String(entry.amount), raw.get('Назначение платежа')];
      const sortValues = statementOnly ? [entry.document, entry.postingDate, statementValues[2], statementValues[3], entry.amount, statementValues[5]] : [parent, payment?.amount, entry.amount, shortCode, bankCodes[0]?.slice(-8),
        crmDate, entry.postingDate, orderNumber, comment, payment?.status];
      return { row, entry, payment, bankCodes, shortCode, parent, crmDate, orderNumber, comment, statementValues, sortValues };
    });
  });
  if (sort) visibleRows.sort((a, b) => {
    const left = a.sortValues[sort.index];
    const right = b.sortValues[sort.index];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
    return sort.descending ? -order : order;
  });
  const ranges = history.map(statementRange);
  const allRange = ranges.length ? { from: ranges.map(item => item.from).sort()[0], to: ranges.map(item => item.to).sort().reverse()[0] } : null;
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const sourceValues = new Map(source?.source?.map(cell => [cell.label, cell.value]) ?? [
    ['Документ', source?.document ?? ''],
    ['Дата операции', source ? paymentDate(source.postingDate) : ''],
    ['Оборот Кт', source ? String(source.amount) : ''],
  ]);

  return <section className="reconcile-page" aria-label="Сверка платежей" style={{ display: 'grid', gap: 12, minHeight: 0, overflow: 'auto', alignContent: 'start' }}>
    <DashboardTopPanel className="dashboard-control-row">
      <div style={{ flex: 1 }}>
        <strong>Сверка платежей</strong>
        {history.length > 0 && <div style={{ color: 'var(--text-2)', fontSize: 12 }}>
          {entries.length} поступлений{month ? ' за месяц' : ''}
          {paymentsQuery.isFetching && !busy && ' · обновляем статусы…'}
        </div>}
      </div>
      <div className="ow-seg reconcile-groups" role="group" aria-label="Результат сверки">
        {groups.map(item => <button key={item.key} className="ow-seg-btn" type="button" title={item.label} aria-label={`${item.key} — ${item.label}`} aria-pressed={group === item.key}
          onClick={() => { setGroup(item.key); resetView(); }}>{item.key} · {counts[item.key]}</button>)}
      </div>
      <button className="ow-btn ow-btn--ghost" type="button" disabled={busy || confirming} onClick={() => fileInput.current?.click()}>
        <Upload size={16} aria-hidden="true" /> Загрузить выписку
      </button>
      <input ref={fileInput} type="file" accept=".xlsx" hidden aria-label="Выписка Мбанка" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void upload(file);
      }} />
    </DashboardTopPanel>
    {history.length > 0 && allRange && <div className="reconcile-history">
      <button type="button" disabled={busy || confirming} onClick={() => filesDialog.current?.showModal()}>
        <strong>Выписки: {paymentDate(allRange.from)} — {paymentDate(allRange.to)}</strong>
        <span>{history.length} {history.length === 1 ? 'файл' : history.length < 5 ? 'файла' : 'файлов'} · {allEntries.length} поступлений без повторов</span>
      </button>
    </div>}
    <dialog ref={filesDialog} className="reconcile-source reconcile-files-dialog" aria-label="Загруженные выписки">
      <form method="dialog"><button className="ow-btn ow-btn--ghost" type="submit">Закрыть</button></form>
      <h3>Загруженные выписки</h3>
      <p className="reconcile-files-hint">Строки, которые есть в нескольких выписках, учитываются один раз.</p>
      <ul className="reconcile-files">
        {history.map((item, index) => {
          const { from, to } = statementRange(item);
          return <li key={index}>
            <div><strong>{item.name}</strong><span>{paymentDate(from)} — {paymentDate(to)} · {item.entries.length} поступлений</span></div>
            <button type="button" className="ow-btn ow-btn--ghost" aria-label={`Удалить выписку ${item.name}`}
              disabled={busy || confirming} onClick={() => deleteStatement(item)}><X size={14} aria-hidden="true" /> Удалить</button>
          </li>;
        })}
      </ul>
    </dialog>
    {receipt && <ReceiptModal receiptUrl={receipt.url} paymentId={receipt.id} subtitle={receipt.parent}
      onClose={() => setReceipt(null)} />}
    <dialog ref={sourceDialog} className="reconcile-source" aria-label="Строка банковской выписки">
      <form method="dialog"><button className="ow-btn ow-btn--ghost" type="submit">Закрыть</button></form>
      <h3>Строка выписки</h3>
      {!source?.source && <p>Загрузите выписку повторно, чтобы увидеть исходную строку целиком.</p>}
      <div className="reconcile-source-scroll">
        <table>
          <thead><tr>{sourceHeaders.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody><tr>{sourceHeaders.map(label => <td key={label}>{sourceValues.get(label) || '—'}</td>)}</tr></tbody>
        </table>
      </div>
    </dialog>
    {busy && <p role="status">Сверяем поступления…</p>}
    {error && <p role="alert">{error}</p>}
    {paymentsQuery.isError && <p role="alert">
      Не удалось загрузить платежи CRM для сверки{results.length ? ', показан прошлый результат' : ''}.{' '}
      <button type="button" className="reconcile-link" onClick={() => void paymentsQuery.refetch()}>Повторить</button>
    </p>}
    {!history.length && !busy && <p>Загрузите выписку АйКай Мбанк в формате .xlsx.</p>}
    {history.length > 0 && !entries.length && !busy && <p>За этот месяц в загруженных выписках поступлений нет.</p>}
    {!!results.length && <div className="dt-root">
      <div className="dt-toolbar" style={{ justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        <div className="reconcile-open-statement">
          <strong>{groups.find(item => item.key === group)?.label}</strong>
        </div>
        {group !== 'Х' && group !== 'Д' && <div className="ow-seg reconcile-groups" role="group" aria-label="Статус платежа">
          {statuses.map(item => <button key={item.key} className="ow-seg-btn" type="button" aria-pressed={status === item.key}
            onClick={() => { setStatus(item.key); resetView(); }}>{item.label}</button>)}
        </div>}
        <button type="button" className="dt-btn" aria-label="Предыдущая страница" disabled={currentPage === 1}
          onClick={() => { setPage(currentPage - 1); setEditing(null); }}>‹</button>
        <span aria-live="polite">{currentPage} / {pageCount}</span>
        <button type="button" className="dt-btn" aria-label="Следующая страница" disabled={currentPage === pageCount}
          onClick={() => { setPage(currentPage + 1); setEditing(null); }}>›</button>
      </div><div className="dt-wrap" style={{ overflowX: 'auto' }}>
      <FilterableTable key={`${group}:${currentPage}`} className="dt-table reconcile-table" style={{ minWidth: statementOnly ? 1185 : 1300 }}>
        <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <thead><tr>{tableHeaders.map((header, index) => <th key={header} className="dt-th" scope="col"
          aria-sort={sort?.index === index ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
          <button type="button" className="dt-th-inner reconcile-sort" onClick={() => {
            setPage(1);
            setSort({ index, descending: sort?.index === index && !sort.descending });
          }}>
            <span>{header}</span>{sort?.index === index && <span aria-hidden="true">{sort.descending ? '↓' : '↑'}</span>}
          </button>
        </th>)}</tr></thead>
        <tbody>{pageRows.map(({ row, entry, payment, bankCodes, shortCode, parent, crmDate, orderNumber, comment, statementValues }) => statementOnly
          ? <tr className="dt-tr" key={entry.number}>
              {statementValues.map((value, index) => <td key={unmatchedHeaders[index]} className="dt-td reconcile-statement-cell">
                {value || '—'}
              </td>)}
            </tr>
          :
            <tr className="dt-tr" key={`${entry.number}:${payment?.id ?? ''}`}>
              {!statementOnly && <td className="dt-td" title={parent}>{payment && onOpenFamily
                ? <button type="button" className="reconcile-link reconcile-parent" onClick={() => {
                    setError('');
                    Promise.resolve(onOpenFamily(payment.familyId)).catch(err =>
                      setError(err instanceof Error ? err.message : 'Не удалось открыть карточку семьи.'));
                  }}>{parent}</button>
                : parent}</td>}
              {!statementOnly && <td className="dt-td">{payment ? payment.amount.toLocaleString('ru-RU') : '—'}</td>}
              <td className="dt-td">{entry.amount.toLocaleString('ru-RU')}</td>
              {!statementOnly && <td className="dt-td">{payment?.receiptUrl
                ? <button type="button" className="reconcile-link" title={payment.receiptCode || 'Открыть чек'}
                    onClick={() => setReceipt({ url: payment.receiptUrl!, id: payment.id, parent })}>{shortCode || 'Открыть чек'}</button>
                : <span title={payment?.receiptCode}>{shortCode || '—'}</span>}</td>}
              <td className="dt-td" title={bankCodes.join(' · ')}>{bankCodes.map(code => code.slice(-8)).join(' · ') || '—'}</td>
              {!statementOnly && <td className="dt-td">{crmDate ? paymentDate(crmDate) : '—'}</td>}
              <td className="dt-td">{paymentDate(entry.postingDate)}</td>
              <td className="dt-td"><button className="reconcile-link" type="button" onClick={() => {
                setSource(entry);
                sourceDialog.current?.showModal();
              }}>{orderNumber ?? 'Строка'}</button></td>
              <td className="dt-td">{comment ? <button type="button" className="reconcile-comment"
                aria-expanded={expandedComment === `${entry.number}:${payment?.id ?? ''}`}
                onClick={() => {
                  const key = `${entry.number}:${payment?.id ?? ''}`;
                  setExpandedComment(current => current === key ? null : key);
                }}>{comment}</button> : '—'}</td>
              {!statementOnly && <td className="dt-td">{payment && duplicateOfConfirmed(row, payment) && payment.status === 'На проверке'
                ? <span className="reconcile-duplicate">Дубль, не подтверждать</span>
                : payment?.status === 'На проверке' ? (
                editing?.number === entry.number && editing.paymentId === payment.id ? <div className="reconcile-confirm">
                  <input aria-label="Дата поступления" type="date" value={editing.date} disabled={confirming}
                    onChange={event => setEditing({ number: entry.number, paymentId: payment.id, date: event.target.value })} />
                  <button type="button" aria-label="Подтвердить" className="reconcile-approve" disabled={confirming || !editing.date}
                    onClick={() => void confirm(row, payment)}><Check size={14} /></button>
                  <button type="button" aria-label="Отмена" disabled={confirming} onClick={() => setEditing(null)}><X size={14} /></button>
                </div> : <button type="button" className="reconcile-review" disabled={busy || confirming}
                  onClick={() => setEditing({ number: entry.number, paymentId: payment.id, date: entry.postingDate })}><Pencil size={12} /> На проверке</button>
              ) : payment?.status === 'Подтверждено' ? 'Подтверждён' : '—'}</td>}
            </tr>)}
        {!visibleRows.length && <tr><td className="dt-td" colSpan={tableHeaders.length}>В этой группе нет поступлений.</td></tr>}</tbody>
      </FilterableTable>
    </div></div>}
  </section>;
}
