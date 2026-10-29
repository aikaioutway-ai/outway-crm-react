import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import DriverPaymentPicker from '../costs/DriverPaymentPicker';
import '../costs/ExpensesModule.css';
import { SCHOOL_TABS, getBranchFilter } from '../families/constants';
import { useDriversTable } from '../../hooks/useCrmQueries';
import type { SpendingEntry } from './SpendingModule';

export default function ExtraTripFields({ draft, onChange }: { draft: SpendingEntry; onChange: (patch: Partial<SpendingEntry>) => void }) {
  const { data: drivers = [], isLoading, error } = useDriversTable();
  const [open, setOpen] = useState(false);
  const choices = drivers.filter(driver => ['active', 'reserve'].includes(driver.status) || driver.driverId === draft.driverId);
  const updateAmount = (price: number, quantity: number) => onChange({ unitPrice: price, quantity, amount: Math.round(price * quantity * 100) / 100 });
  return <section className="payment-section expense-composer-fields">
    <div className="payment-driver-launch"><div><h3>Водитель</h3><p>{draft.recipient || 'Выберите водителя для выезда'}</p></div><button type="button" className="spending-primary" disabled={isLoading || !!error} onClick={() => setOpen(true)}>{draft.driverId ? 'Изменить водителя' : 'Выбрать водителя'}</button></div>
    {open && createPortal(<div className="spending-finance-picker"><DriverPaymentPicker selectDriverOnly compactCards drivers={choices} allDrivers={drivers} school={draft.schoolKey || ''} salary={false} initial={draft.driverId ? [{ driverId: draft.driverId, transferId: draft.transferId || '', schoolKey: draft.schoolKey || '', name: draft.recipient, amount: String(draft.amount) }] : []} transferSchool={transfer => SCHOOL_TABS.find(school => school.key === transfer.branchShort || school.label === transfer.branchShort)?.key || getBranchFilter(transfer.branchShort, transfer.branchCode)} onClose={() => setOpen(false)} onConfirm={rows => { const driver = rows[0]; onChange({ driverId: driver.driverId, recipient: driver.name, transferId: driver.transferId }); setOpen(false); }} /></div>, document.body)}
    {error && <p role="alert">Не удалось загрузить водителей. Повторите попытку позже.</p>}
    <label>Маршрут<input required maxLength={500} placeholder="Откуда — куда" value={draft.description} onChange={event => onChange({ description: event.target.value })} /></label>
    <label>Цена, сом<input required type="number" min="0.01" step="0.01" value={draft.unitPrice || ''} onChange={event => updateAmount(Number(event.target.value), draft.quantity ?? 1)} /></label>
    <label>Количество<input required type="number" min="1" step="1" value={draft.quantity ?? 1} onChange={event => updateAmount(draft.unitPrice || 0, Number(event.target.value))} /></label>
    <label>Сумма, сом<input readOnly value={Number.isFinite(draft.amount) ? draft.amount : 0} /></label>
  </section>;
}
