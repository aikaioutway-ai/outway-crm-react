import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Bus,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Gift,
  LockKeyhole,
  Pencil,
  Percent,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { B2B_PAYMENT_METHODS, B2BPaymentMethod, formatB2BPaymentMethod, requiresB2BPaymentOrder } from '../../services/b2bPaymentService';
import { createB2BExpense, updateB2BExpense, type B2BExpenseRecord } from '../../services/b2bDataService';
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
  bonus: { label: 'Премия', color: '#7b62b4', soft: '#f3efff', icon: Gift },
  returns: { label: 'Возвраты', color: '#b55353', soft: '#fff0ef', icon: RotateCcw },
  rent: { label: 'Аренда', color: '#596bb3', soft: '#eef0ff', icon: Building2 },
  marketing: { label: 'Маркетинг', color: '#b45f7a', soft: '#fff0f5', icon: ReceiptText },
  salary: { label: 'Зарплата', color: '#307c62', soft: '#eaf7f1', icon: CircleDollarSign },
  other: { label: 'Прочие расходы', color: '#69758b', soft: '#eef2f5', icon: ReceiptText },
};

const CATEGORY_ORDER = ['driver_payments', 'taxes', 'salary', 'bonus', 'returns', 'rent', 'marketing', 'other'];

function normalizedCategory(key: string) {
  const normalized = (key || 'other').toLocaleLowerCase('ru-RU');
  return normalized === 'fuel' || normalized === 'maintenance' ? 'other' : normalized;
}

function isAutomaticExpense(row: B2BExpenseRecord) {
  return row.source === 'driver_payment' || row.source === 'tax_4pct';
}

function categoryMeta(key: string): CategoryMeta {
  const normalized = normalizedCategory(key);
  return CATEGORY_META[normalized] ?? {
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
const FORM_CATEGORIES = ['salary', 'bonus', 'returns', 'rent', 'marketing', 'other'];
const CURRENT_YEAR = new Date().getFullYear();

const localDateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const emptyExpenseForm = () => ({
  expenseDate: localDateInput(new Date()),
  category: 'other',
  amount: '',
  method: 'cash' as B2BPaymentMethod,
  paymentOrderNumber: '',
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
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
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
    const keys = Array.from(new Set([...FORM_CATEGORIES, ...expenses.map(row => normalizedCategory(row.category))]));
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
    const result: Record<string, { amount: number; count: number }> = {};
    periodRows.forEach(row => {
      const key = normalizedCategory(row.category);
      const current = result[key] ?? { amount: 0, count: 0 };
      current.amount += row.amount;
      current.count += 1;
      result[key] = current;
    });
    return result;
  }, [periodRows]);

  const totalAmount = useMemo(() => periodRows.reduce((sum, row) => sum + row.amount, 0), [periodRows]);

  const rows = useMemo(() => periodRows.filter(row => {
    if (selectedCategory && normalizedCategory(row.category) !== selectedCategory) return false;
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

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.expenseDate || !form.category || !form.purpose.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError('Заполните дату, категорию, назначение и сумму больше нуля.');
      return;
    }
    if (requiresB2BPaymentOrder(form.method) && !form.paymentOrderNumber.trim()) return setFormError('Укажите номер платёжного поручения.');
    setIsSaving(true);
    setFormError('');
    try {
      const payload = { ...form, amount, purpose: form.purpose.trim(), comment: form.comment.trim() };
      if (editingExpenseId) await updateB2BExpense(editingExpenseId, payload);
      else await createB2BExpense(payload);
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.expenses });
      const expenseDate = new Date(`${form.expenseDate}T00:00:00`);
      setSelectedYear(expenseDate.getFullYear());
      setPeriodKey(String(expenseDate.getMonth() + 1));
      setForm(emptyExpenseForm());
      setEditingExpenseId(null);
      setShowCreate(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить расход.');
    } finally {
      setIsSaving(false);
    }
  };

  const openNewExpense = () => {
    setEditingExpenseId(null);
    setForm(emptyExpenseForm());
    setFormError('');
    setShowCreate(true);
  };

  const openExpenseEdit = (row: B2BExpenseRecord) => {
    if (isAutomaticExpense(row)) return;
    const orderId = orders.find(order => order.number === row.orderNumber)?.id ?? '';
    setEditingExpenseId(row.id);
    setForm({
      expenseDate: row.expenseDate.slice(0, 10), category: normalizedCategory(row.category), amount: String(row.amount),
      method: row.method, paymentOrderNumber: row.paymentOrderNumber ?? '', purpose: row.purpose, orderId, comment: row.comment,
    });
    setFormError('');
    setShowCreate(true);
  };

  const closeExpenseEditor = () => {
    if (isSaving) return;
    setShowCreate(false);
    setEditingExpenseId(null);
    setForm(emptyExpenseForm());
    setFormError('');
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
              <strong>{money(totalAmount)}</strong>
              <small>{periodRows.length} {periodRows.length === 1 ? 'операция' : 'операций'}</small>
            </article>
            {categories.map(key => {
              const meta = categoryMeta(key);
              const Icon = meta.icon;
              const categoryTotal = categoryTotals[key] ?? { amount: 0, count: 0 };
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
          <div className="b2b-expenses-summary"><article><span>Сумма расходов</span><strong>{money(categoryTotals[selectedCategory]?.amount ?? 0)}</strong></article></div>
        )}

        <div className="b2b-expenses-tax-note"><Percent size={18} /><div><strong>Расходы налогом не облагаются</strong><span>Налог 4% создаётся автоматически только с подтверждённой оплаты клиента на юрсчёт.</span></div></div>
      </div>

      <div className="b2b-expenses-panel">
        <div className="b2b-expenses-panel-head">
          <div><strong>{selectedLabel ? `Расходы: ${selectedLabel}` : 'Все расходы за период'}</strong><span>{rows.length} записей</span></div>
          <div className="b2b-expenses-panel-actions">
            <label className="b2b-expenses-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Заказ, категория, назначение, оплата..." /></label>
            <button type="button" className="b2b-primary-button" onClick={openNewExpense}><Plus size={16} />Новый расход</button>
          </div>
        </div>
        <div className="b2b-expenses-table-wrap"><table className="b2b-expenses-table"><thead><tr><th>Дата</th><th>Заказ</th><th>Категория</th><th>Назначение</th><th>Способ оплаты</th><th>№ платёжного поручения</th><th className="number">Сумма</th><th>Комментарий</th><th className="actions">Действия</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={9} className="empty">Загрузка…</td></tr> : rows.length ? rows.map(row => {
          const meta = categoryMeta(normalizedCategory(row.category));
          const Icon = meta.icon;
          const canOpenOrder = Boolean(onOpenOrder && row.orderNumber !== '—' && orders.some(order => order.number === row.orderNumber));
          return <tr key={row.id}><td>{displayDate(row.expenseDate)}</td><td className="order">{canOpenOrder ? <button type="button" className="b2b-expense-order-link" onClick={() => openOrder(row)}>{row.orderNumber}</button> : row.orderNumber}</td><td><span className="b2b-expense-badge" style={{ background: meta.soft, color: meta.color }}><Icon size={12} />{meta.label}</span></td><td className="driver">{row.purpose || '—'}</td><td>{formatB2BPaymentMethod(row.method)}</td><td>{row.paymentOrderNumber || '—'}</td><td className="number">{money(row.amount)}</td><td title={row.comment}>{row.comment || '—'}</td><td className="actions">{!isAutomaticExpense(row) ? <button type="button" className="b2b-expense-edit-button" onClick={() => openExpenseEdit(row)} title="Редактировать расход"><Pencil size={14} /></button> : <span className="b2b-expense-auto" title="Автоматическая запись редактируется в исходной оплате"><LockKeyhole size={12} />Авто</span>}</td></tr>;
        }) : <tr><td colSpan={9} className="empty">За выбранный период расходов пока нет</td></tr>}</tbody></table></div>
      </div>

      {showCreate && <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeExpenseEditor(); }}>
        <div className="b2b-expense-create-card" role="dialog" aria-modal="true" aria-labelledby="b2b-new-expense-title">
          <header className="b2b-modal-head"><div><h2 id="b2b-new-expense-title">{editingExpenseId ? 'Редактирование расхода' : 'Новый расход B2B'}</h2><p>{editingExpenseId ? 'Измените данные операции' : 'Добавление расхода в финансовый учёт'}</p></div><button type="button" onClick={closeExpenseEditor} disabled={isSaving} aria-label="Закрыть"><X size={18} /></button></header>
          <form className="b2b-expense-create-form" onSubmit={saveExpense}>
            <section>
              <h3><ReceiptText size={16} />Основные данные</h3>
              <div className="b2b-expense-form-grid">
                <label><span>Дата *</span><input type="date" value={form.expenseDate} onChange={event => setForm(current => ({ ...current, expenseDate: event.target.value }))} /></label>
                <label><span>Категория *</span><select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}>{FORM_CATEGORIES.map(key => <option key={key} value={key}>{categoryMeta(key).label}</option>)}</select></label>
                <label className="full"><span>Назначение *</span><input autoFocus value={form.purpose} onChange={event => setForm(current => ({ ...current, purpose: event.target.value }))} placeholder="Например: премия сотруднику" /></label>
                <label><span>Сумма, сом *</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
                <label><span>Способ оплаты *</span><select value={form.method} onChange={event => setForm(current => ({ ...current, method: event.target.value as B2BPaymentMethod }))}>{B2B_PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
                <label><span>№ платёжного поручения{requiresB2BPaymentOrder(form.method) ? ' *' : ''}</span><input required={requiresB2BPaymentOrder(form.method)} value={form.paymentOrderNumber} onChange={event => setForm(current => ({ ...current, paymentOrderNumber: event.target.value }))} placeholder={requiresB2BPaymentOrder(form.method) ? 'Обязательно' : 'Для наличных необязательно'} /></label>
              </div>
            </section>
            <section>
              <h3><Bus size={16} />Связь и примечание</h3>
              <div className="b2b-expense-form-grid single">
                <label><span>Заказ</span><select value={form.orderId} onChange={event => setForm(current => ({ ...current, orderId: event.target.value }))}><option value="">Без привязки к заказу</option>{orders.map(order => <option key={order.id} value={order.id}>{order.number} · {order.client}</option>)}</select></label>
                <label><span>Комментарий</span><textarea value={form.comment} onChange={event => setForm(current => ({ ...current, comment: event.target.value }))} placeholder="Дополнительная информация" /></label>
                <div className="b2b-expense-live-total"><span>Сумма расхода<strong>{money(Number(form.amount) || 0)}</strong></span></div>
              </div>
            </section>
            {formError && <div className="b2b-form-error">{formError}</div>}
            <div className="b2b-form-actions"><button type="button" className="b2b-cancel-button" onClick={closeExpenseEditor} disabled={isSaving}>Отмена</button><button type="submit" className="b2b-primary-button" disabled={isSaving}>{isSaving ? 'Сохранение…' : editingExpenseId ? 'Сохранить изменения' : 'Сохранить расход'}</button></div>
          </form>
        </div>
      </div>}
    </section>
  );
}
