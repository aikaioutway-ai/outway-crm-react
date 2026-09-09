import { useMemo, useState } from 'react';
import { AlertTriangle, BanknoteArrowDown, BanknoteArrowUp, Calculator, Check, Clock3, ReceiptText, RefreshCw, Truck, WalletCards, X } from 'lucide-react';
import { useB2BDriverPayouts, useB2BExpenses, useB2BOrders, B2B_QUERY_KEYS } from '../../hooks/useB2BData';
import { useB2BPaymentsQuery } from '../../hooks/useB2BPayments';
import { queryClient } from '../../services/queryClient';
import { updateB2BPaymentStatus } from '../../services/b2bDataService';
import type { B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord } from '../../services/b2bDataService';
import { B2B_LEGAL_ACCOUNT_TAX_RATE, formatB2BPaymentMethod, type B2BPaymentRecord } from '../../services/b2bPaymentService';
import { b2bCashierPeriodBounds, normalizeB2BCashierDate, calculateB2BCashierSummary } from './b2bCashierCalculations';

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
  const [detail, setDetail] = useState<string | null>(null);
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
  const { start, end } = b2bCashierPeriodBounds({ year, month });
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
    { label: 'Поступило за месяц', value: summary.confirmedReceived, hint: 'Подтверждённые платежи', tone: 'income' },
    { label: 'На проверке', value: summary.pendingReview, hint: 'Все ожидающие подтверждения', tone: 'pending' },
    { label: 'Общий долг клиентов', value: summary.outstandingReceivable, hint: 'На текущий момент · все заказы', tone: 'debt' },
    { label: 'Фактический баланс', value: summary.actualBalance, hint: 'Все поступления минус фактические расходы', tone: 'income' },
  ];
  const driverKpis = [
    { label: 'Начислено водителям', value: summary.driverAccrued, hint: 'За заказы выбранного месяца', tone: 'neutral' },
    { label: 'Уже оплачено', value: summary.periodDriverPaid, hint: 'По этим заказам · все даты выплат', tone: 'income' },
    { label: 'Осталось оплатить', value: summary.periodDriverRemaining, hint: 'По этим же заказам', tone: 'debt' },
  ];
  const inPeriod = (date: string) => normalizeB2BCashierDate(date) >= start && normalizeB2BCashierDate(date) <= end;
  type DetailRow = { id: string; orderId?: string; order: string; description: string; date: string; amount: number; payment?: B2BPaymentRecord };
  let detailRows: DetailRow[] = [];
  if (detail === 'Поступило за месяц' || detail === 'На проверке' || detail === 'Расчётный налог B2B') {
    detailRows = payments.filter(row => detail === 'На проверке' ? row.status === 'pending' : row.status === 'confirmed' && inPeriod(row.paymentDate) && (detail !== 'Расчётный налог B2B' || row.method === 'legal_account')).map(row => ({ id: row.id, orderId: row.orderId, order: row.orderNumber, description: row.clientName + ' · ' + formatB2BPaymentMethod(row.method) + (detail === 'Расчётный налог B2B' ? ` · ${money(row.amount)} × ${B2B_LEGAL_ACCOUNT_TAX_RATE * 100}%` : ''), date: row.paymentDate, amount: detail === 'Расчётный налог B2B' ? Math.round(row.amount * B2B_LEGAL_ACCOUNT_TAX_RATE * 100) / 100 : row.amount, payment: detail === 'На проверке' ? row : undefined }));
  } else if (detail === 'Общий долг клиентов') {
    detailRows = summary.clientDebts.map(row => ({ id: row.orderId, orderId: row.orderId, order: row.orderNumber, description: row.client, date: '', amount: row.remaining }));
  } else if (detail === 'Прочие расходы B2B') {
    detailRows = expenses.filter(row => row.source === 'manual' && inPeriod(row.expenseDate)).map(row => ({ id: row.id, orderId: orders.find(order => order.number === row.orderNumber)?.id, order: row.orderNumber || 'Без заказа', description: [row.purpose, row.comment, formatB2BPaymentMethod(row.method)].filter(Boolean).join(' · '), date: row.expenseDate, amount: row.amount }));
  } else if (detail === 'Фактический баланс') {
    detailRows = [
      ...payments.filter(row => row.status === 'confirmed').map(row => ({ id: `p-${row.id}`, orderId: row.orderId, order: row.orderNumber, description: row.clientName, date: row.paymentDate, amount: row.amount })),
      ...payouts.map(row => ({ id: `d-${row.id}`, orderId: row.orderId, order: orders.find(order => order.id === row.orderId)?.number || '', description: row.driverName, date: row.paymentDate, amount: -row.amount })),
      ...expenses.filter(row => row.source === 'manual').map(row => ({ id: `e-${row.id}`, orderId: orders.find(order => order.number === row.orderNumber)?.id, order: row.orderNumber || 'Без заказа', description: row.purpose, date: row.expenseDate, amount: -row.amount })),
      ...payments.filter(row => row.status === 'confirmed' && row.method === 'legal_account').map(row => ({ id: `t-${row.id}`, orderId: row.orderId, order: row.orderNumber, description: 'Налог 4% с выручки', date: row.paymentDate, amount: -Math.round(row.amount * B2B_LEGAL_ACCOUNT_TAX_RATE * 100) / 100 })),
    ];
  } else if (detail) {
    detailRows = orders.filter(row => row.status !== 'cancelled' && inPeriod(row.departureDate || row.requestDate)).map(row => {
      const accrued = row.driverTotal ?? (row.driverPricePerUnit ?? 0) * row.transportCount;
      const paid = payouts.filter(payout => payout.assignmentId === row.assignmentId).reduce((sum, payout) => sum + payout.amount, 0);
      return { id: row.id, orderId: row.id, order: row.number, description: row.driverName, date: row.departureDate || row.requestDate, amount: detail === 'Начислено водителям' ? accrued : detail === 'Уже оплачено' ? paid : Math.max(accrued - paid, 0) };
    });
  }
  const openOrder = (id?: string) => { if (id) { setDetail(null); onOpenOrder?.(id); } };

  if (isLoading) return <div className="b2b-cashier-state"><RefreshCw className="spin" size={22} /><strong>Загрузка данных кассира…</strong></div>;
  if (loadError) return <div className="b2b-cashier-state error"><AlertTriangle size={22} /><strong>Не удалось загрузить данные B2B</strong><span>{loadError instanceof Error ? loadError.message : 'Попробуйте ещё раз.'}</span><button type="button" onClick={retry}>Повторить</button></div>;

  return <section className="b2b-cashier">
    <header className="b2b-cashier-head">
      <div><h2>Cashier</h2><p>Поступления, обязательства и реальные движения денег B2B</p></div>
      <div className="b2b-cashier-period">
        <div className="b2b-cashier-months" aria-label="Месяц">{MONTHS.map((label, index) => <button type="button" key={label} title={label} aria-label={label} aria-pressed={month === index + 1} onClick={() => setMonth(index + 1)}>{index + 1}</button>)}</div>
        <label><span>Год</span><select value={year} onChange={event => setYear(Number(event.target.value))}>{availableYears.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </header>

    <section className="b2b-cashier-kpi-section">
      <div className="b2b-cashier-section-title"><span><BanknoteArrowDown size={17} /></span><div><h3>Клиенты</h3><p>Обороты за {MONTHS[month - 1].toLocaleLowerCase('ru-RU')} · общий долг на текущий момент</p></div></div>
      <div className="b2b-cashier-kpis">{clientKpis.map(kpi => <article key={kpi.label} className={kpi.tone} role="button" tabIndex={0} onClick={() => setDetail(kpi.label)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(kpi.label); } }}><span>{kpi.label}</span><strong>{money(kpi.value)}</strong><small>{kpi.hint}</small></article>)}</div>
    </section>

    <section className="b2b-cashier-kpi-section">
      <div className="b2b-cashier-section-title"><span><Truck size={17} /></span><div><h3>Водители и расходы</h3><p>Начисления и оплата по заказам выбранного месяца</p></div></div>
      <div className="b2b-cashier-kpis">{driverKpis.map(kpi => <article key={kpi.label} className={kpi.tone} role="button" tabIndex={0} onClick={() => setDetail(kpi.label)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(kpi.label); } }}><span>{kpi.label}</span><strong>{money(kpi.value)}</strong><small>{kpi.hint}</small></article>)}</div>
      <div className="b2b-cashier-secondary-kpis">
        <article role="button" tabIndex={0} onClick={() => setDetail('Прочие расходы B2B')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail('Прочие расходы B2B'); } }}><span><ReceiptText size={16} />Прочие расходы B2B</span><strong>{money(summary.manualExpenses)}</strong><small>Фактические прочие расходы за месяц</small>{summary.riskyManualExpenses.count > 0 && <em><AlertTriangle size={13} />{summary.riskyManualExpenses.count} ручн. записей «Водители/Налоги» на {money(summary.riskyManualExpenses.amount)} — возможен дубль</em>}</article>
        <article className="tax" role="button" tabIndex={0} onClick={() => setDetail('Расчётный налог B2B')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail('Расчётный налог B2B'); } }}><span><Calculator size={16} />Расчётный налог B2B</span><strong>{money(summary.calculatedTax)}</strong><small>Для управленческого учёта · не является фактическим списанием</small></article>
      </div>
    </section>

    <div className="b2b-cashier-workspace">
      <section className="b2b-cashier-panel">
        <header><div><h3><Clock3 size={17} />Долги клиентов</h3><p>Все непогашенные остатки · независимо от месяца</p></div><span>{summary.clientDebts.length}</span></header>
        <div className="b2b-cashier-table-wrap"><table><thead><tr><th>Заказ / клиент</th><th>Начислено</th><th>Оплачено</th><th>Остаток</th></tr></thead><tbody>{summary.clientDebts.map(row => <tr key={row.orderId} onClick={() => openOrder(row.orderId)}><td><button className="b2b-cashier-order-link" onClick={event => { event.stopPropagation(); openOrder(row.orderId); }}>{row.orderNumber}</button><small>{row.client}</small></td><td>{money(row.accrued)}</td><td>{money(row.paid)}</td><td className="debt">{money(row.remaining)}</td></tr>)}{!summary.clientDebts.length && <tr><td colSpan={4} className="empty">Долгов клиентов нет</td></tr>}</tbody></table></div>
      </section>

      <section className="b2b-cashier-panel">
        <header><div><h3><Truck size={17} />К оплате водителям</h3><p>Все неоплаченные остатки · независимо от месяца</p></div><span>{summary.driverPayables.length}</span></header>
        <div className="b2b-cashier-table-wrap"><table><thead><tr><th>Заказ</th><th>Водитель</th><th>Дата поездки</th><th className="number">Начислено</th><th className="number">Оплачено</th><th className="number">Остаток</th></tr></thead><tbody>{summary.driverPayables.length ? summary.driverPayables.map(row => <tr key={row.orderId} onClick={() => openOrder(row.orderId)}><td><button type="button" className="b2b-cashier-order-link" onClick={event => { event.stopPropagation(); openOrder(row.orderId); }}>{row.orderNumber}</button></td><td>{row.driverName}</td><td>{displayDate(row.tripDate)}</td><td className="number">{money(row.accrued)}</td><td className="number">{money(row.paidGross)}</td><td className="number debt">{money(row.remaining)}</td></tr>) : <tr><td colSpan={6} className="empty">Неоплаченных обязательств нет</td></tr>}</tbody></table></div>
      </section>
    </div>

    <section className="b2b-cashier-panel operations">
      <header><div><h3><WalletCards size={17} />Последние операции</h3><p>Подтверждённые поступления, налог с выручки, выплаты водителям и расходы</p></div><span>{summary.operations.length}</span></header>
      <div className="b2b-cashier-table-wrap"><table><thead><tr><th>Дата</th><th>Движение</th><th>Операция</th><th>Описание</th><th>Способ</th><th>Платёжка</th><th className="number">Сумма</th></tr></thead><tbody>{summary.operations.length ? summary.operations.slice(0, 15).map(operation => <tr key={operation.id} onClick={() => openOrder(operation.orderId)}><td>{displayDate(operation.date)}</td><td><span className={`b2b-cashier-direction ${operation.direction}`}>{operation.direction === 'income' ? <BanknoteArrowDown size={12} /> : <BanknoteArrowUp size={12} />}{operation.direction === 'income' ? 'Поступление' : 'Расход'}</span></td><td>{operation.title}</td><td>{operation.orderId && onOpenOrder ? <button type="button" className="b2b-cashier-order-link" onClick={event => { event.stopPropagation(); openOrder(operation.orderId); }}>{operation.description}</button> : operation.description}</td><td>{formatB2BPaymentMethod(operation.method)}</td><td>{operation.paymentOrderNumber || '—'}</td><td className={`number operation-${operation.direction}`}>{operation.direction === 'income' ? '+' : '−'}{money(operation.amount)}</td></tr>) : <tr><td colSpan={7} className="empty">В выбранном месяце реальных операций нет</td></tr>}</tbody></table></div>
      {summary.operations.length > 15 && <div className="b2b-cashier-table-note">Показаны последние 15 из {summary.operations.length} операций выбранного месяца.</div>}
    </section>

    {detail && <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setDetail(null); }} onKeyDown={event => { if (event.key === 'Escape') setDetail(null); }}>
      <article className="b2b-finance-month-card" role="dialog" aria-modal="true" aria-label={detail}>
        <header><h3>{detail}</h3><button type="button" autoFocus onClick={() => setDetail(null)} aria-label="Закрыть"><X size={20} /></button></header>
        {reviewError && <p role="alert">{reviewError}</p>}
        <div className="b2b-cashier-table-wrap"><table><thead><tr><th>Заказ</th><th>Описание</th><th>Дата</th><th>Сумма</th>{detail === 'На проверке' && <th>Проверка</th>}</tr></thead><tbody>{detailRows.map(row => <tr key={row.id} onClick={() => openOrder(row.orderId)}><td>{row.orderId ? <button className="b2b-cashier-order-link" onClick={event => { event.stopPropagation(); openOrder(row.orderId); }}>{row.order}</button> : row.order}</td><td>{row.description}</td><td>{displayDate(row.date)}</td><td>{money(row.amount)}</td>{row.payment && <td onClick={event => event.stopPropagation()}><div className="b2b-cashier-actions"><button disabled={reviewingPaymentId === row.id} onClick={() => void reviewPayment(row.id, 'confirmed')}><Check size={14} />Подтвердить</button><button disabled={reviewingPaymentId === row.id} onClick={() => void reviewPayment(row.id, 'rejected')}><X size={14} />Отклонить</button></div></td>}</tr>)}{!detailRows.length && <tr><td colSpan={detail === 'На проверке' ? 5 : 4}>Нет операций</td></tr>}</tbody><tfoot><tr><td colSpan={3}>Итого</td><td>{money(detailRows.reduce((sum, row) => sum + row.amount, 0))}</td>{detail === 'На проверке' && <td />}</tr></tfoot></table></div>
      </article>
    </div>}
  </section>;
}
