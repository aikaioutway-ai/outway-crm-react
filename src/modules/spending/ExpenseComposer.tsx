import ExpenseCategorySelect, { CategoryChange } from './ExpenseCategorySelect';
import AllRecordsButton from '../../core/dashboard/AllRecordsButton';
import CompensationFamilyFinance from './CompensationFamilyFinance';
import ExtraTripFields from './ExtraTripFields';
import ExpenseMonths from './ExpenseMonths';
import CompensationChildSearch from './CompensationChildSearch';
import type { FamilySearchHit } from '../../services/crmV2Service';
import PaymentSummary from './PaymentSummary';
import OfficePayrollFields, { OfficePayee } from './OfficePayrollFields';
import { splitPayment } from './paymentAmounts';
import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { OPEX_GROUPS, OPEX_GROUP_LABELS, OPEX_KIND_LABELS, normalizeExpenseClassification } from './expenseClassification';
import React, { useEffect, useRef, useState } from 'react';
import { Check, WalletCards, X, Users, Landmark, Building2, Monitor, Megaphone, Banknote, HeartHandshake, MoreHorizontal, HandCoins, CalendarDays, ReceiptText, KeyRound, Plug, FileText, Brush, Wrench, Wifi, CreditCard, RefreshCcw, Car, Gift, Printer, ShieldCheck, Armchair, Laptop, Refrigerator, Package, Home, Pill, Fuel, ShoppingBasket, Shirt, GraduationCap, PartyPopper, Gamepad2, HeartPulse, Plane } from 'lucide-react';
import { SCHOOL_TABS, isSchoolVisible } from '../families/constants';
import type { SpendingEntry } from './SpendingModule';

const personalIcons: Record<string, typeof WalletCards> = { 'Квартплата': Home, 'Кредит': CreditCard, 'Лекарство': Pill, 'ГСМ': Fuel, 'Продукты': ShoppingBasket, 'Вещи': Shirt, 'Учёба': GraduationCap, 'Мероприятия': PartyPopper, 'Развлечения': Gamepad2, 'Транспорт и такси': Car, 'Связь и интернет': Wifi, 'Коммунальные услуги': Plug, 'Здоровье': HeartPulse, 'Ремонт': Wrench, 'Путешествия': Plane, 'Прочее': MoreHorizontal };

const capexIcons: Record<string, typeof WalletCards> = { 'Мебель': Armchair, 'Компьютеры': Laptop, 'Техника': Refrigerator, 'ТМЗ': Package };

const groupIcons = [Users, Landmark, Building2, Monitor, Megaphone, Banknote, HeartHandshake, MoreHorizontal];

const kindIcons: Record<string, typeof WalletCards> = {
  'Авансы сотрудникам': HandCoins, 'Зарплата офиса': Banknote,
  'Социальный фонд': Landmark, 'Страховые взносы': ShieldCheck, 'Обязательное страхование сотрудников': ShieldCheck,
  'Аренда': KeyRound, 'Коммунальные услуги': Plug, 'Канцтовары': FileText, 'Уборка': Brush, 'Текущий ремонт': Wrench,
  'Подписки': CalendarDays, 'Пополнение баланса': CreditCard, 'Связь': Wifi, 'Интернет': Wifi, 'Программы': Monitor, 'Хостинг': Monitor, 'Обслуживание IT': Wrench,
  'Промоматериалы': FileText, 'Реклама': Megaphone, 'Печать': Printer, 'Акции': Gift, 'Подарки клиентам': Gift,
  'Банковские комиссии': Landmark, 'Эквайринг': CreditCard,
  'Возврат родителю': RefreshCcw, 'Такси вместо водителя': Car, 'Возмещение такси родителю': Car, 'Компенсация за срыв перевозки': HeartHandshake, 'Неустойка': ReceiptText,
};

export default function ExpenseComposer({ entry, subcategories, disabled, onSave, onSavePayroll, onOpenClient, onCancel, onAllRecords, headerActions, categories = [entry.category], onCategoryChange }: {
  headerActions?: React.ReactNode;
  categories?: SpendingEntry['category'][]; onCategoryChange?: CategoryChange;
  onAllRecords?: () => void;
  entry: SpendingEntry; subcategories: string[]; disabled: boolean;
  onOpenClient?: (familyId: string) => Promise<void>;
  onSavePayroll: (rows: SpendingEntry[]) => boolean;
  onSave: (row: SpendingEntry) => boolean; onCancel: () => void;
}) {
  const [selectionPanel, setSelectionPanel] = useState<string | null>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const recipientInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!selectionPanel) return;
    const previous = document.activeElement as HTMLElement | null;
    selectionRef.current?.focus({preventScroll:true});
    if (selectionRef.current) selectionRef.current.scrollTop = 0;
    const outside = (event: PointerEvent) => { if (!selectionRef.current?.contains(event.target as Node)) setSelectionPanel(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setSelectionPanel(null); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); previous?.focus(); };
  }, [selectionPanel]);
  const mainForm = useRef<HTMLFormElement>(null);
  const focusDetails = () => requestAnimationFrame(() => { (mainForm.current?.querySelector<HTMLInputElement>('.payment-composer-details .expense-composer-fields input') || mainForm.current?.querySelector<HTMLInputElement>('.payment-requisites input'))?.focus(); });
  const [draft, setDraft] = useState(() => entry.category === 'Доп. Выезды' && entry.id && entry.unitPrice == null ? { ...entry, unitPrice: entry.amount, quantity: 1 } : entry);
  const [payees, setPayees] = useState<OfficePayee[]>(entry.employeeId ? [{ id: entry.employeeId, name: entry.recipient, departmentKey: entry.departmentKey || '', amount: entry.amount }] : []);
  // Запись без сотрудника (например, перенесённая из другой категории): сумму не теряем.
  const carriedAmount = entry.id && !entry.employeeId && entry.amount > 0 ? entry.amount : 0;
  const [periods, setPeriods] = useState<string[]>(entry.category === 'Revenue Tax' ? (entry.taxPeriods || (entry.taxPeriodKey ? [entry.taxPeriodKey] : [])) : entry.salaryPeriodKey ? [entry.salaryPeriodKey.slice(0, 7)] : []);
  const [group, setGroup] = useState(Object.keys(OPEX_GROUPS).find(key => OPEX_GROUPS[key as keyof typeof OPEX_GROUPS].includes(entry.subcategory)) || Object.keys(OPEX_GROUPS)[0]);
  const kinds = (group === 'ЗП' ? ['Авансы сотрудникам', 'Зарплата офиса'] : OPEX_GROUPS[group as keyof typeof OPEX_GROUPS]).filter(name => entry.sourceRef && !entry.classificationChanged && name === 'Налог' || !['Налог', 'Подбор и обучение сотрудников', 'Административный транспорт', 'Пополнение баланса', 'Программы', 'Хостинг', 'Обслуживание IT', 'Компенсация за срыв перевозки', 'Такси вместо водителя'].includes(name));
  const legacyTax = !!entry.sourceRef && !entry.classificationChanged && !entry.employeeId && group === 'Налоги';
  const isPayroll = entry.category === 'OPEX' && (['Авансы сотрудникам', 'Зарплата офиса'].includes(draft.subcategory) || group === 'Налоги' && !legacyTax);
  const hasMonthlyPeriod = entry.category === 'OPEX' && (['Аренда', 'Коммунальные услуги'].includes(draft.subcategory) || group === 'Банк');
  const isCompensation = entry.category === 'OPEX' && group === 'Компенсации';
  const selectChild = async (row: FamilySearchHit) => { setDraft(current => ({ ...current, familyId: row.familyId, childName: row.childName, schoolKey: row.branchFilter, recipient: row.childName })); setSelectionPanel('Получатель'); };
  const options = subcategories;
  const isOpex = entry.category === 'OPEX';
  const isRevenueTax = entry.category === 'Revenue Tax';
  const isExtraTrip = entry.category === 'Доп. Выезды' || entry.category === 'Logistics';
  const isPersonal = entry.category === 'Личное';
  const isCapex = entry.category === 'CAPEX';
  const [error, setError] = useState('');
  const schools = SCHOOL_TABS.filter(item => item.key !== 'ALL' && isSchoolVisible(item.key));
  const field = (key: keyof SpendingEntry, value: string | number) => {
    if (key === 'subcategory' && value === 'Оплата водителю' && entry.category === 'Logistics' && onCategoryChange) { onCategoryChange(entry.category,{...draft,subcategory:value}); return; }
    setDraft(current => ({ ...current, [key]: value }));
  };
  return <form ref={mainForm} className={`payment-composer payment-composer-inline payment-composer-compact${selectionPanel ? ' has-selection-panel' : ''}`} aria-label={`Новый расход ${entry.category}`} onSubmit={event => {
    event.preventDefault();
    if (isExtraTrip && (!draft.driverId || !draft.schoolKey || !Number.isFinite(draft.unitPrice) || (draft.unitPrice || 0) <= 0 || !Number.isSafeInteger(draft.quantity) || (draft.quantity || 0) < 1)) { setError('Выберите школу, водителя, укажите цену и целое количество больше нуля.'); return; }
    if (isPayroll) {
      if (!payees.length || !periods.length || payees.some(row => !Number.isFinite(row.amount) || Math.round(row.amount * 100) < periods.length)) { setError('Выберите сотрудников, периоды и укажите сумму каждому.'); return; }
      if (!onSavePayroll(payees.flatMap((person, personIndex) => splitPayment(person.amount, periods.length).map((amount, index) => ({ ...draft, id: entry.id && personIndex === 0 && index === 0 ? entry.id : crypto.randomUUID(), employeeId: person.id, recipient: person.name, departmentKey: person.departmentKey, salaryPeriodKey: periods[index], amount, description: `${OPEX_KIND_LABELS[draft.subcategory] || draft.subcategory} — ${person.name}` }))))) setError('Не удалось сохранить выплаты.'); return;
    }
    if (hasMonthlyPeriod) {
      if (!periods.length || !Number.isFinite(draft.amount) || Math.round(draft.amount * 100) < periods.length) { setError('Выберите период и укажите сумму.'); return; }
      if (!onSavePayroll(splitPayment(draft.amount, periods.length).map((amount, index) => ({ ...normalizeExpenseClassification(draft), employeeId: undefined, departmentKey: undefined, id: entry.id && index === 0 ? entry.id : crypto.randomUUID(), salaryPeriodKey: periods[index], amount, description: draft.subcategory })))) setError('Не удалось сохранить расход.'); return;
    }
    if (isRevenueTax && !periods.length) { setError('Выберите налоговый период.'); return; }
    if (isCompensation && !draft.familyId) { setError('Выберите ребёнка.'); return; }
    if ((!isCompensation && !draft.description.trim()) || !Number.isFinite(draft.amount) || draft.amount <= 0 || !draft.date || !subcategories.includes(draft.subcategory)) { setError('Укажите назначение, дату и сумму больше нуля.'); return; }
    if (!onSave({ ...normalizeExpenseClassification(draft), employeeId: undefined, salaryPeriodKey: undefined, departmentKey: undefined, ...(isCapex || isPersonal ? { schoolKey: undefined } : {}), ...(isRevenueTax ? { schoolKey: undefined, recipient: '', taxPeriodKey: undefined, taxPeriods: periods } : {}), id: draft.id || crypto.randomUUID(), description: isCompensation ? `${OPEX_KIND_LABELS[draft.subcategory] || draft.subcategory} — ${draft.childName || draft.recipient}` : draft.description.trim() })) setError('Не удалось сохранить расход.');
  }}>
    <header className="payment-composer-head"><div className="payment-composer-title"><span className="payment-composer-icon"><WalletCards size={22} /></span><div><span className="payment-composer-kicker">{entry.category}</span><h2>{entry.id ? 'Редактирование расхода' : 'Новый расход'}</h2></div></div>{headerActions || <div className="spending-actions">{onAllRecords && <AllRecordsButton label="Все записи" onClick={onAllRecords} />}<button type="button" className="payment-close" aria-label="Закрыть форму расхода" onClick={onCancel}><X size={20} /></button></div>}</header>
    <div className="payment-composer-body"><div className={`payment-composer-main expense-selection-panel expense-general-selection${selectionPanel ? ' is-open' : ''}`} ref={selectionRef} tabIndex={-1} data-selection={selectionPanel || ''} role={selectionPanel ? 'dialog' : undefined} aria-label="Параметры расхода"><div className="expense-selection-heading"><h3>{selectionPanel}</h3><button type="button" aria-label="Закрыть панель выбора" onClick={() => setSelectionPanel(null)}><X size={18}/></button></div>
      {!isOpex && !isExtraTrip && <section className="payment-section expense-selection-category"><div className="payment-section-heading"><div><h3>{entry.category}</h3><p>Категория расхода</p></div></div>
        {isPersonal ? null : isRevenueTax ? <div className="spending-school-strip expense-group-strip" role="group" aria-label="Категория налога"><button type="button" aria-pressed={true} onClick={() => setSelectionPanel('За период')}><span className="spending-school-logo"><Landmark size={23} aria-hidden="true" /></span><span>Налоги</span></button></div> : isCapex ? null : options.length === 1 ? <div className="expense-fixed-subcategory">{options[0]}</div> : <div className="expense-subcategory-options" role="group" aria-label="Подкатегория">{options.map(name => <button type="button" key={name} aria-pressed={draft.subcategory === name} onClick={() => { field('subcategory', name); setSelectionPanel(null); focusDetails(); }}>{name}</button>)}</div>}
      </section>}
      {isOpex && <section className="payment-section expense-selection-category"><h3>Категория расхода</h3><div className="spending-school-strip expense-group-strip" role="group" aria-label="Статья OPEX">{Object.entries(OPEX_GROUPS).map(([name, items], index) => { const Icon = groupIcons[index]; return <button type="button" key={name} aria-pressed={group === name} onClick={() => { setGroup(name); field('subcategory', name === 'Прочее' ? 'Прочие операционные расходы' : items[0]); setSelectionPanel('Вид расхода'); }}><span className="spending-school-logo"><Icon size={23} aria-hidden="true" /></span><span>{OPEX_GROUP_LABELS[name] || name}</span></button>; })}</div><div className="expense-kind-picker"><h3>Вид расхода</h3><div className="spending-school-strip expense-kind-strip" role="group" aria-label="Вид расхода">{kinds.map(name => { const Icon = kindIcons[name] || groupIcons[Object.keys(OPEX_GROUPS).indexOf(group)]; return <button type="button" key={name} aria-pressed={draft.subcategory === name} onClick={() => { field('subcategory', name); if (['Авансы сотрудникам','Зарплата офиса'].includes(name) || group === 'Налоги') setSelectionPanel('Отдел'); else if (['Аренда','Коммунальные услуги'].includes(name) || group === 'Банк') setSelectionPanel('За период'); else if (group === 'Компенсации') setSelectionPanel('Получатель'); else { setSelectionPanel(null); focusDetails(); } }}><span className="spending-school-logo"><Icon size={22} aria-hidden="true" /></span><span>{OPEX_KIND_LABELS[name] || name}</span></button>; })}</div>{isCompensation && <><CompensationChildSearch onSelect={selectChild} />{draft.familyId && <div className="compensation-selected-child"><span>Выбранный ребёнок</span><button type="button" disabled={!onOpenClient} onClick={async () => { setError(''); try { await onOpenClient?.(draft.familyId!); } catch { setError('Не удалось открыть карточку клиента.'); } }}>{draft.childName || draft.recipient}<span aria-hidden="true"> ↗</span></button><small>{schools.find(school => school.key === draft.schoolKey)?.label || draft.schoolKey}</small><button type="button" className="compensation-clear-child" aria-label="Убрать выбранного ребёнка" onClick={() => { setDraft(current => ({ ...current, familyId: undefined, childName: undefined, schoolKey: undefined, recipient: '' })); setError(''); }}><X size={16} aria-hidden="true" /></button></div>}{draft.familyId && <CompensationFamilyFinance familyId={draft.familyId} isNew={!entry.id} onOpenFamily={onOpenClient ? () => { setError(''); onOpenClient(draft.familyId!).catch(() => setError('Не удалось открыть карточку клиента.')); } : undefined} walletChange={draft.subcategory !== 'Возврат родителю' || !Number.isFinite(draft.amount) ? undefined : !entry.id ? draft.amount : entry.refundId ? draft.amount - entry.amount : undefined} />}</>}</div></section>}
      {isPayroll && <section className="payment-section expense-selection-payroll"><OfficePayrollFields carriedAmount={carriedAmount} onComplete={() => setSelectionPanel('За период')} mode={selectionPanel === 'Отдел' ? 'department' : selectionPanel === 'За период' ? 'period' : selectionPanel === 'Получатель' ? 'recipient' : 'department'} date={draft.date} departmentKey={draft.departmentKey} onDepartment={key => { field('departmentKey', key); setSelectionPanel('Получатель'); }} payees={payees} onPayees={setPayees} periods={periods} onPeriods={setPeriods} /></section>}
      {!isOpex && !isRevenueTax && !isCapex && !isPersonal && <section className="payment-section expense-selection-school"><h3>К какой школе относится расход</h3><div className="spending-school-strip">{!isExtraTrip && <button type="button" aria-pressed={!draft.schoolKey} onClick={() => { field('schoolKey', ''); setSelectionPanel(null); focusDetails(); }}><span className="spending-school-logo"><WalletCards size={22} /></span><span>Общие расходы</span></button>}{schools.map(school => <button key={school.key} type="button" aria-pressed={draft.schoolKey === school.key} onClick={() => { field('schoolKey', school.key); setSelectionPanel(null); focusDetails(); }}><span className="spending-school-logo">{school.logo ? <img src={school.logo} alt="" /> : school.label.slice(0,2)}</span><span>{school.label}</span></button>)}</div></section>}
      {(hasMonthlyPeriod || isRevenueTax) && <section className="payment-section expense-selection-months"><ExpenseMonths date={draft.date} periods={periods} onPeriods={setPeriods} /></section>}
      {isExtraTrip && <section className="payment-section expense-selection-trip"><ExtraTripFields draft={draft} onChange={patch => setDraft(current => ({ ...current, ...patch }))} /></section>}

    {selectionPanel && <button type="button" className="spending-primary expense-selection-done" onClick={() => { setSelectionPanel(null); focusDetails(); }}>Готово</button>}</div><aside className="payment-composer-details"><h3>Сводка расхода</h3><ExpenseCategorySelect entry={{...draft,taxPeriods:isRevenueTax ? periods : draft.taxPeriods,salaryPeriodKey:!isRevenueTax ? periods[0] || draft.salaryPeriodKey : draft.salaryPeriodKey,amount:isPayroll && payees.length ? payees.reduce((sum,row)=>sum+row.amount,0) : draft.amount}} categories={categories} onChange={onCategoryChange} disabled={disabled} />{(isCapex || isPersonal) && <div className={`spending-school-strip expense-group-strip capex-inline-categories${isPersonal ? ' personal-inline-categories' : ''}`} role="group" aria-label={isPersonal ? 'Категории личных расходов' : 'Категории CAPEX'}>{options.map(name => { const Icon = isPersonal ? personalIcons[name] || MoreHorizontal : capexIcons[name] || Package; return <button type="button" key={name} aria-pressed={draft.subcategory === name} onClick={() => { field('subcategory', name); focusDetails(); }}><span className="spending-school-logo"><Icon size={28} aria-hidden="true" /></span><span>{name}</span></button>; })}</div>}<PaymentSummary onSelect={label => { if (label === 'Получатель' && !isPayroll && !isCompensation) { recipientInput.current?.focus(); return; } setSelectionPanel(label); }}>{!isCapex && !isPersonal && <><dt>{isOpex || isRevenueTax ? 'Категория' : 'Подкатегория'}</dt><dd>{isRevenueTax ? 'Налоги' : isOpex ? OPEX_GROUP_LABELS[group] || group : draft.subcategory}</dd></>}{isOpex && <><dt>Вид расхода</dt><dd>{OPEX_KIND_LABELS[draft.subcategory] || draft.subcategory}</dd></>}{!isOpex && !isRevenueTax && !isCapex && !isPersonal && <><dt>Школа</dt><dd>{schools.find(school => school.key === draft.schoolKey)?.label || 'Общие расходы'}</dd></>}{isPayroll && <><dt>Отдел</dt><dd>{draft.departmentKey === 'ALL' ? 'Все отделы' : EMPLOYEE_DEPARTMENTS.find(item => item.key === draft.departmentKey)?.label || 'Отдел'}</dd></>}{!isRevenueTax && !isCapex && !isPersonal && <><dt>Получатель</dt><dd>{isPayroll ? payees.length <= 1 ? (payees[0]?.name || 'Получатели') : <details className="payment-recipient-details"><summary>{`${payees[0].name} +${payees.length - 1}`}</summary>{payees.map(person => <div key={person.id}><span>{person.name}</span><strong>{person.amount.toLocaleString('ru-RU')} сом</strong></div>)}</details> : draft.recipient || 'Получатель'}</dd></>}{isExtraTrip && <><dt>Маршрут и сумма</dt><dd>{draft.description || 'Укажите маршрут и сумму'}</dd></>}{(isPayroll || hasMonthlyPeriod || isRevenueTax) && <><dt>За период</dt><dd>{periods.length ? periods.map(month => new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))).join(', ') : 'За период'}</dd></>}</PaymentSummary>
            {!isPayroll && !isExtraTrip && <section className="payment-section expense-composer-fields">{!hasMonthlyPeriod && !isCompensation && <label>{isRevenueTax ? 'Назначение платежа' : isOpex ? 'За что' : 'Назначение'}<input required maxLength={500} placeholder={isRevenueTax ? "Налог с выручки" : "За что оплачиваем"} value={draft.description} onChange={event => field('description', event.target.value)} /></label>}{!isOpex && !isRevenueTax && <label>Получатель<input ref={recipientInput} required={isRevenueTax} maxLength={200} placeholder={isRevenueTax ? "Налоговый орган / получатель платежа" : "Получатель или поставщик"} value={draft.recipient} onChange={event => field('recipient', event.target.value)} /></label>}<label>{isRevenueTax ? 'Сумма налога, сом' : 'Сумма, сом'}<input required type="number" min="0.01" step="0.01" placeholder="0" value={draft.amount || ''} onChange={event => field('amount', Number(event.target.value))} /></label></section>}
<section className="payment-section payment-requisites"><h3>Реквизиты выплаты</h3><label>Дата<input required type="date" value={draft.date} onChange={event => field('date', event.target.value)} /></label><label>Способ оплаты<select value={draft.method} onChange={event => field('method', event.target.value)}><option>Безналичные</option><option>Наличные</option></select></label><label>Платёжное поручение<input maxLength={100} value={draft.paymentOrderNumber || ''} onChange={event => field('paymentOrderNumber', event.target.value)} /></label><label>Комментарий<textarea rows={3} maxLength={2000} placeholder="Необязательно" value={draft.comment || ''} onChange={event => field('comment', event.target.value)} /></label></section>
    </aside></div>{error && <p role="alert" className="spending-error">{error}</p>}
    <footer className="payment-composer-footer"><div className="payment-footer-total"><span>Итого к выплате</span>{isPayroll && !payees.some(row => row.amount > 0) && carriedAmount > 0 ? <><strong className="payment-carried" title="Сумма записи — подставится выбранному сотруднику">{carriedAmount.toLocaleString('ru-RU')} <small>сом</small></strong><p className="payment-carried-amount">Сумма записи — подставится выбранному сотруднику</p></> : <strong>{(isPayroll ? payees.reduce((sum,row) => sum + row.amount,0) : draft.amount).toLocaleString('ru-RU')} <small>сом</small></strong>}</div><div className="spending-actions"><button type="button" onClick={onCancel}>Отмена</button><button type="submit" className="spending-primary" disabled={disabled}><Check size={16} />Сохранить</button></div></footer>
  </form>;
}
