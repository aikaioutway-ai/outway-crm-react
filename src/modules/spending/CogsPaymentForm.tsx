import ExpenseCategorySelect, { CategoryChange } from './ExpenseCategorySelect';
import AllRecordsButton from '../../core/dashboard/AllRecordsButton';
import PaymentSummary from './PaymentSummary';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DriverPaymentPicker from '../costs/DriverPaymentPicker';
import '../costs/ExpensesModule.css';
import { splitPayment } from './paymentAmounts';
import { CalendarDays, X, WalletCards, Check, ChevronLeft, ChevronRight } from 'lucide-react';
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
export default function CogsPaymentForm({ entry, onSave, onCancel, disabled, onPanelChange, sessionToken, onAllRecords, headerActions, categories = [entry.category], onCategoryChange }: {
  headerActions?: React.ReactNode;
  categories?: SpendingEntry['category'][]; onCategoryChange?: CategoryChange;
  entry: SpendingEntry; onSave: (entries: SpendingEntry[]) => boolean; onCancel: () => void; disabled: boolean; sessionToken?: string; onAllRecords?: () => void; onPanelChange?: (open: boolean) => void;
}) {
  const [selectionPanel, setSelectionPanel] = useState<'school' | 'transfer' | 'period' | 'route' | null>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectionPanel) return;
    const previous = document.activeElement as HTMLElement | null;
    selectionRef.current?.focus({ preventScroll: true });
    if (selectionRef.current) selectionRef.current.scrollTop = 0;
    return () => previous?.focus();
  }, [selectionPanel]);
  const isExtraTrip = entry.category === 'Доп. Выезды' || entry.category === 'Logistics';
  const [route, setRoute] = useState(entry.description || '');
  const [quantity, setQuantity] = useState(entry.quantity ?? 1);
  const { data: drivers = [], isLoading, error: loadError } = useDriversTable();
  const [driversOpen, setDriversOpen] = useState(false);
  useEffect(() => {
    if (!selectionPanel && !driversOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Element;
      if (selectionPanel && !selectionRef.current?.contains(target)) setSelectionPanel(null);
      if (driversOpen && !target.closest('.expense-recipient-drawer .payment-picker')) setDriversOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setSelectionPanel(null); setDriversOpen(false); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape, true); };
  }, [selectionPanel, driversOpen]);
  const [type, setType] = useState(entry.subcategory);
  const [school, setSchool] = useState(entry.schoolKey || '');
  const [transfer, setTransfer] = useState(entry.transferId || (entry.driverId ? 'RESERVE' : ''));
  const initialKey = entry.recipientKey || (entry.driverId ? `${entry.driverId}:${entry.transferId || ''}` : '');
  const [selected, setSelected] = useState<string[]>(initialKey ? [initialKey] : []);
  // Запись без водителя (например, перенесённая из «Финансов» в другую категорию): сумму не теряем.
  const carriedAmount = entry.id && !initialKey && entry.amount > 0 ? entry.amount : 0;
  const [date, setDate] = useState(entry.date);
  const [panelMonth] = useState((entry.salaryPeriodKey || localDate()).slice(0, 7));
  const [periodPage, setPeriodPage] = useState(() => Number(panelMonth.slice(5, 7)) >= 3 && Number(panelMonth.slice(5, 7)) <= 8 ? 1 : 0);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(entry.salaryPeriodKey ? [entry.salaryPeriodKey] : []);
  const [baseAmounts, setBaseAmounts] = useState<Record<string, string>>(initialKey ? { [initialKey]: String(isExtraTrip ? entry.unitPrice ?? entry.amount : entry.amount) } : {});
  const [extraPayees, setExtraPayees] = useState<Payee[]>(entry.paymentOnly ? [{ key: initialKey, driverId: entry.driverId || '', name: entry.recipient, schoolKey: entry.schoolKey || '', transferId: entry.transferId || '', transferNumber: entry.transferNumber || 0, paymentOnly: true }] : []);
  const [method, setMethod] = useState(entry.method);
  const [paymentOrderNumber, setPaymentOrderNumber] = useState(entry.paymentOrderNumber || '');
  const [comment, setComment] = useState(entry.comment || '');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLFormElement>(null);
  useEffect(() => { onPanelChange?.(driversOpen); return () => onPanelChange?.(false); }, [driversOpen, onPanelChange]);
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
  const recipients = allChoices.filter(item => selected.includes(item.key)).map(person => ({ ...person, schoolKey: person.schoolKey || school }));
  const validAmount = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
  const tripTotal = recipients.reduce((sum, person) => sum + Math.round((Number(baseAmounts[person.key]) || 0) * quantity * 100) / 100, 0);
  const total = recipients.reduce((sum, person) => sum + selectedPeriods.reduce((subtotal, period) => subtotal + (Number(amounts[`${person.key}:${period}`]) || 0), 0), 0);
  const resetRecipients = () => { setSelected([]); setBaseAmounts({}); };
  const togglePeriod = (key: string, checked: boolean) => setSelectedPeriods(current => checked ? entry.id ? [key] : [...current.filter(item => item.slice(0,7) === key.slice(0,7)), key] : current.filter(item => item !== key));
  const chooseTransfer = (value: string) => { if (transfer !== value) resetRecipients(); setTransfer(value); setError(''); setDriversOpen(true); };
  const selectedSchool = schools.find(item => item.key === school);
  const [periodYear, periodMonth] = panelMonth.split('-').map(Number);
  const schoolYear = periodYear - (periodMonth < 9 ? 1 : 0);
  const firstMonth = periodPage < 0 ? -3 : periodPage * 6;
  const periodMonths = Array.from({ length: periodPage < 0 ? 3 : 6 }, (_, index) => new Date(Date.UTC(schoolYear, 8 + firstMonth + index, 1)).toISOString().slice(0, 7));
  const periodOptions = periodMonths.flatMap(month => [1, 2].map(half => ({ key: `${month}-${half}`, label: periodLabel(`${month}-${half}`) })));
  const previewTotal = isExtraTrip ? tripTotal : selectedPeriods.length ? total : recipients.reduce((sum, person) => sum + (Number(baseAmounts[person.key]) || 0), 0);
  return <><form inert={driversOpen} ref={dialog} tabIndex={-1} aria-label={isExtraTrip ? `Новый выезд ${entry.category}` : "Новая выплата COGS"} className={`payment-composer payment-composer-inline payment-composer-compact${selectionPanel ? ' has-selection-panel' : ''}`} onSubmit={event => {
    event.preventDefault();
    if (isExtraTrip) {
      const issues: string[] = [];
      if (!recipients.length) issues.push('Выберите получателя выплаты.');
      if (!route.trim()) issues.push('Укажите маршрут.');
      if (!Number.isSafeInteger(quantity) || quantity < 1) issues.push('Количество выездов должно быть целым числом больше нуля.');
      if (!date) issues.push('Укажите дату оплаты.');
      const invalidPrices = recipients.filter(person => !validAmount(baseAmounts[person.key]));
      if (invalidPrices.length) issues.push(`Укажите цену больше нуля для: ${invalidPrices.map(person => person.name).join(', ')}.`);
      const overflowingPrices = recipients.filter(person => validAmount(baseAmounts[person.key]) && !Number.isFinite(Number(baseAmounts[person.key]) * quantity));
      if (overflowingPrices.length) issues.push(`Слишком большая сумма выплаты для: ${overflowingPrices.map(person => person.name).join(', ')}. Уменьшите цену или количество.`);
      if (issues.length) { setError(issues.join(' ')); return; }
      if (entry.id && recipients.length !== 1) { setError('При редактировании выберите одного водителя.'); return; }
      if (!onSave(recipients.map(person => ({ ...entry, id: entry.id || crypto.randomUUID(), category: entry.category, subcategory: 'Оплата водителю', date, method, paymentOrderNumber: paymentOrderNumber.trim(), comment: comment.trim(), schoolKey: person.schoolKey, transferId: person.transferId, driverId: person.driverId, recipientKey: person.key, transferNumber: person.transferNumber, paymentOnly: person.paymentOnly, recipient: person.name, description: route.trim(), unitPrice: Number(baseAmounts[person.key]), quantity, amount: Math.round(Number(baseAmounts[person.key]) * quantity * 100) / 100, salaryPeriodKey: undefined })))) setError('Не удалось сохранить выезд.');
      return;
    }
    const issues: string[] = [];
    if (!recipients.length) issues.push('Выберите получателя выплаты.');
    const withoutSchool = recipients.filter(person => !person.schoolKey);
    if (withoutSchool.length) issues.push(`Не указана школа для: ${withoutSchool.map(person => person.name).join(', ')}. Откройте выбор получателей и укажите школу.`);
    if (!selectedPeriods.length) issues.push('Выберите период выплаты.');
    if (entry.id && recipients.length > 1) issues.push('При редактировании оставьте одного получателя.');
    if (entry.id && selectedPeriods.length > 1) issues.push('При редактировании оставьте один период выплаты.');
    if (issues.length) { setError(issues.join(' ')); return; }
    const invalidAmounts = recipients.flatMap(person => selectedPeriods.filter(period => !validAmount(amounts[`${person.key}:${period}`])).map(period => `${person.name} — ${periodLabel(period)}`));
    if (invalidAmounts.length) { setError(`Укажите сумму больше нуля: ${invalidAmounts.join('; ')}.`); return; }
    const saved = onSave(recipients.flatMap(person => selectedPeriods.map(period => ({ ...entry, id: entry.id || crypto.randomUUID(), category: 'COGS' as const, subcategory: type, date, method, paymentOrderNumber: paymentOrderNumber.trim(), comment: comment.trim(), paymentOnly: person.paymentOnly, recipientKey: person.key, transferNumber: person.transferNumber, schoolKey: person.schoolKey, transferId: person.transferId, driverId: person.driverId, salaryPeriodKey: period, amount: Number(amounts[`${person.key}:${period}`]), unitPrice: undefined, quantity: undefined, recipient: person.name, description: `${type === 'Авансы водителям' ? 'Аванс' : 'Зарплата'} — ${person.name}` }))));
    if (!saved) setError('Не удалось сохранить выплаты. Проверьте доступность хранилища браузера и повторите попытку.');
  }}>
    <header className="payment-composer-head"><div className="payment-composer-title"><span className="payment-composer-icon"><WalletCards size={22} /></span><div><span className="payment-composer-kicker">{isExtraTrip ? entry.category === 'Logistics' ? 'LOGISTICS' : 'ДОП. ВЫЕЗДЫ' : 'COGS · ШКОЛЬНЫЕ ПЕРЕВОЗКИ'}</span><h2>{entry.id ? 'Редактирование выплаты' : 'Новая выплата'}</h2></div></div>{headerActions || <div className="spending-actions">{onAllRecords && <AllRecordsButton label="Все записи" onClick={onAllRecords} />}<button type="button" aria-label="Закрыть форму выплаты" className="payment-close" onClick={onCancel}><X size={20} /></button></div>}</header>
    <div className="payment-composer-body"><div className={`payment-composer-main expense-selection-panel${selectionPanel ? ' is-open' : ''}`} data-panel={selectionPanel || ''} ref={selectionRef} tabIndex={-1} role={selectionPanel ? 'dialog' : undefined} aria-label="Выбор параметров выплаты" onKeyDown={event => { if (event.key === 'Escape' && selectionPanel) { event.stopPropagation(); setSelectionPanel(null); } }}><div className="expense-selection-heading"><h3>{selectionPanel === 'school' ? 'Выберите школу' : selectionPanel === 'transfer' ? 'Выберите трансфер' : selectionPanel === 'period' ? 'Период выплаты' : 'Маршрут и количество'}</h3><button type="button" aria-label="Закрыть панель выбора" onClick={() => setSelectionPanel(null)}><X size={18} /></button></div>
      <section className="payment-section"><div className="payment-section-heading"><div><h3>Кому выплачиваем</h3><p>Выберите школу и нужные трансферы</p></div></div>
      <div className="spending-school-strip">{schools.map(item => <button type="button" key={item.key} aria-pressed={school === item.key} onClick={() => { setSchool(item.key); setTransfer(''); setSelectionPanel('transfer'); }}><span className="spending-school-logo">{item.logo ? <img src={item.logo} alt="" /> : item.label.slice(0, 2)}</span><span>{item.label}</span></button>)}</div>
      <><p className="payment-field-label">Трансферы</p><div className="spending-transfer-strip" inert={!school} style={!school ? { filter: "grayscale(1)", opacity: .5 } : undefined}><TransferBarPages scopeKey={school} counts={Array.from({ length: 15 }, (_, index) => choices.filter(item => item.transferNumber === index + 1).length)}>
        {Array.from({ length: 15 }, (_, index) => { const number = index + 1; const people = choices.filter(item => item.transferNumber === number); return <TransferCell key={number} label={String(number)} value={school ? people.length : 0} active={!!school && people.length > 0} selected={transfer === `number:${number}` || !!transfer && choices.some(item => item.transferId === transfer && item.transferNumber === number)} onClick={() => { chooseTransfer(`number:${number}`); setSelectionPanel(null); setDriversOpen(true); }} />; })}
        <TransferCell label="Резерв" title="Резерв" active={!!school && choices.some(item => !item.transferId)} selected={transfer === 'RESERVE'} value={school ? choices.filter(item => !item.transferId).length : 0} onClick={() => { chooseTransfer('RESERVE'); setSelectionPanel(null); setDriversOpen(true); }} />
        <TransferCell label="≡" title="Все трансферы школы" active={!!school && choices.length > 0} selected={transfer === 'ALL'} value={school ? choices.length : 0} onClick={() => { chooseTransfer('ALL'); setSelectionPanel(null); setDriversOpen(true); }} />
      </TransferBarPages></div></>
      </section>
      <section className="payment-section payment-driver-launch"><div><h3>Получатели <span className="payment-count">{recipients.length}</span></h3><p>{recipients.length ? recipients.slice(0, 3).map(person => person.name).join(', ') : 'Выберите водителей и укажите суммы в отдельном окне'}</p></div><button type="button" className="spending-primary" onClick={() => setDriversOpen(true)}>{recipients.length ? 'Изменить получателей' : 'Выбрать водителей'}</button></section>
      {!isExtraTrip && !!recipients.length && selectedPeriods.length > 1 && <section className="payment-section"><h3>Распределение по периодам</h3><div className="spending-table-wrap"><table><thead><tr><th>Водитель</th>{selectedPeriods.map(key => <th key={key}>{periodLabel(key)}</th>)}</tr></thead><tbody>{recipients.map(person => <tr key={person.key}><td>{person.name}</td>{selectedPeriods.map(period => <td key={period}><span>{Number(amounts[`${person.key}:${period}`] || 0).toLocaleString('ru-RU')} сом</span></td>)}</tr>)}</tbody></table></div></section>}

      {!isExtraTrip && <section className="payment-section payment-period-section"><div className="payment-section-heading"><div><h3>Периоды выплаты</h3><p>Выберите один период или две половины одного месяца</p></div><div className="spending-actions payment-period-navigation" role="group" aria-label="Навигация по кварталам"><button type="button" aria-label="Предыдущие кварталы" disabled={periodPage === -1} onClick={() => setPeriodPage(page => page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button><button type="button" aria-label="Следующие кварталы" disabled={periodPage === 1} onClick={() => setPeriodPage(page => page + 1)}><ChevronRight size={18} aria-hidden="true" /></button></div></div>
      <div className="payment-period-month-grid spending-periods cogs-period-cards">{periodMonths.map((month, index) => <React.Fragment key={month}>{index % 3 === 0 && <h4 className="expense-quarter-divider">{periodPage < 0 ? 'Летний квартал' : `${periodPage * 2 + index / 3 + 1}-й квартал`}</h4>}<fieldset><legend><CalendarDays size={18} aria-hidden="true" /><span>{periodLabel(`${month}-1`).split(' · ')[0]}</span></legend>{periodOptions.filter(item => item.key.startsWith(month)).map(item => <button type="button" className="spending-period-button" key={item.key} aria-label={item.label} aria-pressed={selectedPeriods.includes(item.key)} onClick={() => togglePeriod(item.key, !selectedPeriods.includes(item.key))}><span>{item.label.split(' · ')[1]}<small>числа месяца</small></span></button>)}</fieldset></React.Fragment>)}</div>
      </section>}
{selectionPanel && <button type="button" className="spending-primary expense-selection-done" onClick={() => { if (selectionPanel === 'school' && school) setSelectionPanel('transfer'); else if (selectionPanel === 'transfer') { setSelectionPanel(null); setDriversOpen(true); } else { setSelectionPanel(null); dialog.current?.querySelector<HTMLInputElement>('.payment-requisites input')?.focus(); } }}>Готово</button>}</div><aside className="payment-composer-details"><h3>Сводка выплаты</h3><div className="expense-category-type-row"><ExpenseCategorySelect entry={{...entry,date,method,comment,paymentOrderNumber,subcategory:type,amount:previewTotal || entry.amount,description:isExtraTrip ? route : entry.description,schoolKey:school,driverId:recipients[0]?.driverId || entry.driverId,recipient:recipients[0]?.name || entry.recipient,salaryPeriodKey:selectedPeriods[0],unitPrice:isExtraTrip ? Number(baseAmounts[recipients[0]?.key]) || entry.unitPrice : entry.unitPrice,quantity}} categories={categories} onChange={onCategoryChange} disabled={disabled} />{!isExtraTrip && <div className="payment-type-switch" role="group" aria-label="Тип выплаты">{['Авансы водителям', 'Зарплата водителей'].map(value => <button type="button" key={value} aria-pressed={type === value} onClick={() => { setType(value); if (!school) setSelectionPanel('school'); else if (!transfer) setSelectionPanel('transfer'); else if (!recipients.length) setDriversOpen(true); else if (!selectedPeriods.length) setSelectionPanel('period'); }}>{value === 'Авансы водителям' ? 'Аванс' : 'Зарплата'}</button>)}</div>}</div><PaymentSummary editableLabels={['Маршрут', 'Количество']} icons={{ ...(selectedSchool?.logo ? { Школа: <img className="expense-summary-school-logo" src={selectedSchool.logo} alt="" /> } : {}), ...(transfer ? { Трансфер: <span className="expense-summary-transfer-tile">{transfer.startsWith('number:') ? transfer.slice(7) : transfer === 'RESERVE' ? 'Р' : transfer === 'ALL' ? 'Все' : recipients[0]?.transferNumber || '—'}</span> } : {}) }} onSelect={label => { if (label === 'Получатели') { setDriversOpen(true); return; } setSelectionPanel(label === 'Школа' ? 'school' : label === 'Трансфер' ? 'transfer' : label === 'За период' ? 'period' : 'route'); }}><dt>Школа</dt><dd>{Array.from(new Set(recipients.map(person => schools.find(item => item.key === person.schoolKey)?.label || 'Резерв'))).join(', ') || selectedSchool?.label || 'Школа'}</dd><dt>Трансфер</dt><dd>{transfer.startsWith('number:') ? `№ ${transfer.slice(7)}` : transfer === 'RESERVE' ? 'Резерв' : transfer === 'ALL' ? 'Все трансферы' : recipients[0]?.transferNumber ? `№ ${recipients[0].transferNumber}` : 'Выберите трансфер'}</dd><dt>Получатели</dt><dd>{recipients.length > 0 && <span className="expense-recipient-count">{recipients.length}</span>}{recipients.length <= 1 ? (recipients[0]?.name || 'Получатели') : <details className="payment-recipient-details"><summary>{`${recipients[0].name} +${recipients.length - 1}`}</summary>{recipients.map(person => <div key={person.key}><span>{person.name}</span><strong>{(isExtraTrip ? Math.round((Number(baseAmounts[person.key]) || 0) * quantity * 100) / 100 : Number(baseAmounts[person.key]) || 0).toLocaleString('ru-RU')} сом</strong></div>)}</details>}</dd>{isExtraTrip ? <><dt>Маршрут</dt><dd><input aria-label="Маршрут" required maxLength={500} placeholder="Откуда — куда" value={route} onChange={event => setRoute(event.target.value)} /></dd><dt>Количество</dt><dd><input aria-label="Количество" required type="number" min="1" step="1" value={quantity || ''} onChange={event => setQuantity(Number(event.target.value))} /></dd></> : <><dt>За период</dt><dd>{selectedPeriods.length ? selectedPeriods.map(periodLabel).join('; ') : 'За период'}</dd></>}</PaymentSummary>{comment && <p className="payment-summary-comment">{comment}</p>}<section className="payment-section payment-requisites"><h3>Реквизиты выплаты</h3><label>Дата оплаты<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><label>Способ оплаты<select value={method} onChange={event => setMethod(event.target.value)}><option>Безналичные</option><option>Наличные</option></select></label><label>Платёжное поручение<input maxLength={100} placeholder="Например, № 128" value={paymentOrderNumber} onChange={event => setPaymentOrderNumber(event.target.value)} /></label><label>Комментарий<textarea rows={3} maxLength={2000} placeholder="Необязательно" value={comment} onChange={event => setComment(event.target.value)} /></label></section></aside></div>
    {error && <p role="alert" className="spending-error">{error}</p>}
    <footer className="payment-composer-footer"><div className="payment-footer-total"><span>Итого к выплате</span>{!previewTotal && carriedAmount > 0 ? <strong className="payment-carried" title="Сумма записи — подставится выбранному получателю">{carriedAmount.toLocaleString('ru-RU')} <small>сом</small></strong> : <strong>{previewTotal.toLocaleString('ru-RU')} <small>сом</small></strong>}<p>{recipients.length} получателей · {isExtraTrip ? `${quantity} выездов` : selectedPeriods.length ? `${selectedPeriods.length} периодов` : 'Период не выбран'}</p>{carriedAmount > 0 && !recipients.length && <p className="payment-carried-amount">Сумма записи — подставится выбранному водителю</p>}</div><div className="spending-actions"><button type="button" onClick={onCancel}>Отмена</button><button className="spending-primary" type="submit" disabled={disabled || isLoading || !!loadError}><Check size={16} />Сохранить выплаты</button></div></footer>
  </form>
  {driversOpen && createPortal(<div className="spending-finance-picker expense-recipient-drawer" style={{ '--expense-frame-top': `${dialog.current?.closest('.spending-expense-dialog')?.getBoundingClientRect().top || 28}px`, '--expense-frame-height': `${dialog.current?.closest('.spending-expense-dialog')?.getBoundingClientRect().height || 800}px`, '--expense-frame-right': `${dialog.current?.closest('.spending-expense-dialog')?.getBoundingClientRect().right || 0}px` } as React.CSSProperties}><DriverPaymentPicker
    unitPriceMode={isExtraTrip}
    drivers={activeDrivers.map(driver => ({ ...driver, transfers: driver.transfers.filter(item => (!school || schoolFor(item) === school) && (!transfer || transfer === 'ALL' || transfer === item.id || transfer === `number:${item.transferNumber}`)) }))}
    allDrivers={drivers} school={school} sessionToken={sessionToken} splitTotal compactCards defaultAmount={carriedAmount ? String(carriedAmount) : ''}
    initial={recipients.map(person => ({ driverId: person.driverId, schoolKey: person.schoolKey, transferId: person.transferId, name: person.name, amount: baseAmounts[person.key] || '', temporary: person.paymentOnly }))}
    salary={!isExtraTrip && type === 'Зарплата водителей'} transferSchool={schoolFor}
    onClose={() => setDriversOpen(false)}
    onConfirm={payments => {
      const payees = payments.map(person => ({ key: `${person.driverId}:${person.transferId}`, driverId: person.driverId, schoolKey: person.schoolKey || (isExtraTrip ? school : ''), transferId: person.transferId, name: person.name, transferNumber: drivers.flatMap(driver => driver.transfers).find(item => item.id === person.transferId)?.transferNumber || 0, paymentOnly: person.temporary }));
      setExtraPayees(payees); setSelected(payees.map(person => person.key)); setBaseAmounts(Object.fromEntries(payees.map((person,index) => [person.key, payments[index].amount]))); setDriversOpen(false); if (!isExtraTrip) setSelectionPanel('period'); else dialog.current?.querySelector<HTMLInputElement>('input[aria-label="Маршрут"]')?.focus();
    }}
  /></div>, document.body)}
  </>;
}
