import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, BanknoteArrowDown, BanknoteArrowUp, CalendarDays, WalletCards, X } from 'lucide-react';
import useB2BPayments from '../../hooks/useB2BPayments';
import { useB2BDriverPayouts, useB2BExpenses, useB2BOrders } from '../../hooks/useB2BData';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const money = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
const CATEGORY_LABELS: Record<string, string> = {
  driver_payments: 'Водители', taxes: 'Налоги', salary: 'Зарплата', bonus: 'Премия',
  refunds: 'Возвраты', rent: 'Аренда', marketing: 'Маркетинг', other: 'Прочие расходы',
};

type Direction = 'income' | 'expense';
type SortDirection = 'asc' | 'desc';
type MonthSortKey = 'month' | 'income' | 'expense' | 'net' | 'opening' | 'closing';
type TransactionSortKey = 'date' | 'direction' | 'category' | 'description' | 'orderNumber' | 'amount';

interface CashflowTransaction {
  id: string;
  date: string;
  direction: Direction;
  category: string;
  description: string;
  orderNumber: string;
  orderId?: string;
  amount: number;
}

interface B2BCashflowProps {
  onOpenOrder?: (orderId: string) => void;
}

export default function B2BCashflow({ onOpenOrder }: B2BCashflowProps) {
  const payments = useB2BPayments();
  const { data: expenses = [], isLoading: expensesLoading } = useB2BExpenses();
  const { data: payouts = [] } = useB2BDriverPayouts();
  const { data: orders = [] } = useB2BOrders();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedMonthNumber, setSelectedMonthNumber] = useState<number | null>(null);
  const [monthSort, setMonthSort] = useState<{ key: MonthSortKey; direction: SortDirection }>({ key: 'month', direction: 'asc' });
  const [transactionSort, setTransactionSort] = useState<{ key: TransactionSortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });

  const transactions = useMemo<CashflowTransaction[]>(() => {
    const orderIdsByNumber = new Map(orders.map(order => [order.number, order.id]));
    const validPayoutIds = new Set(payouts.map(payout => payout.id));
    const income: CashflowTransaction[] = payments
      .filter(payment => payment.status === 'confirmed')
      .map(payment => ({
        id: `income-${payment.id}`,
        date: payment.paymentDate,
        direction: 'income',
        category: 'Выручка',
        description: payment.clientName || 'Оплата клиента',
        orderNumber: payment.orderNumber,
        orderId: payment.orderId,
        amount: payment.amount,
      }));
    const outcome: CashflowTransaction[] = expenses
      .filter(expense => !(expense.source === 'driver_payment' && expense.sourceId && !validPayoutIds.has(expense.sourceId)))
      .map(expense => ({
        id: `expense-${expense.id}`,
        date: expense.expenseDate,
        direction: 'expense',
        category: CATEGORY_LABELS[expense.category] ?? expense.category,
        description: expense.purpose || expense.comment || 'Расход B2B',
        orderNumber: expense.orderNumber,
        orderId: orderIdsByNumber.get(expense.orderNumber),
        amount: expense.amount,
      }));
    return [...income, ...outcome];
  }, [expenses, orders, payments, payouts]);

  const years = useMemo(() => {
    const storedYears = transactions.map(transaction => Number(transaction.date.slice(0, 4))).filter(Number.isFinite);
    const min = Math.min(currentYear - 2, year, ...storedYears);
    const max = Math.max(currentYear + 2, year, ...storedYears);
    return Array.from({ length: max - min + 1 }, (_, index) => max - index);
  }, [currentYear, transactions, year]);

  const openingBalance = transactions.reduce((sum, transaction) => {
    if (!transaction.date || Number(transaction.date.slice(0, 4)) >= year) return sum;
    return sum + (transaction.direction === 'income' ? transaction.amount : -transaction.amount);
  }, 0);

  const months = useMemo(() => {
    let runningBalance = openingBalance;
    return MONTHS.map((label, index) => {
      const month = index + 1;
      const rows = transactions.filter(transaction => Number(transaction.date.slice(0, 4)) === year && Number(transaction.date.slice(5, 7)) === month);
      const income = rows.filter(row => row.direction === 'income').reduce((sum, row) => sum + row.amount, 0);
      const expense = rows.filter(row => row.direction === 'expense').reduce((sum, row) => sum + row.amount, 0);
      const net = income - expense;
      const opening = runningBalance;
      runningBalance += net;
      return { month, label, rows, income, expense, net, opening, closing: runningBalance };
    });
  }, [openingBalance, transactions, year]);

  const totals = months.reduce((result, month) => ({
    income: result.income + month.income,
    expense: result.expense + month.expense,
    net: result.net + month.net,
  }), { income: 0, expense: 0, net: 0 });
  const closingBalance = openingBalance + totals.net;

  const sortedMonths = useMemo(() => [...months].sort((left, right) => {
    const result = left[monthSort.key] - right[monthSort.key];
    return monthSort.direction === 'asc' ? result : -result;
  }), [monthSort, months]);

  const selectedMonth = months.find(month => month.month === selectedMonthNumber) ?? null;
  const sortedTransactions = useMemo(() => {
    if (!selectedMonth) return [];
    return [...selectedMonth.rows].sort((left, right) => {
      const a = left[transactionSort.key];
      const b = right[transactionSort.key];
      const result = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'ru', { numeric: true });
      return transactionSort.direction === 'asc' ? result : -result;
    });
  }, [selectedMonth, transactionSort]);

  const toggleMonthSort = (key: MonthSortKey) => setMonthSort(current => current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: key === 'month' ? 'asc' : 'desc' });
  const toggleTransactionSort = (key: TransactionSortKey) => setTransactionSort(current => current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: key === 'date' ? 'desc' : 'asc' });
  const sortIcon = (active: boolean, direction: SortDirection) => !active ? <ArrowUpDown size={12} /> : direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  const monthHead = (label: string, key: MonthSortKey) => <button type="button" className={monthSort.key === key ? 'active' : ''} onClick={() => toggleMonthSort(key)}>{label}{sortIcon(monthSort.key === key, monthSort.direction)}</button>;
  const transactionHead = (label: string, key: TransactionSortKey) => <button type="button" className={transactionSort.key === key ? 'active' : ''} onClick={() => toggleTransactionSort(key)}>{label}{sortIcon(transactionSort.key === key, transactionSort.direction)}</button>;

  return <section className="b2b-cashflow">
    <header className="b2b-finance-head"><div><h2>Cashflow</h2><p>Движение денег B2B по фактическим датам оплаты · {year} год</p></div><span>{transactions.filter(transaction => Number(transaction.date.slice(0, 4)) === year).length} операций</span></header>

    <div className="b2b-cashflow-toolbar"><label><span>Год</span><select value={year} onChange={event => { setYear(Number(event.target.value)); setSelectedMonthNumber(null); }}>{years.map(item => <option key={item} value={item}>{item} год</option>)}</select></label></div>

    <div className="b2b-cashflow-summary">
      <article className="income"><span><BanknoteArrowDown size={17} />Выручка (поступления)</span><strong>{money(totals.income)}</strong></article>
      <article className="expense"><span><BanknoteArrowUp size={17} />Все расходы</span><strong>{money(totals.expense)}</strong></article>
      <article className={totals.net < 0 ? 'negative' : 'net'}><span><WalletCards size={17} />Чистый денежный поток</span><strong>{money(totals.net)}</strong></article>
      <article className={closingBalance < 0 ? 'negative' : 'balance'}><span><CalendarDays size={17} />Остаток на конец года</span><strong>{money(closingBalance)}</strong></article>
    </div>

    <div className="b2b-cashflow-table-wrap"><table><thead><tr><th>{monthHead('Период', 'month')}</th><th>{monthHead('Выручка', 'income')}</th><th>{monthHead('Все расходы', 'expense')}</th><th>{monthHead('Чистый поток', 'net')}</th><th>{monthHead('На начало', 'opening')}</th><th>{monthHead('На конец', 'closing')}</th></tr></thead><tbody>{expensesLoading ? <tr><td colSpan={6} className="empty">Загрузка…</td></tr> : sortedMonths.map(month => <tr key={month.month} onClick={() => { setSelectedMonthNumber(month.month); setTransactionSort({ key: 'date', direction: 'desc' }); }}><td><button type="button" className="month" aria-label={`Открыть движение денег за ${month.label.toLocaleLowerCase('ru-RU')}`}><span><b>{month.label}</b><small>{month.rows.length} операций</small></span></button></td><td className="income">{money(month.income)}</td><td className="expense">{money(month.expense)}</td><td className={month.net < 0 ? 'negative' : 'net'}>{money(month.net)}</td><td>{money(month.opening)}</td><td className={month.closing < 0 ? 'negative' : 'closing'}>{money(month.closing)}</td></tr>)}</tbody><tfoot><tr><td>Итого за {year}</td><td>{money(totals.income)}</td><td>{money(totals.expense)}</td><td>{money(totals.net)}</td><td>{money(openingBalance)}</td><td>{money(closingBalance)}</td></tr></tfoot></table></div>

    {selectedMonth && <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedMonthNumber(null); }}><article className="b2b-cashflow-month-card" role="dialog" aria-modal="true" aria-labelledby="b2b-cashflow-month-title"><header className="b2b-client-profile-head"><div className="b2b-client-profile-identity"><span><WalletCards size={22} /></span><div><small>Движение денег</small><h2 id="b2b-cashflow-month-title">{selectedMonth.label} {year}</h2><p>{selectedMonth.rows.length} операций · чистый поток {money(selectedMonth.net)}</p></div></div><div className="b2b-client-profile-summary"><span>Поступило: <b>{money(selectedMonth.income)}</b></span><span>Расходы: <b>{money(selectedMonth.expense)}</b></span><button type="button" onClick={() => setSelectedMonthNumber(null)} aria-label="Закрыть"><X size={18} /></button></div></header><div className="b2b-cashflow-month-body"><div className="b2b-cashflow-transactions-wrap"><table><thead><tr><th>{transactionHead('Дата', 'date')}</th><th>{transactionHead('Движение', 'direction')}</th><th>{transactionHead('Категория', 'category')}</th><th>{transactionHead('Описание', 'description')}</th><th>{transactionHead('Заказ', 'orderNumber')}</th><th className="number">{transactionHead('Сумма', 'amount')}</th></tr></thead><tbody>{sortedTransactions.length ? sortedTransactions.map(transaction => <tr key={transaction.id}><td>{transaction.date}</td><td><span className={`b2b-cashflow-direction ${transaction.direction}`}>{transaction.direction === 'income' ? 'Поступление' : 'Расход'}</span></td><td>{transaction.category}</td><td>{transaction.description}</td><td>{transaction.orderId && onOpenOrder ? <button type="button" className="b2b-cashflow-order-link" onClick={() => onOpenOrder(transaction.orderId!)}>{transaction.orderNumber}</button> : transaction.orderNumber}</td><td className={`number amount ${transaction.direction}`}>{transaction.direction === 'income' ? '+' : '−'}{money(transaction.amount)}</td></tr>) : <tr><td colSpan={6} className="empty">В этом месяце движения денег нет</td></tr>}</tbody></table></div></div></article></div>}
  </section>;
}
