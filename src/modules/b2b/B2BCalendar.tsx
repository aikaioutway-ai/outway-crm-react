import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Search, Truck, UserRound, X } from 'lucide-react';
import { B2B_ORDER_STATUSES, B2BOrder, OrderStatus } from './B2BOrders';
import { useB2BOrders } from '../../hooks/useB2BData';

type CalendarView = 'month' | 'week' | 'day';

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_FORMAT = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const DAY_FORMAT = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const STATUS_COLORS: Record<OrderStatus, { background: string; border: string; color: string }> = {
  new: { background: '#eef4ff', border: '#6088d5', color: '#355da9' },
  in_progress: { background: '#eef4ff', border: '#6088d5', color: '#355da9' },
  completed: { background: '#eaf7ef', border: '#41a66b', color: '#2b8952' },
  cancelled: { background: '#fff0f0', border: '#d96565', color: '#a84242' },
  driver_assigned: { background: '#fff7e8', border: '#e6a637', color: '#8a5a10' },
  trip_completed: { background: '#f2efff', border: '#8776d5', color: '#6957b3' },
  ready_to_close: { background: '#eaf6fb', border: '#438fb9', color: '#32799e' },
  success: { background: '#eaf7ef', border: '#41a66b', color: '#2b8952' },
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  return next;
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  return addDays(startOfLocalDay(date), 1 - day);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function orderDateKey(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return local ? `${local[3]}-${local[2]}-${local[1]}` : '';
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function sameDay(left: Date, right: Date) {
  return dateKey(left) === dateKey(right);
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);
}

export default function B2BCalendar() {
  const { data: orders = [] } = useB2BOrders();
  const [currentDate, setCurrentDate] = useState(() => startOfLocalDay(new Date()));
  const [view, setView] = useState<CalendarView>('month');
  const [driverFilter, setDriverFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<B2BOrder | null>(null);

  const driverNames = useMemo(() => Array.from(new Set(orders.map(order => order.driverName).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')), [orders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return orders.filter(order => {
      if (!orderDateKey(order.departureDate)) return false;
      if (driverFilter !== 'all' && order.driverName !== driverFilter) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (!query) return true;
      return [order.number, order.client, order.driverName, order.routeFrom, order.routeTo]
        .some(value => value.toLocaleLowerCase('ru-RU').includes(query));
    });
  }, [driverFilter, orders, search, statusFilter]);

  const ordersByDate = useMemo(() => filteredOrders.reduce<Record<string, B2BOrder[]>>((result, order) => {
    const key = orderDateKey(order.departureDate);
    (result[key] ??= []).push(order);
    return result;
  }, {}), [filteredOrders]);

  const days = useMemo(() => {
    if (view === 'day') return [currentDate];
    if (view === 'week') return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(currentDate), index));
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const beginning = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    const length = Math.round((end.getTime() - beginning.getTime()) / 86_400_000) + 1;
    return Array.from({ length }, (_, index) => addDays(beginning, index));
  }, [currentDate, view]);

  const selectedDayOrders = selectedDay ? ordersByDate[selectedDay] ?? [] : [];
  const statusLabel = (status: OrderStatus) => B2B_ORDER_STATUSES.find(item => item.key === status)?.label ?? status;

  const navigate = (direction: number) => {
    if (view === 'month') setCurrentDate(date => addMonths(date, direction));
    else if (view === 'week') setCurrentDate(date => addDays(date, direction * 7));
    else setCurrentDate(date => addDays(date, direction));
  };

  const headerLabel = view === 'month'
    ? MONTH_FORMAT.format(currentDate)
    : view === 'week'
      ? `${SHORT_DATE_FORMAT.format(days[0])} — ${LONG_DATE_FORMAT.format(days[6])}`
      : DAY_FORMAT.format(currentDate);

  const openOrder = (order: B2BOrder) => {
    setSelectedDay(null);
    setSelectedOrder(order);
  };

  const renderEvent = (order: B2BOrder, compact = false) => {
    const colors = STATUS_COLORS[order.status];
    return (
      <button
        key={order.id}
        type="button"
        className={`b2b-calendar-event${compact ? ' compact' : ''}`}
        style={{ background: colors.background, borderLeftColor: colors.border, color: colors.color }}
        title={`${order.routeFrom} → ${order.routeTo} · ${order.driverName || 'Без водителя'} · ${order.transportCount}× ${order.transport}`}
        onClick={event => { event.stopPropagation(); openOrder(order); }}
      >
        <strong>{compact ? `${order.routeFrom} → ${order.routeTo}` : `${order.number} · ${order.routeFrom} → ${order.routeTo}`}</strong>
        {!compact && <><span>{order.driverName || 'Без водителя'}</span><span>{order.transportCount}× {order.transport}</span></>}
      </button>
    );
  };

  return (
    <section className="b2b-calendar" aria-label="Календарь выездов">
      <header className="b2b-calendar-head">
        <div><h2>Календарь выездов</h2><p>{filteredOrders.length} {filteredOrders.length === 1 ? 'выезд' : 'выездов'} с указанной датой</p></div>
        <div className="b2b-calendar-view" aria-label="Вид календаря">
          {([['month', 'Месяц'], ['week', 'Неделя'], ['day', 'День']] as const).map(([key, label]) => (
            <button key={key} type="button" className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>
          ))}
        </div>
      </header>

      <div className="b2b-calendar-filters">
        <label className="b2b-calendar-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по заказам..." /></label>
        <select aria-label="Водитель" value={driverFilter} onChange={event => setDriverFilter(event.target.value)}>
          <option value="all">Все водители</option>
          {driverNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select aria-label="Статус" value={statusFilter} onChange={event => setStatusFilter(event.target.value as OrderStatus | 'all')}>
          <option value="all">Все статусы</option>
          {B2B_ORDER_STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}
        </select>
      </div>

      <div className="b2b-calendar-nav">
        <button type="button" onClick={() => navigate(-1)} aria-label="Предыдущий период"><ChevronLeft size={18} /></button>
        <h3>{capitalize(headerLabel)}</h3>
        <div><button type="button" className="today" onClick={() => setCurrentDate(startOfLocalDay(new Date()))}>Сегодня</button><button type="button" onClick={() => navigate(1)} aria-label="Следующий период"><ChevronRight size={18} /></button></div>
      </div>

      {view === 'month' && (
        <div className="b2b-calendar-grid month">
          {WEEK_DAYS.map(day => <div className="b2b-calendar-weekday" key={day}>{day}</div>)}
          {days.map(day => {
            const key = dateKey(day);
            const dayOrders = ordersByDate[key] ?? [];
            const outside = day.getMonth() !== currentDate.getMonth();
            return (
              <div key={key} className={`b2b-calendar-cell${outside ? ' outside' : ''}${sameDay(day, new Date()) ? ' today' : ''}`} onClick={() => dayOrders.length && setSelectedDay(key)}>
                <span className="b2b-calendar-day-number">{day.getDate()}</span>
                {dayOrders.slice(0, 3).map(order => renderEvent(order, true))}
                {dayOrders.length > 3 && <button type="button" className="b2b-calendar-more" onClick={event => { event.stopPropagation(); setSelectedDay(key); }}>+{dayOrders.length - 3} ещё</button>}
              </div>
            );
          })}
        </div>
      )}

      {view === 'week' && (
        <div className="b2b-calendar-grid week">
          {days.map(day => {
            const key = dateKey(day);
            const dayOrders = ordersByDate[key] ?? [];
            return <div className={`b2b-calendar-week-column${sameDay(day, new Date()) ? ' today' : ''}`} key={key}><div className="b2b-calendar-weekday">{capitalize(new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric' }).format(day))}</div><div>{dayOrders.length ? dayOrders.map(order => renderEvent(order)) : <span className="b2b-calendar-no-events">—</span>}</div></div>;
          })}
        </div>
      )}

      {view === 'day' && (
        <div className="b2b-calendar-day-view">
          {(ordersByDate[dateKey(currentDate)] ?? []).length ? (ordersByDate[dateKey(currentDate)] ?? []).map(order => (
            <button type="button" key={order.id} className="b2b-calendar-day-order" onClick={() => openOrder(order)}>
              <div><strong>{order.number} · {order.routeFrom} → {order.routeTo}</strong><span>{order.client} · {order.driverName || 'Без водителя'} · {order.transportCount}× {order.transport}</span></div>
              <i className={`status-${order.status}`}>{statusLabel(order.status)}</i>
            </button>
          )) : <div className="b2b-calendar-empty"><CalendarDays size={28} /><strong>Нет выездов на этот день</strong></div>}
        </div>
      )}

      {selectedDay && (
        <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedDay(null); }}>
          <div className="b2b-calendar-dialog" role="dialog" aria-modal="true">
            <header><div><span>Выезды</span><h2>{LONG_DATE_FORMAT.format(dateFromKey(selectedDay))}</h2></div><button type="button" onClick={() => setSelectedDay(null)} aria-label="Закрыть"><X size={18} /></button></header>
            <div className="b2b-calendar-dialog-list">{selectedDayOrders.map(order => renderEvent(order))}</div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedOrder(null); }}>
          <article className="b2b-calendar-order-card" role="dialog" aria-modal="true">
            <header><div><span>Карточка выезда</span><h2>{selectedOrder.number}</h2></div><button type="button" onClick={() => setSelectedOrder(null)} aria-label="Закрыть"><X size={18} /></button></header>
            <div className="b2b-calendar-order-status"><i className={`status-${selectedOrder.status}`}>{statusLabel(selectedOrder.status)}</i><span>{selectedOrder.departureDate}</span></div>
            <div className="b2b-calendar-order-grid">
              <section><h3><UserRound size={16} /> Клиент</h3><strong>{selectedOrder.client}</strong><span>{selectedOrder.driverName || 'Водитель не назначен'}</span></section>
              <section><h3><MapPin size={16} /> Маршрут</h3><strong>{selectedOrder.routeFrom}</strong><span>→ {selectedOrder.routeTo}</span></section>
              <section><h3><Truck size={16} /> Транспорт</h3><strong>{selectedOrder.transportCount}× {selectedOrder.transport}</strong><span>{selectedOrder.total.toLocaleString()} сом</span></section>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
