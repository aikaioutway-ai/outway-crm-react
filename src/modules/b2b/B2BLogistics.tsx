import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, CreditCard, MapPin, Search, Truck, UserPlus, UserRound, X } from 'lucide-react';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { B2B_QUERY_KEYS, useB2BDriverPayouts, useB2BOrders } from '../../hooks/useB2BData';
import { B2B_PAYMENT_METHODS, B2BPaymentMethod, calculateB2BExpenseTax, formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { createB2BDriverPayout, saveB2BAssignment, updateB2BOrder } from '../../services/b2bDataService';
import { queryClient } from '../../services/queryClient';
import {
  B2B_ORDER_STATUSES, B2BDriverPayout, B2BOrder, OrderStatus,
} from './B2BOrders';

type SortKey = 'number' | 'client' | 'route' | 'departureDate' | 'driverName' | 'driverTotal' | 'driverPaid' | 'driverRemaining' | 'status';
type SortDirection = 'asc' | 'desc';

const statusLabel = (status: OrderStatus) => B2B_ORDER_STATUSES.find(item => item.key === status)?.label ?? status;

export default function B2BLogistics() {
  const { data: storedOrders } = useB2BOrders();
  const { data: storedPayouts } = useB2BDriverPayouts();
  const [orders, setOrders] = useState<B2BOrder[]>([]);
  const [payouts, setPayouts] = useState<B2BDriverPayout[]>([]);
  const { data: drivers = [], isLoading: driversLoading } = useDriversTable();
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<OrderStatus[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('departureDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedOrder, setSelectedOrder] = useState<B2BOrder | null>(null);
  const [orderCardTab, setOrderCardTab] = useState<'main' | 'driver'>('main');
  const [assignmentOrder, setAssignmentOrder] = useState<B2BOrder | null>(null);
  const [assignmentDriverId, setAssignmentDriverId] = useState('');
  const [assignmentPrice, setAssignmentPrice] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [paymentOrder, setPaymentOrder] = useState<B2BOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<B2BPaymentMethod>('cash');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentComment, setPaymentComment] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (storedOrders) setOrders(storedOrders); }, [storedOrders]);
  useEffect(() => { if (storedPayouts) setPayouts(storedPayouts); }, [storedPayouts]);

  const paidFor = useCallback((orderId: string) => payouts.filter(payout => payout.orderId === orderId).reduce((sum, payout) => sum + payout.amount, 0), [payouts]);
  const totalFor = (order: B2BOrder) => (order.driverPricePerUnit ?? 0) * order.transportCount;
  const remainingFor = useCallback((order: B2BOrder) => Math.max(0, totalFor(order) - paidFor(order.id)), [paidFor]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return orders.filter(order => {
      if (statusFilters.length && !statusFilters.includes(order.status)) return false;
      return !query || [order.number, order.client, order.driverName, order.routeFrom, order.routeTo]
        .some(value => value.toLocaleLowerCase('ru-RU').includes(query));
    });
  }, [orders, search, statusFilters]);

  const sortedOrders = useMemo(() => {
    const valueFor = (order: B2BOrder): string | number => {
      if (sortKey === 'route') return `${order.routeFrom} ${order.routeTo}`.toLocaleLowerCase('ru-RU');
      if (sortKey === 'driverTotal') return totalFor(order);
      if (sortKey === 'driverPaid') return paidFor(order.id);
      if (sortKey === 'driverRemaining') return remainingFor(order);
      return order[sortKey];
    };
    return [...filteredOrders].sort((left, right) => {
      const a = valueFor(left); const b = valueFor(right);
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru', { numeric: true });
      return sortDirection === 'asc' ? result : -result;
    });
  }, [filteredOrders, paidFor, remainingFor, sortDirection, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection('asc'); }
  };

  const sortHead = (label: string, key: SortKey, number = false) => {
    const active = sortKey === key;
    const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;
    return <th className={number ? 'number' : undefined} aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => toggleSort(key)}>{label}<Icon size={12} /></button></th>;
  };

  const updateOrder = (id: string, values: Partial<B2BOrder>) => {
    setOrders(current => current.map(order => order.id === id ? { ...order, ...values } : order));
    setSelectedOrder(current => current?.id === id ? { ...current, ...values } : current);
    void updateB2BOrder(id, values);
  };
  const toggleStatusFilter = (status: OrderStatus) => setStatusFilters(current => current.includes(status) ? current.filter(value => value !== status) : [...current, status]);
  const openOrderCard = (order: B2BOrder) => { setOrderCardTab('main'); setSelectedOrder(order); };

  const openAssignment = (order: B2BOrder) => {
    setAssignmentOrder(order); setAssignmentDriverId(order.driverId ?? '');
    setAssignmentPrice(order.driverPricePerUnit ? String(order.driverPricePerUnit) : ''); setAssignmentError('');
  };
  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!assignmentOrder || !assignmentDriverId) return setAssignmentError('Выберите водителя.');
    const price = Number(assignmentPrice);
    if (!(price > 0)) return setAssignmentError('Укажите цену водителю за единицу транспорта.');
    const driver = drivers.find(item => item.driverId === assignmentDriverId);
    if (!driver) return setAssignmentError('Водитель не найден.');
    try {
      const assignmentId = await saveB2BAssignment(assignmentOrder, driver.driverId, price);
      updateOrder(assignmentOrder.id, { assignmentId, driverId: driver.driverId, driverName: driver.fullName, driverPricePerUnit: price, status: 'driver_assigned' });
      setAssignmentOrder(null); setNotice(`Водитель назначен на заказ ${assignmentOrder.number}`);
    } catch (submitError) { setAssignmentError(submitError instanceof Error ? submitError.message : 'Не удалось назначить водителя.'); }
  };

  const openPayment = (order: B2BOrder) => {
    setPaymentOrder(order); setPaymentAmount(''); setPaymentMethod('cash');
    setPaymentDate(new Date().toISOString().slice(0, 10)); setPaymentComment(`Выплата водителю по заказу ${order.number}`); setPaymentError('');
  };
  const savePayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentOrder?.driverId) return setPaymentError('Сначала назначьте водителя.');
    const amount = Number(paymentAmount); const remaining = remainingFor(paymentOrder);
    if (!(amount > 0)) return setPaymentError('Укажите сумму выплаты.');
    if (amount > remaining) return setPaymentError(`Сумма не может превышать остаток ${remaining.toLocaleString()} сом.`);
    try {
      await createB2BDriverPayout(paymentOrder, amount, paymentMethod, paymentDate, paymentComment.trim());
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.payouts });
      setPaymentOrder(null); setNotice(`Выплата по заказу ${paymentOrder.number} сохранена`);
    } catch (submitError) { setPaymentError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить выплату.'); }
  };

  const advanceStatus = (order: B2BOrder) => {
    if (order.status === 'driver_assigned') { updateOrder(order.id, { status: 'trip_completed' }); setNotice(`Выезд ${order.number} завершён`); return; }
    if (order.status === 'trip_completed') {
      const remaining = remainingFor(order);
      if (remaining > 0) return setNotice(`Сначала закройте долг водителю: ${remaining.toLocaleString()} сом`);
      updateOrder(order.id, { status: 'ready_to_close' }); setNotice(`Заказ ${order.number} готов к закрытию`);
    }
  };

  const actionButtons = (order: B2BOrder) => {
    const remaining = remainingFor(order);
    return <div className="b2b-logistics-row-actions" onClick={event => event.stopPropagation()}>
      {!order.driverName && <button type="button" title="Назначить водителя" onClick={() => openAssignment(order)}><UserPlus size={14} /></button>}
      {!!order.driverName && remaining > 0 && <button type="button" title="Выплата водителю" onClick={() => openPayment(order)}><CreditCard size={14} /></button>}
      {order.status === 'driver_assigned' && <button type="button" className="primary" title="Выезд завершён" onClick={() => advanceStatus(order)}><CheckCircle2 size={14} /></button>}
      {order.status === 'trip_completed' && <button type="button" className="primary" disabled={remaining > 0} title={remaining > 0 ? 'Сначала закройте долг водителю' : 'Готов к закрытию'} onClick={() => advanceStatus(order)}><CheckCircle2 size={14} /></button>}
    </div>;
  };

  return (
    <section className="b2b-logistics">
      <header className="b2b-logistics-head"><div><h2>Логистика</h2><p>Назначение водителей, контроль выездов и выплат</p></div><span>{filteredOrders.length} заказов</span></header>
      <div className="b2b-logistics-filters"><label><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по номеру, клиенту, маршруту или водителю..." /></label><div>{B2B_ORDER_STATUSES.map(status => <button type="button" key={status.key} className={`${statusFilters.includes(status.key) ? 'active ' : ''}status-${status.key}`} onClick={() => toggleStatusFilter(status.key)}><i />{status.label}<span>{orders.filter(order => order.status === status.key).length}</span></button>)}</div></div>
      {notice && <div className="b2b-logistics-notice"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Закрыть"><X size={14} /></button></div>}

      <div className="b2b-logistics-table-wrap"><table className="b2b-logistics-table"><thead><tr>{sortHead('Номер', 'number')}{sortHead('Заказчик', 'client')}{sortHead('Маршрут', 'route')}{sortHead('Выезд', 'departureDate')}{sortHead('Водитель', 'driverName')}{sortHead('Начислено', 'driverTotal', true)}{sortHead('Выплачено', 'driverPaid', true)}{sortHead('Долг', 'driverRemaining', true)}{sortHead('Статус', 'status')}<th className="actions">Действия</th></tr></thead><tbody>{sortedOrders.length ? sortedOrders.map(order => { const total = totalFor(order); const paid = paidFor(order.id); const remaining = Math.max(0, total - paid); return <tr key={order.id} onClick={() => openOrderCard(order)}><td className="order-number">{order.number}</td><td className="client">{order.client}</td><td><span className="b2b-logistics-route"><MapPin size={12} />{order.routeFrom} → {order.routeTo}</span></td><td>{order.departureDate || '—'}</td><td><span className={`b2b-order-driver${order.driverName ? ' assigned' : ''}`}>{order.driverName || 'Не назначен'}</span></td><td className="number">{total.toLocaleString()} сом</td><td className="number paid">{paid.toLocaleString()} сом</td><td className={`number ${remaining > 0 ? 'debt' : 'paid'}`}>{remaining.toLocaleString()} сом</td><td><i className={`b2b-logistics-status status-${order.status}`}>{statusLabel(order.status)}</i></td><td>{actionButtons(order)}</td></tr>; }) : <tr><td colSpan={10} className="empty">Нет заказов по выбранным условиям</td></tr>}</tbody></table></div>

      {assignmentOrder && <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setAssignmentOrder(null); }}><div className="b2b-logistics-dialog" role="dialog" aria-modal="true"><header><div><h2>Назначить водителя</h2><p>{assignmentOrder.number} · {assignmentOrder.transportCount}× {assignmentOrder.transport}</p></div><button type="button" onClick={() => setAssignmentOrder(null)}><X size={18} /></button></header><form onSubmit={saveAssignment}><label className="full"><span>Водитель *</span><select autoFocus value={assignmentDriverId} onChange={event => setAssignmentDriverId(event.target.value)} disabled={driversLoading}><option value="">{driversLoading ? 'Загрузка...' : 'Выберите водителя'}</option>{drivers.filter(driver => driver.status !== 'inactive').map(driver => <option key={driver.driverId} value={driver.driverId}>{driver.fullName}{driver.vehicleLabel ? ` · ${driver.vehicleLabel}` : ''}{driver.plateNumber ? ` · ${driver.plateNumber}` : ''}</option>)}</select></label><label><span>Количество транспорта</span><input value={assignmentOrder.transportCount} readOnly /></label><label><span>Цена за единицу, сом *</span><input type="number" min="1" value={assignmentPrice} onChange={event => setAssignmentPrice(event.target.value)} placeholder="0" /></label><div className="b2b-logistics-dialog-total"><span>Итого водителю</span><strong>{((Number(assignmentPrice) || 0) * assignmentOrder.transportCount).toLocaleString()} сом</strong></div>{assignmentError && <div className="b2b-form-error">{assignmentError}</div>}<div className="b2b-form-actions"><button type="button" className="b2b-cancel-button" onClick={() => setAssignmentOrder(null)}>Отмена</button><button type="submit" className="b2b-primary-button">Назначить</button></div></form></div></div>}
      {paymentOrder && <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setPaymentOrder(null); }}><div className="b2b-logistics-dialog" role="dialog" aria-modal="true"><header><div><h2>Выплата водителю</h2><p>{paymentOrder.number} · {paymentOrder.driverName}</p></div><button type="button" onClick={() => setPaymentOrder(null)}><X size={18} /></button></header><form onSubmit={savePayment}><div className="b2b-logistics-payment-summary"><span>Начислено <b>{totalFor(paymentOrder).toLocaleString()} сом</b></span><span>Выплачено <b>{paidFor(paymentOrder.id).toLocaleString()} сом</b></span><span>Остаток <b>{remainingFor(paymentOrder).toLocaleString()} сом</b></span></div><label><span>Сумма, сом *</span><input autoFocus type="number" min="1" max={remainingFor(paymentOrder)} value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} /></label><label><span>Способ оплаты</span><select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as B2BPaymentMethod)}>{B2B_PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>{paymentMethod === 'legal_account' && (() => { const tax = calculateB2BExpenseTax(Number(paymentAmount), paymentMethod); return <div className="b2b-tax-preview"><span>Удержание налога 4% <strong>{tax.taxAmount.toLocaleString()} сом</strong></span><span>К перечислению водителю <strong>{tax.netAmount.toLocaleString()} сом</strong></span></div>; })()}<label><span>Дата *</span><input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} /></label><label className="full"><span>Комментарий</span><input value={paymentComment} onChange={event => setPaymentComment(event.target.value)} /></label>{paymentError && <div className="b2b-form-error">{paymentError}</div>}<div className="b2b-form-actions"><button type="button" className="b2b-cancel-button" onClick={() => setPaymentOrder(null)}>Отмена</button><button type="submit" className="b2b-primary-button">Сохранить выплату</button></div></form></div></div>}
      {selectedOrder && (
        <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedOrder(null); }}>
          <article className="b2b-order-card" role="dialog" aria-modal="true" aria-labelledby="b2b-logistics-card-title">
            <header className="b2b-order-card-head">
              <div><span>Карточка заказа</span><h2 id="b2b-logistics-card-title">{selectedOrder.number}</h2></div>
              <div className="b2b-order-card-head-actions"><i className={`b2b-logistics-status status-${selectedOrder.status}`}>{statusLabel(selectedOrder.status)}</i><button type="button" onClick={() => setSelectedOrder(null)} aria-label="Закрыть"><X size={18} /></button></div>
            </header>
            <nav className="b2b-order-card-tabs" aria-label="Разделы карточки заказа">
              <button type="button" className={orderCardTab === 'main' ? 'active' : ''} onClick={() => setOrderCardTab('main')}><ClipboardList size={15} />Основной</button>
              <button type="button" className={orderCardTab === 'driver' ? 'active' : ''} onClick={() => setOrderCardTab('driver')}><Truck size={15} />Водитель</button>
            </nav>
            {orderCardTab === 'main' && <div className="b2b-order-card-grid">
              <section><h3><UserRound size={16} /> Клиент</h3><strong>{selectedOrder.client}</strong><span>Корпоративный заказчик</span></section>
              <section><h3><CalendarDays size={16} /> Даты</h3><div><span>Заявка</span><strong>{selectedOrder.requestDate}</strong></div><div><span>Выезд</span><strong>{selectedOrder.departureDate || 'Не указан'}</strong></div></section>
              <section className="wide"><h3><MapPin size={16} /> Маршрут</h3><div className="b2b-order-card-route"><span><i>A</i>{selectedOrder.routeFrom}</span><b /><span><i>B</i>{selectedOrder.routeTo}</span></div></section>
              <section className="wide"><h3><Truck size={16} /> Транспорт</h3><div><span>Вид транспорта</span><strong>{selectedOrder.transport}</strong></div><div><span>Количество</span><strong>{selectedOrder.transportCount}</strong></div></section>
            </div>}
            {orderCardTab === 'driver' && <div className="b2b-order-tab-panel">
              {selectedOrder.driverName ? <div className="b2b-driver-card"><Truck size={24} /><div><span>Назначенный водитель</span><strong>{selectedOrder.driverName}</strong><p>{selectedOrder.transportCount}× {selectedOrder.transport} · {selectedOrder.driverPricePerUnit?.toLocaleString() || 0} сом за единицу</p></div></div> : <div className="b2b-order-tab-empty b2b-driver-empty"><Truck size={27} /><strong>Водитель не назначен</strong><span>Назначьте водителя для выполнения выезда.</span></div>}
              <div className="b2b-driver-finance-head"><div className="b2b-payment-summary"><div><span>Начислено водителю</span><strong>{totalFor(selectedOrder).toLocaleString()} сом</strong></div><div className="paid"><span>Выплачено</span><strong>{paidFor(selectedOrder.id).toLocaleString()} сом</strong></div><div className="debt"><span>Наш долг</span><strong>{remainingFor(selectedOrder).toLocaleString()} сом</strong></div></div><button className="b2b-primary-button" type="button" disabled={!!selectedOrder.driverName && remainingFor(selectedOrder) <= 0} onClick={() => { setSelectedOrder(null); if (selectedOrder.driverName) openPayment(selectedOrder); else openAssignment(selectedOrder); }}>{selectedOrder.driverName ? <><CreditCard size={15} /> Добавить выплату</> : <><UserPlus size={15} /> Назначить водителя</>}</button></div>
              {selectedOrder.driverName && <div className="b2b-payment-history"><div className="b2b-payment-history-title"><strong>История выплат водителю</strong><span>{payouts.filter(payout => payout.orderId === selectedOrder.id).length}</span></div>{payouts.filter(payout => payout.orderId === selectedOrder.id).length ? payouts.filter(payout => payout.orderId === selectedOrder.id).map(payout => <div className="b2b-driver-payout-row" key={payout.id}><span className="b2b-payment-method"><CircleDollarSign size={16} />{formatB2BPaymentMethod(payout.method)}</span><span>{payout.paymentDate}</span><strong>{payout.amount.toLocaleString()} сом</strong><span title={payout.comment}>{payout.comment || 'Без комментария'}</span><span /></div>) : <div className="b2b-logistics-history-empty">Выплат пока нет</div>}</div>}
            </div>}
          </article>
        </div>
      )}
    </section>
  );
}
