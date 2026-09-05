import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Bus,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Fuel,
  Percent,
  Plus,
  ReceiptText,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { B2B_PAYMENT_METHODS, B2BPaymentMethod, calculateB2BExpenseTax, formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { createB2BExpense, type B2BExpenseRecord } from '../../services/b2bDataService';
import { B2B_QUERY_KEYS, useB2BExpenses, useB2BOrders } from '../../hooks/useB2BData';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import { queryClient } from '../../services/queryClient';

const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} сом`;
const displayDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || '—';
};

type CategoryMeta = {
  label: string;
  color: string;
  soft: string;
  icon: typeof ReceiptText;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  driver_payments: { label: 'Водители', color: '#477279', soft: '#e7f2f4', icon: Bus },
  taxes: { label: 'Налоги', color: '#a66e12', soft: '#fff4d8', icon: Percent },
  fuel: { label: 'Топливо', color: '#b26c28', soft: '#fff0e2', icon: Fuel },
  rent: { label: 'Аренда', color: '#596bb3', soft: '#eef0ff', icon: Building2 },
  maintenance: { label: 'Ремонт и обслуживание', color: '#8b5b96', soft: '#f7ebfa', icon: Wrench },
  marketing: { label: 'Маркетинг', color: '#b45f7a', soft: '#fff0f5', icon: ReceiptText },
  salary: { label: 'Зарплата', color: '#307c62', soft: '#eaf7f1', icon: CircleDollarSign },
  other: { label: 'Прочие расходы', color: '#69758b', soft: '#eef2f5', icon: ReceiptText },
};

const CATEGORY_ORDER = ['driver_payments', 'taxes', 'salary', 'fuel', 'rent', 'maintenance', 'marketing', 'other'];

function categoryMeta(key: string): CategoryMeta {
  return CATEGORY_META[key.toLocaleLowerCase('ru-RU')] ?? {
    label: key.replaceAll('_', ' ').replace(/^./, letter => letter.toLocaleUpperCase('ru-RU')),
    color: '#69758b',
    soft: '#eef2f5',
    icon: ReceiptText,
  };
}

function periodContains(date: string, periodKey: string, year: number) {
  const match = date.match(/^(\d{4})-(\d{2})/);
  return Boolean(match && Number(match[1]) === year && (periodKey === 'ALL' || Number(match[2]) === Number(periodKey)));
}

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const FORM_CATEGORIES = ['driver_payments', 'taxes', 'salary', 'fuel', 'rent', 'maintenance', 'marketing', 'other'];
const CURRENT_YEAR = new Date().getFullYear();

const emptyExpenseForm = () => ({
  expenseDate: new Date().toISOString().slice(0, 10),
  category: 'other',
  amount: '',
  method: 'cash' as B2BPaymentMethod,
  purpose: '',
  orderId: '',
  comment: '',
});

interface B2BExpensesProps {
  onOpenOrder?: (orderId: string) => void;
}

export default function B2BExpenses({ onOpenOrder }: B2BExpensesProps) {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [periodKey, setPeriodKey] = useState(String(new Date().getMonth() + 1));
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyExpenseForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { data: expenses = [], isLoading } = useB2BExpenses();
  const { data: orders = [] } = useB2BOrders();

  const calendarPeriods = useMemo(() => MONTH_NAMES.map((label, index) => ({
    key: String(index + 1), month: index + 1, year: selectedYear, label: `${label} ${selectedYear}`,
  })), [selectedYear]);

  const availableYears = useMemo(() => {
    const years = expenses.map(row => Number(row.expenseDate.slice(0, 4))).filter(Number.isFinite);
    const min = Math.min(CURRENT_YEAR - 2, selectedYear, ...years);
    const max = Math.max(CURRENT_YEAR + 2, selectedYear, ...years);
    return Array.from({ length: max - min + 1 }, (_, index) => max - index);
  }, [expenses, selectedYear]);

  const periodRows = useMemo(
    () => expenses.filter(row => periodContains(row.expenseDate, periodKey, selectedYear)),
    [expenses, periodKey, selectedYear],
  );

  const categories = useMemo(() => {
    const keys = Array.from(new Set([...FORM_CATEGORIES, ...expenses.map(row => row.category || 'other')]));
    return keys.sort((left, right) => {
      const leftIndex = CATEGORY_ORDER.indexOf(left.toLocaleLowerCase('ru-RU'));
      const rightIndex = CATEGORY_ORDER.indexOf(right.toLocaleLowerCase('ru-RU'));
      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? CATEGORY_ORDER.length : leftIndex) - (rightIndex === -1 ? CATEGORY_ORDER.length : rightIndex);
      }
      return categoryMeta(left).label.localeCompare(categoryMeta(right).label, 'ru');
    });
  }, [expenses]);

  const categoryTotals = useMemo(() => {
    const result: Record<string, { amount: number; tax: number; net: number; count: number }> = {};
    periodRows.forEach(row => {
      const key = row.category || 'other';
      const current = result[key] ?? { amount: 0, tax: 0, net: 0, count: 0 };
      current.amount += row.amount;
      current.tax += row.taxAmount;
      current.net += row.netAmount;
      current.count += 1;
      result[key] = current;
    });
    return result;
  }, [periodRows]);

  const totals = useMemo(() => periodRows.reduce((result, row) => ({
    gross: result.gross + row.amount,
    tax: result.tax + row.taxAmount,
    net: result.net + row.netAmount,
  }), { gross: 0, tax: 0, net: 0 }), [periodRows]);

  const rows = useMemo(() => periodRows.filter(row => {
    if (selectedCategory && (row.category || 'other') !== selectedCategory) return false;
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return !query || [row.orderNumber, categoryMeta(row.category || 'other').label, row.category, row.purpose, row.comment, formatB2BPaymentMethod(row.method)]
      .some(value => value.toLocaleLowerCase('ru-RU').includes(query));
  }), [periodRows, search, selectedCategory]);

  useEffect(() => {
    if (selectedCategory && !categories.includes(selectedCategory)) setSelectedCategory(null);
  }, [categories, selectedCategory]);

  const selectedLabel = selectedCategory ? categoryMeta(selectedCategory).label : null;
  const periodLabel = periodKey === 'ALL'
    ? `Весь ${selectedYear} год`
    : calendarPeriods.find(period => period.key === periodKey)?.label ?? 'Выбранный период';

  const taxPreview = calculateB2BExpenseTax(Number(form.amount), form.method);

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.expenseDate || !form.category || !form.purpose.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError('Заполните дату, категорию, назначение и сумму больше нуля.');
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      await createB2BExpense({ ...form, amount, purpose: form.purpose.trim(), comment: form.comment.trim() });
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.expenses });
      const expenseDate = new Date(`${form.expenseDate}T00:00:00`);
      setSelectedYear(expenseDate.getFullYear());
      setPeriodKey(String(expenseDate.getMonth() + 1));
      setForm(emptyExpenseForm());
      setShowCreate(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить расход.');
    } finally {
      setIsSaving(false);
    }
  };

  const openOrder = (row: B2BExpenseRecord) => {
    if (!onOpenOrder || row.orderNumber === '—') return;
    const order = orders.find(item => item.number === row.orderNumber);
    if (order) onOpenOrder(order.id);
  };

  return (
    <section className="b2b-expenses">
      <div className="b2b-expenses-overview">
        <div className="b2b-expenses-toolbar">
          <div>
            {selectedCategory && <button type="button" className="b2b-expenses-back" onClick={() => setSelectedCategory(null)}>← Главная расходов</button>}
            <h2>{selectedLabel ?? 'Дашборд расходов B2B'}</h2>
            <p>Расходы нерегулярных перевозок · {periodLabel}</p>
          </div>
          <div className="b2b-expenses-period-controls">
            <div className="b2b-expenses-year-picker">
              <button type="button" onClick={() => setSelectedYear(year => year - 1)} aria-label="Предыдущий год"><ChevronLeft size={17} /></button>
              <select value={selectedYear} onChange={event => setSelectedYear(Number(event.target.value))} aria-label="Год">
                {availableYears.map(year => <option key={year} value={year}>{year} год</option>)}
              </select>
              <button type="button" onClick={() => setSelectedYear(year => year + 1)} aria-label="Следующий год"><ChevronRight size={17} /></button>
            </div>
            <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} periods={calendarPeriods} />
          </div>
        </div>

        {!selectedCategory ? (
          <div className="b2b-expense-category-grid">
            <article className="b2b-expense-category-card total">
              <span className="b2b-expense-category-icon"><CircleDollarSign size={20} /></span>
              <span className="b2b-expense-category-name">Всего за период</span>
              <strong>{money(totals.gross)}</strong>
              <small>{periodRows.length} {periodRows.length === 1 ? 'операция' : 'операций'}</small>
            </article>
            {categories.map(key => {
              const meta = categoryMeta(key);
              const Icon = meta.icon;
              const categoryTotal = categoryTotals[key] ?? { amount: 0, tax: 0, net: 0, count: 0 };
              return (
                <button key={key} type="button" className="b2b-expense-category-card" onClick={() => setSelectedCategory(key)}>
                  <span className="b2b-expense-category-icon" style={{ background: meta.soft, color: meta.color }}><Icon size={20} /></span>
                  <span className="b2b-expense-category-name">{meta.label}</span>
                  <strong>{money(categoryTotal.amount)}</strong>
                  <small>{categoryTotal.count} записей · открыть →</small>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="b2b-expenses-summary">
            <article><span>Начислено</span><strong>{money(categoryTotals[selectedCategory]?.amount ?? 0)}</strong></article>
            <article className="tax"><span>Удержано налога</span><strong>{money(categoryTotals[selectedCategory]?.tax ?? 0)}</strong></article>
            <article className="net"><span>К перечислению</span><strong>{money(categoryTotals[selectedCategory]?.net ?? 0)}</strong></article>
          </div>
        )}

        <div className="b2b-expenses-tax-note"><Percent size={18} /><div><strong>Налог удерживается автоматически</strong><span>Для способа «Безнал — юрлицо» система удерживает 4% из начисленной суммы и показывает сумму к перечислению.</span></div></div>
      </div>

      <div className="b2b-expenses-panel">
        <div className="b2b-expenses-panel-head">
          <div><strong>{selectedLabel ? `Расходы: ${selectedLabel}` : 'Все расходы за период'}</strong><span>{rows.length} записей</span></div>
          <div className="b2b-expenses-panel-actions">
            <label className="b2b-expenses-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Заказ, категория, назначение, оплата..." /></label>
            <button type="button" className="b2b-primary-button" onClick={() => { setFormError(''); setShowCreate(true); }}><Plus size={16} />Новый расход</button>
          </div>
        </div>
        <div className="b2b-expenses-table-wrap"><table className="b2b-expenses-table"><thead><tr><th>Дата</th><th>Заказ</th><th>Категория</th><th>Назначение</th><th>Способ оплаты</th><th className="number">Начислено</th><th className="number">Налог 4%</th><th className="number">К перечислению</th><th>Комментарий</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={9} className="empty">Загрузка…</td></tr> : rows.length ? rows.map(row => {
          const meta = categoryMeta(row.category || 'other');
          const Icon = meta.icon;
          const canOpenOrder = Boolean(onOpenOrder && row.orderNumber !== '—' && orders.some(order => order.number === row.orderNumber));
          return <tr key={row.id}><td>{displayDate(row.expenseDate)}</td><td className="order">{canOpenOrder ? <button type="button" className="b2b-expense-order-link" onClick={() => openOrder(row)}>{row.orderNumber}</button> : row.orderNumber}</td><td><span className="b2b-expense-badge" style={{ background: meta.soft, color: meta.color }}><Icon size={12} />{meta.label}</span></td><td className="driver">{row.purpose || '—'}</td><td>{formatB2BPaymentMethod(row.method)}</td><td className="number">{money(row.amount)}</td><td className={`number ${row.taxAmount > 0 ? 'tax' : ''}`}>{money(row.taxAmount)}</td><td className="number net">{money(row.netAmount)}</td><td title={row.comment}>{row.comment || '—'}</td></tr>;
        }) : <tr><td colSpan={9} className="empty">За выбранный период расходов пока нет</td></tr>}</tbody></table></div>
      </div>

      {showCreate && <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !isSaving) setShowCreate(false); }}>
        <div className="b2b-expense-create-card" role="dialog" aria-modal="true" aria-labelledby="b2b-new-expense-title">
          <header className="b2b-modal-head"><div><h2 id="b2b-new-expense-title">Новый расход B2B</h2><p>Добавление расхода в финансовый учёт</p></div><button type="button" onClick={() => setShowCreate(false)} disabled={isSaving} aria-label="Закрыть"><X size={18} /></button></header>
          <form className="b2b-expense-create-form" onSubmit={saveExpense}>
            <section>
              <h3><ReceiptText size={16} />Основные данные</h3>
              <div className="b2b-expense-form-grid">
                <label><span>Дата *</span><input type="date" value={form.expenseDate} onChange={event => setForm(current => ({ ...current, expenseDate: event.target.value }))} /></label>
                <label><span>Категория *</span><select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}>{FORM_CATEGORIES.map(key => <option key={key} value={key}>{categoryMeta(key).label}</option>)}</select></label>
                <label className="full"><span>Назначение *</span><input autoFocus value={form.purpose} onChange={event => setForm(current => ({ ...current, purpose: event.target.value }))} placeholder="Например: топливо для поездки" /></label>
                <label><span>Сумма, сом *</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
                <label><span>Способ оплаты *</span><select value={form.method} onChange={event => setForm(current => ({ ...current, method: event.target.value as B2BPaymentMethod }))}>{B2B_PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              </div>
            </section>
            <section>
              <h3><Bus size={16} />Связь и примечание</h3>
              <div className="b2b-expense-form-grid single">
                <label><span>Заказ</span><select value={form.orderId} onChange={event => setForm(current => ({ ...current, orderId: event.target.value }))}><option value="">Без привязки к заказу</option>{orders.map(order => <option key={order.id} value={order.id}>{order.number} · {order.client}</option>)}</select></label>
                <label><span>Комментарий</span><textarea value={form.comment} onChange={event => setForm(current => ({ ...current, comment: event.target.value }))} placeholder="Дополнительная информация" /></label>
                <div className="b2b-expense-live-total"><span>Начислено<strong>{money(taxPreview.grossAmount)}</strong></span><span>Налог 4%<strong>{money(taxPreview.taxAmount)}</strong></span><span>К перечислению<strong>{money(taxPreview.netAmount)}</strong></span></div>
              </div>
            </section>
            {formError && <div className="b2b-form-error">{formError}</div>}
            <div className="b2b-form-actions"><button type="button" className="b2b-cancel-button" onClick={() => setShowCreate(false)} disabled={isSaving}>Отмена</button><button type="submit" className="b2b-primary-button" disabled={isSaving}>{isSaving ? 'Сохранение…' : 'Сохранить расход'}</button></div>
          </form>
        </div>
      </div>}
    </section>
  );
}
