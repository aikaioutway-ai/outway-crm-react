import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Building2, CalendarDays, FileText, Plus, Save, Search, ShieldCheck, Trash2, UserCheck, Users, UserX, WalletCards, X } from 'lucide-react';
import { ColumnDef, DataTable } from '../../core/tables/DataTable';
import { Employee, EmployeeRole, EmployeeStatus } from '../../types';
import { createDefaultEmployeeDocuments, createEmployeeAdvance, deleteEmployee, deleteEmployeeAdvance, EmployeeAdvance, EmployeeDocument, EmployeeDraft, fetchEmployeeAdvances, fetchEmployeeDocuments, fetchEmployees, saveEmployee, saveEmployeeDocuments } from '../../services/employeeService';
import { fetchV2PayrollEntriesForPeriod, V2PayrollEntry } from '../../services/crmV2Service';
import { SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { SCHOOL_TABS } from '../families/constants';
import './EmployeesPage.css';

const ROLE_OPTIONS: { value: EmployeeRole; label: string }[] = [
  { value: 'admin', label: 'Админ' }, { value: 'gen_director', label: 'Ген. директор' }, { value: 'director', label: 'Директор' },
  { value: 'manager', label: 'Менеджер' }, { value: 'cashier', label: 'Кассир' }, { value: 'logist', label: 'Логист' },
  { value: 'senior_logist', label: 'Нач. логистики' }, { value: 'driver', label: 'Водитель' },
];
const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: 'active', label: 'Активен' }, { value: 'inactive', label: 'Неактивен' }, { value: 'dismissed', label: 'Уволен' },
];
const SCHOOL_OPTIONS = SCHOOL_TABS.filter(item => item.key !== 'ALL');
const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} сом`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const EMPTY_DRAFT: EmployeeDraft = { fullName: '', login: '', password: '', role: 'manager', position: 'Менеджер', phone1: '', phone2: '', address: '', schoolKeys: ['ALL'], status: 'active', startDate: today(), comment: '' };
type EmployeeRow = Employee & { missingDocumentCount: number };
type EmployeeTab = 'main' | 'documents' | 'finance' | 'advances';

function academicPeriods() {
  const now = new Date();
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const months = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
  const labels = ['Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август'];
  return months.map((month, index) => ({ month, year: month >= 9 ? startYear : startYear + 1, label: labels[index] }));
}
function toDraft(employee: Employee): EmployeeDraft { return { id: employee.id, fullName: employee.fullName, login: employee.login, password: '', role: employee.role, position: employee.position, phone1: employee.phone1, phone2: employee.phone2 ?? '', address: employee.address ?? '', schoolKeys: employee.schoolKeys, status: employee.status, startDate: employee.startDate, comment: employee.comment ?? '' }; }
function roleLabel(role: EmployeeRole) { return ROLE_OPTIONS.find(item => item.value === role)?.label ?? role; }
function statusLabel(status: EmployeeStatus) { return STATUS_OPTIONS.find(item => item.value === status)?.label ?? status; }
function schoolLabel(keys: string[]) {
  if (keys.includes('ALL')) return 'Все школы';
  return keys.map(key => SCHOOL_OPTIONS.find(school => school.key === key)?.label ?? key).join(', ') || '—';
}
function schoolCountLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} школа`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} школы`;
  return `${count} школ`;
}
function SchoolDisplay({ keys }: { keys: string[] }) {
  if (keys.includes('ALL')) return <span className="employee-school-cell all"><Building2 size={17} /><span>Все школы</span></span>;
  const schools = keys.map(key => SCHOOL_OPTIONS.find(school => school.key === key)).filter(Boolean) as typeof SCHOOL_OPTIONS;
  if (!schools.length) return <span className="employee-school-cell">—</span>;
  return <span className="employee-school-cell" title={schoolLabel(keys)}><span className="employee-school-avatars">{schools.slice(0, 4).map(school => <SchoolAvatar key={school.key} logo={school.logo} label={school.label} color="#626C8B" size={24} radius={7} fontSize={9} />)}</span><span>{schools.length === 1 ? schools[0].label : schoolCountLabel(schools.length)}</span></span>;
}

const COLUMNS: ColumnDef<EmployeeRow>[] = [
  { key: 'fullName', label: 'Сотрудник', type: 'text', width: 220, render: value => <strong>{value}</strong> },
  { key: 'position', label: 'Должность', type: 'text', width: 170 },
  { key: 'role', label: 'Роль', type: 'select', width: 135, render: value => <span className="employee-role-badge">{roleLabel(value)}</span> },
  { key: 'phone1', label: 'Телефон', type: 'text', width: 135 },
  { key: 'schoolKeys', label: 'Школы', type: 'text', width: 210, getValue: row => schoolLabel(row.schoolKeys), render: (_value, row) => <SchoolDisplay keys={row.schoolKeys} /> },
  { key: 'startDate', label: 'Дата начала', type: 'date', width: 115 },
  { key: 'missingDocumentCount', label: 'Документы', type: 'number', width: 110, render: value => <span className={value ? 'employee-docs-missing' : 'employee-docs-ready'}>{value ? `Не хватает: ${value}` : 'Готово'}</span> },
  { key: 'status', label: 'Статус', type: 'select', width: 110, render: value => <span className={`employee-status ${value}`}>{statusLabel(value)}</span> },
];

export default function EmployeesPage() {
  const [rows, setRows] = useState<EmployeeRow[]>([]), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<Employee | null>(null), [creating, setCreating] = useState(false), [loadError, setLoadError] = useState('');
  const load = async () => {
    setLoading(true);
    try {
      const employees = await fetchEmployees();
      const documents = await Promise.all(employees.map(async employee => { try { return await fetchEmployeeDocuments(employee.id); } catch { return createDefaultEmployeeDocuments(); } }));
      setRows(employees.map((employee, index) => ({ ...employee, missingDocumentCount: documents[index].filter(document => !document.number.trim() || !document.scanUrl).length })));
      setLoadError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить сотрудников'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return needle ? rows.filter(row => [row.fullName, row.position, row.login, row.phone1, row.phone2, roleLabel(row.role), schoolLabel(row.schoolKeys)].some(value => String(value ?? '').toLowerCase().includes(needle))) : rows; }, [rows, query]);
  const stats = useMemo(() => ({ total: rows.length, active: rows.filter(row => row.status === 'active').length, inactive: rows.filter(row => row.status !== 'active').length, documents: rows.filter(row => row.missingDocumentCount > 0).length }), [rows]);
  const openNewEmployee = () => { setSelected(null); setCreating(true); };
  const openEmployee = (employee: Employee) => { setCreating(false); setSelected(employee); };
  return <div className="employees-page">
    <section className="employees-overview">
      <div className="employees-heading"><div><h1>Сотрудники</h1><p>Команда, доступы, документы и расчёты</p></div><button className="employee-primary" onClick={openNewEmployee}><Plus size={17} /> Новый сотрудник</button></div>
      <div className="employees-kpis"><Kpi icon={<Users size={19} />} label="Всего сотрудников" value={stats.total} color="#5267A8" /><Kpi icon={<UserCheck size={19} />} label="Активные" value={stats.active} color="#258B8C" /><Kpi icon={<UserX size={19} />} label="Неактивные" value={stats.inactive} color="#B75B75" /><Kpi icon={<FileText size={19} />} label="Не хватает документов" value={stats.documents} color="#D17B2C" /></div>
      <div className="employees-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ФИО, должность, телефон, школа..." /></div>
      {loadError && <div className="employee-error">{loadError}</div>}
    </section>
    <section className="employees-table-panel"><DataTable<EmployeeRow> columns={COLUMNS} data={filtered} rowKey="id" loading={loading} storageKey="employees_table_v2" emptyText="Сотрудники не найдены" onRowClick={openEmployee} onRowOpen={openEmployee} canManageProperties={false} toolbarRightExtra={<button className="employee-toolbar-add" onClick={openNewEmployee} title="Новый сотрудник"><Plus size={16} /></button>} /></section>
    {(selected || creating) && <EmployeeCardModal employee={selected} onClose={() => { setSelected(null); setCreating(false); }} onChanged={async employee => { setSelected(employee); setCreating(false); await load(); }} onDeleted={async () => { setSelected(null); setCreating(false); await load(); }} />}
  </div>;
}
function Kpi({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) { return <div className="employee-kpi dock-hover-card"><span style={{ background: color }}>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }

function EmployeeCardModal({ employee, onClose, onChanged, onDeleted }: { employee: Employee | null; onClose: () => void; onChanged: (employee: Employee) => void; onDeleted: () => void }) {
  const [draft, setDraft] = useState<EmployeeDraft>(employee ? toDraft(employee) : { ...EMPTY_DRAFT, startDate: today() });
  const [documents, setDocuments] = useState<EmployeeDocument[]>(createDefaultEmployeeDocuments()), [advances, setAdvances] = useState<EmployeeAdvance[]>([]), [payroll, setPayroll] = useState<V2PayrollEntry[]>([]);
  const [tab, setTab] = useState<EmployeeTab>('main'), [saving, setSaving] = useState(false), [deleting, setDeleting] = useState(false), [loadingDetails, setLoadingDetails] = useState(Boolean(employee)), [error, setError] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState(''), [advanceDate, setAdvanceDate] = useState(today()), [advanceComment, setAdvanceComment] = useState('');
  const periods = useMemo(academicPeriods, []);
  useEffect(() => { if (!employee) return; setLoadingDetails(true); Promise.all([fetchEmployeeDocuments(employee.id), fetchEmployeeAdvances(employee.id), Promise.all(periods.map(period => fetchV2PayrollEntriesForPeriod(period.month, period.year))).then(items => items.flat())]).then(([docs, employeeAdvances, entries]) => { setDocuments(docs); setAdvances(employeeAdvances); setPayroll(entries.filter(entry => entry.subjectType === 'employee' && entry.subjectId === employee.id)); }).catch(reason => setError(reason instanceof Error ? reason.message : 'Не удалось загрузить карточку')).finally(() => setLoadingDetails(false)); }, [employee, periods]);
  const patch = (updates: Partial<EmployeeDraft>) => setDraft(current => ({ ...current, ...updates }));
  const toggleSchool = (key: string) => setDraft(current => { if (key === 'ALL') return { ...current, schoolKeys: ['ALL'] }; const keys = current.schoolKeys.filter(item => item !== 'ALL'); return { ...current, schoolKeys: keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key] }; });
  const patchDocument = <K extends keyof EmployeeDocument>(index: number, key: K, value: EmployeeDocument[K]) => setDocuments(current => current.map((document, itemIndex) => itemIndex === index ? { ...document, [key]: value } : document));
  const financeRows = periods.map(period => { const entry = payroll.find(item => item.periodMonth === period.month && item.periodYear === period.year); const monthAdvances = advances.filter(advance => { const [year, month] = advance.date.split('-').map(Number); return year === period.year && month === period.month; }).reduce((sum, advance) => sum + advance.amount, 0); const accrued = entry?.accruedAmount ?? ((entry?.days ?? 0) * (entry?.rate ?? 0) + (entry?.bonusAmount ?? 0) - (entry?.penaltyAmount ?? 0)); const paid = entry?.salaryAmount ?? 0; return { ...period, days: entry?.days ?? 0, rate: entry?.rate ?? 0, bonus: entry?.bonusAmount ?? 0, penalty: entry?.penaltyAmount ?? 0, accrued, advances: monthAdvances, paid, balance: Math.max(0, accrued - monthAdvances - paid) }; });
  const totals = financeRows.reduce((sum, row) => ({ days: sum.days + row.days, rate: sum.rate + row.rate, bonus: sum.bonus + row.bonus, penalty: sum.penalty + row.penalty, accrued: sum.accrued + row.accrued, advances: sum.advances + row.advances, paid: sum.paid + row.paid, balance: sum.balance + row.balance }), { days: 0, rate: 0, bonus: 0, penalty: 0, accrued: 0, advances: 0, paid: 0, balance: 0 });
  const save = async () => { if (!draft.fullName.trim() || !draft.login.trim()) { setError('Заполните ФИО и логин'); return; } if (!draft.id && !draft.password?.trim()) { setError('Укажите пароль для нового сотрудника'); return; } setSaving(true); setError(''); try { const employees = await saveEmployee(draft); const saved = employees.find(item => item.id === draft.id) ?? employees.find(item => item.login === draft.login.trim()); if (!saved) throw new Error('Сотрудник не найден после сохранения'); await saveEmployeeDocuments(saved.id, documents); setDraft(toDraft(saved)); onChanged(saved); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить сотрудника'); } finally { setSaving(false); } };
  const remove = async () => { if (!employee || !window.confirm(`Удалить сотрудника «${employee.fullName}»? Документы и авансы также будут удалены.`)) return; setDeleting(true); try { await deleteEmployee(employee.id); onDeleted(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось удалить сотрудника'); } finally { setDeleting(false); } };
  const addAdvance = async () => { if (!employee || Number(advanceAmount) <= 0 || !advanceDate) { setError('Укажите сумму и дату аванса'); return; } try { const created = await createEmployeeAdvance(employee.id, Number(advanceAmount), advanceDate, advanceComment); setAdvances(current => [created, ...current]); setAdvanceAmount(''); setAdvanceComment(''); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось добавить аванс'); } };
  const removeAdvance = async (advance: EmployeeAdvance) => { if (!window.confirm(`Удалить аванс на сумму ${money(advance.amount)}?`)) return; try { await deleteEmployeeAdvance(advance.id); setAdvances(current => current.filter(item => item.id !== advance.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось удалить аванс'); } };
  const missingDocuments = documents.filter(document => !document.number.trim() || !document.scanUrl).length;
  return <div className="employee-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="employee-card-modal" role="dialog" aria-modal="true">
    <header className="employee-card-header"><div className="employee-card-identity"><input value={draft.fullName} onChange={event => patch({ fullName: event.target.value })} placeholder="ФИО сотрудника" /><div><span>{draft.position || 'Должность не указана'}</span><span>{draft.login ? `логин: ${draft.login}` : 'новый сотрудник'}</span><span>{statusLabel(draft.status)}</span></div><div className="employee-card-summary"><b>Наш долг: {money(totals.balance)}</b><b>Не хватает документов: {missingDocuments}</b><b>Авансы: {money(advances.reduce((sum, item) => sum + item.amount, 0))}</b></div></div><div className="employee-card-actions">{employee && <button className="danger" onClick={remove} disabled={deleting || saving}><Trash2 size={15} />{deleting ? 'Удаление…' : 'Удалить'}</button>}<button className="save" onClick={save} disabled={saving || deleting}><Save size={15} />{saving ? 'Сохранение…' : draft.id ? 'Сохранить' : 'Добавить'}</button><button className="close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div></header>
    <nav className="employee-card-tabs">{([['main', 'Основная', <BriefcaseBusiness size={14} />], ['documents', 'Документы', <FileText size={14} />], ['finance', 'Финансы', <WalletCards size={14} />], ['advances', `Авансы${advances.length ? ` (${advances.length})` : ''}`, <CalendarDays size={14} />]] as [EmployeeTab, string, React.ReactNode][]).map(([key, label, icon]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{icon}{label}</button>)}</nav>
    <div className="employee-card-content">{error && <div className="employee-error">{error}</div>}{loadingDetails ? <div className="employee-loading">Загрузка карточки…</div> : tab === 'main' ? <MainTab draft={draft} patch={patch} toggleSchool={toggleSchool} /> : tab === 'documents' ? <DocumentsTab documents={documents} patchDocument={patchDocument} /> : tab === 'finance' ? <FinanceTable rows={financeRows} totals={totals} /> : <AdvancesTab employee={employee} advances={advances} amount={advanceAmount} date={advanceDate} comment={advanceComment} setAmount={setAdvanceAmount} setDate={setAdvanceDate} setComment={setAdvanceComment} add={addAdvance} remove={removeAdvance} />}</div>
  </section></div>;
}

function MainTab({ draft, patch, toggleSchool }: { draft: EmployeeDraft; patch: (updates: Partial<EmployeeDraft>) => void; toggleSchool: (key: string) => void }) { return <div className="employee-main-grid"><CardSection title="Работа и доступ" icon={<ShieldCheck size={17} />}><Field label="Должность"><input value={draft.position} onChange={event => patch({ position: event.target.value })} /></Field><Field label="Роль"><select value={draft.role} onChange={event => patch({ role: event.target.value as EmployeeRole })}>{ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Статус"><select value={draft.status} onChange={event => patch({ status: event.target.value as EmployeeStatus })}>{STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Дата начала"><input type="date" value={draft.startDate ?? ''} onChange={event => patch({ startDate: event.target.value })} /></Field></CardSection><CardSection title="Контакты и вход" icon={<Building2 size={17} />}><Field label="Телефон"><input value={draft.phone1} onChange={event => patch({ phone1: event.target.value })} /></Field><Field label="Доп. телефон"><input value={draft.phone2 ?? ''} onChange={event => patch({ phone2: event.target.value })} /></Field><Field label="Логин"><input autoComplete="off" value={draft.login} onChange={event => patch({ login: event.target.value })} /></Field><Field label={draft.id ? 'Новый пароль (необязательно)' : 'Пароль'}><input type="password" autoComplete="new-password" value={draft.password ?? ''} onChange={event => patch({ password: event.target.value })} /></Field><Field label="Адрес" full><input value={draft.address ?? ''} onChange={event => patch({ address: event.target.value })} /></Field></CardSection><CardSection title="Доступные школы" wide><div className="employee-school-chips"><button className={draft.schoolKeys.includes('ALL') ? 'active' : ''} onClick={() => toggleSchool('ALL')}><span className="employee-school-all-icon"><Building2 size={16} /></span><span>Все школы</span></button>{SCHOOL_OPTIONS.map(school => <button key={school.key} className={draft.schoolKeys.includes(school.key) ? 'active' : ''} onClick={() => toggleSchool(school.key)} title={school.label}><SchoolAvatar logo={school.logo} label={school.label} color="#626C8B" size={24} radius={7} fontSize={9} /><span>{school.label}</span></button>)}</div></CardSection><CardSection title="Комментарий" wide><textarea value={draft.comment ?? ''} onChange={event => patch({ comment: event.target.value })} /></CardSection></div>; }
function DocumentsTab({ documents, patchDocument }: { documents: EmployeeDocument[]; patchDocument: <K extends keyof EmployeeDocument>(index: number, key: K, value: EmployeeDocument[K]) => void }) { return <div className="employee-documents-grid">{documents.map((document, index) => <section key={document.type} className="employee-document-card"><div className="employee-document-title"><span><FileText size={18} />{document.title}</span><span className={document.number && document.scanUrl ? 'ready' : 'missing'}>{document.number && document.scanUrl ? 'Готово' : 'Не заполнен'}</span></div><div className="employee-document-fields"><Field label="Номер"><input value={document.number} onChange={event => patchDocument(index, 'number', event.target.value)} /></Field><Field label="Дата выдачи"><input type="date" value={document.issuedAt} onChange={event => patchDocument(index, 'issuedAt', event.target.value)} /></Field><Field label="Дата окончания"><input type="date" value={document.expiresAt} onChange={event => patchDocument(index, 'expiresAt', event.target.value)} /></Field></div><label className="employee-file-upload">{document.scanFile ? document.scanFile.name : document.scanUrl ? 'Заменить скан' : 'Добавить скан'}<input type="file" accept="image/*,.pdf" onChange={event => patchDocument(index, 'scanFile', event.target.files?.[0] ?? null)} /></label>{document.scanUrl && <a href={document.scanUrl} target="_blank" rel="noreferrer">Открыть текущий документ</a>}</section>)}</div>; }
function AdvancesTab({ employee, advances, amount, date, comment, setAmount, setDate, setComment, add, remove }: any) { return <div className="employee-advances-layout">{!employee ? <div className="employee-empty">Сначала сохраните нового сотрудника</div> : <><section className="employee-advance-form"><h3>Новый аванс</h3><div><Field label="Сумма, сом"><input type="number" min="1" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></Field><Field label="Дата"><input type="date" value={date} onChange={event => setDate(event.target.value)} /></Field></div><Field label="Комментарий"><input value={comment} onChange={event => setComment(event.target.value)} /></Field><button onClick={add}><Plus size={15} /> Добавить аванс</button></section><section className="employee-advance-list"><h3>История авансов</h3>{advances.length ? advances.map((advance: EmployeeAdvance) => <div key={advance.id}><div><strong>{money(advance.amount)}</strong><span>{new Date(`${advance.date}T00:00:00`).toLocaleDateString('ru-RU')} · {advance.comment || 'Без комментария'}</span></div><button onClick={() => remove(advance)} aria-label="Удалить аванс"><Trash2 size={14} /></button></div>) : <div className="employee-empty">Авансов пока нет</div>}</section></>}</div>; }
function CardSection({ title, icon, wide, children }: { title: string; icon?: React.ReactNode; wide?: boolean; children: React.ReactNode }) { return <section className={`employee-card-section${wide ? ' wide' : ''}`}><h3>{icon}{title}</h3><div className="employee-section-fields">{children}</div></section>; }
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) { return <label className={`employee-field${full ? ' full' : ''}`}><span>{label}</span>{children}</label>; }
function FinanceTable({ rows, totals }: { rows: any[]; totals: any }) { return <div className="employee-finance-wrap"><table className="employee-finance-table"><thead><tr>{['Месяц', 'К-во дней', 'Ставка', 'Премия', 'Штрафы', 'Начислено', 'Авансы', 'Оплачено', 'Остаток'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.year}-${row.month}`}><td>{row.label}</td><td>{row.days}</td><td>{money(row.rate)}</td><td>{money(row.bonus)}</td><td>{money(row.penalty)}</td><td>{money(row.accrued)}</td><td>{money(row.advances)}</td><td>{money(row.paid)}</td><td>{money(row.balance)}</td></tr>)}</tbody><tfoot><tr><td>Итого</td><td>{totals.days}</td><td>{money(totals.rate)}</td><td>{money(totals.bonus)}</td><td>{money(totals.penalty)}</td><td>{money(totals.accrued)}</td><td>{money(totals.advances)}</td><td>{money(totals.paid)}</td><td>{money(totals.balance)}</td></tr></tfoot></table></div>; }
