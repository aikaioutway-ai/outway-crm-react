import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, BanknoteArrowDown, BanknoteArrowUp, Calculator, CircleDollarSign, Search, ShoppingCart, Truck, WalletCards } from 'lucide-react';
import { useB2BClients, useB2BDriverPayouts, useB2BExpenses, useB2BOrders } from '../../hooks/useB2BData';
import useB2BPayments from '../../hooks/useB2BPayments';
import { B2B_ORDER_STATUSES } from './B2BOrders';
import { calculateB2BOrderProfit } from './b2bProfitCalculations';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const money = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
const percent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

type SortDirection = 'asc' | 'desc';
type FinanceSortKey = 'month' | 'number' | 'client' | 'sold' | 'received' | 'driverCost' | 'taxCost' | 'otherCost' | 'balance' | 'receivable' | 'payable' | 'margin';
export type B2BFinancePeriod = number | 'all';

function isoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

interface B2BFinanceProps {
  onOpenOrder?: (orderId: string) => void;
  selectedMonthNumber: B2BFinancePeriod | null;
  onSelectedMonthChange: (month: B2BFinancePeriod | null) => void;
}

export default function B2BFinance({ onOpenOrder, selectedMonthNumber, onSelectedMonthChange }: B2BFinanceProps) {
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
    return filteredOrders.map(order => {
    const profit = calculateB2BOrderProfit(order, payments, payouts, expenses);
    return {
      order,
      month: Number(isoDate(order.departureDate || order.requestDate).slice(5, 7)),
      ...profit,
    };
  });
  }, [expenses, filteredOrders, payments, payouts]);

  const months = useMemo(() => MONTHS.map((label, index) => {
    const month = index + 1;
    const rows = orderRows.filter(row => row.month === month);
    const totals = rows.reduce((result, row) => ({
      sold: result.sold + row.sold,
      received: result.received + row.received,
      driverCost: result.driverCost + row.driverCost,
      taxCost: result.taxCost + row.taxCost,
      otherCost: result.otherCost + row.otherCost,
      balance: result.balance + row.balance,
      receivable: result.receivable + row.receivable,
      payable: result.payable + row.payable,
    }), { sold: 0, received: 0, driverCost: 0, taxCost: 0, otherCost: 0, balance: 0, receivable: 0, payable: 0 });
    return { month, label, rows, ...totals, margin: totals.sold > 0 ? (totals.balance / totals.sold) * 100 : 0 };
  }), [orderRows]);

  const totals = months.reduce((result, month) => ({
    sold: result.sold + month.sold,
    received: result.received + month.received,
    driverCost: result.driverCost + month.driverCost,
    taxCost: result.taxCost + month.taxCost,
    otherCost: result.otherCost + month.otherCost,
    balance: result.balance + month.balance,
    receivable: result.receivable + month.receivable,
    payable: result.payable + month.payable,
  }), { sold: 0, received: 0, driverCost: 0, taxCost: 0, otherCost: 0, balance: 0, receivable: 0, payable: 0 });
  const totalMargin = totals.sold > 0 ? (totals.balance / totals.sold) * 100 : 0;

  const sortedMonths = useMemo(() => [...months].sort((left, right) => {
    const a = monthSort.key === 'month' ? left.month : Number(left[monthSort.key as keyof typeof left]);
    const b = monthSort.key === 'month' ? right.month : Number(right[monthSort.key as keyof typeof right]);
    return monthSort.direction === 'asc' ? a - b : b - a;
  }), [monthSort, months]);

  const selectedMonth = selectedMonthNumber === 'all'
    ? { month: 0, label: 'Все периоды', rows: orderRows, ...totals, margin: totalMargin }
    : months.find(month => month.month === selectedMonthNumber) ?? null;
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

  if (selectedMonth) return <section className="b2b-finance b2b-finance-month-page">
    <header className="b2b-finance-month-page-head">
      <button type="button" className="b2b-finance-back" onClick={() => onSelectedMonthChange(null)}><ArrowLeft size={17} />Назад к году</button>
      <div><small>Детализация P&amp;L</small><h2>{selectedMonth.label} · {year}</h2><p>{selectedMonth.rows.length} заказов · финансовый результат {selectedMonthNumber === 'all' ? 'за год' : 'за месяц'}</p></div>
    </header>

    <div className="b2b-finance-equation b2b-finance-result-cards">
      <article><span><ShoppingCart size={17} />Продано</span><strong>{money(selectedMonth.sold)}</strong></article>
      <article><span><BanknoteArrowDown size={17} />Поступило</span><strong>{money(selectedMonth.received)}</strong></article>
      <article><span><Truck size={17} />Водители</span><strong>{money(selectedMonth.driverCost)}</strong></article>
      <article><span><Calculator size={17} />Налог 4%</span><strong>{money(selectedMonth.taxCost)}</strong></article>
      <article><span><WalletCards size={17} />Прочие расходы</span><strong>{money(selectedMonth.otherCost)}</strong></article>
      <article className={selectedMonth.balance < 0 ? 'negative' : 'result'}><span><CircleDollarSign size={17} />Остаток</span><strong>{money(selectedMonth.balance)}</strong></article>
      <article className="margin"><span>Маржа</span><strong>{percent(selectedMonth.margin)}</strong></article>
    </div>

    <div className="b2b-finance-debts"><article><span><BanknoteArrowDown size={18} /><b>Дебиторская задолженность</b><small>Клиенты должны нам</small></span><strong>{money(selectedMonth.receivable)}</strong></article><article><span><BanknoteArrowUp size={18} /><b>Кредиторская задолженность</b><small>Мы должны водителям</small></span><strong>{money(selectedMonth.payable)}</strong></article></div>

    <div className="b2b-finance-month-body"><div className="b2b-finance-orders-wrap"><table><thead><tr><th>{orderHead('Заказ', 'number')}</th><th>{orderHead('Клиент / маршрут', 'client')}</th><th className="number">{orderHead('Продано', 'sold')}</th><th className="number">{orderHead('Поступило', 'received')}</th><th className="number">{orderHead('Водитель', 'driverCost')}</th><th className="number">{orderHead('Налог', 'taxCost')}</th><th className="number">{orderHead('Прочие', 'otherCost')}</th><th className="number">{orderHead('Остаток', 'balance')}</th><th className="number">{orderHead('Нам должны', 'receivable')}</th><th className="number">{orderHead('Мы должны', 'payable')}</th><th className="number">{orderHead('Маржа', 'margin')}</th></tr></thead><tbody>{sortedOrderRows.length ? sortedOrderRows.map(row => <tr key={row.order.id} onClick={() => onOpenOrder?.(row.order.id)}><td><button type="button">{row.order.number}</button><small>{row.order.departureDate || row.order.requestDate}</small></td><td><b>{row.order.client}</b><small>{row.order.routeFrom} → {row.order.routeTo}</small></td><td className="number sold">{money(row.sold)}</td><td className="number received">{money(row.received)}</td><td className="number costs">{money(row.driverCost)}</td><td className="number costs">{money(row.taxCost)}</td><td className="number costs">{money(row.otherCost)}</td><td className={`number balance${row.balance < 0 ? ' negative' : ''}`}>{money(row.balance)}</td><td className="number receivable">{money(row.receivable)}</td><td className="number payable">{money(row.payable)}</td><td className={`number margin${row.margin < 0 ? ' negative' : ''}`}>{percent(row.margin)}</td></tr>) : <tr><td colSpan={11} className="empty">{selectedMonthNumber === 'all' ? 'За выбранный год заказов нет' : 'В этом месяце заказов нет'}</td></tr>}</tbody></table></div></div>
  </section>;

  return <section className="b2b-finance">
    <header className="b2b-finance-head"><div><h2>P&amp;L по заказам</h2><p>Финансовый результат по каждому заказу · {year} год</p></div><span>{filteredOrders.length} заказов</span></header>

    <div className="b2b-finance-filters">
      <label><span>Год</span><select value={year} onChange={event => { setYear(Number(event.target.value)); onSelectedMonthChange(null); }}>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>Клиент</span><select value={clientId} onChange={event => setClientId(event.target.value)}><option value="all">Все клиенты</option>{clients.map(client => <option key={client.id} value={client.id}>{client.companyName || client.contactName}</option>)}</select></label>
      <label><span>Статус</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Все статусы</option>{B2B_ORDER_STATUSES.filter(item => item.key !== 'cancelled').map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className="search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Заказ, клиент, маршрут, водитель..." /></label>
      {(clientId !== 'all' || status !== 'all' || search) && <button type="button" className="reset" onClick={() => { setClientId('all'); setStatus('all'); setSearch(''); }}>Сбросить фильтры</button>}
    </div>

    <div className="b2b-finance-equation b2b-finance-result-cards">
      <article><span><ShoppingCart size={17} />Продано</span><strong>{money(totals.sold)}</strong></article>
      <article><span><BanknoteArrowDown size={17} />Поступило</span><strong>{money(totals.received)}</strong></article>
      <article><span><Truck size={17} />Водители</span><strong>{money(totals.driverCost)}</strong></article>
      <article><span><Calculator size={17} />Налог 4%</span><strong>{money(totals.taxCost)}</strong></article>
      <article><span><WalletCards size={17} />Прочие расходы</span><strong>{money(totals.otherCost)}</strong></article>
      <article className={totals.balance < 0 ? 'negative' : 'result'}><span><CircleDollarSign size={17} />Остаток</span><strong>{money(totals.balance)}</strong></article>
      <article className="margin"><span>Маржа</span><strong>{percent(totalMargin)}</strong></article>
    </div>

    <div className="b2b-finance-debts"><article><span><BanknoteArrowDown size={18} /><b>Дебиторская задолженность</b><small>Клиенты должны нам</small></span><strong>{money(totals.receivable)}</strong></article><article><span><BanknoteArrowUp size={18} /><b>Кредиторская задолженность</b><small>Мы должны водителям</small></span><strong>{money(totals.payable)}</strong></article></div>

    <div className="b2b-finance-table-wrap"><table><thead><tr><th>{monthHead('Период', 'month')}</th><th>{monthHead('Продано', 'sold')}</th><th>{monthHead('Поступило', 'received')}</th><th>{monthHead('Водители', 'driverCost')}</th><th>{monthHead('Налог', 'taxCost')}</th><th>{monthHead('Прочие', 'otherCost')}</th><th>{monthHead('Остаток', 'balance')}</th><th>{monthHead('Должны нам', 'receivable')}</th><th>{monthHead('Должны мы', 'payable')}</th><th>{monthHead('Маржа', 'margin')}</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={10} className="empty">Загрузка…</td></tr> : <>{sortedMonths.map(month => <tr key={month.month} onClick={() => { onSelectedMonthChange(month.month); setOrderSort({ key: 'number', direction: 'asc' }); }}><td><button type="button" className="month" aria-label={`Открыть заказы за ${month.label.toLocaleLowerCase('ru-RU')}`}><span><b>{month.label}</b><small>{month.rows.length} заказов</small></span></button></td><td className="sold">{money(month.sold)}</td><td className="received">{money(month.received)}</td><td className="costs">{money(month.driverCost)}</td><td className="costs">{money(month.taxCost)}</td><td className="costs">{money(month.otherCost)}</td><td className={`balance${month.balance < 0 ? ' negative' : ''}`}>{money(month.balance)}</td><td className="receivable">{money(month.receivable)}</td><td className="payable">{money(month.payable)}</td><td className={`margin${month.margin < 0 ? ' negative' : ''}`}>{percent(month.margin)}</td></tr>)}<tr className="all-periods" onClick={() => { onSelectedMonthChange('all'); setOrderSort({ key: 'number', direction: 'asc' }); }}><td><button type="button" className="month" aria-label={`Открыть все заказы за ${year} год`}><span><b>Все периоды</b><small>{orderRows.length} заказов</small></span></button></td><td className="sold">{money(totals.sold)}</td><td className="received">{money(totals.received)}</td><td className="costs">{money(totals.driverCost)}</td><td className="costs">{money(totals.taxCost)}</td><td className="costs">{money(totals.otherCost)}</td><td className={`balance${totals.balance < 0 ? ' negative' : ''}`}>{money(totals.balance)}</td><td className="receivable">{money(totals.receivable)}</td><td className="payable">{money(totals.payable)}</td><td className={`margin${totalMargin < 0 ? ' negative' : ''}`}>{percent(totalMargin)}</td></tr></>}</tbody></table></div>
  </section>;
}
