import { OPEX_GROUPS, OPEX_GROUP_LABELS, OPEX_SUBCATEGORIES, CAPEX_SUBCATEGORIES, normalizeExpenseClassification } from './expenseClassification';
import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil, Trash2, ReceiptText, ChevronRight } from 'lucide-react';
import { UserRole } from '../../types';
import './SpendingModule.css';
import AllRecordsButton from '../../core/dashboard/AllRecordsButton';
import ExpenseComposer from './ExpenseComposer';
import ImportedExpenseForm from './ImportedExpenseForm';
import { fetchSpendingEntries, saveSpendingEntries, deleteSpendingEntry } from '../../services/spendingService';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../costs/expenseTypes';
import CogsPaymentForm from './CogsPaymentForm';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import { SCHOOL_TABS, isSchoolVisible, CASHIER_PERIODS, currentCashierPeriodKey } from '../families/constants';

export const SPENDING_CATEGORIES = {
  COGS: ['Авансы водителям', 'Зарплата водителей'],
  'Revenue Tax': ['Налог'],
  OPEX: OPEX_SUBCATEGORIES,
  CAPEX: CAPEX_SUBCATEGORIES,
  'Доп. Выезды': ['Оплата водителю', 'ГСМ', 'Транспорт и такси', 'Возврат', 'Прочее'],
  'Личное': ['Квартплата', 'Кредит', 'Лекарство', 'ГСМ', 'Продукты', 'Вещи', 'Учёба', 'Мероприятия', 'Развлечения', 'Транспорт и такси', 'Связь и интернет', 'Коммунальные услуги', 'Здоровье', 'Ремонт', 'Путешествия', 'Прочее'],
  Logistics: ['Оплата водителю', 'ГСМ', 'Транспорт и такси', 'Возврат', 'Прочее'],
};
type Category = keyof typeof SPENDING_CATEGORIES;
export type SpendingEntry = { sourceRef?: string; originalCategory?: string; originalSubcategory?: string; id: string; category: Category; subcategory: string; date: string; amount: number; description: string; recipient: string; method: string; schoolKey?: string; taxPeriodKey?: string; taxPeriods?: string[]; unitPrice?: number; quantity?: number; transferId?: string; driverId?: string; salaryPeriodKey?: string; paymentOrderNumber?: string; comment?: string; paymentOnly?: boolean; recipientKey?: string; transferNumber?: number; operationType?: string; departmentKey?: string; employeeId?: string; familyId?: string; childName?: string };
type Entry = SpendingEntry;
const descriptions: Record<Category, string> = {
  COGS: 'Авансы и зарплата водителям', 'Revenue Tax': 'Налог с выручки', OPEX: 'Офис и операционные расходы',
  CAPEX: 'Мебель и долгосрочное оборудование', 'Личное': 'Личные расходы', Logistics: 'Расходы вне школьных перевозок', 'Доп. Выезды': 'Расходы на дополнительные выезды',
};
const money = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bishkek' }).format(new Date());
const blank = (category: Category): Entry => ({ id: '', category, subcategory: SPENDING_CATEGORIES[category][0], date: today(), amount: 0, description: '', recipient: '', method: 'Безналичные' });
function readEntries(key: string): Entry[] {
  const stored: unknown = JSON.parse(localStorage.getItem(key) || '[]');
  const raw = Array.isArray(stored) ? stored.map(row => row && typeof row === 'object' ? normalizeExpenseClassification(row) : row) : stored;
  if (!Array.isArray(raw) || !raw.every(row => row && typeof row.id === 'string' && Object.prototype.hasOwnProperty.call(SPENDING_CATEGORIES, row.category) && SPENDING_CATEGORIES[row.category as Category].includes(row.subcategory) && typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount > 0 && typeof row.date === 'string' && typeof row.description === 'string' && typeof row.recipient === 'string' && typeof row.method === 'string')) throw new Error('Некорректные сохранённые записи');
  return raw;
}

export default function SpendingModule({ userId, role, sessionToken, onOpenClient, periodKey: controlledPeriodKey, onPeriodKeyChange, embedded = false, searchQuery = '', onTotalChange }: { onTotalChange?: (summary: { userId: string; periodKey: string; total: number | null }) => void; searchQuery?: string; periodKey?: string; onPeriodKeyChange?: (key: string) => void; embedded?: boolean; userId: string; role: UserRole; sessionToken?: string; onOpenClient?: (familyId: string) => Promise<void> }) {
  const workspace = useRef<HTMLDivElement>(null);
  const categoryBar = useRef<HTMLDivElement>(null);
  const scrollToCategories = () => categoryBar.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const scrollToWorkspace = () => requestAnimationFrame(() => workspace.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  const storageKey = `outway-spending-v1:${userId}`;
  const [initial] = useState(() => { try { return { rows: readEntries(storageKey), error: '' }; } catch { return { rows: [] as Entry[], error: 'Не удалось прочитать записи. Сохранение отключено, чтобы не потерять данные.' }; } });
  const [rows, setRows] = useState(initial.rows);
  const [error, setError] = useState(initial.error);
  const [busy, setBusy] = useState(!!sessionToken);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!sessionToken) return;
    let active = true;
    setBusy(true);
    setLoadFailed(false);
    (async () => {
      if (initial.error) throw new Error(initial.error);
      const local = initial.rows.filter(row => role === 'admin' || role === 'gen_director' || row.category !== 'Личное');
      await saveSpendingEntries(sessionToken, local.map(row => ({ ...row, id: `browser:${userId}:${row.id}` })), true);
      const remote = await fetchSpendingEntries(sessionToken);
      if (active) { setRows(remote); setError(''); }
    })().catch(reason => { if (active) { setLoadFailed(true); setError(reason instanceof Error ? reason.message : 'Не удалось загрузить расходы'); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [sessionToken, userId, initial, role, reloadKey]);
  const [localPeriodKey, setLocalPeriodKey] = useState(currentCashierPeriodKey);
  const periodKey = controlledPeriodKey ?? localPeriodKey;
  const setPeriodKey = onPeriodKeyChange ?? setLocalPeriodKey;
  const [category, setCategory] = useState<Category | 'ALL'>('COGS');
  const [allRecords, setAllRecords] = useState(false);
  const [recordsScrollRequest, setRecordsScrollRequest] = useState(0);
  const openAllRecords = () => {
    setAllRecords(true);
    setSchoolFilter(null);
    setRecordsScrollRequest(current => current + 1);
  };
  useEffect(() => {
    if (!recordsScrollRequest) return;
    const frame = requestAnimationFrame(() => {
      workspace.current?.querySelector<HTMLElement>('.spending-register')?.scrollIntoView?.({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [recordsScrollRequest]);

  const [draft, setDraft] = useState<Entry | null>(() => blank('COGS'));
  const [showFormReturn, setShowFormReturn] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const categories = categoryBar.current?.getBoundingClientRect();
      const rect = workspace.current?.getBoundingClientRect();
      setShowFormReturn(!!categories && categories.top < -20 && !!rect && rect.bottom > 0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [draft?.category, draft?.id]);

  useEffect(() => {
    if (!draft?.category || typeof ResizeObserver === 'undefined') return;
    const editor = workspace.current?.querySelector<HTMLElement>('.payment-composer-inline');
    if (!editor) return;
    const syncSize = () => workspace.current?.style.setProperty('--spending-editor-height', `${editor.getBoundingClientRect().height}px`);
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(editor);
    return () => observer.disconnect();
  }, [draft?.category, draft?.id]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const personalAllowed = role === 'admin' || role === 'gen_director';
  const categories: Category[] = ['COGS', 'Revenue Tax', 'OPEX', 'CAPEX', 'Доп. Выезды', 'Logistics', ...(personalAllowed ? ['Личное' as const] : [])];
  const periodRows = rows.filter(row => (personalAllowed || row.category !== 'Личное') && CASHIER_PERIODS.filter(period => periodKey === 'ALL' || period.key === periodKey).some(period => row.date.startsWith(`${period.year}-${String(period.month).padStart(2,'0')}`)));
  const periodTotal = periodRows.reduce((sum, row) => sum + row.amount, 0);
  useEffect(() => {
    onTotalChange?.({ userId, periodKey, total: busy || loadFailed || !!initial.error ? null : periodTotal });
  }, [onTotalChange, userId, periodKey, busy, loadFailed, initial.error, periodTotal]);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('ru-RU');
  const visible = periodRows.filter(row => (!normalizedSearch || [row.description, row.recipient, row.childName, row.category, row.subcategory, row.schoolKey, row.paymentOrderNumber, row.comment, String(row.amount)].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU').includes(normalizedSearch)) && (allRecords || !schoolFilter || (schoolFilter.startsWith('opex:') ? OPEX_GROUPS[schoolFilter.slice(5) as keyof typeof OPEX_GROUPS]?.includes(row.subcategory) : (row.schoolKey || 'unassigned') === schoolFilter)) && (allRecords || category === 'ALL' || row.category === category)).sort((a,b) => b.date.localeCompare(a.date));
  const persist = (next: Entry[], onSaved: () => void = () => {}) => {
    if (initial.error || busy || loadFailed) return false;
    if (sessionToken) {
      setBusy(true);
      const changed = next.filter(row => rows.find(old => old.id === row.id) !== row);
      const removed = rows.filter(row => !next.some(item => item.id === row.id));
      (async () => {
        await saveSpendingEntries(sessionToken, changed);
        for (const row of removed) await deleteSpendingEntry(sessionToken, row.id);
        setRows(await fetchSpendingEntries(sessionToken));
        setError('');
        window.dispatchEvent(new Event('outway-spending-updated'));
        onSaved();
      })().catch(reason => setError(reason instanceof Error ? reason.message : 'Не удалось сохранить расход'))
        .finally(() => setBusy(false));
      return true;
    }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event('outway-spending-updated')); setRows(next); setError(''); onSaved(); return true; }
    catch { setError('Не удалось сохранить. Проверьте свободное место и настройки браузера.'); return false; }
  };
  const schoolRows = (category === 'OPEX' ? Object.keys(OPEX_GROUPS).map(label => ({ key: `opex:${label}`, label })) : [...SCHOOL_TABS.filter(item => item.key !== 'ALL' && isSchoolVisible(item.key)).map(item => ({ key: item.key, label: item.label })), { key: 'unassigned', label: 'Общие расходы' }]).map(school => {
    const payments = visible.filter(row => (school.key.startsWith('opex:') ? OPEX_GROUPS[school.label as keyof typeof OPEX_GROUPS].includes(row.subcategory) : (row.schoolKey || 'unassigned') === school.key));
    return { ...school, count: payments.length, total: payments.reduce((sum,row) => sum + row.amount, 0), advance: payments.filter(row => row.subcategory === 'Авансы водителям').reduce((sum, row) => sum + row.amount, 0), salary: payments.filter(row => row.subcategory === 'Зарплата водителей').reduce((sum, row) => sum + row.amount, 0) };
  }).filter(school => school.key !== 'unassigned' || school.total > 0);
  const openNewExpense = () => { setAllRecords(false); setDraft(blank(category === 'ALL' ? 'COGS' : category)); if (category === 'ALL') setCategory('COGS'); setSchoolFilter(null); setDeleting(null); scrollToWorkspace(); };
  return <section className={`spending-module${pickerOpen ? ' has-picker' : ''}`} aria-label="Расходы">
    {!embedded && <header className="spending-header"><div><span className="spending-eyebrow">УПРАВЛЕНИЕ РАСХОДАМИ</span><h1>Расходы</h1></div><div className="spending-finance-periods"><ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} periods={CASHIER_PERIODS} /></div></header>}
    {error && <p role="alert" className="spending-error">{error}{loadFailed && <button type="button" onClick={() => setReloadKey(value => value + 1)}>Повторить загрузку</button>}</p>}{busy && <p role="status">Обработка расходов…</p>}
    <div className="spending-categories" ref={categoryBar}>{categories.map(key => <button key={key} className={key === 'Личное' ? 'spending-personal-tile' : undefined} aria-pressed={category === key} onClick={() => { setAllRecords(false); setCategory(key);  setSchoolFilter(null); setDraft(blank(key)); scrollToWorkspace(); }}><span className="spending-category-name">{key}</span><span className="spending-category-description">{descriptions[key]}</span><strong>{money(periodRows.filter(row => row.category === key).reduce((sum, row) => sum + row.amount, 0))}</strong><small>{periodRows.filter(row => row.category === key).length} операций</small></button>)}</div>
    <div className="spending-workspace" ref={workspace}>
    {!allRecords && !normalizedSearch && draft?.sourceRef && <ImportedExpenseForm key={draft.id} entry={draft} disabled={busy || loadFailed} onCancel={() => setDraft(null)} onAllRecords={openAllRecords} onSave={entry => persist(rows.map(row => row.id === entry.id ? entry : row), () => setDraft(null))} />}

    {!allRecords && !normalizedSearch && !draft?.sourceRef && (draft?.category === 'COGS' || draft?.category === 'Доп. Выезды' || draft?.category === 'Logistics') && <div className="spending-cogs-editor"><CogsPaymentForm onAllRecords={openAllRecords} sessionToken={sessionToken} onPanelChange={setPickerOpen} key={`${draft.category}:${draft.id || 'new'}`} entry={draft} disabled={!!initial.error || busy || loadFailed} onCancel={() => { setDraft(null); scrollToWorkspace(); }} onSave={entries => { const next = draft.id ? rows.map(row => row.id === draft.id ? entries[0] : row) : [...rows, ...entries]; return persist(next, () => { setDraft(null); setCategory(draft.category); setSchoolFilter(null); }); }} /></div>}
    {!allRecords && !normalizedSearch && draft && !draft.sourceRef && draft.category !== 'COGS' && draft.category !== 'Доп. Выезды' && draft.category !== 'Logistics' && <ExpenseComposer onAllRecords={openAllRecords} key={`${draft.category}:${draft.id || 'new'}`} entry={draft} onOpenClient={onOpenClient} subcategories={SPENDING_CATEGORIES[draft.category]} onSavePayroll={entries => { return persist(draft.id ? rows.flatMap(row => row.id === draft.id ? entries : [row]) : [...rows, ...entries], () => { setCategory(draft.category); setDraft(null); }); }} disabled={!!initial.error || busy || loadFailed} onCancel={() => { setDraft(null); scrollToWorkspace(); }} onSave={entry => { return persist(draft.id ? rows.map(row => row.id === draft.id ? entry : row) : [...rows, entry], () => { setCategory(entry.category); setDraft(null); }); }} />}
    {(allRecords || !draft || normalizedSearch) && <div className={`spending-register${!allRecords && category !== 'ALL' && category !== 'Revenue Tax' && category !== 'CAPEX' && category !== 'Личное' && !schoolFilter && !normalizedSearch ? ' spending-register-schools' : ''}`}><div className="spending-register-heading"><h2>{allRecords ? 'Все записи' : category === 'ALL' ? 'Все расходы' : schoolFilter?.startsWith('opex:') ? (OPEX_GROUP_LABELS[schoolFilter.slice(5)] || schoolFilter.slice(5)) : schoolFilter ? SCHOOL_TABS.find(item => item.key === schoolFilter)?.label || 'Без привязки к школе' : category}</h2><div className="spending-actions"><AllRecordsButton label="Все записи" onClick={openAllRecords} /><button type="button" className="payment-close" aria-label="Вернуться к новому расходу" title="Новый расход" onClick={openNewExpense}><X size={20} aria-hidden="true" /></button></div></div>
      {!allRecords && category !== 'ALL' && category !== 'Revenue Tax' && category !== 'CAPEX' && category !== 'Личное' && !schoolFilter && !normalizedSearch ? <div className="spending-table-wrap"><table aria-label={category === 'COGS' ? 'Выплаты по школам' : 'Расходы по школам'}><thead><tr><th>{category === 'OPEX' ? 'Статья расходов' : 'Школа'}</th><th className="spending-number">{category === 'COGS' ? 'Выплата аванса' : 'Расходы'}</th><th className="spending-number">{category === 'COGS' ? 'Выплата зарплаты' : 'Операций'}</th><th className="spending-number">Итого</th></tr></thead><tbody>{schoolRows.map(school => <tr key={school.key}><td><button className="spending-school-link" onClick={() => setSchoolFilter(school.key)}>{school.key.startsWith('opex:') ? OPEX_GROUP_LABELS[school.label] || school.label : school.label}<ChevronRight size={15} /></button></td><td className="spending-number">{money(category === 'COGS' ? school.advance : school.total)}</td><td className="spending-number">{category === 'COGS' ? money(school.salary) : school.count}</td><td className="spending-number"><b>{money(school.total)}</b></td></tr>)}</tbody><tfoot><tr><td>Итого</td><td className="spending-number">{money(schoolRows.reduce((sum, school) => sum + (category === 'COGS' ? school.advance : school.total), 0))}</td><td className="spending-number">{category === 'COGS' ? money(schoolRows.reduce((sum, school) => sum + school.salary, 0)) : schoolRows.reduce((sum,school) => sum + school.count,0)}</td><td className="spending-number">{money(schoolRows.reduce((sum, school) => sum + school.total, 0))}</td></tr></tfoot></table></div> : <>
      {!allRecords && schoolFilter && <button className="spending-back" onClick={() => setSchoolFilter(null)}>← Все статьи</button>}
      <div className="spending-table-wrap"><table aria-label="Записи расходов"><thead><tr><th>#</th><th>Наименование расхода</th><th>Категория</th><th>Подкатегория</th><th>Дата</th><th>Период</th><th>Получатель</th><th>Оплата</th><th>Платёжное поручение</th><th>Комментарий</th><th className="spending-number">Сумма</th><th>Действия</th></tr></thead><tbody>{visible.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.description}</td><td>{row.originalCategory ? EXPENSE_CATEGORIES[row.originalCategory as ExpenseCategory]?.label || row.originalCategory : row.category}</td><td>{row.originalSubcategory || row.subcategory}</td><td>{row.date.split('-').reverse().join('.')}</td><td>{(row.taxPeriods?.length || row.taxPeriodKey) && <small>Налоговый период: {row.taxPeriods?.join(', ') || row.taxPeriodKey}</small>}{row.salaryPeriodKey && <small>{row.salaryPeriodKey.slice(0, 7)}{row.salaryPeriodKey.length > 7 && <> · {row.salaryPeriodKey.endsWith("-1") ? "1–15" : "16–конец месяца"}</>}</small>}</td><td>{row.recipient || '—'}</td><td>{row.method}</td><td>{row.paymentOrderNumber || '—'}</td><td>{row.comment || '—'}</td><td className="spending-number">{money(row.amount)}</td><td>{deleting === row.id ? <div className="spending-actions"><button disabled={busy || loadFailed} onClick={() => { persist(rows.filter(item => item.id !== row.id), () => setDeleting(null)); }}>Удалить?</button><button onClick={() => setDeleting(null)}>Отмена</button></div> : <div className="spending-actions"><button aria-label={`Редактировать ${row.description}`} onClick={() => { setAllRecords(false); setDraft({ ...row }); setDeleting(null); scrollToWorkspace(); }}><Pencil size={15} /></button><button disabled={busy || loadFailed} aria-label={`Удалить ${row.description}`} onClick={() => setDeleting(row.id)}><Trash2 size={15} /></button></div>}</td></tr>)}</tbody>{visible.length > 0 && <tfoot><tr><td colSpan={10}>Итого по выбранным записям · {visible.length}</td><td className="spending-number">{money(visible.reduce((sum, row) => sum + row.amount, 0))}</td><td /></tr></tfoot>}</table></div>
      {!visible.length && <div className="spending-empty"><ReceiptText size={30} aria-hidden="true" /><h3>Расходов пока нет</h3><p>{rows.length ? 'Измените период или фильтры либо добавьте новый расход.' : 'Добавьте первый расход — он появится в реестре и итогах категории.'}</p></div>}
    </>}
    </div>}
    </div>
    {showFormReturn && <button type="button" className="spending-return-to-form" aria-label="Вернуться к категориям расходов" title="Вернуться к категориям расходов" onClick={scrollToCategories}><span aria-hidden="true"><i /><i /></span></button>}
  </section>;
}
