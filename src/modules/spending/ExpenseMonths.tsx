import React, { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ExpenseMonths({ date, periods, onPeriods }: { date: string; periods: string[]; onPeriods: (value: string[]) => void }) {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const startYear = year - (month < 6 ? 1 : 0);
  const groups = Array.from({ length: 5 }, (_, group) => ({
    label: group === 0 ? 'Летний период' : `${group}-й квартал`,
    months: Array.from({ length: 3 }, (_, index) => new Date(Date.UTC(startYear, 5 + group * 3 + index, 1)).toISOString().slice(0, 7)),
  }));
  const pages = [[groups[0]], groups.slice(1, 3), groups.slice(3, 5)];
  const [page, setPage] = useState(() => {
    const selected = periods[0];
    return selected ? Math.max(0, pages.findIndex(groups => groups.some(group => group.months.includes(selected)))) : 0;
  });
  return <section className="payment-section payment-period-section">
    <div className="payment-section-heading expense-month-navigation"><h3>Периоды выплаты</h3><div className="spending-actions payment-period-navigation"><button type="button" aria-label="Предыдущие периоды" disabled={page === 0} onClick={() => setPage(current => current - 1)}><ChevronLeft size={18} /><span>Назад</span></button><span>{page + 1} / {pages.length}</span><button type="button" aria-label="Следующие периоды" disabled={page === pages.length - 1} onClick={() => setPage(current => current + 1)}><span>Далее</span><ChevronRight size={18} /></button></div></div>
    <div className="payment-period-month-grid spending-periods cogs-period-cards">
      {pages[page].map(group => <React.Fragment key={group.label}><h4 className="expense-quarter-divider">{group.label}</h4>{group.months.map(key => <fieldset key={key}><legend><CalendarDays size={18} aria-hidden="true" /><span>{new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))}</span></legend>
          <button type="button" className="spending-period-button" aria-label={key} aria-pressed={periods.includes(key)} onClick={() => onPeriods(periods.includes(key) ? periods.filter(item => item !== key) : [...periods, key].sort())}><span>Весь месяц<small>период выплаты</small></span></button>
        </fieldset>)}</React.Fragment>)}
    </div>
  </section>;
}
