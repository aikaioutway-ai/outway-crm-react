import { OPEX_GROUPS, OPEX_GROUP_LABELS, OPEX_SUBCATEGORIES, CAPEX_SUBCATEGORIES, normalizeExpenseClassification } from './expenseClassification';
import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil, Trash2, ReceiptText, ChevronRight } from 'lucide-react';
import { UserRole } from '../../types';
import './SpendingModule.css';
import AllRecordsButton from '../../core/dashboard/AllRecordsButton';
import ExpenseComposer from './ExpenseComposer';
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
export type SpendingEntry = { id: string; category: Category; subcategory: string; date: string; amount: number; description: string; recipient: string; method: string; schoolKey?: string; transferId?: string; driverId?: string; salaryPeriodKey?: string; paymentOrderNumber?: string; comment?: string; paymentOnly?: boolean; recipientKey?: string; transferNumber?: number; operationType?: string; departmentKey?: string; employeeId?: string; familyId?: string; childName?: string };
type Entry = SpendingEntry;
const descriptions: Record<Category, string> = {
  COGS: 'Авансы и зарплата водителям', 'Revenue Tax': 'Налог', OPEX: 'Офис и операционные расходы',
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

export default function SpendingModule({ userId, role, sessionToken, onOpenClient }: { userId: string; role: UserRole; sessionToken?: string; onOpenClient?: (familyId: string) => Promise<void> }) {
  const workspace = useRef<HTMLDivElement>(null);
  const scrollToWorkspace = () => requestAnimationFrame(() => workspace.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  const storageKey = `outway-spending-v1:${userId}`;
  const [initial] = useState(() => { try { return { rows: readEntries(storageKey), error: '' }; } catch { return { rows: [] as Entry[], error: 'Не удалось прочитать записи. Сохранение отключено, чтобы не потерять данные.' }; } });
  const [rows, setRows] = useState(initial.rows);
  const [error, setError] = useState(initial.error);
  const [periodKey, setPeriodKey] = useState(currentCashierPeriodKey);
  const [category, setCategory] = useState<Category | 'ALL'>('COGS');
  const [draft, setDraft] = useState<Entry | null>(() => blank('COGS'));
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
  const visible = periodRows.filter(row => (!schoolFilter || (schoolFilter.startsWith('opex:') ? OPEX_GROUPS[schoolFilter.slice(5) as keyof typeof OPEX_GROUPS]?.includes(row.subcategory) : (row.schoolKey || 'unassigned') === schoolFilter)) && (category === 'ALL' || row.category === category)).sort((a,b) => b.date.localeCompare(a.date));
  const persist = (next: Entry[]) => {
    if (initial.error) return false;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setRows(next); setError(''); return true; }
    catch { setError('Не удалось сохранить. Проверьте свободное место и настройки браузера.'); return false; }
  };
  const schoolRows = (category === 'OPEX' ? Object.keys(OPEX_GROUPS).map(label => ({ key: `opex:${label}`, label })) : [...SCHOOL_TABS.filter(item => item.key !== 'ALL' && isSchoolVisible(item.key)).map(item => ({ key: item.key, label: item.label })), { key: 'unassigned', label: 'Общие расходы' }]).map(school => {
    const payments = visible.filter(row => (school.key.startsWith('opex:') ? OPEX_GROUPS[school.label as keyof typeof OPEX_GROUPS].includes(row.subcategory) : (row.schoolKey || 'unassigned') === school.key));
    return { ...school, count: payments.length, total: payments.reduce((sum,row) => sum + row.amount, 0), advance: payments.filter(row => row.subcategory === 'Авансы водителям').reduce((sum, row) => sum + row.amount, 0), salary: payments.filter(row => row.subcategory === 'Зарплата водителей').reduce((sum, row) => sum + row.amount, 0) };
  }).filter(school => school.key !== 'unassigned' || school.total > 0);
  const openNewExpense = () => { setDraft(blank(category === 'ALL' ? 'COGS' : category)); if (category === 'ALL') setCategory('COGS'); setSchoolFilter(null); setDeleting(null); scrollToWorkspace(); };
  return <section className={`spending-module${pickerOpen ? ' has-picker' : ''}`} aria-label="Расходы">
    <header className="spending-header"><div><span className="spending-eyebrow">УПРАВЛЕНИЕ РАСХОДАМИ</span><h1>Расходы</h1></div><div className="spending-finance-periods"><ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} periods={CASHIER_PERIODS} /></div></header>
    {error && <p role="alert" className="spending-error">{error}</p>}
    <div className="spending-categories">{categories.map(key => <button key={key} className={key === 'Личное' ? 'spending-personal-tile' : undefined} aria-pressed={category === key} onClick={() => { setCategory(key);  setSchoolFilter(null); setDraft(blank(key)); scrollToWorkspace(); }}><span className="spending-category-name">{key}</span><span className="spending-category-description">{descriptions[key]}</span><strong>{money(periodRows.filter(row => row.category === key).reduce((sum, row) => sum + row.amount, 0))}</strong><small>{periodRows.filter(row => row.category === key).length} операций</small></button>)}</div>
    <div className="spending-workspace" ref={workspace}>
    {draft?.category === 'COGS' && <div className="spending-cogs-editor"><CogsPaymentForm sessionToken={sessionToken} onPanelChange={setPickerOpen} key={`${draft.category}:${draft.id || 'new'}`} entry={draft} disabled={!!initial.error} onCancel={() => setDraft(null)} onSave={entries => { const next = draft.id ? rows.map(row => row.id === draft.id ? entries[0] : row) : [...rows, ...entries]; if (!persist(next)) return false; setDraft(null); setCategory('COGS');  setSchoolFilter(null); return true; }} /></div>}
    {draft && draft.category !== 'COGS' && <ExpenseComposer key={`${draft.category}:${draft.id || 'new'}`} entry={draft} onOpenClient={onOpenClient} subcategories={SPENDING_CATEGORIES[draft.category]} onSavePayroll={entries => { if (!persist(draft.id ? rows.flatMap(row => row.id === draft.id ? entries : [row]) : [...rows, ...entries])) return false; setCategory(draft.category); setDraft(null); return true; }} disabled={!!initial.error} onCancel={() => setDraft(null)} onSave={entry => { if (!persist(draft.id ? rows.map(row => row.id === draft.id ? entry : row) : [...rows, entry])) return false; setCategory(entry.category); setDraft(null); return true; }} />}
    {!draft && <div className={`spending-register${category !== 'ALL' && !schoolFilter ? ' spending-register-schools' : ''}`}><div className="spending-register-heading"><h2>{category === 'ALL' ? 'Все расходы' : schoolFilter?.startsWith('opex:') ? (OPEX_GROUP_LABELS[schoolFilter.slice(5)] || schoolFilter.slice(5)) : schoolFilter ? SCHOOL_TABS.find(item => item.key === schoolFilter)?.label || 'Без привязки к школе' : category}</h2><div className="spending-actions"><AllRecordsButton label="Все расходы" onClick={() => { setCategory('ALL'); setSchoolFilter(null); }} /><button type="button" className="payment-close" aria-label="Вернуться к новому расходу" title="Новый расход" onClick={openNewExpense}><X size={20} aria-hidden="true" /></button></div></div>
      {category !== 'ALL' && !schoolFilter ? <div className="spending-table-wrap"><table aria-label={category === 'COGS' ? 'Выплаты по школам' : 'Расходы по школам'}><thead><tr><th>{category === 'OPEX' ? 'Статья расходов' : 'Школа'}</th><th className="spending-number">{category === 'COGS' ? 'Выплата аванса' : 'Расходы'}</th><th className="spending-number">{category === 'COGS' ? 'Выплата зарплаты' : 'Операций'}</th><th className="spending-number">Итого</th></tr></thead><tbody>{schoolRows.map(school => <tr key={school.key}><td><button className="spending-school-link" onClick={() => setSchoolFilter(school.key)}>{school.key.startsWith('opex:') ? OPEX_GROUP_LABELS[school.label] || school.label : school.label}<ChevronRight size={15} /></button></td><td className="spending-number">{money(category === 'COGS' ? school.advance : school.total)}</td><td className="spending-number">{category === 'COGS' ? money(school.salary) : school.count}</td><td className="spending-number"><b>{money(school.total)}</b></td></tr>)}</tbody><tfoot><tr><td>Итого</td><td className="spending-number">{money(schoolRows.reduce((sum, school) => sum + (category === 'COGS' ? school.advance : school.total), 0))}</td><td className="spending-number">{category === 'COGS' ? money(schoolRows.reduce((sum, school) => sum + school.salary, 0)) : schoolRows.reduce((sum,school) => sum + school.count,0)}</td><td className="spending-number">{money(schoolRows.reduce((sum, school) => sum + school.total, 0))}</td></tr></tfoot></table></div> : <>
      {schoolFilter && <button className="spending-back" onClick={() => setSchoolFilter(null)}>← Все статьи</button>}
      <div className="spending-table-wrap"><table><thead><tr><th>Дата</th><th>Категория / подкатегория</th><th>Назначение</th><th>Получатель</th><th>Оплата</th><th>Платёжное поручение</th><th>Комментарий</th><th className="spending-number">Сумма</th><th>Действия</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{row.date.split('-').reverse().join('.')}</td><td><b>{row.category}</b><small>{row.subcategory}</small></td><td>{row.description}{row.salaryPeriodKey && <small>{row.salaryPeriodKey.slice(0, 7)}{row.salaryPeriodKey.length > 7 && <> · {row.salaryPeriodKey.endsWith("-1") ? "1–15" : "16–конец месяца"}</>}</small>}</td><td>{row.recipient || '—'}</td><td>{row.method}</td><td>{row.paymentOrderNumber || '—'}</td><td>{row.comment || '—'}</td><td className="spending-number">{money(row.amount)}</td><td>{deleting === row.id ? <div className="spending-actions"><button onClick={() => { if (persist(rows.filter(item => item.id !== row.id))) setDeleting(null); }}>Удалить?</button><button onClick={() => setDeleting(null)}>Отмена</button></div> : <div className="spending-actions"><button aria-label={`Редактировать ${row.description}`} onClick={() => { setDraft({ ...row }); setDeleting(null); }}><Pencil size={15} /></button><button aria-label={`Удалить ${row.description}`} onClick={() => setDeleting(row.id)}><Trash2 size={15} /></button></div>}</td></tr>)}</tbody>{visible.length > 0 && <tfoot><tr><td colSpan={7}>Итого по выбранным записям · {visible.length}</td><td className="spending-number">{money(visible.reduce((sum, row) => sum + row.amount, 0))}</td><td /></tr></tfoot>}</table></div>
      {!visible.length && <div className="spending-empty"><ReceiptText size={30} aria-hidden="true" /><h3>Расходов пока нет</h3><p>{rows.length ? 'Измените период или фильтры либо добавьте новый расход.' : 'Добавьте первый расход — он появится в реестре и итогах категории.'}</p></div>}
    </>}
    </div>}
    </div>
  </section>;
}
