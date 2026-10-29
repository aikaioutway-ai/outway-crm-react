import React from 'react';
import { CalendarDays } from 'lucide-react';

export default function ExpenseMonths({ date, periods, onPeriods }: { date: string; periods: string[]; onPeriods: (value: string[]) => void }) {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const startYear = year - (month < 9 ? 1 : 0);
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(startYear, 8 + index, 1)).toISOString().slice(0, 7));
  return <section className="payment-section payment-period-section">
    <div className="payment-section-heading"><h3>Периоды выплаты</h3></div>
    <div className="payment-period-month-grid spending-periods cogs-period-cards">
      {months.map((key, index) => <React.Fragment key={key}>
        {index % 3 === 0 && <h4 className="expense-quarter-divider">{index / 3 + 1}-й квартал</h4>}
        <fieldset><legend><CalendarDays size={18} aria-hidden="true" /><span>{new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))}</span></legend>
          <button type="button" className="spending-period-button" aria-label={key} aria-pressed={periods.includes(key)} onClick={() => onPeriods(periods.includes(key) ? periods.filter(item => item !== key) : [...periods, key].sort())}><span>Весь месяц<small>период выплаты</small></span></button>
        </fieldset>
      </React.Fragment>)}
    </div>
  </section>;
}
