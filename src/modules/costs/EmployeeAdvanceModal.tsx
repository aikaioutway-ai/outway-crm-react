import { useState } from 'react';
import { X } from 'lucide-react';
import { useDriversTable, useEmployees } from '../../hooks/useCrmQueries';
import { createEmployeeAdvance } from '../../services/employeeService';
import { createV2DriverAdvance } from '../../services/crmV2Service';
import { queryClient } from '../../services/queryClient';
import { getBranchFilter, SCHOOL_TABS } from '../families/constants';

export default function EmployeeAdvanceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: employees = [], isLoading, error: loadError } = useEmployees();
  const { data: drivers = [], isLoading: driversLoading, error: driversError } = useDriversTable();
  const [department, setDepartment] = useState('');
  const [driverId, setDriverId] = useState('');
  const [transferId, setTransferId] = useState('');
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
  const recipients = employees.filter(employee => employee.status === 'active' && employee.role !== 'driver');
  const activeDrivers = drivers.filter(driver => driver.status === 'active');
  const transferSchool = (transfer: typeof drivers[number]['transfers'][number]) => SCHOOL_TABS.find(tab => tab.key !== 'ALL' && (tab.key === transfer.branchShort || tab.label === transfer.branchShort))?.key ?? getBranchFilter(transfer.branchShort, transfer.branchCode);
  const transfers = activeDrivers.flatMap(driver => driver.transfers).filter((transfer, index, all) => all.findIndex(row => row.id === transfer.id) === index).filter(transfer => !school || transferSchool(transfer) === school);
  const visibleDrivers = activeDrivers.filter(driver => (!school || driver.transfers.some(transfer => transferSchool(transfer) === school)) && (!transferId || driver.transfers.some(transfer => transfer.id === transferId)));
  const selectedDriver = activeDrivers.find(driver => driver.driverId === driverId);
  const selectedTransfers = selectedDriver?.transfers.filter(transfer => !school || transferSchool(transfer) === school) ?? [];
  const loading = department === 'drivers' ? driversLoading : isLoading;
  const loadingError = department === 'drivers' ? driversError : loadError;
  const selectDriver = (id: string) => {
    setDriverId(id);
    const driver = activeDrivers.find(row => row.driverId === id);
    const choices = driver?.transfers.filter(transfer => !school || transferSchool(transfer) === school) ?? [];
    const chosen = choices.find(transfer => transfer.id === transferId) ?? (choices.length === 1 ? choices[0] : undefined);
    setTransferId(chosen?.id ?? '');
    if (chosen) setSchool(transferSchool(chosen));
    else if (choices.length && choices.every(transfer => transferSchool(transfer) === transferSchool(choices[0]))) setSchool(transferSchool(choices[0]));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const [year, month] = period.split('-').map(Number);
    if (!department || (department === 'drivers' ? !selectedDriver || (selectedDriver.transfers.length > 0 && !selectedTransfers.some(row => row.id === transferId)) : !recipients.some(row => row.id === employeeId)) || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !date || !month || !year) { setError('Заполните подразделение, сотрудника, период, дату и сумму'); return; }
    setBusy(true); setError('');
    try {
      if (department === 'drivers') {
        await createV2DriverAdvance({ driverId, transferId: transferId || undefined, schoolKey: school || undefined, amount: Number(amount), date, comment, periodMonth: month, periodYear: year, paymentMethod: method, paymentOrderNumber: number });
        void queryClient.invalidateQueries({ queryKey: ['driverAdvances'] });
        void queryClient.invalidateQueries({ queryKey: ['driverAdvancesForPeriod'] });
      } else {
        await createEmployeeAdvance(employeeId, Number(amount), date, comment, { periodMonth: month, periodYear: year, schoolKey: 'OFFICE', paymentMethod: method, paymentOrderNumber: number });
      }
      void queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      onSaved(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить аванс'); setBusy(false); }
  };
  return <div className="expense-modal-overlay"><div className="expense-modal" role="dialog" aria-modal="true" aria-label="Новый аванс"><div className="expense-modal-head"><h2>Новый аванс</h2><button className="expense-modal-close" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div><form onSubmit={save} className="expense-form"><fieldset disabled={busy} style={{ display: 'contents' }}>
    <label className="expense-field full">Подразделение<select required disabled={busy} value={department} onChange={event => { setDepartment(event.target.value); setSchool(''); setTransferId(''); setDriverId(''); setEmployeeId(''); }}><option value="">Выберите подразделение</option><option value="office">Офис</option><option value="drivers">Водители</option></select></label>
    {department === 'drivers' ? <>
      <label className="expense-field">Школа<select disabled={busy} value={school} onChange={event => { setSchool(event.target.value); setTransferId(''); setDriverId(''); }}><option value="">Все школы</option>{SCHOOL_TABS.filter(row => row.key !== 'ALL').map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <label className="expense-field">Трансфер<select disabled={busy || driversLoading} value={transferId} onChange={event => { const id = event.target.value; setTransferId(id); const owner = activeDrivers.find(driver => driver.transfers.some(transfer => transfer.id === id)); const transfer = owner?.transfers.find(row => row.id === id); setDriverId(owner?.driverId ?? ''); if (transfer) setSchool(transferSchool(transfer)); }}><option value="">Все трансферы</option>{transfers.map(row => <option key={row.id} value={row.id}>{row.branchShort} · № {row.transferNumber}</option>)}</select></label>
      <label className="expense-field full">Водитель<select required disabled={busy || driversLoading} value={driverId} onChange={event => selectDriver(event.target.value)}><option value="">Выберите водителя</option>{visibleDrivers.map(row => <option key={row.driverId} value={row.driverId}>{row.fullName}</option>)}</select></label>
      <p className="expense-field full">Можно сразу выбрать водителя — школа и трансфер заполнятся автоматически. {selectedDriver && selectedTransfers.length > 1 && !transferId ? 'У водителя несколько трансферов: выберите нужный.' : selectedDriver && !selectedDriver.transfers.length ? 'У водителя пока нет назначенного трансфера.' : ''}</p>
    </> : department === 'office' ? <label className="expense-field full">Сотрудник<select required disabled={busy || isLoading} value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Выберите сотрудника</option>{recipients.map(row => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></label> : null}
    <label className="expense-field">За какой месяц<input required type="month" value={period} onChange={event => setPeriod(event.target.value)} /></label>
    <label className="expense-field">Сумма, сом<input required type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
    <label className="expense-field">Дата выплаты<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label className="expense-field">Способ оплаты<select value={method} onChange={event => setMethod(event.target.value)}><option value="cashless">Безналичные</option><option value="cash">Наличные</option></select></label>
    <label className="expense-field">№ платёжного поручения<input value={number} onChange={event => setNumber(event.target.value)} /></label>
    <label className="expense-field">Комментарий<input value={comment} onChange={event => setComment(event.target.value)} /></label>
    {(error || loadingError) && <p role="alert">{error || 'Не удалось загрузить получателей аванса'}</p>}
    <button className="expenses-add" type="submit" disabled={busy || !department || loading || Boolean(loadingError)}>{busy ? 'Сохранение…' : 'Выдать аванс'}</button>
  </fieldset></form></div></div>;
}
