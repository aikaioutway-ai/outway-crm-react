import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { canAccessFinanceExpenses } from '../../core/bars/Sidebar';
import { loadExpenseRows, periodBounds } from '../../modules/costs/expenseRows';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_KEYS, ExpenseCategory, ExpenseRecord } from '../../modules/costs/expenseTypes';
import { CASHIER_PERIODS, currentCashierPeriodKey } from '../../modules/families/constants';
import { compactMoney } from '../../modules/families/familiesRowHelpers';
import { AuthenticatedUser } from '../../services/employeeService';
import { money } from '../../utils/pricing';
import { Screen, useNavPosition } from '../nav';
import { Badge, Chips, Empty, ErrorBox, formatDate, InfoRow, Kpi, Sheet, Skeletons, useIncremental } from '../ui';

const METHOD_LABEL: Record<string, string> = { cash: 'Наличные', cashless: 'Безналичные' };

function ExpenseCard({ row, onClick }: { row: ExpenseRecord; onClick: () => void }) {
  const category = EXPENSE_CATEGORIES[row.category];
  return (
    <button type="button" className="m-card" onClick={onClick}>
      <div className="m-card-row" style={{ alignItems: 'flex-start' }}>
        <div className="m-card-main">
          <div className="m-card-title">{row.name || row.subcategory || 'Расход'}</div>
          <div className="m-card-sub">{[formatDate(row.expenseDate), METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="m-card-end" style={{ fontSize: 16, fontWeight: 800 }}>{money(row.amount)}</div>
      </div>
      <div className="m-card-meta">
        {category && <Badge tone={{ bg: category.soft, color: category.color }}>{category.label}</Badge>}
        {row.subcategory && <Badge>{row.subcategory}</Badge>}
        {row.source && row.source !== 'manual' && <Badge tone={{ bg: '#EDF0FA', color: '#5267A8' }}>Авто</Badge>}
      </div>
    </button>
  );
}

function ExpenseList({ rows, onOpen }: { rows: ExpenseRecord[]; onOpen: (row: ExpenseRecord) => void }) {
  const [visible, sentinelRef] = useIncremental(rows);
  if (!rows.length) return <Empty>Расходов за этот месяц нет</Empty>;
  return (
    <div className="m-list">
      {visible.map(row => <ExpenseCard key={row.id} row={row} onClick={() => onOpen(row)} />)}
      <div ref={sentinelRef} className="m-more" />
    </div>
  );
}

export default function FinanceSection({ user }: { user: AuthenticatedUser }) {
  const canSeeExpenses = canAccessFinanceExpenses(user.role);
  const canViewPersonal = user.role === 'admin' || user.role === 'gen_director';
  const [periodKey, setPeriodKey] = useState(currentCashierPeriodKey);
  const [category, setCategory] = useState<'ALL' | ExpenseCategory>('ALL');
  const nav = useNavPosition();

  const periodIndex = Math.max(0, CASHIER_PERIODS.findIndex(period => period.key === periodKey));
  const period = CASHIER_PERIODS[periodIndex];
  const bounds = periodBounds(period.month - 1, period.year);

  const expenses = useQuery({
    queryKey: ['mobileExpenses', period.key, user.sessionToken],
    queryFn: () => loadExpenseRows(bounds, [period], user.sessionToken),
    enabled: canSeeExpenses,
    staleTime: 60_000,
  });

  const accessible = useMemo(
    () => (expenses.data ?? []).filter(row => canViewPersonal || row.category !== 'personal'),
    [expenses.data, canViewPersonal],
  );
  const visible = useMemo(
    () => (category === 'ALL' ? accessible : accessible.filter(row => row.category === category)),
    [accessible, category],
  );
  const categories = EXPENSE_CATEGORY_KEYS.filter(key => canViewPersonal || key !== 'personal');
  const opened: ExpenseRecord | null = nav.sheet?.kind === 'expense'
    ? accessible.find(row => row.id === (nav.sheet as { expenseId: string }).expenseId) ?? null
    : null;
  const total = visible.reduce((sum, row) => sum + row.amount, 0);

  if (!canSeeExpenses) {
    return (
      <Screen pageKey="finance:none" title="Финансы" subtitle={user.name}>
        <div className="m-note">Табель и зарплата пока доступны только в полной версии на компьютере.</div>
      </Screen>
    );
  }

  return (
    <>
      <Screen pageKey="finance:expenses" title="Финансы" subtitle="Расходы">
        <div className="m-month">
          <button type="button" className="m-icon-btn" aria-label="Предыдущий месяц" disabled={periodIndex === 0} onClick={() => setPeriodKey(CASHIER_PERIODS[periodIndex - 1].key)}>
            <ChevronLeft size={20} />
          </button>
          <div className="m-month-label">{period.label}</div>
          <button type="button" className="m-icon-btn" aria-label="Следующий месяц" disabled={periodIndex === CASHIER_PERIODS.length - 1} onClick={() => setPeriodKey(CASHIER_PERIODS[periodIndex + 1].key)}>
            <ChevronRight size={20} />
          </button>
        </div>
        {expenses.error && <ErrorBox>{expenses.error instanceof Error ? expenses.error.message : 'Не удалось загрузить расходы'}</ErrorBox>}
        {expenses.isLoading ? <Skeletons /> : (
          <>
            <div className="m-kpis">
              <Kpi label={category === 'ALL' ? 'Всего расходов' : EXPENSE_CATEGORIES[category].label} value={`${compactMoney(total)} сом`} color="#B3261E" />
              <Kpi label="Записей" value={visible.length} />
            </div>
            <Chips
              value={category}
              onChange={setCategory}
              options={[
                { value: 'ALL' as const, label: 'Все' },
                ...categories.map(key => ({ value: key, label: EXPENSE_CATEGORIES[key].label })),
              ]}
            />
            <ExpenseList rows={visible} onOpen={row => nav.push({ kind: 'expense', expenseId: row.id, sheet: true })} />
            <div className="m-note">Добавление расходов, табель и зарплата — в полной версии на компьютере.</div>
          </>
        )}
      </Screen>
      {opened && (
        <Sheet title={opened.name || 'Расход'} onClose={nav.back}>
          <div className="m-info">
            <InfoRow label="Сумма" value={money(opened.amount)} />
            <InfoRow label="Категория" value={[EXPENSE_CATEGORIES[opened.category]?.label, opened.subcategory].filter(Boolean).join(' · ')} />
            <InfoRow label="Дата" value={formatDate(opened.expenseDate)} />
            <InfoRow label="Оплата" value={[METHOD_LABEL[opened.paymentMethod] ?? opened.paymentMethod, opened.paymentOrderNumber ? `п/п ${opened.paymentOrderNumber}` : ''].filter(Boolean).join(' · ')} />
            {opened.quantity > 1 && <InfoRow label="Количество × цена" value={`${opened.quantity} × ${money(opened.unitPrice)}`} />}
            {opened.comment && <InfoRow label="Комментарий" value={opened.comment} />}
            {opened.createdBy && <InfoRow label="Добавил" value={opened.createdBy} />}
          </div>
        </Sheet>
      )}
    </>
  );
}
