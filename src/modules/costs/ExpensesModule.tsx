import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Bus, CircleUserRound, Route, School, ReceiptText, RotateCcw, Gift, Banknote, LockKeyhole, WalletCards, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createExpense, deleteExpense, updateExpense } from '../../services/expenseService';
import { loadExpenseRows, periodBounds } from './expenseRows';
import EmployeeAdvanceModal from './EmployeeAdvanceModal';
import { UserRole } from '../../types';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import { CASHIER_PERIODS, currentCashierPeriodKey } from '../families/constants';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_KEYS,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseRecord,
} from './expenseTypes';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import './ExpensesModule.css';

interface ExpensesModuleProps { userName?: string; userRole?: UserRole; sessionToken?: string;
  toolbarContent?: React.ReactNode;
  selectedCategory: ExpenseCategory | null;
  onCategoryChange: (category: ExpenseCategory | null) => void;
  selectedSubcategory: string;
  onSubcategoryChange: (subcategory: string) => void;
}

const CATEGORY_ICONS: Record<ExpenseCategory, React.ReactNode> = {
  school: <School size={18} />,
  office: <Building2 size={18} />,
  logistics: <Bus size={18} />,
  extra_trip: <Route size={18} />,
  personal: <CircleUserRound size={18} />,
};

const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} сом`;
const displayDate = (date: string) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU') : '—';
const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

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
          <th>№ платёжного поручения</th>
          <th>Комментарий</th>
          <th className="expense-actions-column">Действия</th>
        </tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.id}>
            <td className="expense-name">{row.name}</td>
            {showCategory && <td><span className="expense-badge">{EXPENSE_CATEGORIES[row.category].label}</span></td>}
            <td>{row.subcategory}</td>
            <td className="number">{money(row.unitPrice)}</td>
            <td className="number">{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(row.quantity)}</td>
            <td className="number" style={{ fontWeight: 850, color: '#17222F' }}>{money(row.amount)}</td>
            <td>{displayDate(row.expenseDate)}</td>
            <td><span className="expense-badge">{row.source === 'salary' ? 'Из зарплаты' : row.source === 'advance' ? 'Из аванса' : row.paymentMethod === 'cash' ? 'Наличные' : 'АйКай Мбанк'}</span></td>
            <td>{row.paymentOrderNumber || '—'}</td>
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

function ExpenseModal({ initialCategory, expense, userName, sessionToken, allowPersonalCategory, onClose, onSaved }: {
  initialCategory: ExpenseCategory | null;
  expense?: ExpenseRecord | null;
  userName?: string;
  sessionToken?: string;
  allowPersonalCategory: boolean;
  onClose: () => void;
  onSaved: (expense: ExpenseRecord) => void;
}) {
  const requestedCategory = expense?.category ?? initialCategory ?? 'school';
  const defaultCategory = requestedCategory === 'personal' && !allowPersonalCategory ? 'school' : requestedCategory;
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [subcategory, setSubcategory] = useState(expense?.subcategory ?? EXPENSE_CATEGORIES[defaultCategory].subcategories[0]);
  const [name, setName] = useState(expense?.name ?? '');
  const [unitPrice, setUnitPrice] = useState(expense ? String(expense.unitPrice) : '');
  const [quantity, setQuantity] = useState(expense ? String(expense.quantity) : '1');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? today());
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>(expense?.paymentMethod ?? 'cashless');
  const [paymentOrderNumber, setPaymentOrderNumber] = useState(expense?.paymentOrderNumber ?? '');
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
        expenseDate, paymentMethod, paymentOrderNumber: paymentOrderNumber.trim() || undefined, comment, createdBy: userName,
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
          <div className="expense-field"><label>Главная категория</label><select value={category} onChange={event => changeCategory(event.target.value as ExpenseCategory)}>{EXPENSE_CATEGORY_KEYS.filter(key => allowPersonalCategory || key !== 'personal').map(key => <option key={key} value={key}>{EXPENSE_CATEGORIES[key].label}</option>)}</select></div>
          <div className="expense-field"><label>Подкатегория</label><select value={subcategory} onChange={event => setSubcategory(event.target.value)}>{EXPENSE_CATEGORIES[category].subcategories.map(item => <option key={item}>{item}</option>)}</select></div>
          <div className="expense-field"><label>Цена, сом</label><input type="number" min="0" step="0.01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} placeholder="0" /></div>
          <div className="expense-field"><label>Количество</label><input type="number" min="0.01" step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} /></div>
          <div className="expense-total-preview"><span>Итоговая сумма</span><strong>{money(total)}</strong></div>
          <div className="expense-field"><label>Фактическая дата расхода</label><input type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} /></div>
          <div className="expense-field"><label>Способ оплаты</label><select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as ExpensePaymentMethod)}><option value="cash">Наличные</option><option value="cashless">АйКай Мбанк</option></select></div>
          <div className="expense-field"><label>№ платёжного поручения</label><input value={paymentOrderNumber} onChange={event => setPaymentOrderNumber(event.target.value)} placeholder="Необязательно" /></div>
          <div className="expense-field full"><label>Комментарий</label><textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="Необязательно" /></div>
          {error && <div className="expense-form-error">{error}</div>}
          <div className="expense-form-actions"><button type="button" className="expense-cancel" onClick={onClose}>Отмена</button><button type="submit" className="expense-save" disabled={saving}>{saving ? 'Сохранение…' : expense ? 'Сохранить изменения' : 'Добавить расход'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default function ExpensesModule({ userName, userRole, sessionToken, toolbarContent, selectedCategory, onCategoryChange: setSelectedCategory, selectedSubcategory, onSubcategoryChange: setSelectedSubcategory }: ExpensesModuleProps) {
  const [sortKey, setSortKey] = useState('category');
  const [ascending, setAscending] = useState(true);
  const [periodKey, setPeriodKey] = useState(currentCashierPeriodKey);
  const [rows, setRows] = useState<ExpenseRecord[]>([]);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
    loadExpenseRows({ first: bounds.first, last: bounds.last }, selectedPeriods, sessionToken).then(combined => {
      if (!active) return;
      setRows(combined);
    }).catch(reason => {
      if (active) setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить расходы');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bounds.first, bounds.last, selectedPeriods, sessionToken, refreshKey]);

  const canViewPersonalDetails = userRole === 'admin' || userRole === 'gen_director';
  const accessibleRows = useMemo(() => canViewPersonalDetails ? rows : rows.filter(row => row.category !== 'personal'), [rows, canViewPersonalDetails]);
  useEffect(() => {
    if (selectedCategory === 'personal' && !canViewPersonalDetails) {
      setSelectedCategory(null);
      setSelectedSubcategory('ALL');
    }
  }, [selectedCategory, canViewPersonalDetails, setSelectedCategory, setSelectedSubcategory]);
  const categoryRows = selectedCategory ? accessibleRows.filter(row => row.category === selectedCategory) : accessibleRows;
  const subcategoryTotals = useMemo(() => {
    if (!selectedCategory) return [];
    const subcategories = Array.from(new Set([
      ...EXPENSE_CATEGORIES[selectedCategory].subcategories,
      ...accessibleRows.filter(row => row.category === selectedCategory).map(row => row.subcategory),
    ]));
    return subcategories.map(subcategory => {
      const matching = accessibleRows.filter(row => row.category === selectedCategory && row.subcategory === subcategory);
      return { subcategory, amount: matching.reduce((sum, row) => sum + row.amount, 0), count: matching.length };
    });
  }, [accessibleRows, selectedCategory]);
  const visibleRows = selectedSubcategory === 'ALL'
    ? categoryRows
    : categoryRows.filter(row => row.subcategory === selectedSubcategory);

  useEffect(() => {
    setSelectedSubcategory('ALL');
  }, [selectedCategory, periodKey, setSelectedSubcategory]);

  const overviewRows = (selectedCategory
    ? subcategoryTotals.map(item => ({ key: item.subcategory, category: selectedCategory, label: item.subcategory }))
    : EXPENSE_CATEGORY_KEYS.filter(key => canViewPersonalDetails || key !== 'personal').map(key => ({ key, category: key, label: EXPENSE_CATEGORIES[key].label }))
  ).map(item => {
    const matching = categoryRows.filter(row => selectedCategory ? row.subcategory === item.key : row.category === item.category);
    const meta = EXPENSE_CATEGORIES[item.category];
    const icon = selectedCategory
      ? item.key === 'Возврат' ? <RotateCcw size={18} />
        : item.key === 'Подарки' ? <Gift size={18} />
        : item.key === 'Аванс' || item.key === 'Зарплата' || item.key === 'Оплата водителю' ? <Banknote size={18} />
        : <ReceiptText size={18} />
      : CATEGORY_ICONS[item.category];
    const disabled = item.category === 'personal' && !canViewPersonalDetails;
    return { key: item.key, label: item.label + (disabled ? ' · детали скрыты' : ''), disabled,
      icon: <span aria-hidden="true" className="finance-category-icon" style={{ background: meta.soft, color: meta.color }}>{icon}</span>,
      metrics: { count: matching.length, amount: matching.reduce((sum, row) => sum + row.amount, 0),
        cashless: matching.filter(row => row.paymentMethod === 'cashless').reduce((sum, row) => sum + row.amount, 0),
        cash: matching.filter(row => row.paymentMethod === 'cash').reduce((sum, row) => sum + row.amount, 0) } };
  });
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
        <div className={`expenses-toolbar${toolbarContent ? '' : ' expenses-toolbar-inner'}`}>
          {toolbarContent}
          <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} periods={CASHIER_PERIODS} />
          <div className="expenses-create-actions"><button className="expenses-add" title="Новый расход" aria-label="Новый расход" onClick={() => { setEditingExpense(null); setModalOpen(true); }}><Plus size={17} /></button><button className="expenses-add" title="Новый аванс" aria-label="Новый аванс" onClick={() => setAdvanceOpen(true)}><WalletCards size={17} /></button></div>
        </div>

        {loadError && <div className="expenses-load-error">Не удалось загрузить данные: {loadError}. Проверьте, что миграция расходов применена.</div>}

      </div>

      {selectedSubcategory === 'ALL' && (loading ? <div className="expenses-empty">Загрузка…</div> : <SchoolDashboardTable
        showAvatars={false} rowGap={8} className="finance-category-table"
        columns={[
          { key: 'category', label: selectedCategory ? 'Подкатегория' : 'Категория', total: overviewRows.length, color: '#64748B' },
          { key: 'count', label: 'К-во расходов', total: categoryRows.length, color: '#7C3AED' },
          { key: 'amount', label: 'Сумма расходов', total: money(categoryRows.reduce((sum, row) => sum + row.amount, 0)), color: '#2563EB' },
          { key: 'cashless', label: 'Безналичные', total: money(categoryRows.filter(row => row.paymentMethod === 'cashless').reduce((sum, row) => sum + row.amount, 0)), color: '#1D6FA4' },
          { key: 'cash', label: 'Наличные', total: money(categoryRows.filter(row => row.paymentMethod === 'cash').reduce((sum, row) => sum + row.amount, 0)), color: '#15803D' },
        ]}
        rows={overviewRows.sort((a, b) => {
          const comparison = sortKey === 'category' ? a.label.localeCompare(b.label, 'ru') : a.metrics[sortKey as keyof typeof a.metrics] - b.metrics[sortKey as keyof typeof b.metrics];
          return ascending ? comparison : -comparison;
        }).map(row => ({ ...row, values: { count: row.metrics.count, amount: money(row.metrics.amount), cashless: money(row.metrics.cashless), cash: money(row.metrics.cash) } }))}
        sortKey={sortKey} ascending={ascending}
        onSort={key => { setAscending(key === sortKey ? !ascending : key === 'category'); setSortKey(key); }}
        onSelect={key => {
          if (selectedCategory) setSelectedSubcategory(key);
          else if (key !== 'personal' || canViewPersonalDetails) { setSelectedCategory(key as ExpenseCategory); setSelectedSubcategory('ALL'); }
        }}
      />)}

      {selectedCategory && selectedSubcategory !== 'ALL' && <div className="expenses-panel">
        <div className="expenses-panel-title">
          <span>{EXPENSE_CATEGORIES[selectedCategory].label} · {selectedSubcategory}</span>
          <div className="expenses-panel-tools">
            <span>{visibleRows.length} записей</span>
          </div>
        </div>
        {loading ? <div className="expenses-empty">Загрузка…</div> : <ExpensesTable rows={canViewPersonalDetails ? visibleRows : visibleRows.filter(row => row.category !== 'personal')} showCategory={!selectedCategory} onEdit={expense => { setEditingExpense(expense); setModalOpen(true); }} onDelete={handleDelete} deletingId={deletingId} />}
      </div>}
      {advanceOpen && <EmployeeAdvanceModal onClose={() => setAdvanceOpen(false)} onSaved={() => setRefreshKey(value => value + 1)} />}
      {modalOpen && <ExpenseModal initialCategory={selectedCategory} expense={editingExpense} userName={userName} sessionToken={sessionToken} allowPersonalCategory={canViewPersonalDetails} onClose={() => { setModalOpen(false); setEditingExpense(null); }} onSaved={handleSaved} />}
    </div>
  );
}
