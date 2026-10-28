import ExpenseMonths from './ExpenseMonths';
import CompensationChildSearch from './CompensationChildSearch';
import type { FamilySearchHit } from '../../services/crmV2Service';
import PaymentSummary from './PaymentSummary';
import OfficePayrollFields, { OfficePayee } from './OfficePayrollFields';
import { splitPayment } from './paymentAmounts';
import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { OPEX_GROUPS, OPEX_KIND_LABELS, normalizeExpenseClassification } from './expenseClassification';
import React, { useState } from 'react';
import { Check, WalletCards, X, Users, Landmark, Building2, Monitor, Megaphone, Banknote, HeartHandshake, MoreHorizontal, HandCoins, CalendarDays, ReceiptText, KeyRound, Plug, FileText, Brush, Wrench, Wifi, CreditCard, RefreshCcw, Car, Gift, Printer, ShieldCheck } from 'lucide-react';
import { SCHOOL_TABS, isSchoolVisible } from '../families/constants';
import type { SpendingEntry } from './SpendingModule';

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

export default function ExpenseComposer({ entry, subcategories, disabled, onSave, onSavePayroll, onOpenClient, onCancel }: {
  entry: SpendingEntry; subcategories: string[]; disabled: boolean;
  onOpenClient?: (familyId: string) => Promise<void>;
  onSavePayroll: (rows: SpendingEntry[]) => boolean;
  onSave: (row: SpendingEntry) => boolean; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(entry);
  const [payees, setPayees] = useState<OfficePayee[]>(entry.employeeId ? [{ id: entry.employeeId, name: entry.recipient, departmentKey: entry.departmentKey || '', amount: entry.amount }] : []);
  const [periods, setPeriods] = useState<string[]>(entry.salaryPeriodKey ? [entry.salaryPeriodKey.slice(0, 7)] : []);
  const [group, setGroup] = useState(Object.keys(OPEX_GROUPS).find(key => OPEX_GROUPS[key as keyof typeof OPEX_GROUPS].includes(entry.subcategory)) || Object.keys(OPEX_GROUPS)[0]);
  const kinds = (group === 'ЗП' ? ['Авансы сотрудникам', 'Зарплата офиса'] : OPEX_GROUPS[group as keyof typeof OPEX_GROUPS]).filter(name => !['Подбор и обучение сотрудников', 'Административный транспорт', 'Пополнение баланса', 'Программы', 'Хостинг', 'Обслуживание IT', 'Компенсация за срыв перевозки', 'Такси вместо водителя'].includes(name));
  const isPayroll = entry.category === 'OPEX' && (['Авансы сотрудникам', 'Зарплата офиса'].includes(draft.subcategory) || group === 'Налоги');
  const hasMonthlyPeriod = entry.category === 'OPEX' && (['Аренда', 'Коммунальные услуги'].includes(draft.subcategory) || group === 'Банк');
  const isCompensation = entry.category === 'OPEX' && group === 'Компенсации';
  const selectChild = async (row: FamilySearchHit) => { if (!onOpenClient) throw new Error('Карточка недоступна'); await onOpenClient(row.familyId); setDraft(current => ({ ...current, familyId: row.familyId, childName: row.childName, schoolKey: row.branchFilter, recipient: row.childName })); };
  const options = subcategories;
  const isOpex = entry.category === 'OPEX';
  const [error, setError] = useState('');
  const schools = SCHOOL_TABS.filter(item => item.key !== 'ALL' && isSchoolVisible(item.key));
  const field = (key: keyof SpendingEntry, value: string | number) => setDraft(current => ({ ...current, [key]: value }));
  return <form className="payment-composer payment-composer-inline" aria-label={`Новый расход ${entry.category}`} onSubmit={event => {
    event.preventDefault();
    if (isPayroll) {
      if (!payees.length || !periods.length || payees.some(row => !Number.isFinite(row.amount) || Math.round(row.amount * 100) < periods.length)) { setError('Выберите сотрудников, периоды и укажите сумму каждому.'); return; }
      if (!onSavePayroll(payees.flatMap((person, personIndex) => splitPayment(person.amount, periods.length).map((amount, index) => ({ ...draft, id: entry.id && personIndex === 0 && index === 0 ? entry.id : crypto.randomUUID(), employeeId: person.id, recipient: person.name, departmentKey: person.departmentKey, salaryPeriodKey: periods[index], amount, description: `${OPEX_KIND_LABELS[draft.subcategory] || draft.subcategory} — ${person.name}` }))))) setError('Не удалось сохранить выплаты.'); return;
    }
    if (hasMonthlyPeriod) {
      if (!periods.length || !Number.isFinite(draft.amount) || Math.round(draft.amount * 100) < periods.length) { setError('Выберите период и укажите сумму.'); return; }
      if (!onSavePayroll(splitPayment(draft.amount, periods.length).map((amount, index) => ({ ...normalizeExpenseClassification(draft), employeeId: undefined, departmentKey: undefined, id: entry.id && index === 0 ? entry.id : crypto.randomUUID(), salaryPeriodKey: periods[index], amount, description: draft.subcategory })))) setError('Не удалось сохранить расход.'); return;
    }
    if (isCompensation && !draft.familyId) { setError('Выберите ребёнка.'); return; }
    if (!draft.description.trim() || !Number.isFinite(draft.amount) || draft.amount <= 0 || !draft.date || !subcategories.includes(draft.subcategory)) { setError('Укажите назначение, дату и сумму больше нуля.'); return; }
    if (!onSave({ ...normalizeExpenseClassification(draft), employeeId: undefined, salaryPeriodKey: undefined, departmentKey: undefined, id: draft.id || crypto.randomUUID(), description: draft.description.trim() })) setError('Не удалось сохранить расход.');
  }}>
    <header className="payment-composer-head"><div className="payment-composer-title"><span className="payment-composer-icon"><WalletCards size={22} /></span><div><span className="payment-composer-kicker">{entry.category}</span><h2>{entry.id ? 'Редактирование расхода' : 'Новый расход'}</h2></div></div><button type="button" className="payment-close" aria-label="Закрыть форму расхода" onClick={onCancel}><X size={20} /></button></header>
    <div className="payment-composer-body"><div className={`payment-composer-main${isPayroll || hasMonthlyPeriod ? ' office-payroll-main' : ''}`}>
      {!isOpex && <section className="payment-section"><div className="payment-section-heading"><div><h3>{entry.category}</h3><p>Категория расхода</p></div></div>
        {options.length === 1 ? <div className="expense-fixed-subcategory">{options[0]}</div> : <div className="expense-subcategory-options" role="group" aria-label="Подкатегория">{options.map(name => <button type="button" key={name} aria-pressed={draft.subcategory === name} onClick={() => field('subcategory', name)}>{name}</button>)}</div>}
      </section>}
      {isOpex && <section className="payment-section"><h3>Категория расхода</h3><div className="spending-school-strip expense-group-strip" role="group" aria-label="Статья OPEX">{Object.entries(OPEX_GROUPS).map(([name, items], index) => { const Icon = groupIcons[index]; return <button type="button" key={name} aria-pressed={group === name} onClick={() => { setGroup(name); field('subcategory', name === 'Прочее' ? 'Прочие операционные расходы' : items[0]); }}><span className="spending-school-logo"><Icon size={23} aria-hidden="true" /></span><span>{name}</span></button>; })}</div><div className="expense-kind-picker"><h3>Вид расхода</h3><div className="spending-school-strip expense-kind-strip" role="group" aria-label="Вид расхода">{kinds.map(name => { const Icon = kindIcons[name] || groupIcons[Object.keys(OPEX_GROUPS).indexOf(group)]; return <button type="button" key={name} aria-pressed={draft.subcategory === name} onClick={() => field('subcategory', name)}><span className="spending-school-logo"><Icon size={22} aria-hidden="true" /></span><span>{OPEX_KIND_LABELS[name] || name}</span></button>; })}</div>{isCompensation && <CompensationChildSearch onSelect={selectChild} />}</div></section>}
      {isPayroll && <OfficePayrollFields date={draft.date} departmentKey={draft.departmentKey} onDepartment={key => field('departmentKey', key)} payees={payees} onPayees={setPayees} periods={periods} onPeriods={setPeriods} />}
      {!isOpex && <section className="payment-section"><h3>К какой школе относится расход</h3><div className="spending-school-strip"><button type="button" aria-pressed={!draft.schoolKey} onClick={() => field('schoolKey', '')}><span className="spending-school-logo"><WalletCards size={22} /></span><span>Общие расходы</span></button>{schools.map(school => <button key={school.key} type="button" aria-pressed={draft.schoolKey === school.key} onClick={() => field('schoolKey', school.key)}><span className="spending-school-logo">{school.logo ? <img src={school.logo} alt="" /> : school.label.slice(0,2)}</span><span>{school.label}</span></button>)}</div></section>}
      {hasMonthlyPeriod && <ExpenseMonths date={draft.date} periods={periods} onPeriods={setPeriods} />}
      {!isPayroll && <section className="payment-section expense-composer-fields">{!hasMonthlyPeriod && <label>{isOpex ? 'За что' : 'Назначение'}<input required maxLength={500} placeholder="За что оплачиваем" value={draft.description} onChange={event => field('description', event.target.value)} /></label>}{!isOpex && <label>Получатель<input maxLength={200} placeholder="Получатель или поставщик" value={draft.recipient} onChange={event => field('recipient', event.target.value)} /></label>}<label>Сумма, сом<input required type="number" min="0.01" step="0.01" placeholder="0" value={draft.amount || ''} onChange={event => field('amount', Number(event.target.value))} /></label></section>}
    </div><aside className="payment-composer-details"><h3>Сводка расхода</h3><p className="payment-summary-kind">{entry.category}</p><PaymentSummary><dt>{isOpex ? 'Категория' : 'Подкатегория'}</dt><dd>{isOpex ? group : draft.subcategory}</dd>{isOpex && <><dt>Вид расхода</dt><dd>{OPEX_KIND_LABELS[draft.subcategory] || draft.subcategory}</dd></>}{!isOpex && <><dt>Школа</dt><dd>{schools.find(school => school.key === draft.schoolKey)?.label || 'Общие расходы'}</dd></>}{isPayroll && <><dt>Отдел</dt><dd>{draft.departmentKey === 'ALL' ? 'Все отделы' : EMPLOYEE_DEPARTMENTS.find(item => item.key === draft.departmentKey)?.label || 'Отдел'}</dd></>}<dt>Получатель</dt><dd>{isPayroll ? payees.length <= 1 ? (payees[0]?.name || 'Получатели') : <details className="payment-recipient-details"><summary>{`${payees[0].name} +${payees.length - 1}`}</summary>{payees.map(person => <div key={person.id}><span>{person.name}</span><strong>{person.amount.toLocaleString('ru-RU')} сом</strong></div>)}</details> : draft.recipient || 'Получатель'}</dd>{(isPayroll || hasMonthlyPeriod) && <><dt>За период</dt><dd>{periods.length ? periods.map(month => new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))).join(', ') : 'За период'}</dd></>}</PaymentSummary>
      <section className="payment-section payment-requisites"><h3>Реквизиты выплаты</h3><label>Дата<input required type="date" value={draft.date} onChange={event => field('date', event.target.value)} /></label><label>Способ оплаты<select value={draft.method} onChange={event => field('method', event.target.value)}><option>Безналичные</option><option>Наличные</option></select></label><label>Платёжное поручение<input maxLength={100} value={draft.paymentOrderNumber || ''} onChange={event => field('paymentOrderNumber', event.target.value)} /></label><label>Комментарий<textarea rows={3} maxLength={2000} value={draft.comment || ''} onChange={event => field('comment', event.target.value)} /></label></section>
    </aside></div>{error && <p role="alert" className="spending-error">{error}</p>}
    <footer className="payment-composer-footer"><div className="payment-footer-total"><span>Итого к выплате</span><strong>{(isPayroll ? payees.reduce((sum,row) => sum + row.amount,0) : draft.amount).toLocaleString('ru-RU')} <small>сом</small></strong></div><div className="spending-actions"><button type="button" onClick={onCancel}>Отмена</button><button type="submit" className="spending-primary" disabled={disabled}><Check size={16} />Сохранить</button></div></footer>
  </form>;
}
