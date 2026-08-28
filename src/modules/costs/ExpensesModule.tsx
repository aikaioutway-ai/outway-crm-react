import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Bus, CircleUserRound, LockKeyhole, Pencil, Plus, ReceiptText, Route, School, Trash2, X } from 'lucide-react';
import { createExpense, deleteExpense, fetchExpenses, updateExpense } from '../../services/expenseService';
import {
  fetchV2DriverAdvancesForPeriod,
  fetchV2DriversTable,
  fetchV2PayrollEntriesForPeriod,
  V2DriverAdvance,
  V2DriverTableRow,
  V2PayrollEntry,
} from '../../services/crmV2Service';
import { fetchEmployees } from '../../services/employeeService';
import { Employee, UserRole } from '../../types';
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

interface ExpensesModuleProps { userName?: string; userRole?: UserRole; sessionToken?: string; }

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

function payrollPeriodDate(month: number, year: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function systemExpenseRows(
  entries: V2PayrollEntry[],
  advances: V2DriverAdvance[],
  drivers: V2DriverTableRow[],
  employees: Employee[],
): ExpenseRecord[] {
  const driverById = new Map(drivers.map(driver => [driver.driverId, driver]));
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));

  const salaryRows = entries.filter(entry => entry.salaryAmount > 0).map(entry => {
    const person = entry.subjectType === 'driver'
      ? driverById.get(entry.subjectId)?.fullName
      : employeeById.get(entry.subjectId)?.fullName;
    const updatedDate = entry.updatedAt?.slice(0, 10) ?? '';
    const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(updatedDate)
      ? updatedDate
      : payrollPeriodDate(entry.periodMonth, entry.periodYear);
    return {
      id: `salary-${entry.id}`,
      name: `Зарплата — ${person || 'сотрудник'}`,
      category: entry.subjectType === 'driver' ? 'school' as const : 'office' as const,
      subcategory: 'Зарплата',
      unitPrice: entry.salaryAmount,
      quantity: 1,
      amount: entry.salaryAmount,
      expenseDate,
      paymentMethod: 'cashless' as const,
      comment: `Системная выплата за ${String(entry.periodMonth).padStart(2, '0')}.${entry.periodYear}`,
      createdAt: entry.updatedAt,
      source: 'salary' as const,
    };
  });

  const advanceRows = advances.filter(advance => advance.amount > 0).map(advance => ({
    id: `advance-${advance.id}`,
    name: `Аванс — ${driverById.get(advance.driverId)?.fullName || 'водитель'}`,
    category: 'school' as const,
    subcategory: 'Аванс',
    unitPrice: advance.amount,
    quantity: 1,
    amount: advance.amount,
    expenseDate: advance.date,
    paymentMethod: 'cashless' as const,
    comment: advance.comment || 'Системная выплата из раздела «Зарплата»',
    createdAt: advance.createdAt,
    source: 'advance' as const,
  }));

  return [...salaryRows, ...advanceRows];
}

function ExpensesTable({ rows, showCategory, onEdit, onDelete, deletingId }: {
  rows: ExpenseRecord[];
  showCategory: boolean;
  onEdit: (expense: ExpenseRecord) => void;
  onDelete: (expense: ExpenseRecord) => void;
  deletingId: string | null;
}) {
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
          <th className="expense-actions-column">Действия</th>
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
            <td><span className="expense-badge">{row.source === 'salary' ? 'Из зарплаты' : row.source === 'advance' ? 'Из аванса' : row.paymentMethod === 'cash' ? 'Наличные' : 'Безнал'}</span></td>
            <td title={row.comment}>{row.comment || '—'}</td>
            <td className="expense-row-actions">
              {row.source === 'manual' && <>
                <button type="button" onClick={() => onEdit(row)} title="Редактировать расход" aria-label={`Редактировать ${row.name}`}><Pencil size={14} /></button>
                <button type="button" className="danger" onClick={() => onDelete(row)} disabled={deletingId === row.id} title="Удалить расход" aria-label={`Удалить ${row.name}`}><Trash2 size={14} /></button>
              </>}
              {row.source !== 'manual' && <span className="expense-system-lock" title="Системная выплата редактируется в разделе «Зарплата»"><LockKeyhole size={14} /></span>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ExpenseModal({ initialCategory, expense, userName, sessionToken, onClose, onSaved }: {
  initialCategory: ExpenseCategory | null;
  expense?: ExpenseRecord | null;
  userName?: string;
  sessionToken?: string;
  onClose: () => void;
  onSaved: (expense: ExpenseRecord) => void;
}) {
  const defaultCategory = expense?.category ?? initialCategory ?? 'school';
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [subcategory, setSubcategory] = useState(expense?.subcategory ?? EXPENSE_CATEGORIES[defaultCategory].subcategories[0]);
  const [name, setName] = useState(expense?.name ?? '');
  const [unitPrice, setUnitPrice] = useState(expense ? String(expense.unitPrice) : '');
  const [quantity, setQuantity] = useState(expense ? String(expense.quantity) : '1');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? today());
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>(expense?.paymentMethod ?? 'cashless');
  const [comment, setComment] = useState(expense?.comment ?? '');
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
      const payload = {
        name, category, subcategory,
        unitPrice: Number(unitPrice), quantity: Number(quantity),
        expenseDate, paymentMethod, comment, createdBy: userName,
      };
      const saved = expense
        ? await updateExpense(expense.id, payload, sessionToken)
        : await createExpense(payload, sessionToken);
      onSaved(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить расход');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="expense-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="expense-modal" role="dialog" aria-modal="true" aria-label={expense ? 'Редактирование расхода' : 'Новый расход'}>
        <div className="expense-modal-head"><h2>{expense ? 'Редактировать расход' : 'Новый расход'}</h2><button className="expense-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div>
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
          <div className="expense-form-actions"><button type="button" className="expense-cancel" onClick={onClose}>Отмена</button><button type="submit" className="expense-save" disabled={saving}>{saving ? 'Сохранение…' : expense ? 'Сохранить изменения' : 'Добавить расход'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default function ExpensesModule({ userName, userRole, sessionToken }: ExpensesModuleProps) {
  const [periodKey, setPeriodKey] = useState(currentCashierPeriodKey);
  const [rows, setRows] = useState<ExpenseRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const selectedPeriods = useMemo(() => (
    periodKey === 'ALL'
      ? CASHIER_PERIODS
      : [CASHIER_PERIODS.find(item => item.key === periodKey) ?? CASHIER_PERIODS[0]]
  ), [periodKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([
      fetchExpenses(bounds.first, bounds.last, sessionToken),
      Promise.all(selectedPeriods.map(period => fetchV2PayrollEntriesForPeriod(period.month, period.year))).then(result => result.flat()),
      Promise.all(selectedPeriods.map(period => fetchV2DriverAdvancesForPeriod(period.month, period.year))).then(result => result.flat()),
      fetchV2DriversTable(),
      fetchEmployees(),
    ]).then(([manualRows, payrollEntries, advances, drivers, employees]) => {
      if (!active) return;
      const combined = [
        ...manualRows.map(row => ({ ...row, source: 'manual' as const })),
        ...systemExpenseRows(payrollEntries, advances, drivers, employees),
      ].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt));
      setRows(combined);
    }).catch(reason => {
      if (active) setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить расходы');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bounds.first, bounds.last, selectedPeriods, sessionToken]);

  const totals = useMemo(() => {
    const byCategory = Object.fromEntries(EXPENSE_CATEGORY_KEYS.map(key => [key, { amount: 0, count: 0 }])) as Record<ExpenseCategory, { amount: number; count: number }>;
    rows.forEach(row => { byCategory[row.category].amount += row.amount; byCategory[row.category].count += 1; });
    return byCategory;
  }, [rows]);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const categoryRows = selectedCategory ? rows.filter(row => row.category === selectedCategory) : rows;
  const subcategoryTotals = useMemo(() => {
    if (!selectedCategory) return [];
    const subcategories = Array.from(new Set([
      ...EXPENSE_CATEGORIES[selectedCategory].subcategories,
      ...rows.filter(row => row.category === selectedCategory).map(row => row.subcategory),
    ]));
    return subcategories.map(subcategory => {
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

  const canViewPersonalDetails = userRole === 'admin' || userRole === 'gen_director';
  const handleSaved = (expense: ExpenseRecord) => {
    setModalOpen(false);
    setEditingExpense(null);
    setRows(current => {
      const withoutPrevious = current.filter(row => row.id !== expense.id);
      return expense.expenseDate >= bounds.first && expense.expenseDate <= bounds.last
        ? [{ ...expense, source: 'manual' as const }, ...withoutPrevious].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt))
        : withoutPrevious;
    });
  };

  const handleDelete = async (expense: ExpenseRecord) => {
    if (!window.confirm(`Удалить расход «${expense.name}» на сумму ${money(expense.amount)}?`)) return;
    setDeletingId(expense.id);
    try {
      await deleteExpense(expense.id, sessionToken);
      setRows(current => current.filter(row => row.id !== expense.id));
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : 'Не удалось удалить расход');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="expenses-module">
      <div className="expenses-overview">
        <div className="expenses-toolbar">
          <div>
            {selectedCategory && <button className="expenses-back" onClick={() => setSelectedCategory(null)}>← Главная расходов</button>}
            <div className="expenses-title">{selectedCategory ? EXPENSE_CATEGORIES[selectedCategory].label : 'Дашборд расходов'}</div>
            <div className="expenses-subtitle">Ручные расходы и системные выплаты из раздела «Зарплата»</div>
          </div>
          <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} periods={CASHIER_PERIODS} />
          <button className="expenses-add" onClick={() => { setEditingExpense(null); setModalOpen(true); }}><Plus size={17} /> Новый расход</button>
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
          const personalLocked = key === 'personal' && !canViewPersonalDetails;
          return <button key={key} className={`expense-category-card dock-hover-card${personalLocked ? ' locked' : ''}`} onClick={() => { if (!personalLocked) setSelectedCategory(key); }} aria-disabled={personalLocked}>
            <span className="expense-category-icon" style={{ background: meta.soft, color: meta.color }}>{CATEGORY_ICONS[key]}</span>
            <div className="expense-category-name">{meta.label}</div>
            <div className="expense-category-amount">{money(totals[key].amount)}</div>
            <div className="expense-category-count">{personalLocked ? <><LockKeyhole size={11} /> Детали скрыты</> : `${totals[key].count} записей · открыть →`}</div>
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
        {loading ? <div className="expenses-empty">Загрузка…</div> : <ExpensesTable rows={canViewPersonalDetails ? visibleRows : visibleRows.filter(row => row.category !== 'personal')} showCategory={!selectedCategory} onEdit={expense => { setEditingExpense(expense); setModalOpen(true); }} onDelete={handleDelete} deletingId={deletingId} />}
      </div>
      {modalOpen && <ExpenseModal initialCategory={selectedCategory} expense={editingExpense} userName={userName} sessionToken={sessionToken} onClose={() => { setModalOpen(false); setEditingExpense(null); }} onSaved={handleSaved} />}
    </div>
  );
}
