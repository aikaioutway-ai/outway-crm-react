import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheckBig, Copy, FileText, Landmark, Pencil, Upload, X, type LucideIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePaymentsTable, useReconciliationPayments } from '../../hooks/useCrmQueries';
import { QK } from '../../services/queryClient';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import { currentReconciliationMonth } from './constants';
import PaymentDecisionModal, { type PaymentDecision } from './PaymentDecisionModal';
import './cashierReconciliation.css';
import ReceiptModal from './ReceiptModal';
import FilterableTable from '../../core/tables/FilterableTable';
import { applyPaymentDecision, fetchFamilyPayment, type fetchReconciliationPayments } from '../../services/financeService';
import { mergeStatements, readBankStatement, reconcileBankStatement, type StatementEntry } from './statementReconciliation';
import { deleteBankStatement, fetchBankStatements, saveBankStatement, type BankStatement } from '../../services/bankStatementService';

type ReconciliationPayment = Awaited<ReturnType<typeof fetchReconciliationPayments>>[number];
type Result = ReturnType<typeof reconcileBankStatement<ReconciliationPayment>>[number];
type Statement = BankStatement;

function readLegacyStatements(key: string): Statement[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? 'null');
    const list = Array.isArray(saved) ? saved : saved?.entries?.length ? [saved] : [];
    return list.filter((item: Statement) => item?.name && Array.isArray(item.entries) && item.entries.length);
  } catch {
    return [];
  }
}

function clearLegacyStatements(key: string) {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // Повторный перенос не создаст дублей: база отбрасывает одинаковые выписки.
  }
}

function statementRange(statement: Statement) {
  if (statement.range) return statement.range;
  const dates = statement.entries.map(entry => entry.postingDate).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

// Иконка с красным крестиком в углу: лист — нет в CRM, банк — нет в выписке.
function missingIcon(Base: LucideIcon) {
  return function MissingIcon({ size = 16 }: { size?: number }) {
    return <span className="reconcile-icon-badge" aria-hidden="true">
      <Base size={size} />
      <X size={Math.round(size * 0.62)} strokeWidth={3.5} className="reconcile-icon-badge-x" />
    </span>;
  };
}
const NotInCrmIcon = missingIcon(FileText);
const NotInStatementIcon = missingIcon(Landmark);

const groups = [
  { key: '1', title: 'Совпали', label: 'Совпали: код чека и сумма совпали с выпиской', Icon: CircleCheckBig },
  { key: '2', title: 'Частично', label: 'Частично: код совпал, а сумма нет, или совпали только сумма и дата', Icon: CircleAlert },
  { key: 'Д', title: 'Дубли', label: 'Дубли: один чек привязан к нескольким платежам CRM', Icon: Copy },
  { key: 'missing', title: 'Нет в выписке', label: 'Нет в выписке: платёж переводом есть в CRM, а в выписке его нет', Icon: NotInStatementIcon },
  { key: 'Х', title: 'Нет в CRM', label: 'Нет в CRM: поступление в выписке без платежа в CRM', Icon: NotInCrmIcon },
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

const missingHeaders = ['Школа', 'Родитель', 'Сумма CRM', 'Код чека CRM', 'Дата CRM', 'Статус'];
const missingWidths = [90, 260, 120, 160, 110, 140];

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

// Окно закрывается кликом по затемнённому фону вокруг него.
function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
    event.currentTarget.close();
  }
}

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

export function useCashierReconciliationSummary(sessionToken?: string, enabled = false) {
  const statements = useQuery({
    queryKey: ['cashier-summary-statements', sessionToken],
    queryFn: () => fetchBankStatements(sessionToken),
    enabled: enabled && !!sessionToken,
  });
  const entries = useMemo(() => mergeStatements(statements.data ?? []), [statements.data]);
  const range = useMemo(() => entries.length ? paymentRange(entries) : null, [entries]);
  const payments = useReconciliationPayments(range);
  const counts = { '1': 0, '2': 0, 'Д': 0 };
  if (!statements.data || (range && !payments.data)) return null;
  for (const row of reconcileBankStatement(entries, payments.data ?? [])) {
    if (row.group === 'Х') continue;
    counts[row.group] += row.candidates.filter(payment => payment.status === 'На проверке').length;
  }
  return counts;
}

export default function CashierReconciliation({ userId, userName, userRole, sessionToken, onOpenFamily, resultTiles }: {
  resultTiles?: boolean;
  userId: string; userName?: string; userRole?: string; sessionToken?: string;
  onOpenFamily?: (familyId: string) => Promise<void> | void;
}) {
  // Старые выписки лежали только в браузере: при открытии переносим их в базу.
  const legacyKey = `cashier-reconciliation:v1:${userId}`;
  const [history, setHistory] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PaymentStatus>('На проверке');
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; id: string; parent: string } | null>(null);
  const [source, setSource] = useState<StatementEntry | null>(null);
  // Окно решения по платежу: подтвердить / отклонить / удалить.
  const [deciding, setDeciding] = useState<{ row: Result; payment: ReconciliationPayment } | null>(null);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const filesDialog = useRef<HTMLDialogElement>(null);
  const [group, setGroup] = useState<Group>('1');
  const [groupOpen, setGroupOpen] = useState(false);
  const showResultGrid = resultTiles && !groupOpen;
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ index: number; descending: boolean } | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const queryClient = useQueryClient();
  // Все загруженные выписки сверяются как одна, за весь период сразу.
  const allEntries = useMemo(() => mergeStatements(history), [history]);
  const entries = allEntries;
  const range = useMemo(() => entries.length ? paymentRange(entries) : null, [entries]);
  const paymentsQuery = useReconciliationPayments(range);
  const results: Result[] = useMemo(() => entries.length && paymentsQuery.data
    ? reconcileBankStatement(entries, paymentsQuery.data) : [], [entries, paymentsQuery.data]);
  // «Нет в выписке»: платежи CRM за те же даты, которые не нашлись ни в одной строке выписки.
  const missingPayments = useMemo<ReconciliationPayment[]>(() => {
    if (!results.length || !paymentsQuery.data) return [];
    const matched = new Set(results.flatMap(row => row.candidates.map(payment => payment.id)));
    return (paymentsQuery.data as ReconciliationPayment[]).filter(payment => !matched.has(payment.id));
  }, [results, paymentsQuery.data]);
  // Школу платежа берём из общей таблицы платежей кассира (она уже в кэше).
  const paymentsTable = usePaymentsTable({ enabled: group === 'missing' });
  const schoolByPayment = useMemo(() => new Map((paymentsTable.data ?? []).map(row => [row.id, row.branchShort])),
    [paymentsTable.data]);
  const busy = loading || reading || (entries.length > 0 && paymentsQuery.isPending);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const legacy = readLegacyStatements(legacyKey);
        for (const statement of legacy) await saveBankStatement(statement, sessionToken);
        if (legacy.length) clearLegacyStatements(legacyKey);
        const saved = await fetchBankStatements(sessionToken);
        if (!cancelled) {
          setHistory(saved);
          queryClient.setQueryData(['cashier-summary-statements', sessionToken], saved);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить выписки.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [legacyKey, sessionToken, queryClient]);

  function resetView() {
    setPage(1);
    setExpandedComment(null);
    setSort(null);
  }

  // Можно выбрать сразу несколько выписок: каждая сохраняется отдельно,
  // ошибка в одном файле не мешает сохранить остальные.
  async function upload(files: File[]) {
    setReading(true);
    setError('');
    const uploadedMonth = currentReconciliationMonth();
    const failed: string[] = [];
    for (const file of files) {
      try {
        const next = await saveBankStatement({ name: file.name, uploadedMonth, ...await readBankStatement(file) }, sessionToken);
        void queryClient.invalidateQueries({ queryKey: ['cashier-summary-statements', sessionToken] });
        setHistory(current => [next, ...current.filter(item => item.id !== next.id)]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось прочитать выписку.';
        failed.push(files.length > 1 ? `${file.name}: ${message}` : message);
      }
    }
    resetView();
    setError(failed.join('\n'));
    setReading(false);
  }

  async function deleteStatement(item: Statement) {
    if (!item.id || !window.confirm(`Удалить выписку ${item.name} для всех сотрудников?`)) return;
    setError('');
    try {
      await deleteBankStatement(item.id, sessionToken);
      void queryClient.invalidateQueries({ queryKey: ['cashier-summary-statements', sessionToken] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить выписку.');
      return;
    }
    setHistory(current => current.filter(saved => saved.id !== item.id));
    resetView();
  }

  // В окне нужны свежие комментарии менеджера и кассира — берём платёж из базы.
  async function openDecision(row: Result, payment: ReconciliationPayment) {
    setError('');
    try {
      const fresh = await fetchFamilyPayment(payment.id);
      setDeciding({ row, payment: { ...payment, comment: fresh.comment, cashierComment: fresh.cashierComment } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть платёж.');
    }
  }

  // Решение из окна. Перед подтверждением проверяем, что платёж не изменился, пока открыта сверка.
  async function decide(row: Result, payment: ReconciliationPayment, decision: PaymentDecision,
    values: { date: string; comment: string }): Promise<string | void> {
    if (decision === 'confirm') {
      if (duplicateOfConfirmed(row, payment)) return 'Этот чек уже подтверждён у другого платежа.';
      if (row.group === 'Д' && !window.confirm(
        `Этот чек привязан к ${row.candidates.length} платежам CRM. Подтвердить только платёж ${payment.parentName || payment.familyId} на ${payment.amount.toLocaleString('ru-RU')} сом?`
      )) return 'Подтверждение отменено.';
      if (row.group === '2' && payment.amount !== row.entry.amount && !window.confirm(
        `Подтвердить платёж CRM на ${payment.amount.toLocaleString('ru-RU')} сом? Сумма в выписке: ${row.entry.amount.toLocaleString('ru-RU')} сом.`
      )) return 'Подтверждение отменено.';
    }
    const fresh = await fetchFamilyPayment(payment.id);
    if (fresh.status !== 'На проверке' || fresh.amount !== payment.amount || fresh.receiptCode !== payment.receiptCode) {
      return 'Платёж уже изменился в CRM. Закройте окно — сверка обновится.';
    }
    await applyPaymentDecision(fresh, decision, values, { name: userName, sessionToken });
    // Сразу меняем строку в сверке; остальные разделы CRM обновятся сами.
    if (range) queryClient.setQueryData<ReconciliationPayment[]>(QK.reconciliationPayments(range.from, range.to), (list: ReconciliationPayment[] | undefined) =>
      decision === 'confirm'
        ? list?.map(item => item.id === payment.id ? { ...item, status: 'Подтверждено', actualPaymentDate: values.date, cashierComment: values.comment } : item)
        : list?.filter(item => item.id !== payment.id));
  }

  const statementOnly = group === 'Х';
  const crmOnly = group === 'missing';
  const statusCounts = { '1': [0, 0], '2': [0, 0], missing: [0, 0] };
  if (showResultGrid) {
    for (const row of results) {
      if (row.group === 'Х' || row.group === 'Д') continue;
      for (const payment of row.candidates) {
        if (payment.status === 'На проверке') statusCounts[row.group][0]++;
        if (payment.status === 'Подтверждено') statusCounts[row.group][1]++;
      }
    }
    for (const payment of missingPayments) {
      if (payment.status === 'На проверке') statusCounts.missing[0]++;
      if (payment.status === 'Подтверждено') statusCounts.missing[1]++;
    }
  }
  const tableHeaders = statementOnly ? unmatchedHeaders : crmOnly ? missingHeaders : headers;
  const widths = statementOnly ? unmatchedWidths : crmOnly ? missingWidths : columnWidths;
  // Строки с платежом показываем по статусу платежа; поступления без платежа (Х) статуса не имеют.
  // Дубли показываем все сразу, независимо от статуса: так видно, какой из них уже подтверждён.
  const rowsFor = (row: Result) => row.group === 'Х' ? [undefined]
    : row.group === 'Д' ? row.candidates : row.candidates.filter(payment => payment.status === status);
  const counts: Record<Group, number> = { 1: 0, 2: 0, Д: 0, Х: 0, missing: 0 };
  for (const row of results) counts[row.group] += rowsFor(row).length;
  const missingRows = missingPayments.filter(payment => payment.status === status).map(payment => {
    const parent = payment.parentName || payment.familyId;
    const crmDate = payment.actualPaymentDate ?? payment.paymentDate;
    const school = schoolByPayment.get(payment.id) || '';
    const crmCodes = payment.receiptCode?.split('/').map(code => code.toLowerCase().replace(/[-\s]/g, '')) ?? [];
    const shortCode = crmCodes[crmCodes.length - 1]?.slice(-8);
    return { payment, parent, crmDate, school, shortCode, sortValues: [school, parent, payment.amount, shortCode, crmDate, payment.status] };
  });
  counts.missing = missingRows.length;
  if (sort && crmOnly) missingRows.sort((a, b) => {
    const left = a.sortValues[sort.index];
    const right = b.sortValues[sort.index];
    if (left == null || left === '') return right == null || right === '' ? 0 : 1;
    if (right == null || right === '') return -1;
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
    return sort.descending ? -order : order;
  });
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
  const rowTotal = crmOnly ? missingRows.length : visibleRows.length;
  const pageCount = Math.max(1, Math.ceil(rowTotal / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = crmOnly ? [] : visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const missingPage = crmOnly ? missingRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : [];
  const sourceValues = new Map(source?.source?.map(cell => [cell.label, cell.value]) ?? [
    ['Документ', source?.document ?? ''],
    ['Дата операции', source ? paymentDate(source.postingDate) : ''],
    ['Оборот Кт', source ? String(source.amount) : ''],
  ]);

  return <section className={`reconcile-page${resultTiles && groupOpen ? ' reconcile-group-open' : ''}`} aria-label="Сверка платежей" style={{ display: 'grid', gap: 12, minHeight: 0, overflow: 'auto', alignContent: 'start' }}>
    <DashboardTopPanel className={`dashboard-control-row${resultTiles && groupOpen ? ' reconcile-detail-toolbar' : ''}`}>
      {resultTiles && groupOpen && <button className="ow-btn ow-btn--ghost" type="button" onClick={() => { setGroupOpen(false); resetView(); }}>
        К группам
      </button>}
      <div style={{ flex: 1 }}>
        {resultTiles && groupOpen ? <div className="ow-seg reconcile-detail-groups" role="group" aria-label="Группы сверки">
          {groups.map(({ key, title }) => <button key={key} className="ow-seg-btn" type="button"
            aria-pressed={group === key} onClick={() => { setGroup(key); resetView(); }}>{title}</button>)}
        </div> : <strong>Сверка платежей</strong>}
        {history.length > 0 && <div style={{ color: 'var(--text-2)', fontSize: 12 }}>
          {entries.length} поступлений
          {paymentsQuery.isFetching && !busy && ' · обновляем статусы…'}
        </div>}
      </div>
      {!resultTiles && <div className="ow-seg reconcile-groups" role="group" aria-label="Результат сверки">
        {groups.map(({ key, title, label, Icon }) => <button key={key} className="ow-seg-btn reconcile-group-btn" type="button" title={label}
          aria-label={`${title}: ${counts[key]}`} aria-pressed={group === key}
          onClick={() => { setGroup(key); resetView(); }}><Icon size={16} aria-hidden="true" /><span>{counts[key]}</span></button>)}
      </div>}
      <button className="ow-btn ow-btn--ghost" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
        <Upload size={16} aria-hidden="true" /> Загрузить выписки
      </button>
      <input ref={fileInput} type="file" accept=".xlsx" multiple hidden aria-label="Выписки Мбанка" onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (files.length) void upload(files);
      }} />
    </DashboardTopPanel>
    {history.length > 0 && allRange && <div className="reconcile-history">
      <button type="button" disabled={busy} onClick={() => filesDialog.current?.showModal()}>
        <strong>Выписки: {paymentDate(allRange.from)} — {paymentDate(allRange.to)}</strong>
        <span>{history.length} {history.length === 1 ? 'файл' : history.length < 5 ? 'файла' : 'файлов'} · {allEntries.length} поступлений без повторов</span>
      </button>
    </div>}
    <dialog ref={filesDialog} className="reconcile-source reconcile-files-dialog" aria-label="Загруженные выписки" onClick={closeOnBackdrop}>
      <form method="dialog"><button className="ow-btn ow-btn--ghost" type="submit">Закрыть</button></form>
      <h3>Загруженные выписки</h3>
      <p className="reconcile-files-hint">Строки, которые есть в нескольких выписках, учитываются один раз.</p>
      <ul className="reconcile-files">
        {history.map((item, index) => {
          const { from, to } = statementRange(item);
          return <li key={index}>
            <div><strong>{item.name}</strong><span>{paymentDate(from)} — {paymentDate(to)} · {item.entries.length} поступлений</span></div>
            <button type="button" className="ow-btn ow-btn--ghost" aria-label={`Удалить выписку ${item.name}`}
              disabled={busy} onClick={() => void deleteStatement(item)}><X size={14} aria-hidden="true" /> Удалить</button>
          </li>;
        })}
      </ul>
    </dialog>
    {deciding && <PaymentDecisionModal
      title={`${deciding.payment.parentName || deciding.payment.familyId} · ${deciding.payment.amount.toLocaleString('ru-RU')} сом`}
      subtitle={`Выписка: ${deciding.row.entry.amount.toLocaleString('ru-RU')} сом, ${paymentDate(deciding.row.entry.postingDate)}`}
      note={deciding.row.group === '2' && deciding.payment.amount !== deciding.row.entry.amount
        ? `Сумма в CRM и в выписке разная: ${deciding.payment.amount.toLocaleString('ru-RU')} и ${deciding.row.entry.amount.toLocaleString('ru-RU')} сом.` : undefined}
      defaultDate={deciding.row.entry.postingDate}
      managerComment={deciding.payment.comment}
      defaultComment={deciding.payment.cashierComment ?? ''}
      canDelete={userRole === 'admin' || userRole === 'gen_director' || userRole === 'cashier'}
      onDecide={(decision, values) => decide(deciding.row, deciding.payment, decision, values)}
      onClose={() => setDeciding(null)} />}
    {receipt && <ReceiptModal receiptUrl={receipt.url} paymentId={receipt.id} subtitle={receipt.parent}
      onClose={() => setReceipt(null)} />}
    <dialog ref={sourceDialog} className="reconcile-source" aria-label="Строка банковской выписки" onClick={closeOnBackdrop}>
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
    {error && <p role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
    {paymentsQuery.isError && <p role="alert">
      Не удалось загрузить платежи CRM для сверки{results.length ? ', показан прошлый результат' : ''}.{' '}
      <button type="button" className="reconcile-link" onClick={() => void paymentsQuery.refetch()}>Повторить</button>
    </p>}
    {loading && <p>Загружаем выписки…</p>}
    {!history.length && !busy && <p>Загрузите выписки АйКай Мбанк в формате .xlsx — можно несколько файлов сразу.</p>}
    {showResultGrid && <div className="manager-metric-panel manager-school-grid cashier2-reconciliation-tiles" role="group" aria-label="Результаты сверки">
      {groups.map(({ key, title, label, Icon }) => (
        <button key={key} type="button" title={label} onClick={() => { setGroup(key); resetView(); setGroupOpen(true); }}>
          <span className="manager-school-identity"><Icon size={20} aria-hidden="true" /><span>{title}</span></span>
          {key === 'Х' || key === 'Д' ? <strong>{counts[key]}</strong> : <span>
            <span className="manager-mode-metric"><span>На проверке</span><strong>{statusCounts[key][0]}</strong></span>
            <span className="manager-mode-metric"><span>Подтверждено</span><strong>{statusCounts[key][1]}</strong></span>
          </span>}
        </button>
      ))}
    </div>}
    {!showResultGrid && (results.length > 0 || (resultTiles && history.length > 0)) && <div className="dt-root">
      <div className="dt-toolbar" style={{ justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        <div className="reconcile-open-statement">
          <strong>{groups.find(item => item.key === group)?.label}</strong>
        </div>
        {group !== 'Х' && group !== 'Д' && <div className="ow-seg reconcile-groups" role="group" aria-label="Статус платежа">
          {statuses.map(item => <button key={item.key} className="ow-seg-btn" type="button" aria-pressed={status === item.key}
            onClick={() => { setStatus(item.key); resetView(); }}>{item.label}</button>)}
        </div>}
        <button type="button" className="dt-btn" aria-label="Предыдущая страница" disabled={currentPage === 1}
          onClick={() => setPage(currentPage - 1)}>‹</button>
        <span aria-live="polite">{currentPage} / {pageCount}</span>
        <button type="button" className="dt-btn" aria-label="Следующая страница" disabled={currentPage === pageCount}
          onClick={() => setPage(currentPage + 1)}>›</button>
      </div><div className="dt-wrap" style={{ overflowX: 'auto' }}>
      <FilterableTable key={`${group}:${currentPage}`} className="dt-table reconcile-table" style={{ minWidth: statementOnly ? 1185 : crmOnly ? 880 : 1300 }}>
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
        <tbody>{missingPage.map(({ payment, parent, crmDate, school, shortCode }) => <tr className="dt-tr" key={payment.id}>
          <td className="dt-td">{school || 'Без школы'}</td>
          <td className="dt-td" title={parent}>{onOpenFamily
            ? <button type="button" className="reconcile-link reconcile-parent" onClick={() => {
                setError('');
                Promise.resolve(onOpenFamily(payment.familyId)).catch(err =>
                  setError(err instanceof Error ? err.message : 'Не удалось открыть карточку семьи.'));
              }}>{parent}</button>
            : parent}</td>
          <td className="dt-td">{payment.amount.toLocaleString('ru-RU')}</td>
          <td className="dt-td">{payment.receiptUrl
            ? <button type="button" className="reconcile-link" title={payment.receiptCode || 'Открыть чек'}
                onClick={() => setReceipt({ url: payment.receiptUrl!, id: payment.id, parent })}>{shortCode || 'Открыть чек'}</button>
            : <span title={payment.receiptCode}>{shortCode || '—'}</span>}</td>
          <td className="dt-td">{crmDate ? paymentDate(crmDate) : '—'}</td>
          <td className="dt-td">{payment.status === 'Подтверждено' ? 'Подтверждён' : payment.status}</td>
        </tr>)}
        {pageRows.map(({ row, entry, payment, bankCodes, shortCode, parent, crmDate, orderNumber, comment, statementValues }) => statementOnly
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
                : payment?.status === 'На проверке'
                  ? <button type="button" className="reconcile-review" disabled={busy}
                      onClick={() => void openDecision(row, payment)}><Pencil size={12} /> На проверке</button>
                  : payment?.status === 'Подтверждено' ? 'Подтверждён' : '—'}</td>}
            </tr>)}
        {!rowTotal && <tr><td className="dt-td" colSpan={tableHeaders.length}>{crmOnly ? 'Все платежи CRM за эти даты есть в выписке.' : 'В этой группе нет поступлений.'}</td></tr>}</tbody>
      </FilterableTable>
    </div></div>}
  </section>;
}
