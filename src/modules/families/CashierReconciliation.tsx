import React, { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Upload, X } from 'lucide-react';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import { CASHIER_PERIODS, currentReconciliationMonth } from './constants';
import './cashierReconciliation.css';
import ReceiptModal from './ReceiptModal';
import FilterableTable from '../../core/tables/FilterableTable';
import { confirmFamilyPayment, fetchFamilyPayment, fetchReconciliationPayments } from '../../services/financeService';
import { readBankStatement, reconcileBankStatement, type StatementEntry } from './statementReconciliation';

type ReconciliationPayment = Awaited<ReturnType<typeof fetchReconciliationPayments>>[number];
type Result = ReturnType<typeof reconcileBankStatement<ReconciliationPayment>>[number];
type Statement = { name: string; entries: StatementEntry[]; uploadedMonth?: string; range?: { from: string; to: string } };

function statementRange(statement: Statement) {
  if (statement.range) return statement.range;
  const dates = statement.entries.map(entry => entry.postingDate).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

const groups = [
  { key: '1', label: 'Код и сумма совпали' },
  { key: '2', label: 'Код совпал, сумма отличается' },
  { key: '3', label: 'Совпали сумма и дата' },
  { key: 'Х', label: 'Без совпадений' },
] as const;
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

async function reconcile(entries: StatementEntry[]) {
  const dates = entries.flatMap(entry => [entry.operationDate ?? entry.postingDate, entry.postingDate]).sort();
  return reconcileBankStatement(entries, await fetchReconciliationPayments(dates[0], dates[dates.length - 1]));
}

export default function CashierReconciliation({ userId, userName, period, setPeriod }: {
  userId: string; userName?: string; period: string; setPeriod: (period: string) => void;
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
  const [statement, setStatement] = useState<Statement | null>(() => history[0] ?? null);
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; id: string; parent: string } | null>(null);
  const [source, setSource] = useState<StatementEntry | null>(null);
  const [editing, setEditing] = useState<{ number: number; paymentId: string; date: string } | null>(null);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [group, setGroup] = useState<Group>('1');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ index: number; descending: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(Boolean(statement));
  const [confirming, setConfirming] = useState(false);
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

  useEffect(() => {
    if (!statement) return;
    let active = true;
    setBusy(true);
    reconcile(statement.entries).then(rows => {
      if (active) setResults(rows);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Не удалось сверить выписку.');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [statement]);

  function openStatement(next: Statement) {
    if (statement === next) return;
    setResults([]);
    setGroup('1');
    setPage(1);
    setExpandedComment(null);
    setSort(null);
    setEditing(null);
    setBusy(true);
    setStatement(next);
  }

  async function upload(file: File) {
    setBusy(true);
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
      setPeriod(CASHIER_PERIODS.find(item => `${item.year}-${String(item.month).padStart(2, '0')}` === uploadedMonth)?.key ?? 'ALL');
      openStatement(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать выписку.');
      setBusy(false);
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
    if (statement === item) {
      setStatement(null);
      setResults([]);
      setEditing(null);
    }
  }

  async function confirm(row: Result, payment: ReconciliationPayment) {
    if (confirmationLock.current || payment.status !== 'На проверке' ||
        editing?.number !== row.entry.number || editing.paymentId !== payment.id || !editing.date) return;
    const actualPaymentDate = editing.date;
    if (row.group !== '1' && !window.confirm(
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
      setResults(current => current.map(item => ({ ...item, candidates: item.candidates.map(candidate =>
        candidate.id === payment.id ? { ...candidate, status: 'Подтверждено', actualPaymentDate: savedDate } : candidate
      ) })));
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
  const counts = { 1: 0, 2: 0, 3: 0, Х: 0 };
  for (const row of results) counts[row.group]++;
  const visibleRows = results.filter(row => row.group === group).flatMap(row => {
    const { entry, candidates } = row;
    return (candidates.length ? candidates : [undefined]).map(payment => {
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
  const openedRange = statement ? statementRange(statement) : null;
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const sourceValues = new Map(source?.source?.map(cell => [cell.label, cell.value]) ?? [
    ['Документ', source?.document ?? ''],
    ['Дата операции', source ? paymentDate(source.postingDate) : ''],
    ['Оборот Кт', source ? String(source.amount) : ''],
  ]);
  const selectedPeriod = CASHIER_PERIODS.find(item => item.key === period);
  const month = selectedPeriod && `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}`;
  const tiles = history.filter(item => !month || item.uploadedMonth === month);

  return <section aria-label="Сверка платежей" style={{ display: 'grid', gap: 12, minHeight: 0, overflow: 'auto', alignContent: 'start' }}>
    <DashboardTopPanel className="dashboard-control-row">
      <div style={{ flex: 1 }}>
        <strong>Сверка платежей</strong>
        {statement && <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{statement.name} · {statement.entries.length} поступлений</div>}
      </div>
      <div className="ow-seg reconcile-groups" role="group" aria-label="Результат сверки">
        {groups.map(item => <button key={item.key} className="ow-seg-btn" type="button" title={item.label} aria-label={`${item.key} — ${item.label}`} aria-pressed={group === item.key}
          onClick={() => { setGroup(item.key); setPage(1); setEditing(null); setSort(null); setExpandedComment(null); }}>{item.key} · {counts[item.key]}</button>)}
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
    {history.length > 0 && <div className="reconcile-history" aria-label="История выписок">
      {tiles.map(item => {
        const { from, to } = statementRange(item);
        return <div className="reconcile-tile" key={history.indexOf(item)}>
          <button type="button" aria-pressed={statement === item}
            disabled={busy || confirming} onClick={() => { setError(''); openStatement(item); }}>
            <strong>{item.name}</strong>
            <span>{paymentDate(from)} — {paymentDate(to)}</span>
          </button>
          <button type="button" className="reconcile-tile-delete" aria-label={`Удалить выписку ${item.name}`}
            title="Удалить из истории" disabled={busy || confirming} onClick={() => deleteStatement(item)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>;
      })}
      {!tiles.length && <p>За этот период выписок нет.</p>}
    </div>}
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
    {!statement && !busy && <p>{history.length ? 'Выберите выписку из истории.' : 'Загрузите выписку АйКай Мбанк в формате .xlsx.'}</p>}
    {!!results.length && <div className="dt-root">
      <div className="dt-toolbar" style={{ justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        {statement && openedRange && <div className="reconcile-open-statement">
          <strong title={statement.name}>{statement.name}</strong>
          <span>{paymentDate(openedRange.from)} — {paymentDate(openedRange.to)}</span>
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
              {!statementOnly && <td className="dt-td" title={parent}>{parent}</td>}
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
              {!statementOnly && <td className="dt-td">{payment?.status === 'На проверке' ? (
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
