import { useMemo, useState } from 'react';
import { AlertTriangle, BanknoteArrowDown, BanknoteArrowUp, Calculator, Check, Clock3, ReceiptText, RefreshCw, Truck, WalletCards, X } from 'lucide-react';
import { useB2BDriverPayouts, useB2BExpenses, useB2BOrders, B2B_QUERY_KEYS } from '../../hooks/useB2BData';
import { useB2BPaymentsQuery } from '../../hooks/useB2BPayments';
import { queryClient } from '../../services/queryClient';
import { updateB2BPaymentStatus } from '../../services/b2bDataService';
import type { B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord } from '../../services/b2bDataService';
import { formatB2BPaymentMethod, type B2BPaymentRecord } from '../../services/b2bPaymentService';
import { b2bCashierPeriodBounds, calculateB2BCashierSummary } from './b2bCashierCalculations';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const EMPTY_ORDERS: B2BOrderRecord[] = [];
const EMPTY_PAYMENTS: B2BPaymentRecord[] = [];
const EMPTY_PAYOUTS: B2BDriverPayoutRecord[] = [];
const EMPTY_EXPENSES: B2BExpenseRecord[] = [];
const money = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
const displayDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || '—';
};

interface B2BCashierProps {
  onOpenOrder?: (orderId: string) => void;
}

export default function B2BCashier({ onOpenOrder }: B2BCashierProps) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [reviewingPaymentId, setReviewingPaymentId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const ordersQuery = useB2BOrders();
  const paymentsQuery = useB2BPaymentsQuery();
  const payoutsQuery = useB2BDriverPayouts();
  const expensesQuery = useB2BExpenses();
  const orders = ordersQuery.data ?? EMPTY_ORDERS;
  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const payouts = payoutsQuery.data ?? EMPTY_PAYOUTS;
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES;
  const summary = useMemo(
    () => calculateB2BCashierSummary(orders, payments, payouts, expenses, { year, month }),
    [expenses, month, orders, payments, payouts, year],
  );
  const { end } = b2bCashierPeriodBounds({ year, month });
  const availableYears = useMemo(() => {
    const years = [
      ...orders.map(order => Number((order.departureDate || order.requestDate).match(/(\d{4})/)?.[1])),
      ...payments.map(payment => Number(payment.paymentDate.slice(0, 4))),
      ...payouts.map(payout => Number(payout.paymentDate.slice(0, 4))),
      ...expenses.map(expense => Number(expense.expenseDate.slice(0, 4))),
    ].filter(Number.isFinite);
    const min = Math.min(CURRENT_YEAR - 2, year, ...years);
    const max = Math.max(CURRENT_YEAR + 1, year, ...years);
    return Array.from({ length: max - min + 1 }, (_, index) => max - index);
  }, [expenses, orders, payments, payouts, year]);
  const isLoading = ordersQuery.isLoading || paymentsQuery.isLoading || payoutsQuery.isLoading || expensesQuery.isLoading;
  const loadError = ordersQuery.error || paymentsQuery.error || payoutsQuery.error || expensesQuery.error;

  const retry = () => void Promise.all([
    ordersQuery.refetch(), paymentsQuery.refetch(), payoutsQuery.refetch(), expensesQuery.refetch(),
  ]);

  const reviewPayment = async (id: string, status: 'confirmed' | 'rejected') => {
    setReviewingPaymentId(id);
    setReviewError('');
    try {
      await updateB2BPaymentStatus(id, status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.payments }),
        queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.expenses }),
      ]);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Не удалось изменить статус платежа.');
    } finally {
      setReviewingPaymentId(null);
    }
  };

  const clientKpis = [
    { label: 'Начислено клиентам', value: summary.clientAccrued, hint: 'За выбранный месяц', tone: 'neutral' },
    { label: 'Подтверждено поступлений', value: summary.confirmedReceived, hint: 'По дате платежа', tone: 'income' },
    { label: 'На проверке', value: summary.pendingReview, hint: `Текущая очередь на ${displayDate(end)}`, tone: 'pending' },
    { label: 'Должны нам', value: summary.outstandingReceivable, hint: `Остаток на ${displayDate(end)}`, tone: 'debt' },
    ...(summary.clientOverpayment > 0 ? [{ label: 'Переплата', value: summary.clientOverpayment, hint: `На ${displayDate(end)}`, tone: 'income' }] : []),
  ];
  const driverKpis = [
    { label: 'Начислено водителям', value: summary.driverAccrued, hint: 'По поездкам месяца', tone: 'neutral' },
    { label: 'Погашено обязательств, gross', value: summary.driverPaidGross, hint: 'По датам выплат', tone: 'neutral' },
    { label: 'Фактически выплачено, net', value: summary.driverPaidNet, hint: 'Реальное движение денег', tone: 'expense' },
    { label: 'Осталось оплатить', value: summary.driverRemaining, hint: `По текущим назначениям на ${displayDate(end)}`, tone: 'debt' },
  ];

  if (isLoading) return <div className="b2b-cashier-state"><RefreshCw className="spin" size={22} /><strong>Загрузка данных кассира…</strong></div>;
  if (loadError) return <div className="b2b-cashier-state error"><AlertTriangle size={22} /><strong>Не удалось загрузить данные B2B</strong><span>{loadError instanceof Error ? loadError.message : 'Попробуйте ещё раз.'}</span><button type="button" onClick={retry}>Повторить</button></div>;

  return <section className="b2b-cashier">
    <header className="b2b-cashier-head">
      <div><h2>Cashier</h2><p>Поступления, обязательства и реальные движения денег B2B</p></div>
      <div className="b2b-cashier-period">
        <label><span>Месяц</span><select value={month} onChange={event => setMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
        <label><span>Год</span><select value={year} onChange={event => setYear(Number(event.target.value))}>{availableYears.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </header>

    <section className="b2b-cashier-kpi-section">
      <div className="b2b-cashier-section-title"><span><BanknoteArrowDown size={17} /></span><div><h3>Клиенты</h3><p>Обороты за {MONTHS[month - 1].toLocaleLowerCase('ru-RU')} · задолженность на конец периода</p></div></div>
      <div className="b2b-cashier-kpis">{clientKpis.map(kpi => <article key={kpi.label} className={kpi.tone}><span>{kpi.label}</span><strong>{money(kpi.value)}</strong><small>{kpi.hint}</small></article>)}</div>
    </section>

    <section className="b2b-cashier-kpi-section">
      <div className="b2b-cashier-section-title"><span><Truck size={17} /></span><div><h3>Водители и расходы</h3><p>Gross погашает обязательство · net показывает фактическую выплату</p></div></div>
      <div className="b2b-cashier-kpis">{driverKpis.map(kpi => <article key={kpi.label} className={kpi.tone}><span>{kpi.label}</span><strong>{money(kpi.value)}</strong><small>{kpi.hint}</small></article>)}</div>
      <div className="b2b-cashier-secondary-kpis">
        <article><span><ReceiptText size={16} />Реальные прочие расходы B2B</span><strong>{money(summary.manualExpenses)}</strong><small>Только source=manual · фактическая сумма net</small>{summary.riskyManualExpenses.count > 0 && <em><AlertTriangle size={13} />{summary.riskyManualExpenses.count} ручн. записей «Водители/Налоги» на {money(summary.riskyManualExpenses.amount)} — возможен дубль</em>}</article>
        <article className="tax"><span><Calculator size={16} />Расчётный налог B2B</span><strong>{money(summary.calculatedTax)}</strong><small>Для управленческого учёта · не является фактическим списанием</small></article>
      </div>
    </section>

    <div className="b2b-cashier-workspace">
      <section className="b2b-cashier-panel">
        <header><div><h3><Clock3 size={17} />Поступления на проверке</h3><p>Текущие pending-платежи с датой до {displayDate(end)}</p></div><span>{summary.pendingPayments.length}</span></header>
        {reviewError && <div className="b2b-cashier-inline-error">{reviewError}</div>}
        <div className="b2b-cashier-table-wrap"><table><thead><tr><th>Заказ / клиент</th><th>Дата</th><th>Способ</th><th>Платёжка</th><th className="number">Сумма</th><th>Комментарий</th><th>Статус</th><th></th></tr></thead><tbody>{summary.pendingPayments.length ? summary.pendingPayments.map(payment => <tr key={payment.id}><td><button type="button" className="b2b-cashier-order-link" onClick={() => onOpenOrder?.(payment.orderId)}>{payment.orderNumber}</button><small>{payment.clientName}</small></td><td>{displayDate(payment.paymentDate)}</td><td>{formatB2BPaymentMethod(payment.method)}</td><td>{payment.paymentOrderNumber || '—'}</td><td className="number amount">{money(payment.amount)}</td><td title={payment.comment}>{payment.comment || '—'}</td><td><span className="b2b-cashier-status pending"><Clock3 size={12} />На проверке</span></td><td><div className="b2b-cashier-actions"><button type="button" className="approve" disabled={reviewingPaymentId === payment.id} onClick={() => void reviewPayment(payment.id, 'confirmed')} aria-label={`Подтвердить оплату ${payment.orderNumber}`}><Check size={14} />Подтвердить</button><button type="button" className="reject" disabled={reviewingPaymentId === payment.id} onClick={() => void reviewPayment(payment.id, 'rejected')} aria-label={`Отклонить оплату ${payment.orderNumber}`}><X size={14} />Отклонить</button></div></td></tr>) : <tr><td colSpan={8} className="empty">Поступлений на проверке нет</td></tr>}</tbody></table></div>
      </section>

      <section className="b2b-cashier-panel">
        <header><div><h3><Truck size={17} />К оплате водителям</h3><p>Read-only · по текущему assignment, без обнуления по статусу заказа</p></div><span>{summary.driverPayables.length}</span></header>
        <div className="b2b-cashier-table-wrap"><table><thead><tr><th>Заказ</th><th>Водитель</th><th>Дата поездки</th><th className="number">Начислено</th><th className="number">Оплачено gross</th><th className="number">Выплачено net</th><th className="number">Остаток</th></tr></thead><tbody>{summary.driverPayables.length ? summary.driverPayables.map(row => <tr key={row.orderId}><td><button type="button" className="b2b-cashier-order-link" onClick={() => onOpenOrder?.(row.orderId)}>{row.orderNumber}</button></td><td>{row.driverName}</td><td>{displayDate(row.tripDate)}</td><td className="number">{money(row.accrued)}</td><td className="number">{money(row.paidGross)}</td><td className="number">{money(row.paidNet)}</td><td className="number debt">{money(row.remaining)}</td></tr>) : <tr><td colSpan={7} className="empty">Обязательств к оплате на конец периода нет</td></tr>}</tbody></table></div>
      </section>
    </div>

    <section className="b2b-cashier-panel operations">
      <header><div><h3><WalletCards size={17} />Последние реальные операции</h3><p>Только подтверждённые поступления, выплаты водителям net и ручные расходы net</p></div><span>{summary.operations.length}</span></header>
      <div className="b2b-cashier-table-wrap"><table><thead><tr><th>Дата</th><th>Движение</th><th>Операция</th><th>Описание</th><th>Способ</th><th>Платёжка</th><th className="number">Сумма</th></tr></thead><tbody>{summary.operations.length ? summary.operations.slice(0, 15).map(operation => <tr key={operation.id}><td>{displayDate(operation.date)}</td><td><span className={`b2b-cashier-direction ${operation.direction}`}>{operation.direction === 'income' ? <BanknoteArrowDown size={12} /> : <BanknoteArrowUp size={12} />}{operation.direction === 'income' ? 'Поступление' : 'Расход'}</span></td><td>{operation.title}</td><td>{operation.orderId && onOpenOrder ? <button type="button" className="b2b-cashier-order-link" onClick={() => onOpenOrder(operation.orderId!)}>{operation.description}</button> : operation.description}</td><td>{formatB2BPaymentMethod(operation.method)}</td><td>{operation.paymentOrderNumber || '—'}</td><td className={`number operation-${operation.direction}`}>{operation.direction === 'income' ? '+' : '−'}{money(operation.amount)}</td></tr>) : <tr><td colSpan={7} className="empty">В выбранном месяце реальных операций нет</td></tr>}</tbody></table></div>
      {summary.operations.length > 15 && <div className="b2b-cashier-table-note">Показаны последние 15 из {summary.operations.length} операций выбранного месяца.</div>}
    </section>

    <p className="b2b-cashier-footnote"><AlertTriangle size={13} />Исторический статус pending/confirmed восстановить нельзя: в текущей модели нет confirmed_at, reviewed_by и истории проверки. Остатки рассчитаны по текущим статусам и датам операций.</p>
  </section>;
}
