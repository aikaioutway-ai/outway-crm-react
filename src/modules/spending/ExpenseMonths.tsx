import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { paymentQuarter } from './paymentQuarter';
export default function ExpenseMonths({ date, periods, onPeriods }: { date: string; periods: string[]; onPeriods: (value: string[]) => void }) {
  const [month, setMonth] = useState(date.slice(0,7));
  const quarter = paymentQuarter(month);
  const shift = (delta: number) => { const [year, current] = month.split('-').map(Number); setMonth(new Date(Date.UTC(year, current - 1 + delta, 1)).toISOString().slice(0,7)); };
  return (
    <section className="payment-section payment-period-section"><div className="payment-section-heading"><h3>Периоды выплаты</h3><div className="spending-actions"><button type="button" aria-label="Предыдущий квартал" onClick={() => shift(-3)}><ChevronLeft size={16} /></button><span>{quarter.number}-й квартал</span><button type="button" aria-label="Следующий квартал" onClick={() => shift(3)}><ChevronRight size={16} /></button></div></div><div className="payment-period-month-grid office-payment-months">{quarter.months.map(key => <label className="office-payment-month" key={key}><input type="checkbox" aria-label={key} checked={periods.includes(key)} onChange={event => onPeriods(event.target.checked ? [...periods, key].sort() : periods.filter(item => item !== key))} /><span>{new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))}</span></label>)}</div></section>
  );
}
