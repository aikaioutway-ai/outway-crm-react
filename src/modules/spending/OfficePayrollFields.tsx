import ExpenseMonths from './ExpenseMonths';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Headset, WalletCards, ShieldCheck, Users, X } from 'lucide-react';
import { useEmployees } from '../../hooks/useCrmQueries';
import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { splitPayment } from './paymentAmounts';

export type OfficePayee = { id: string; name: string; departmentKey: string; amount: number };
const icons = [Truck, Headset, WalletCards, ShieldCheck];
const labels = ['Логистика', 'Сервис', 'Финансы', 'Администратор'];
export default function OfficePayrollFields({ date, departmentKey, onDepartment, payees, onPayees, periods, onPeriods, onComplete, mode = 'all' }: { onComplete?: () => void; mode?: 'all' | 'department' | 'period' | 'recipient'; date: string; departmentKey?: string; onDepartment: (key: string) => void; payees: OfficePayee[]; onPayees: (value: OfficePayee[]) => void; periods: string[]; onPeriods: (value: string[]) => void }) {
  const { data: employees = [], isLoading, error } = useEmployees();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLInputElement>('input')?.focus(); return () => previous?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!dialog.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const [scope, setScope] = useState('');
  useEffect(() => { if (mode === 'recipient') { setScope(departmentKey === 'ALL' ? '' : departmentKey || ''); setOpen(true); } }, [mode, departmentKey]);
  const [batch, setBatch] = useState('');
  const gesture = useRef<{selected:boolean; visited:Set<string>} | null>(null);
  const [dragging, setDragging] = useState(false);
  const payeesRef = useRef(payees);
  payeesRef.current = payees;
  useEffect(() => { const finish = () => { gesture.current = null; setDragging(false); }; window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); }; }, []);
  const selectEmployee = (id: string, selected: boolean) => {
    const employee = employees.find(item => item.id === id);
    if (!employee) return;
    const current = payeesRef.current;
    const next = selected ? current.some(item => item.id === id) ? current : [...current, {id, name:employee.fullName, departmentKey:EMPLOYEE_DEPARTMENTS.find(item => item.roles.includes(employee.role))?.key || '', amount:0}] : current.filter(item => item.id !== id);
    payeesRef.current = next; onPayees(next);
  };
  const paint = (id: string) => { if (!gesture.current || gesture.current.visited.has(id)) return; gesture.current.visited.add(id); selectEmployee(id, gesture.current.selected); };
  const frame = document.querySelector('.spending-expense-dialog')?.getBoundingClientRect();
  const filtered = employees.filter(employee => employee.status === 'active' && employee.role !== 'driver' && (search.trim() ? employee.fullName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) : !scope || EMPLOYEE_DEPARTMENTS.find(item => item.key === scope)?.roles.includes(employee.role))).sort((a,b) => dragging ? 0 : Number(payees.some(item=>item.id===b.id))-Number(payees.some(item=>item.id===a.id)));

  return <>

    {(mode === 'all' || mode === 'department') && <section className="payment-section"><h3>Отдел</h3><div className="spending-school-strip expense-kind-strip" role="group" aria-label="Отдел выплаты">{EMPLOYEE_DEPARTMENTS.map((department, index) => { const Icon = icons[index]; return <button type="button" key={department.key} aria-pressed={departmentKey === department.key} onClick={() => { onDepartment(department.key); setScope(department.key); setSearch(''); if (mode === 'all') setOpen(true); }}><span className="spending-school-logo"><Icon size={22} /></span><span>{labels[index]}</span></button>; })}<button type="button" aria-pressed={departmentKey === 'ALL'} onClick={() => { onDepartment('ALL'); setScope(''); setSearch(''); if (mode === 'all') setOpen(true); }}><span className="spending-school-logo"><Users size={22} /></span><span>Все</span></button></div></section>}
    {(mode === 'all' || mode === 'period') && <ExpenseMonths date={date} periods={periods} onPeriods={onPeriods} />}
    {open && createPortal(<div className="spending-module payment-driver-modal-overlay office-payroll-overlay office-recipient-drawer" style={{'--office-top': `${frame?.top || 28}px`, '--office-height': `${frame?.height || 800}px`} as React.CSSProperties} onClick={() => setOpen(false)}><div ref={dialog} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } if (event.key === 'Tab') { const fields = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []); const first = fields[0]; const last = fields[fields.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }} className="payment-driver-modal" role="dialog" aria-modal="true" aria-label="Сотрудники и суммы" onClick={event => event.stopPropagation()}><header><div><h3>Сотрудники и суммы</h3><p>{EMPLOYEE_DEPARTMENTS.find(item => item.key === scope)?.label || 'Все отделы'}</p></div><button type="button" aria-label="Закрыть выбор сотрудников" onClick={() => setOpen(false)}><X size={20} /></button></header><div className="payment-driver-modal-body office-payroll-body"><input aria-label="Поиск сотрудника" placeholder="Найти сотрудника…" value={search} onChange={event => setSearch(event.target.value)} /><div className="spending-actions spending-batch-amount"><label>Сумма<input type="number" min="0.01" step="0.01" value={batch} onChange={event => setBatch(event.target.value)} /></label>{['Применить', 'Разделить'].map((label, index) => <button type="button" key={label} disabled={!payees.length || !(Number(batch) > 0)} onClick={() => { const amounts = index ? splitPayment(Number(batch), payees.length) : payees.map(() => Number(batch)); onPayees(payees.map((row,i) => ({ ...row, amount: amounts[i] }))); }}>{label}</button>)}</div>{isLoading ? <p>Загрузка сотрудников…</p> : error ? <p role="alert">Не удалось загрузить сотрудников.</p> : <div className="office-payroll-cards">{filtered.map(employee => { const selected = payees.find(row => row.id === employee.id); const department = EMPLOYEE_DEPARTMENTS.find(item => item.roles.includes(employee.role)); return <div onPointerDown={event => { if (event.button !== 0 || (event.target as Element).closest('input,button,label')) return; event.preventDefault(); gesture.current={selected:!selected,visited:new Set()}; setDragging(true); paint(employee.id); }} onPointerEnter={() => paint(employee.id)} tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectEmployee(employee.id,!selected); } }} className={`payment-driver-card${selected ? ' is-selected' : ''}`} key={employee.id}><div className="office-recipient-identity"><input type="checkbox" checked={!!selected} onChange={event => onPayees(event.target.checked ? [...payees, { id: employee.id, name: employee.fullName, departmentKey: department?.key || '', amount: 0 }] : payees.filter(row => row.id !== employee.id))} /><span><strong>{employee.fullName}</strong><small>{department?.label}</small></span></div><input aria-label={`Сумма ${employee.fullName}`} type="number" min="0.01" step="0.01" placeholder="Сумма, сом" value={selected?.amount || ''} onChange={event => { const amount = Number(event.target.value); onPayees(selected ? payees.map(row => row.id === employee.id ? { ...row, amount } : row) : [...payees, { id: employee.id, name: employee.fullName, departmentKey: department?.key || '', amount }]); }} /></div>; })}{!filtered.length && <p>Сотрудники не найдены.</p>}</div>}</div><footer><span>Выбрано: {payees.length} · Итого: <b>{payees.reduce((sum,row) => sum + row.amount,0).toLocaleString('ru-RU')} сом</b></span><button type="button" className="spending-primary" onClick={() => { setOpen(false); onComplete?.(); }}>Готово</button></footer></div></div>, document.body)}
  </>;
}
