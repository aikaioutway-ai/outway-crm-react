import { useState } from 'react';
import { X } from 'lucide-react';
import { useEmployees } from '../../hooks/useCrmQueries';
import { createEmployeeAdvance } from '../../services/employeeService';
import { queryClient } from '../../services/queryClient';
import { SCHOOL_TABS } from '../families/constants';

export default function EmployeeAdvanceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: employees = [], isLoading, error: loadError } = useEmployees();
  const [school, setSchool] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('sv-SE').slice(0, 7));
  const [date, setDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cashless');
  const [number, setNumber] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recipients = employees.filter(employee => employee.status === 'active' && employee.role !== 'driver' && (school === 'OFFICE' || employee.schoolKeys.includes('ALL') || employee.schoolKeys.includes(school)));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const [year, month] = period.split('-').map(Number);
    if (!school || !recipients.some(row => row.id === employeeId) || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !date || !month || !year) { setError('Заполните подразделение, сотрудника, период, дату и сумму'); return; }
    setBusy(true); setError('');
    try {
      await createEmployeeAdvance(employeeId, Number(amount), date, comment, { periodMonth: month, periodYear: year, schoolKey: school, paymentMethod: method, paymentOrderNumber: number });
      void queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      onSaved(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить аванс'); setBusy(false); }
  };
  return <div className="expense-modal-overlay"><div className="expense-modal" role="dialog" aria-modal="true" aria-label="Новый аванс"><div className="expense-modal-head"><h2>Новый аванс</h2><button className="expense-modal-close" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div><form onSubmit={save} className="expense-form">
    <label className="expense-field">Школа / офис<select required value={school} onChange={event => { setSchool(event.target.value); setEmployeeId(''); }}><option value="">Выберите подразделение</option><option value="OFFICE">Офис</option>{SCHOOL_TABS.filter(row => row.key !== 'ALL').map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
    <label className="expense-field">Сотрудник<select required disabled={!school || isLoading} value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Выберите сотрудника</option>{recipients.map(row => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></label>
    <label className="expense-field">За какой месяц<input required type="month" value={period} onChange={event => setPeriod(event.target.value)} /></label>
    <label className="expense-field">Сумма, сом<input required type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
    <label className="expense-field">Дата выплаты<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="expense-field">Способ оплаты<select value={method} onChange={event => setMethod(event.target.value)}><option value="cashless">Безналичные</option><option value="cash">Наличные</option></select></label>
    <label className="expense-field">№ платёжного поручения<input value={number} onChange={event => setNumber(event.target.value)} /></label>
    <label className="expense-field">Комментарий<input value={comment} onChange={event => setComment(event.target.value)} /></label>
    {(error || loadError) && <p role="alert">{error || 'Не удалось загрузить сотрудников'}</p>}
    <button className="expenses-add" type="submit" disabled={busy || isLoading || Boolean(loadError)}>{busy ? 'Сохранение…' : 'Выдать аванс'}</button>
  </form></div></div>;
}
