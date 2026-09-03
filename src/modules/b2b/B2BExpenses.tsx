import { useMemo, useState } from 'react';
import { Percent, ReceiptText, Search } from 'lucide-react';
import { formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { useB2BExpenses } from '../../hooks/useB2BData';

const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} сом`;

export default function B2BExpenses() {
  const [search, setSearch] = useState('');
  const { data: expenses = [] } = useB2BExpenses();

  const rows = useMemo(() => expenses.filter(row => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return !query || [row.orderNumber, row.category, row.purpose, row.comment, formatB2BPaymentMethod(row.method)]
      .some(value => value.toLocaleLowerCase('ru-RU').includes(query));
  }), [expenses, search]);

  const totals = useMemo(() => rows.reduce((result, row) => ({
    gross: result.gross + row.amount,
    tax: result.tax + row.taxAmount,
    net: result.net + row.netAmount,
  }), { gross: 0, tax: 0, net: 0 }), [rows]);

  return (
    <section className="b2b-expenses">
      <header className="b2b-expenses-head"><div><h2>Расходы B2B</h2><p>Все перенесённые и новые расходы нерегулярных перевозок</p></div><span>{rows.length} операций</span></header>
      <div className="b2b-expenses-tax-note"><Percent size={18} /><div><strong>Налог удерживается автоматически</strong><span>Для способа «Безнал — юрлицо» система удерживает 4% из начисленной суммы и показывает сумму к перечислению водителю.</span></div></div>
      <div className="b2b-expenses-summary"><article><span>Начислено</span><strong>{money(totals.gross)}</strong></article><article className="tax"><span>Удержано налога</span><strong>{money(totals.tax)}</strong></article><article className="net"><span>Перечислено водителям</span><strong>{money(totals.net)}</strong></article></div>
      <label className="b2b-expenses-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по заказу, водителю или способу оплаты..." /></label>
      <div className="b2b-expenses-table-wrap"><table className="b2b-expenses-table"><thead><tr><th>Дата</th><th>Заказ</th><th>Статья расхода</th><th>Назначение</th><th>Способ оплаты</th><th className="number">Начислено</th><th className="number">Налог 4%</th><th className="number">К перечислению</th><th>Комментарий</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id}><td>{row.expenseDate}</td><td className="order">{row.orderNumber}</td><td><span className="b2b-expense-badge"><ReceiptText size={12} />{row.category}</span></td><td className="driver">{row.purpose || '—'}</td><td>{formatB2BPaymentMethod(row.method)}</td><td className="number">{money(row.amount)}</td><td className={`number ${row.taxAmount > 0 ? 'tax' : ''}`}>{money(row.taxAmount)}</td><td className="number net">{money(row.netAmount)}</td><td title={row.comment}>{row.comment || '—'}</td></tr>) : <tr><td colSpan={9} className="empty">Расходов пока нет</td></tr>}</tbody></table></div>
    </section>
  );
}
