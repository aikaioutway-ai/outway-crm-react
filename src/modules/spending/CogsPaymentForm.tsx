import PaymentSummary from './PaymentSummary';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DriverPaymentPicker from '../costs/DriverPaymentPicker';
import '../costs/ExpensesModule.css';
import { splitPayment } from './paymentAmounts';
import { paymentQuarter } from './paymentQuarter';
import { ChevronLeft, ChevronRight, X, WalletCards, Check } from 'lucide-react';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { SCHOOL_TABS, getBranchFilter, isSchoolVisible } from '../families/constants';
import TransferCell from '../../core/dashboard/TransferCell';
import TransferBarPages from '../../core/dashboard/TransferBarPages';
import '../../core/dashboard/DashboardUI.css';
import type { SpendingEntry } from './SpendingModule';

type Payee = { key: string; driverId: string; name: string; schoolKey: string; transferId: string; transferNumber: number; paymentOnly?: boolean };
const localDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bishkek' }).format(new Date());
function periodLabel(key: string) {
  const [year, month, half] = key.split('-').map(Number);
  const name = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${name} · ${half === 1 ? '1–15' : `16–${new Date(Date.UTC(year, month, 0)).getUTCDate()}`}`;
}
export default function CogsPaymentForm({ entry, onSave, onCancel, disabled, onPanelChange, sessionToken }: {
  entry: SpendingEntry; onSave: (entries: SpendingEntry[]) => boolean; onCancel: () => void; disabled: boolean; sessionToken?: string; onPanelChange?: (open: boolean) => void;
}) {
  const { data: drivers = [], isLoading, error: loadError } = useDriversTable();
  const [driversOpen, setDriversOpen] = useState(false);
  const [type, setType] = useState(entry.subcategory);
  const [school, setSchool] = useState(entry.schoolKey || '');
  const [transfer, setTransfer] = useState(entry.transferId || (entry.driverId ? 'RESERVE' : ''));
  const initialKey = entry.recipientKey || (entry.driverId ? `${entry.driverId}:${entry.transferId || ''}` : '');
  const [selected, setSelected] = useState<string[]>(initialKey ? [initialKey] : []);
  const [date, setDate] = useState(entry.date);
  const [panelMonth, setPanelMonth] = useState((entry.salaryPeriodKey || localDate()).slice(0, 7));
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(entry.salaryPeriodKey ? [entry.salaryPeriodKey] : []);
  const [baseAmounts, setBaseAmounts] = useState<Record<string, string>>(initialKey ? { [initialKey]: String(entry.amount) } : {});
  const [extraPayees, setExtraPayees] = useState<Payee[]>(entry.paymentOnly ? [{ key: initialKey, driverId: entry.driverId || '', name: entry.recipient, schoolKey: entry.schoolKey || '', transferId: entry.transferId || '', transferNumber: entry.transferNumber || 0, paymentOnly: true }] : []);
  const [method, setMethod] = useState(entry.method);
  const [paymentOrderNumber, setPaymentOrderNumber] = useState(entry.paymentOrderNumber || '');
  const [comment, setComment] = useState(entry.comment || '');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLFormElement>(null);
  useEffect(() => { onPanelChange?.(false); }, [onPanelChange]);
  useEffect(() => { dialog.current?.focus({ preventScroll: true }); }, []);
  const schoolFor = (item: typeof drivers[number]['transfers'][number]) => SCHOOL_TABS.find(tab => tab.key !== 'ALL' && (tab.key === item.branchShort || tab.label === item.branchShort))?.key || getBranchFilter(item.branchShort, item.branchCode);
  const schools = SCHOOL_TABS.filter(item => item.key !== 'ALL' && isSchoolVisible(item.key));
  const activeDrivers = drivers.filter(driver => ['active', 'reserve'].includes(driver.status) || driver.driverId === entry.driverId);
  const directoryChoices: Payee[] = Array.from(new Map(activeDrivers.flatMap(driver => {
    const assigned = driver.transfers.filter(item => isSchoolVisible(schoolFor(item))).map(item => ({ key: `${driver.driverId}:${item.id}`, driverId: driver.driverId, name: driver.fullName, schoolKey: schoolFor(item), transferId: item.id, transferNumber: item.transferNumber }));
    if (!driver.transfers.length) { const driverSchool = schools.filter(item => driver.branchShorts?.some(branch => branch === item.key || branch === item.label)); assigned.push({ key: `${driver.driverId}:`, driverId: driver.driverId, name: driver.fullName, schoolKey: driverSchool.length === 1 ? driverSchool[0].key : transfer === 'RESERVE' ? school : '', transferId: '', transferNumber: 0 }); }
    return assigned;
  }).map(item => [item.key, item])).values());
  const allChoices = [...directoryChoices.filter(person => !extraPayees.some(extra => extra.key === person.key)), ...extraPayees];
  const amounts = Object.fromEntries(allChoices.flatMap(person => {
    const parts = splitPayment(Number(baseAmounts[person.key]) || 0, selectedPeriods.length);
    return selectedPeriods.map((period, index) => [`${person.key}:${period}`, String(parts[index])]);
  }));
  const choices = allChoices.filter(item => !school || item.schoolKey === school);
  const recipients = allChoices.filter(item => selected.includes(item.key));
  const validAmount = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
  const total = recipients.reduce((sum, person) => sum + selectedPeriods.reduce((subtotal, period) => subtotal + (Number(amounts[`${person.key}:${period}`]) || 0), 0), 0);
  const resetRecipients = () => { setSelected([]); setBaseAmounts({}); };
  const togglePeriod = (key: string, checked: boolean) => setSelectedPeriods(current => checked ? entry.id ? [key] : [...current, key] : current.filter(item => item !== key));
  const chooseTransfer = (value: string) => { if (transfer !== value) resetRecipients(); setTransfer(value); setError(''); setDriversOpen(true); };
  const shiftMonth = (direction: number) => { const [year, month] = panelMonth.split('-').map(Number); setPanelMonth(new Date(Date.UTC(year, month - 1 + direction, 1)).toISOString().slice(0, 7)); };
  const selectedSchool = schools.find(item => item.key === school);
  const quarter = paymentQuarter(panelMonth);
  const periodMonths = quarter.months;
  const periodOptions = periodMonths.flatMap(month => [1, 2].map(half => ({ key: `${month}-${half}`, label: periodLabel(`${month}-${half}`) })));
  const previewTotal = selectedPeriods.length ? total : recipients.reduce((sum, person) => sum + (Number(baseAmounts[person.key]) || 0), 0);
  return <><form inert={driversOpen} ref={dialog} tabIndex={-1} aria-label="Новая выплата COGS" className="payment-composer payment-composer-inline" onSubmit={event => {
    event.preventDefault();
    if (!recipients.length || recipients.some(person => !person.schoolKey) || !selectedPeriods.length || (entry.id && (recipients.length !== 1 || selectedPeriods.length !== 1))) { setError('Выберите школу, трансфер, водителей и период выплаты.'); return; }
    if (recipients.some(person => selectedPeriods.some(period => !validAmount(amounts[`${person.key}:${period}`])))) { setError('Укажите сумму каждому водителю за каждый период.'); return; }
    const saved = onSave(recipients.flatMap(person => selectedPeriods.map(period => ({ ...entry, id: entry.id || crypto.randomUUID(), category: 'COGS' as const, subcategory: type, date, method, paymentOrderNumber: paymentOrderNumber.trim(), comment: comment.trim(), paymentOnly: person.paymentOnly, recipientKey: person.key, transferNumber: person.transferNumber, schoolKey: person.schoolKey, transferId: person.transferId, driverId: person.driverId, salaryPeriodKey: period, amount: Number(amounts[`${person.key}:${period}`]), recipient: person.name, description: `${type === 'Авансы водителям' ? 'Аванс' : 'Зарплата'} — ${person.name}` }))));
    if (!saved) setError('Не удалось сохранить выплаты. Проверьте доступность хранилища браузера и повторите попытку.');
  }}>
    <header className="payment-composer-head"><div className="payment-composer-title"><span className="payment-composer-icon"><WalletCards size={22} /></span><div><span className="payment-composer-kicker">COGS · ШКОЛЬНЫЕ ПЕРЕВОЗКИ</span><h2>{entry.id ? 'Редактирование выплаты' : 'Новая выплата'}</h2></div></div><button type="button" aria-label="Закрыть форму выплаты" className="payment-close" onClick={onCancel}><X size={20} /></button></header>
    <div className="payment-composer-body"><div className="payment-composer-main">
      <section className="payment-section"><div className="payment-section-heading"><div><h3>Кому выплачиваем</h3><p>Выберите школу и нужные трансферы</p></div><div className="payment-type-switch" role="group" aria-label="Тип выплаты">{['Авансы водителям', 'Зарплата водителей'].map(value => <button type="button" key={value} aria-pressed={type === value} onClick={() => setType(value)}>{value === 'Авансы водителям' ? 'Аванс' : 'Зарплата'}</button>)}</div></div>
      <div className="spending-school-strip">{schools.map(item => <button type="button" key={item.key} aria-pressed={school === item.key} onClick={() => { setSchool(school === item.key ? '' : item.key); setTransfer(''); }}><span className="spending-school-logo">{item.logo ? <img src={item.logo} alt="" /> : item.label.slice(0, 2)}</span><span>{item.label}</span></button>)}</div>
      <><p className="payment-field-label">Трансферы</p><div className="spending-transfer-strip" inert={!school} style={!school ? { filter: "grayscale(1)", opacity: .5 } : undefined}><TransferBarPages scopeKey={school} counts={Array.from({ length: 15 }, (_, index) => choices.filter(item => item.transferNumber === index + 1).length)}>
        {Array.from({ length: 15 }, (_, index) => { const number = index + 1; const people = choices.filter(item => item.transferNumber === number); return <TransferCell key={number} label={String(number)} value={school ? people.length : 0} active={!!school && people.length > 0} selected={transfer === `number:${number}` || !!transfer && choices.some(item => item.transferId === transfer && item.transferNumber === number)} onClick={() => chooseTransfer(`number:${number}`)} />; })}
        <TransferCell label="Резерв" title="Резерв" active={!!school && choices.some(item => !item.transferId)} selected={transfer === 'RESERVE'} value={school ? choices.filter(item => !item.transferId).length : 0} onClick={() => chooseTransfer('RESERVE')} />
        <TransferCell label="≡" title="Все трансферы школы" active={!!school && choices.length > 0} selected={transfer === 'ALL'} value={school ? choices.length : 0} onClick={() => chooseTransfer('ALL')} />
      </TransferBarPages></div></>
      </section>
      <section className="payment-section payment-driver-launch"><div><h3>Получатели <span className="payment-count">{recipients.length}</span></h3><p>{recipients.length ? recipients.slice(0, 3).map(person => person.name).join(', ') : 'Выберите водителей и укажите суммы в отдельном окне'}</p></div><button type="button" className="spending-primary" onClick={() => setDriversOpen(true)}>{recipients.length ? 'Изменить получателей' : 'Выбрать водителей'}</button></section>
      {!!recipients.length && selectedPeriods.length > 1 && <section className="payment-section"><h3>Распределение по периодам</h3><div className="spending-table-wrap"><table><thead><tr><th>Водитель</th>{selectedPeriods.map(key => <th key={key}>{periodLabel(key)}</th>)}</tr></thead><tbody>{recipients.map(person => <tr key={person.key}><td>{person.name}</td>{selectedPeriods.map(period => <td key={period}><span>{Number(amounts[`${person.key}:${period}`] || 0).toLocaleString('ru-RU')} сом</span></td>)}</tr>)}</tbody></table></div></section>}
      <section className="payment-section payment-period-section"><div className="payment-section-heading"><div><h3>Периоды выплаты</h3><p>Выберите одну или несколько половин месяца</p></div><div className="spending-actions"><button type="button" aria-label="Предыдущий квартал" onClick={() => shiftMonth(-3)}><ChevronLeft size={16} /></button><span>{quarter.number}-й квартал</span><button type="button" aria-label="Следующий квартал" onClick={() => shiftMonth(3)}><ChevronRight size={16} /></button></div></div>
      <div className="payment-period-month-grid spending-periods">{periodMonths.map(month => <fieldset key={month}><legend>{periodLabel(`${month}-1`).split(' · ')[0]}</legend>{periodOptions.filter(item => item.key.startsWith(month)).map(item => <label className="spending-check" key={item.key}><input aria-label={item.label} type="checkbox" checked={selectedPeriods.includes(item.key)} onChange={event => togglePeriod(item.key, event.target.checked)} />{item.label.split(' · ')[1]}</label>)}</fieldset>)}</div>
      </section>
</div><aside className="payment-composer-details"><h3>Сводка выплаты</h3><p className="payment-summary-kind">{type === 'Авансы водителям' ? 'Аванс водителям' : 'Зарплата водителей'}</p><PaymentSummary><dt>Школа</dt><dd>{Array.from(new Set(recipients.map(person => schools.find(item => item.key === person.schoolKey)?.label || 'Резерв'))).join(', ') || selectedSchool?.label || 'Школа'}</dd><dt>Получатели</dt><dd>{recipients.length <= 1 ? (recipients[0]?.name || 'Получатели') : <details className="payment-recipient-details"><summary>{`${recipients[0].name} +${recipients.length - 1}`}</summary>{recipients.map(person => <div key={person.key}><span>{person.name}</span><strong>{(Number(baseAmounts[person.key]) || 0).toLocaleString('ru-RU')} сом</strong></div>)}</details>}</dd><dt>За период</dt><dd>{selectedPeriods.length ? selectedPeriods.map(periodLabel).join('; ') : 'За период'}</dd></PaymentSummary>{comment && <p className="payment-summary-comment">{comment}</p>}<section className="payment-section payment-requisites"><h3>Реквизиты выплаты</h3><label>Дата оплаты<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><label>Способ оплаты<select value={method} onChange={event => setMethod(event.target.value)}><option>Безналичные</option><option>Наличные</option></select></label><label>Платёжное поручение<input maxLength={100} placeholder="Например, № 128" value={paymentOrderNumber} onChange={event => setPaymentOrderNumber(event.target.value)} /></label><label>Комментарий<textarea rows={3} maxLength={2000} placeholder="Необязательно" value={comment} onChange={event => setComment(event.target.value)} /></label></section></aside></div>
    {error && <p role="alert" className="spending-error">{error}</p>}
    <footer className="payment-composer-footer"><div className="payment-footer-total"><span>Итого к выплате</span><strong>{previewTotal.toLocaleString('ru-RU')} <small>сом</small></strong><p>{recipients.length} получателей · {selectedPeriods.length ? `${selectedPeriods.length} периодов` : 'Период не выбран'}</p></div><div className="spending-actions"><button type="button" onClick={onCancel}>Отмена</button><button className="spending-primary" type="submit" disabled={disabled || isLoading || !!loadError}><Check size={16} />Сохранить выплаты</button></div></footer>
  </form>
  {driversOpen && createPortal(<div className="spending-finance-picker"><DriverPaymentPicker
    drivers={activeDrivers.map(driver => ({ ...driver, transfers: driver.transfers.filter(item => (!school || schoolFor(item) === school) && (!transfer || transfer === 'ALL' || transfer === item.id || transfer === `number:${item.transferNumber}`)) }))}
    allDrivers={drivers} school={school} sessionToken={sessionToken} splitTotal compactCards
    initial={recipients.map(person => ({ driverId: person.driverId, schoolKey: person.schoolKey, transferId: person.transferId, name: person.name, amount: baseAmounts[person.key] || '', temporary: person.paymentOnly }))}
    salary={type === 'Зарплата водителей'} transferSchool={schoolFor}
    onClose={() => setDriversOpen(false)}
    onConfirm={payments => {
      const payees = payments.map(person => ({ key: `${person.driverId}:${person.transferId}`, driverId: person.driverId, schoolKey: person.schoolKey, transferId: person.transferId, name: person.name, transferNumber: drivers.flatMap(driver => driver.transfers).find(item => item.id === person.transferId)?.transferNumber || 0, paymentOnly: person.temporary }));
      setExtraPayees(payees); setSelected(payees.map(person => person.key)); setBaseAmounts(Object.fromEntries(payees.map((person,index) => [person.key, payments[index].amount]))); setDriversOpen(false);
    }}
  /></div>, document.body)}
  </>;
}
