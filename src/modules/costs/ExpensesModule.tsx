import { withSchoolColumn } from '../../core/tables/withSchoolColumn';
import { EMPLOYEE_DEPARTMENTS } from '../employees/employeeDepartments';
import { SCHOOL_TABS, isSchoolVisible } from '../families/constants';
import { currentSchoolYear, salaryExpensePeriods } from './salaryExpensePeriods';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, List, Search, Building2, Bus, CircleUserRound, Route, School, ReceiptText, RotateCcw, Gift, Banknote, LockKeyhole, WalletCards, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteExpense, updateExpense } from '../../services/expenseService';
import { ADVANCE_EDITABLE_FIELDS, deleteAdvanceExpense, updateAdvanceExpenseCell } from '../../services/advanceExpenseService';
import { loadExpenseRows, periodBounds } from './expenseRows';
import EmployeeAdvanceModal from './EmployeeAdvanceModal';
import { UserRole } from '../../types';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import { CASHIER_PERIODS, currentCashierPeriodKey } from '../families/constants';
import {
  isPayrollExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_KEYS,
  ExpenseCategory,
  ExpenseRecord,
} from './expenseTypes';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import DataTable, { ColumnDef } from '../../core/tables/DataTable';
import './ExpensesModule.css';

interface ExpensesModuleProps { columnsOpen?: boolean; onColumnsOpenChange?: (open: boolean) => void; userName?: string; userRole?: UserRole; sessionToken?: string;
  toolbarContent?: React.ReactNode;
  onOpenSalary?: (scope:'school'|'office')=>void;
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

const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}`;
const displayDate = (date: string) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU') : '—';

export function ExpensesTable({ rows, showCategory, onEdit, onDelete, deletingId, onCellSave, allowPersonal, toolbar, columnsOpen, onColumnsOpenChange, settingsKey }: {
  rows: ExpenseRecord[];
  showCategory: boolean;
  onEdit: (expense: ExpenseRecord) => void;
  onDelete: (expense: ExpenseRecord) => void;
  deletingId: string | null;
  onCellSave: (row: ExpenseRecord, key: string, value: string) => Promise<boolean>;
  allowPersonal: boolean;
  toolbar: React.ReactNode;
  columnsOpen?: boolean;
  onColumnsOpenChange?: (open: boolean) => void;
  settingsKey: string;
}) {
  const columns: ColumnDef<ExpenseRecord>[] = [
    { key: 'name', label: 'Наименование расхода', type: 'text', width: 230 },
    ...(showCategory ? [{ key: 'category', label: 'Категория', type: 'select' as const, editOptions: EXPENSE_CATEGORY_KEYS.filter(key => allowPersonal || key !== 'personal').map(value => ({value, label: EXPENSE_CATEGORIES[value].label})), render: (_value: unknown, row: ExpenseRecord) => EXPENSE_CATEGORIES[row.category].label }] : []),
    { key: 'subcategory', label: 'Подкатегория', type: 'select', editOptions: Array.from(new Set(Object.values(EXPENSE_CATEGORIES).flatMap(category => category.subcategories))).map(value => ({value,label:value})) },
    { key: 'schoolKey', label: 'Школа', type: 'select', editOptions: SCHOOL_TABS.filter(school => school.key !== 'ALL' && isSchoolVisible(school.key)).map(school => ({value:school.key,label:school.label})), render: (_value, row) => SCHOOL_TABS.find(school => school.key === row.schoolKey)?.label ?? row.schoolKey ?? '—' },
    { key: 'departmentKey', label: 'Отдел', type: 'select', editOptions: EMPLOYEE_DEPARTMENTS.map(department => ({value:department.key,label:department.label})), render: (_value, row) => EMPLOYEE_DEPARTMENTS.find(department => department.key === row.departmentKey)?.label ?? row.departmentKey ?? '—' },
    { key: 'salaryPeriodKey', label: 'Период зарплаты', type: 'select', editOptions: salaryExpensePeriods(currentSchoolYear()).map(period => ({value:period.key,label:period.label})) },
    { key: 'unitPrice', label: 'Цена', type: 'currency', render: value => money(Number(value)) },
    { key: 'quantity', label: 'Кол-во', type: 'number' },
    { key: 'amount', label: 'Сумма', type: 'currency', render: value => <strong className="finance-amount">{money(Number(value))}</strong> },
    { key: 'expenseDate', label: 'Дата', type: 'date', render: value => displayDate(value) },
    { key: 'paymentMethod', label: 'Оплата', type: 'select', editOptions: [{value:'cash',label:'Наличные'},{value:'cashless',label:'АйКай Мбанк'}], render: (_value, row) => row.paymentMethod === 'cash' ? 'Наличные' : 'АйКай Мбанк' },
    { key: 'source', label: 'Источник', type: 'text', getValue: row => row.source === 'salary' ? 'Из зарплаты' : row.source === 'advance' ? 'Из аванса' : 'Ручной расход' },
    { key: 'paymentOrderNumber', label: '№ платёжного поручения', type: 'text' },
    { key: 'comment', label: 'Комментарий', type: 'text', width: 250 },
    { key: 'actions', label: 'Действия', type: 'text', sortable: false, filterable: false, render: (_value, row) => row.source === 'manual' || row.source === 'advance' ? (
      <div className="expense-row-actions">
        <button type="button" onClick={() => onEdit(row)} aria-label={`Редактировать ${row.name}`}><Pencil size={14} /></button>
        <button type="button" className="danger" onClick={() => onDelete(row)} disabled={deletingId === row.id} aria-label={`Удалить ${row.name}`}><Trash2 size={14} /></button>
      </div>
    ) : <span title="Системная выплата редактируется в разделе «Зарплата»"><LockKeyhole size={14} /></span> },
  ];
  return <DataTable<ExpenseRecord> storageKey={settingsKey} showProperties={columnsOpen} onShowPropertiesChange={onColumnsOpenChange} columns={withSchoolColumn(columns.map(column => ({...column, width: column.width ?? (column.key === 'subcategory' ? 170 : 130), visible: !['schoolKey','departmentKey','salaryPeriodKey','source'].includes(column.key), editable: !['source','actions'].includes(column.key)})), row => SCHOOL_TABS.find(school => school.key === row.schoolKey)?.label ?? row.schoolKey ?? '')} toolbarExtra={toolbar} onCellSave={onCellSave} canEditCell={(row, key) => row.source === 'advance' ? ADVANCE_EDITABLE_FIELDS.includes(key) : row.source === 'manual' && (key !== 'schoolKey' || row.category === 'school' && row.subcategory === 'ЗП') && (key !== 'departmentKey' || row.category === 'office' && row.subcategory === 'ЗП') && (key !== 'salaryPeriodKey' || row.subcategory === 'ЗП')} data={rows} rowKey="id" emptyText="За выбранный период расходов пока нет" canManageProperties={false} />;
}

export function ExpenseModal({ initialCategory, expense, userName, sessionToken, allowPersonalCategory, onClose, onSaved, onPaymentsSaved }: {
  initialCategory:ExpenseCategory|null; expense?:ExpenseRecord|null; userName?:string;sessionToken?:string;allowPersonalCategory:boolean;onClose:()=>void;onSaved:(row:ExpenseRecord)=>void;onPaymentsSaved?:()=>void;
}) {
  return <EmployeeAdvanceModal initialPaymentType="expense" initialCategory={initialCategory==='personal' && !allowPersonalCategory?'school':initialCategory ?? 'school'} expense={expense ?? undefined} userName={userName} sessionToken={sessionToken} allowPersonalCategory={allowPersonalCategory} onClose={onClose} onSaved={()=>onPaymentsSaved?.()} onRecordSaved={onSaved}/>;
}

export default function ExpensesModule({ userName, userRole, sessionToken, toolbarContent, columnsOpen, onColumnsOpenChange, selectedCategory, onCategoryChange: setSelectedCategory, selectedSubcategory, onSubcategoryChange: setSelectedSubcategory, onOpenSalary }: ExpensesModuleProps) {
  const [tableOpen, setTableOpen] = useState(false);
  const [localColumnsOpen, setLocalColumnsOpen] = useState(false);
  const propertiesOpen = columnsOpen ?? localColumnsOpen;
  const changePropertiesOpen = onColumnsOpenChange ?? setLocalColumnsOpen;
  const [search, setSearch] = useState('');
  useEffect(() => { if (propertiesOpen) setTableOpen(true); }, [propertiesOpen]);
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
  const accessibleRows = useMemo(() => rows.filter(row=>(!row.schoolKey || isSchoolVisible(row.schoolKey)) && (canViewPersonalDetails || row.category!=='personal')), [rows, canViewPersonalDetails]);
  useEffect(() => {
    if (selectedCategory === 'personal' && !canViewPersonalDetails) {
      setSelectedCategory(null);
      setSelectedSubcategory('ALL');
    }
  }, [selectedCategory, canViewPersonalDetails, setSelectedCategory, setSelectedSubcategory]);
  const categoryRows = selectedCategory ? accessibleRows.filter(row => row.category === selectedCategory && !isPayrollExpense(row)) : accessibleRows;
  const subcategoryTotals = useMemo(() => {
    if (!selectedCategory) return [];
    const subcategories = Array.from(new Set([
      ...EXPENSE_CATEGORIES[selectedCategory].subcategories.filter(subcategory=>!isPayrollExpense({category:selectedCategory,subcategory})),
      ...categoryRows.map(row => row.subcategory),
    ]));
    return subcategories.map(subcategory => {
      const matching = categoryRows.filter(row => row.subcategory === subcategory);
      return { subcategory, amount: matching.reduce((sum, row) => sum + row.amount, 0), count: matching.length };
    });
  }, [categoryRows, selectedCategory]);
  const tableRows = selectedCategory ? accessibleRows.filter(row => row.category === selectedCategory) : accessibleRows;
  const scopedRows = selectedSubcategory === 'ALL' ? tableRows : tableRows.filter(row => row.subcategory === selectedSubcategory);
  const visibleRows = scopedRows.filter(row => !search.trim() || [row.name, row.subcategory, EXPENSE_CATEGORIES[row.category].label, row.comment, row.paymentOrderNumber].some(value => value?.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))));

  useEffect(() => { setTableOpen(false); setSearch(''); }, [selectedCategory]);

  useEffect(() => {
    setSelectedSubcategory('ALL');
  }, [selectedCategory, periodKey, setSelectedSubcategory]);

  const overviewRows = (selectedCategory
    ? subcategoryTotals.map(item => ({ key: item.subcategory, category: selectedCategory, label: item.subcategory }))
    : [...EXPENSE_CATEGORY_KEYS.filter(key => canViewPersonalDetails || key !== 'personal').map(key => ({ key, category: key, label: EXPENSE_CATEGORIES[key].label })), {key:'salary-office',category:'office' as const,label:'ЗП офис'}, {key:'salary-school',category:'school' as const,label:'ЗП школа'}]
  ).map(item => {
    const matching = categoryRows.filter(row => selectedCategory ? row.subcategory === item.key : row.category === item.category && (item.key.startsWith('salary-') ? isPayrollExpense(row) : !isPayrollExpense(row)));
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
        ? [{ ...expense, source: expense.source ?? 'manual' as const }, ...withoutPrevious].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt))
        : withoutPrevious;
    });
  };

  const saveExpenseCell = async (row: ExpenseRecord, key: string, value: string): Promise<boolean> => {
    if (row.source === 'advance' && accessibleRows.some(item => item.id === row.id)) {
      try {
        const saved = await updateAdvanceExpenseCell(row, key, value);
        setRows(current => current.map(item => item.id === row.id ? saved : item).filter(item => item.expenseDate >= bounds.first && item.expenseDate <= bounds.last));
        return true;
      } catch (reason) { alert(reason instanceof Error ? reason.message : 'Не удалось сохранить аванс'); return false; }
    }
    if (row.source !== 'manual' || !accessibleRows.some(item => item.id === row.id)) return false;
    const next = { ...row, [key]: ['unitPrice', 'quantity', 'amount'].includes(key) ? Number(value) : value };
    if (key === 'category') {
      if (!EXPENSE_CATEGORY_KEYS.includes(next.category) || next.category === 'personal' && !canViewPersonalDetails) return false;
      next.subcategory = EXPENSE_CATEGORIES[next.category].subcategories.find(item => item !== 'ЗП')!;
      next.schoolKey = undefined; next.departmentKey = undefined; next.salaryPeriodKey = undefined;
      next.driverId = undefined; next.employeeId = undefined; next.transferId = undefined;
    }
    if (!EXPENSE_CATEGORIES[next.category].subcategories.includes(next.subcategory)) { alert('Выберите подкатегорию этой категории расходов'); return false; }
    if (key === 'subcategory' && next.subcategory === 'ЗП' && (!next.salaryPeriodKey || !(next.category === 'school' ? next.schoolKey : next.departmentKey))) {
      setEditingExpense(next); setModalOpen(true); return false;
    }
    if (key === 'subcategory' && next.subcategory !== 'ЗП') {
      next.schoolKey = undefined; next.departmentKey = undefined; next.salaryPeriodKey = undefined;
      next.driverId = undefined; next.employeeId = undefined; next.transferId = undefined;
    }
    if (key === 'amount') next.unitPrice = next.amount / next.quantity;
    next.amount = next.unitPrice * next.quantity;
    if (!next.name.trim() || !Number.isFinite(next.amount) || next.amount <= 0 || next.quantity <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(next.expenseDate) || Number.isNaN(Date.parse(next.expenseDate))) {
      alert('Проверьте наименование, положительную сумму, количество и дату в формате ГГГГ-ММ-ДД'); return false;
    }
    try {
      const saved = await updateExpense(row.id, next, sessionToken);
      setRows(current => current.map(item => item.id === row.id ? {...saved, source:'manual' as const} : item).filter(item => item.expenseDate >= bounds.first && item.expenseDate <= bounds.last));
      return true;
    } catch (reason) { alert(reason instanceof Error ? reason.message : 'Не удалось сохранить расход'); return false; }
  };

  const handleDelete = async (expense: ExpenseRecord) => {
    if (!window.confirm(`Удалить расход «${expense.name}» на сумму ${money(expense.amount)}?`)) return;
    setDeletingId(expense.id);
    try {
      if (expense.source === 'advance') await deleteAdvanceExpense(expense);
      else await deleteExpense(expense.id, sessionToken);
      setRows(current => current.filter(row => row.id !== expense.id));
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : 'Не удалось удалить расход');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="expenses-module finance-workspace">
      <div className="expenses-overview">
        <div className={`expenses-toolbar${toolbarContent ? '' : ' expenses-toolbar-inner'}`}>
          {toolbarContent}
          <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} periods={CASHIER_PERIODS} />
          <div className="expenses-create-actions"><button className="expenses-add" title="Новый расход" aria-label="Новый расход" onClick={() => { setEditingExpense(null); setModalOpen(true); }}><Plus size={17} /></button><button className="expenses-add" title="Новая выплата" aria-label="Новая выплата" onClick={() => setAdvanceOpen(true)}><WalletCards size={17} aria-hidden="true" /></button><button type="button" className="expenses-all-records" title={selectedCategory ? 'Все расходы категории' : 'Все расходы'} aria-label={selectedCategory ? 'Все расходы категории' : 'Все расходы'} onClick={() => setTableOpen(true)}><List size={17} aria-hidden="true"/></button></div>
        </div>

        {loadError && <div className="expenses-load-error">Не удалось загрузить данные: {loadError}. Проверьте, что миграция расходов применена.</div>}

      </div>

      <section className="finance-summary" aria-label="Итоги расходов за период">
        <div className="finance-summary-total"><span>Расходы за период</span><strong>{loading ? '…' : money(scopedRows.reduce((sum,row)=>sum+row.amount,0))}<small> сом</small></strong></div>
        <div><span>Безналичные</span><strong>{loading ? '…' : money(scopedRows.filter(row=>row.paymentMethod==='cashless').reduce((sum,row)=>sum+row.amount,0))}</strong></div>
        <div><span>Наличные</span><strong>{loading ? '…' : money(scopedRows.filter(row=>row.paymentMethod==='cash').reduce((sum,row)=>sum+row.amount,0))}</strong></div>
        <div className="finance-summary-count"><span>Записей</span><strong>{loading ? '…' : scopedRows.length}</strong></div>
      </section>
      {!tableOpen && selectedSubcategory === 'ALL' && <section className="finance-categories-card" aria-label="Категории расходов">

        {loading ? <div className="expenses-empty">Загрузка…</div> : <SchoolDashboardTable
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
          if(key.startsWith('salary-')){onOpenSalary?.(key==='salary-office'?'office':'school');return;}
          if (selectedCategory && key==='ЗП' && (selectedCategory==='school' || selectedCategory==='office')){onOpenSalary?.(selectedCategory);return;}
          if (selectedCategory) setSelectedSubcategory(key);
          else if (key !== 'personal' || canViewPersonalDetails) { setSelectedCategory(key as ExpenseCategory); setSelectedSubcategory('ALL'); }
        }}
      />}</section>}

      {(tableOpen || selectedSubcategory !== 'ALL') && <div className="expenses-panel">
        {loading ? <div className="expenses-empty">Загрузка…</div> : <ExpensesTable rows={canViewPersonalDetails ? visibleRows : visibleRows.filter(row => row.category !== 'personal')} showCategory={!selectedCategory} allowPersonal={canViewPersonalDetails} columnsOpen={propertiesOpen} onColumnsOpenChange={changePropertiesOpen} settingsKey={`finance_expenses_v2_${userName || userRole || 'user'}_${selectedCategory || 'all'}`} onCellSave={saveExpenseCell} toolbar={<div className="expenses-table-heading"><button type="button" className="expenses-view-button expenses-view-button--back" onClick={() => {setTableOpen(false);setSelectedSubcategory('ALL');}}><ArrowLeft size={15} />К сводке</button><strong>{selectedCategory ? EXPENSE_CATEGORIES[selectedCategory].label : 'Все расходы'}{selectedSubcategory !== 'ALL' ? ` · ${selectedSubcategory}` : ''}</strong><span className="expenses-record-count">{visibleRows.length} записей</span><label className="finance-search"><Search size={15}/><input aria-label="Поиск расходов" placeholder="Поиск по расходам…" value={search} onChange={event=>setSearch(event.target.value)}/></label></div>} onEdit={expense => { setEditingExpense(expense); setModalOpen(true); }} onDelete={handleDelete} deletingId={deletingId} />}
      </div>}
      {advanceOpen && <EmployeeAdvanceModal sessionToken={sessionToken} allowPersonalCategory={canViewPersonalDetails} userName={userName} onClose={() => setAdvanceOpen(false)} onSaved={() => setRefreshKey(value => value + 1)} />}
      {modalOpen && <ExpenseModal initialCategory={selectedCategory} expense={editingExpense} userName={userName} sessionToken={sessionToken} allowPersonalCategory={canViewPersonalDetails} onClose={() => { setModalOpen(false); setEditingExpense(null); }} onSaved={handleSaved} onPaymentsSaved={()=>{setRefreshKey(value=>value+1);setModalOpen(false);setEditingExpense(null);}} />}
    </div>
  );
}
