import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Bus, CircleUserRound, Plus, ReceiptText, Route, School, X } from 'lucide-react';
import { createExpense, fetchExpenses } from '../../services/expenseService';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import { CASHIER_PERIODS, currentCashierPeriodKey } from '../families/constants';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_KEYS,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseRecord,
} from './expenseTypes';
import './ExpensesModule.css';

interface ExpensesModuleProps { userName?: string; sessionToken?: string; }

const CATEGORY_ICONS: Record<ExpenseCategory, React.ReactNode> = {
  school: <School size={20} />,
  office: <Building2 size={20} />,
  logistics: <Bus size={20} />,
  extra_trip: <Route size={20} />,
  personal: <CircleUserRound size={20} />,
};

const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} сом`;
const compactMoney = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
const displayDate = (date: string) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU') : '—';
const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

function periodBounds(month: number, year: number) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { first, last: `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}` };
}

function ExpensesTable({ rows, showCategory }: { rows: ExpenseRecord[]; showCategory: boolean }) {
  if (!rows.length) return <div className="expenses-empty">За выбранный период расходов пока нет</div>;
  return (
    <div className="expenses-table-wrap">
      <table className="expenses-table">
        <thead><tr>
          <th>Наименование расхода</th>
          {showCategory && <th>Категория</th>}
          <th>Подкатегория</th>
          <th className="number">Цена</th>
          <th className="number">Кол-во</th>
          <th className="number">Сумма</th>
          <th>Дата</th>
          <th>Оплата</th>
          <th>Комментарий</th>
        </tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.id}>
            <td className="expense-name">{row.name}</td>
            {showCategory && <td><span className="expense-badge">{EXPENSE_CATEGORIES[row.category].label}</span></td>}
            <td>{row.subcategory}</td>
            <td className="number">{compactMoney(row.unitPrice)}</td>
            <td className="number">{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(row.quantity)}</td>
            <td className="number" style={{ fontWeight: 850, color: '#17222F' }}>{compactMoney(row.amount)}</td>
            <td>{displayDate(row.expenseDate)}</td>
            <td><span className="expense-badge">{row.paymentMethod === 'cash' ? 'Наличные' : 'Безнал'}</span></td>
            <td title={row.comment}>{row.comment || '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ExpenseModal({ initialCategory, userName, sessionToken, onClose, onCreated }: {
  initialCategory: ExpenseCategory | null;
  userName?: string;
  sessionToken?: string;
  onClose: () => void;
  onCreated: (expense: ExpenseRecord) => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>(initialCategory ?? 'school');
  const [subcategory, setSubcategory] = useState(EXPENSE_CATEGORIES[initialCategory ?? 'school'].subcategories[0]);
  const [name, setName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [expenseDate, setExpenseDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('cashless');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = Math.max(0, Number(unitPrice) || 0) * Math.max(0, Number(quantity) || 0);

  const changeCategory = (next: ExpenseCategory) => {
    setCategory(next);
    setSubcategory(EXPENSE_CATEGORIES[next].subcategories[0]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !subcategory || total <= 0 || !expenseDate) {
      setError('Заполните наименование, подкатегорию, цену, количество и дату.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createExpense({
        name, category, subcategory,
        unitPrice: Number(unitPrice), quantity: Number(quantity),
        expenseDate, paymentMethod, comment, createdBy: userName,
      }, sessionToken);
      onCreated(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить расход');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="expense-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="expense-modal" role="dialog" aria-modal="true" aria-label="Новый расход">
        <div className="expense-modal-head"><h2>Новый расход</h2><button className="expense-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div>
        <form className="expense-form" onSubmit={submit}>
          <div className="expense-field full"><label>Наименование расхода</label><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Например, аренда офиса" /></div>
          <div className="expense-field"><label>Главная категория</label><select value={category} onChange={event => changeCategory(event.target.value as ExpenseCategory)}>{EXPENSE_CATEGORY_KEYS.map(key => <option key={key} value={key}>{EXPENSE_CATEGORIES[key].label}</option>)}</select></div>
          <div className="expense-field"><label>Подкатегория</label><select value={subcategory} onChange={event => setSubcategory(event.target.value)}>{EXPENSE_CATEGORIES[category].subcategories.map(item => <option key={item}>{item}</option>)}</select></div>
          <div className="expense-field"><label>Цена, сом</label><input type="number" min="0" step="0.01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} placeholder="0" /></div>
          <div className="expense-field"><label>Количество</label><input type="number" min="0.01" step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} /></div>
          <div className="expense-total-preview"><span>Итоговая сумма</span><strong>{money(total)}</strong></div>
          <div className="expense-field"><label>Фактическая дата расхода</label><input type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} /></div>
          <div className="expense-field"><label>Способ оплаты</label><select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as ExpensePaymentMethod)}><option value="cash">Наличные</option><option value="cashless">Безнал</option></select></div>
          <div className="expense-field full"><label>Комментарий</label><textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="Необязательно" /></div>
          {error && <div className="expense-form-error">{error}</div>}
          <div className="expense-form-actions"><button type="button" className="expense-cancel" onClick={onClose}>Отмена</button><button type="submit" className="expense-save" disabled={saving}>{saving ? 'Сохранение…' : 'Добавить расход'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default function ExpensesModule({ userName, sessionToken }: ExpensesModuleProps) {
  const [periodKey, setPeriodKey] = useState(currentCashierPeriodKey);
  const [rows, setRows] = useState<ExpenseRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const bounds = useMemo(() => {
    if (periodKey === 'ALL') {
      const firstPeriod = CASHIER_PERIODS[0];
      const lastPeriod = CASHIER_PERIODS[CASHIER_PERIODS.length - 1];
      return { first: periodBounds(firstPeriod.month - 1, firstPeriod.year).first, last: periodBounds(lastPeriod.month - 1, lastPeriod.year).last };
    }
    const period = CASHIER_PERIODS.find(item => item.key === periodKey) ?? CASHIER_PERIODS[0];
    return periodBounds(period.month - 1, period.year);
  }, [periodKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    fetchExpenses(bounds.first, bounds.last, sessionToken).then(data => { if (active) setRows(data); }).catch(reason => {
      if (active) setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить расходы');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bounds.first, bounds.last, sessionToken]);

  const totals = useMemo(() => {
    const byCategory = Object.fromEntries(EXPENSE_CATEGORY_KEYS.map(key => [key, { amount: 0, count: 0 }])) as Record<ExpenseCategory, { amount: number; count: number }>;
    rows.forEach(row => { byCategory[row.category].amount += row.amount; byCategory[row.category].count += 1; });
    return byCategory;
  }, [rows]);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const categoryRows = selectedCategory ? rows.filter(row => row.category === selectedCategory) : rows;
  const subcategoryTotals = useMemo(() => {
    if (!selectedCategory) return [];
    return EXPENSE_CATEGORIES[selectedCategory].subcategories.map(subcategory => {
      const matching = rows.filter(row => row.category === selectedCategory && row.subcategory === subcategory);
      return { subcategory, amount: matching.reduce((sum, row) => sum + row.amount, 0), count: matching.length };
    });
  }, [rows, selectedCategory]);
  const visibleRows = selectedSubcategory === 'ALL'
    ? categoryRows
    : categoryRows.filter(row => row.subcategory === selectedSubcategory);

  useEffect(() => {
    setSelectedSubcategory('ALL');
  }, [selectedCategory, periodKey]);

  const handleCreated = (expense: ExpenseRecord) => {
    setModalOpen(false);
    if (expense.expenseDate >= bounds.first && expense.expenseDate <= bounds.last) setRows(current => [expense, ...current]);
  };

  return (
    <div className="expenses-module">
      <div className="expenses-overview">
        <div className="expenses-toolbar">
          <div>
            {selectedCategory && <button className="expenses-back" onClick={() => setSelectedCategory(null)}>← Главная расходов</button>}
            <div className="expenses-title">{selectedCategory ? EXPENSE_CATEGORIES[selectedCategory].label : 'Дашборд расходов'}</div>
            <div className="expenses-subtitle">Учёт ведётся по фактической дате оплаты</div>
          </div>
          <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} periods={CASHIER_PERIODS} />
          <button className="expenses-add" onClick={() => setModalOpen(true)}><Plus size={17} /> Новый расход</button>
        </div>

        {loadError && <div className="expenses-load-error">Не удалось загрузить данные: {loadError}. Проверьте, что миграция расходов применена.</div>}

        {!selectedCategory && <div className="expense-category-grid">
          <div className="expense-category-card expense-total-card dock-hover-card">
            <span className="expense-category-icon" style={{ background: '#E7F2F4', color: '#477279' }}><ReceiptText size={20} /></span>
            <div className="expense-category-name">Всего за период</div>
            <div className="expense-category-amount">{money(total)}</div>
            <div className="expense-category-count">{rows.length} записей</div>
          </div>
          {EXPENSE_CATEGORY_KEYS.map(key => {
          const meta = EXPENSE_CATEGORIES[key];
          return <button key={key} className="expense-category-card dock-hover-card" onClick={() => setSelectedCategory(key)}>
            <span className="expense-category-icon" style={{ background: meta.soft, color: meta.color }}>{CATEGORY_ICONS[key]}</span>
            <div className="expense-category-name">{meta.label}</div>
            <div className="expense-category-amount">{money(totals[key].amount)}</div>
            <div className="expense-category-count">{totals[key].count} записей · открыть →</div>
          </button>;
        })}</div>}

        {selectedCategory && <div className="expense-subcategory-grid">
          <button className={`expense-subcategory-card dock-hover-card${selectedSubcategory === 'ALL' ? ' active' : ''}`} onClick={() => setSelectedSubcategory('ALL')}>
            <span>Все расходы</span>
            <strong>{money(categoryRows.reduce((sum, row) => sum + row.amount, 0))}</strong>
            <small>{categoryRows.length} записей</small>
          </button>
          {subcategoryTotals.map(item => <button key={item.subcategory} className={`expense-subcategory-card dock-hover-card${selectedSubcategory === item.subcategory ? ' active' : ''}`} onClick={() => setSelectedSubcategory(item.subcategory)}>
            <span>{item.subcategory}</span>
            <strong>{money(item.amount)}</strong>
            <small>{item.count} записей</small>
          </button>)}
        </div>}
      </div>

      <div className="expenses-panel">
        <div className="expenses-panel-title">
          <span>{selectedCategory ? `Расходы: ${EXPENSE_CATEGORIES[selectedCategory].label}` : 'Все расходы за период'}</span>
          <div className="expenses-panel-tools">
            <span>{visibleRows.length} записей</span>
          </div>
        </div>
        {loading ? <div className="expenses-empty">Загрузка…</div> : <ExpensesTable rows={visibleRows} showCategory={!selectedCategory} />}
      </div>
      {modalOpen && <ExpenseModal initialCategory={selectedCategory} userName={userName} sessionToken={sessionToken} onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
    </div>
  );
}
