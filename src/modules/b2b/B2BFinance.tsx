import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, BanknoteArrowDown, BanknoteArrowUp, CircleDollarSign, Search, ShoppingCart, WalletCards, X } from 'lucide-react';
import { useB2BClients, useB2BDriverPayouts, useB2BExpenses, useB2BOrders } from '../../hooks/useB2BData';
import useB2BPayments from '../../hooks/useB2BPayments';
import type { B2BExpenseRecord } from '../../services/b2bDataService';
import { B2B_ORDER_STATUSES } from './B2BOrders';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const money = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
const percent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

type SortDirection = 'asc' | 'desc';
type FinanceSortKey = 'month' | 'number' | 'client' | 'sold' | 'received' | 'costs' | 'balance' | 'receivable' | 'payable' | 'margin';

function isoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function expenseCategory(value: string) {
  const normalized = (value || 'other').toLocaleLowerCase('ru-RU');
  return normalized === 'fuel' || normalized === 'maintenance' ? 'other' : normalized;
}

function splitExpense(rows: B2BExpenseRecord[]) {
  return rows.reduce((totals, expense) => {
    const category = expenseCategory(expense.category);
    if (category === 'driver_payments') totals.driverPayments += expense.amount;
    else totals.other += expense.amount;
    return totals;
  }, { driverPayments: 0, other: 0 });
}

interface B2BFinanceProps {
  onOpenOrder?: (orderId: string) => void;
}

export default function B2BFinance({ onOpenOrder }: B2BFinanceProps) {
  const { data: orders = [], isLoading } = useB2BOrders();
  const { data: expenses = [] } = useB2BExpenses();
  const { data: payouts = [] } = useB2BDriverPayouts();
  const { data: clients = [] } = useB2BClients();
  const payments = useB2BPayments();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [clientId, setClientId] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedMonthNumber, setSelectedMonthNumber] = useState<number | null>(null);
  const [monthSort, setMonthSort] = useState<{ key: FinanceSortKey; direction: SortDirection }>({ key: 'month', direction: 'asc' });
  const [orderSort, setOrderSort] = useState<{ key: FinanceSortKey; direction: SortDirection }>({ key: 'number', direction: 'asc' });

  const years = useMemo(() => {
    const storedYears = orders.map(order => Number(isoDate(order.departureDate || order.requestDate).slice(0, 4))).filter(Number.isFinite);
    const min = Math.min(currentYear - 2, year, ...storedYears);
    const max = Math.max(currentYear + 2, year, ...storedYears);
    return Array.from({ length: max - min + 1 }, (_, index) => max - index);
  }, [currentYear, orders, year]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return orders.filter(order => {
      if (order.status === 'cancelled') return false;
      if (clientId !== 'all' && order.clientId !== clientId) return false;
      if (status !== 'all' && order.status !== status) return false;
      if (query && ![order.number, order.client, order.routeFrom, order.routeTo, order.driverName].some(value => value.toLocaleLowerCase('ru-RU').includes(query))) return false;
      return Number(isoDate(order.departureDate || order.requestDate).slice(0, 4)) === year;
    });
  }, [clientId, orders, search, status, year]);

  const orderRows = useMemo(() => {
    const validDriverPaymentIds = new Set(payouts.map(payout => payout.id));
    return filteredOrders.map(order => {
    const recordedCosts = splitExpense(expenses.filter(expense =>
      expense.orderNumber === order.number &&
      !(expense.source === 'driver_payment' && expense.sourceId && !validDriverPaymentIds.has(expense.sourceId)),
    ));
    const confirmedPayments = payments.filter(payment => payment.status === 'confirmed' && payment.orderId === order.id).reduce((sum, payment) => sum + payment.amount, 0);
    const received = Math.min(order.total, order.paid + confirmedPayments);
    const paidToDriver = payouts.filter(payout => payout.orderId === order.id).reduce((sum, payout) => sum + payout.amount, 0);
    const driverAccrued = order.driverTotal ?? (order.driverPricePerUnit ?? 0) * order.transportCount;
    const costs = Math.max(driverAccrued, recordedCosts.driverPayments) + recordedCosts.other;
    const balance = order.total - costs;
    return {
      order,
      month: Number(isoDate(order.departureDate || order.requestDate).slice(5, 7)),
      sold: order.total,
      received,
      costs,
      balance,
      receivable: Math.max(0, order.total - received),
      payable: order.status === 'success' ? 0 : Math.max(0, driverAccrued - paidToDriver),
      margin: order.total > 0 ? (balance / order.total) * 100 : 0,
    };
  });
  }, [expenses, filteredOrders, payments, payouts]);

  const months = useMemo(() => MONTHS.map((label, index) => {
    const month = index + 1;
    const rows = orderRows.filter(row => row.month === month);
    const totals = rows.reduce((result, row) => ({
      sold: result.sold + row.sold,
      received: result.received + row.received,
      costs: result.costs + row.costs,
      balance: result.balance + row.balance,
      receivable: result.receivable + row.receivable,
      payable: result.payable + row.payable,
    }), { sold: 0, received: 0, costs: 0, balance: 0, receivable: 0, payable: 0 });
    return { month, label, rows, ...totals, margin: totals.sold > 0 ? (totals.balance / totals.sold) * 100 : 0 };
  }), [orderRows]);

  const totals = months.reduce((result, month) => ({
    sold: result.sold + month.sold,
    received: result.received + month.received,
    costs: result.costs + month.costs,
    balance: result.balance + month.balance,
    receivable: result.receivable + month.receivable,
    payable: result.payable + month.payable,
  }), { sold: 0, received: 0, costs: 0, balance: 0, receivable: 0, payable: 0 });
  const totalMargin = totals.sold > 0 ? (totals.balance / totals.sold) * 100 : 0;

  const sortedMonths = useMemo(() => [...months].sort((left, right) => {
    const a = monthSort.key === 'month' ? left.month : Number(left[monthSort.key as keyof typeof left]);
    const b = monthSort.key === 'month' ? right.month : Number(right[monthSort.key as keyof typeof right]);
    return monthSort.direction === 'asc' ? a - b : b - a;
  }), [monthSort, months]);

  const selectedMonth = months.find(month => month.month === selectedMonthNumber) ?? null;
  const sortedOrderRows = useMemo(() => {
    if (!selectedMonth) return [];
    return [...selectedMonth.rows].sort((left, right) => {
      const value = (row: typeof left): string | number => orderSort.key === 'number' ? row.order.number : orderSort.key === 'client' ? row.order.client : Number(row[orderSort.key as keyof typeof row]);
      const a = value(left);
      const b = value(right);
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru', { numeric: true });
      return orderSort.direction === 'asc' ? result : -result;
    });
  }, [orderSort, selectedMonth]);

  const toggleMonthSort = (key: FinanceSortKey) => setMonthSort(current => current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'desc' });
  const toggleOrderSort = (key: FinanceSortKey) => setOrderSort(current => current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: key === 'number' || key === 'client' ? 'asc' : 'desc' });

  const sortIcon = (active: boolean, direction: SortDirection) => !active ? <ArrowUpDown size={12} /> : direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  const monthHead = (label: string, key: FinanceSortKey) => <button type="button" className={monthSort.key === key ? 'active' : ''} onClick={() => toggleMonthSort(key)}>{label}{sortIcon(monthSort.key === key, monthSort.direction)}</button>;
  const orderHead = (label: string, key: FinanceSortKey) => <button type="button" className={orderSort.key === key ? 'active' : ''} onClick={() => toggleOrderSort(key)}>{label}{sortIcon(orderSort.key === key, orderSort.direction)}</button>;

  return <section className="b2b-finance">
    <header className="b2b-finance-head"><div><h2>P&amp;L по заказам</h2><p>Финансовый результат по каждому заказу · {year} год</p></div><span>{filteredOrders.length} заказов</span></header>

    <div className="b2b-finance-filters">
      <label><span>Год</span><select value={year} onChange={event => { setYear(Number(event.target.value)); setSelectedMonthNumber(null); }}>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>Клиент</span><select value={clientId} onChange={event => setClientId(event.target.value)}><option value="all">Все клиенты</option>{clients.map(client => <option key={client.id} value={client.id}>{client.companyName || client.contactName}</option>)}</select></label>
      <label><span>Статус</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Все статусы</option>{B2B_ORDER_STATUSES.filter(item => item.key !== 'cancelled').map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className="search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Заказ, клиент, маршрут, водитель..." /></label>
      {(clientId !== 'all' || status !== 'all' || search) && <button type="button" className="reset" onClick={() => { setClientId('all'); setStatus('all'); setSearch(''); }}>Сбросить фильтры</button>}
    </div>

    <div className="b2b-finance-equation b2b-finance-result-cards">
      <article><span><ShoppingCart size={17} />Продано</span><strong>{money(totals.sold)}</strong></article>
      <article><span><BanknoteArrowDown size={17} />Поступило</span><strong>{money(totals.received)}</strong></article>
      <article><span><WalletCards size={17} />Затраты заказов</span><strong>{money(totals.costs)}</strong></article>
      <article className={totals.balance < 0 ? 'negative' : 'result'}><span><CircleDollarSign size={17} />Остаток</span><strong>{money(totals.balance)}</strong></article>
      <article className="margin"><span>Маржа</span><strong>{percent(totalMargin)}</strong></article>
    </div>

    <div className="b2b-finance-debts"><article><span><BanknoteArrowDown size={18} /><b>Дебиторская задолженность</b><small>Клиенты должны нам</small></span><strong>{money(totals.receivable)}</strong></article><article><span><BanknoteArrowUp size={18} /><b>Кредиторская задолженность</b><small>Мы должны водителям</small></span><strong>{money(totals.payable)}</strong></article></div>

    <div className="b2b-finance-table-wrap"><table><thead><tr><th>{monthHead('Период', 'month')}</th><th>{monthHead('Продано', 'sold')}</th><th>{monthHead('Поступило', 'received')}</th><th>{monthHead('Затраты заказов', 'costs')}</th><th>{monthHead('Остаток', 'balance')}</th><th>{monthHead('Должны нам', 'receivable')}</th><th>{monthHead('Должны мы', 'payable')}</th><th>{monthHead('Маржа', 'margin')}</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={8} className="empty">Загрузка…</td></tr> : sortedMonths.map(month => <tr key={month.month} onClick={() => { setSelectedMonthNumber(month.month); setOrderSort({ key: 'number', direction: 'asc' }); }}><td><button type="button" className="month" aria-label={`Открыть заказы за ${month.label.toLocaleLowerCase('ru-RU')}`}><span><b>{month.label}</b><small>{month.rows.length} заказов</small></span></button></td><td className="sold">{money(month.sold)}</td><td className="received">{money(month.received)}</td><td className="costs">{money(month.costs)}</td><td className={`balance${month.balance < 0 ? ' negative' : ''}`}>{money(month.balance)}</td><td className="receivable">{money(month.receivable)}</td><td className="payable">{money(month.payable)}</td><td className={`margin${month.margin < 0 ? ' negative' : ''}`}>{percent(month.margin)}</td></tr>)}</tbody><tfoot><tr><td>Итого за {year}</td><td>{money(totals.sold)}</td><td>{money(totals.received)}</td><td>{money(totals.costs)}</td><td>{money(totals.balance)}</td><td>{money(totals.receivable)}</td><td>{money(totals.payable)}</td><td>{percent(totalMargin)}</td></tr></tfoot></table></div>

    {selectedMonth && <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedMonthNumber(null); }}>
      <article className="b2b-finance-month-card" role="dialog" aria-modal="true" aria-labelledby="b2b-finance-month-title">
        <header className="b2b-client-profile-head"><div className="b2b-client-profile-identity"><span><CircleDollarSign size={22} /></span><div><small>Детализация финансов</small><h2 id="b2b-finance-month-title">{selectedMonth.label} {year}</h2><p>{selectedMonth.rows.length} заказов · продано на {money(selectedMonth.sold)}</p></div></div><div className="b2b-client-profile-summary"><span>Остаток: <b>{money(selectedMonth.balance)}</b></span><span>Маржа: <b>{percent(selectedMonth.margin)}</b></span><button type="button" onClick={() => setSelectedMonthNumber(null)} aria-label="Закрыть"><X size={18} /></button></div></header>
        <div className="b2b-finance-month-body"><div className="b2b-finance-orders-wrap"><table><thead><tr><th>{orderHead('Заказ', 'number')}</th><th>{orderHead('Клиент / маршрут', 'client')}</th><th className="number">{orderHead('Продано', 'sold')}</th><th className="number">{orderHead('Поступило', 'received')}</th><th className="number">{orderHead('Затраты заказа', 'costs')}</th><th className="number">{orderHead('Остаток', 'balance')}</th><th className="number">{orderHead('Нам должны', 'receivable')}</th><th className="number">{orderHead('Мы должны', 'payable')}</th><th className="number">{orderHead('Маржа', 'margin')}</th></tr></thead><tbody>{sortedOrderRows.length ? sortedOrderRows.map(row => <tr key={row.order.id} onClick={() => onOpenOrder?.(row.order.id)}><td><button type="button">{row.order.number}</button><small>{row.order.departureDate || row.order.requestDate}</small></td><td><b>{row.order.client}</b><small>{row.order.routeFrom} → {row.order.routeTo}</small></td><td className="number sold">{money(row.sold)}</td><td className="number received">{money(row.received)}</td><td className="number costs">{money(row.costs)}</td><td className={`number balance${row.balance < 0 ? ' negative' : ''}`}>{money(row.balance)}</td><td className="number receivable">{money(row.receivable)}</td><td className="number payable">{money(row.payable)}</td><td className={`number margin${row.margin < 0 ? ' negative' : ''}`}>{percent(row.margin)}</td></tr>) : <tr><td colSpan={9} className="empty">В этом месяце заказов нет</td></tr>}</tbody></table></div></div>
      </article>
    </div>}
  </section>;
}
