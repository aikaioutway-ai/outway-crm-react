import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, CircleDollarSign, ClipboardList, CreditCard, FileText, MapPin, Pencil, Plus, Search, Truck, UserRound, X } from 'lucide-react';
import useB2BPayments from '../../hooks/useB2BPayments';
import { B2B_PAYMENT_METHODS, B2BPaymentMethod, B2BPaymentRecord, calculateB2BExpenseTax, formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { B2B_QUERY_KEYS, useB2BClients, useB2BDriverPayouts, useB2BOrders } from '../../hooks/useB2BData';
import { B2BDriverPayoutRecord, B2BOrderRecord, B2BOrderStatus, createB2BClientPayment, createB2BDriverPayout, createB2BOrder, saveB2BAssignment, updateB2BClientPayment, updateB2BOrder } from '../../services/b2bDataService';
import { queryClient } from '../../services/queryClient';
import B2BOrderDocuments from './B2BOrderDocuments';

export type OrderStatus = B2BOrderStatus;
export type B2BOrder = B2BOrderRecord;
export type B2BDriverPayout = B2BDriverPayoutRecord;

type SortKey = 'number' | 'client' | 'requestDate' | 'departureDate' | 'transport' | 'transportCount' | 'pricePerUnit' | 'total' | 'paid' | 'status' | 'driverName' | 'route' | 'remaining';
type SortDirection = 'asc' | 'desc';
type OrderCardTab = 'main' | 'payment' | 'driver' | 'documents';

export const B2B_ORDER_STATUSES: { key: OrderStatus; label: string }[] = [
  { key: 'new', label: 'Новый' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'completed', label: 'Завершён' },
  { key: 'cancelled', label: 'Отменён' },
  { key: 'driver_assigned', label: 'Водитель назначен' },
  { key: 'trip_completed', label: 'Выезд завершён' },
  { key: 'ready_to_close', label: 'Готов к закрытию' },
  { key: 'success', label: 'Успешно' },
];

const EMPTY_ORDER_FORM = {
  client: '', routeFrom: '', routeTo: '', requestDate: new Date().toISOString().slice(0, 10), departureDate: '',
  transport: 'Минивэн', transportCount: '1', pricePerUnit: '', paid: '', status: 'new' as OrderStatus,
};

const EMPTY_PAYMENT_FORM = {
  amount: '', method: 'legal_account' as B2BPaymentMethod, paymentDate: new Date().toISOString().slice(0, 10), comment: '',
};

const EMPTY_DRIVER_PAYOUT_FORM = {
  amount: '', method: 'cash' as B2BPaymentMethod, paymentDate: new Date().toISOString().slice(0, 10), comment: '',
};

function toDateInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function toDateTimeInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.replace(', ', 'T').slice(0, 16);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}` : '';
}

interface B2BOrdersProps {
  openOrderId?: string | null;
}

export default function B2BOrders({ openOrderId = null }: B2BOrdersProps) {
  const { data: storedOrders } = useB2BOrders();
  const { data: storedPayouts } = useB2BDriverPayouts();
  const { data: clients = [] } = useB2BClients();
  const [orders, setOrders] = useState<B2BOrder[]>([]);
  const payments = useB2BPayments();
  const { data: drivers = [], isLoading: driversLoading } = useDriversTable();
  const [driverPayouts, setDriverPayouts] = useState<B2BDriverPayout[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('requestDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderCardTab, setOrderCardTab] = useState<OrderCardTab>('main');
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState({ ...EMPTY_ORDER_FORM });
  const [orderFormError, setOrderFormError] = useState('');
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ ...EMPTY_PAYMENT_FORM });
  const [paymentFormError, setPaymentFormError] = useState('');
  const [driverPayoutFormOpen, setDriverPayoutFormOpen] = useState(false);
  const [editingDriverPayoutId, setEditingDriverPayoutId] = useState<string | null>(null);
  const [driverPayoutForm, setDriverPayoutForm] = useState({ ...EMPTY_DRIVER_PAYOUT_FORM });
  const [driverPayoutFormError, setDriverPayoutFormError] = useState('');
  const selectedOrder = orders.find(order => order.id === selectedOrderId) ?? null;

  useEffect(() => { if (storedOrders) setOrders(storedOrders); }, [storedOrders]);
  useEffect(() => { if (storedPayouts) setDriverPayouts(storedPayouts); }, [storedPayouts]);
  useEffect(() => {
    if (!openOrderId) return;
    setOrderCardTab('main');
    setSelectedOrderId(openOrderId);
  }, [openOrderId]);

  const confirmedPaymentsFor = useCallback((orderId: string) => payments
    .filter(payment => payment.orderId === orderId && payment.status === 'confirmed')
    .reduce((sum, payment) => sum + payment.amount, 0), [payments]);

  const effectivePaidFor = useCallback((order: B2BOrder) => Math.min(order.total, order.paid + confirmedPaymentsFor(order.id)), [confirmedPaymentsFor]);
  const selectedPayments = selectedOrder ? payments.filter(payment => payment.orderId === selectedOrder.id) : [];
  const selectedPaid = selectedOrder ? effectivePaidFor(selectedOrder) : 0;
  const selectedDriverPayouts = selectedOrder ? driverPayouts.filter(payout => payout.orderId === selectedOrder.id) : [];
  const selectedDriverTotal = selectedOrder ? (selectedOrder.driverPricePerUnit ?? 0) * selectedOrder.transportCount : 0;
  const selectedDriverPaid = selectedDriverPayouts.reduce((sum, payout) => sum + payout.amount, 0);
  const selectedDriverDebt = Math.max(0, selectedDriverTotal - selectedDriverPaid);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter(order => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (!query) return true;
      return order.number.toLowerCase().includes(query) || order.client.toLowerCase().includes(query) ||
        order.routeFrom.toLowerCase().includes(query) || order.routeTo.toLowerCase().includes(query);
    });
  }, [orders, search, statusFilter]);

  const sortedOrders = useMemo(() => {
    const valueFor = (order: B2BOrder): string | number => {
      if (sortKey === 'route') return `${order.routeFrom} ${order.routeTo}`.toLowerCase();
      if (sortKey === 'remaining') return order.total - effectivePaidFor(order);
      if (sortKey === 'paid') return effectivePaidFor(order);
      const value = order[sortKey];
      return typeof value === 'string' ? value.toLowerCase() : value;
    };
    return [...filteredOrders].sort((left, right) => {
      const a = valueFor(left);
      const b = valueFor(right);
      const result = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'ru', { numeric: true });
      return sortDirection === 'asc' ? result : -result;
    });
  }, [effectivePaidFor, filteredOrders, sortDirection, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortableHead = (label: string, key: SortKey, number = false) => {
    const active = sortKey === key;
    const SortIcon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={number ? 'number' : undefined} aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`b2b-sort-head${active ? ' active' : ''}`} onClick={() => toggleSort(key)}>
          {label}<SortIcon size={12} />
        </button>
      </th>
    );
  };

  const changeStatus = (id: string, status: OrderStatus) => {
    setOrders(current => current.map(order => order.id === id ? { ...order, status } : order));
    void updateB2BOrder(id, { status });
  };

  const openOrderCard = (id: string) => {
    setOrderCardTab('main');
    setSelectedOrderId(id);
  };

  const closeOrderForm = () => {
    setOrderFormOpen(false);
    setEditingOrderId(null);
    setOrderForm({ ...EMPTY_ORDER_FORM, requestDate: new Date().toISOString().slice(0, 10) });
    setOrderFormError('');
  };

  const openNewOrderForm = () => {
    setEditingOrderId(null);
    setOrderForm({ ...EMPTY_ORDER_FORM, requestDate: new Date().toISOString().slice(0, 10) });
    setOrderFormError('');
    setOrderFormOpen(true);
  };

  const openEditOrderForm = (order: B2BOrder) => {
    setEditingOrderId(order.id);
    setOrderForm({
      client: order.clientId, routeFrom: order.routeFrom, routeTo: order.routeTo,
      requestDate: toDateInput(order.requestDate), departureDate: toDateTimeInput(order.departureDate),
      transport: order.transport, transportCount: String(order.transportCount), pricePerUnit: String(order.pricePerUnit),
      paid: String(order.paid), status: order.status,
    });
    setOrderFormError('');
    setOrderFormOpen(true);
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    const selectedClient = clients.find(client => client.id === orderForm.client);
    if (!selectedClient) return setOrderFormError('Выберите клиента из справочника.');
    if (!orderForm.routeFrom.trim() || !orderForm.routeTo.trim()) return setOrderFormError('Укажите полный маршрут.');
    if (!orderForm.departureDate) return setOrderFormError('Укажите дату и время выезда.');

    const transportCount = Math.max(1, Number(orderForm.transportCount) || 1);
    const pricePerUnit = Math.max(0, Number(orderForm.pricePerUnit) || 0);
    const total = transportCount * pricePerUnit;
    const paid = Math.min(total, Math.max(0, Number(orderForm.paid) || 0));
    const values = {
      clientId: selectedClient.id, client: selectedClient.companyName || selectedClient.contactName,
      routeFrom: orderForm.routeFrom.trim(), routeTo: orderForm.routeTo.trim(),
      requestDate: orderForm.requestDate, departureDate: orderForm.departureDate.slice(0, 10),
      transport: orderForm.transport, transportCount, pricePerUnit, total, paid, status: orderForm.status,
    };
    try {
      if (editingOrderId) {
      await updateB2BOrder(editingOrderId, values);
      setOrders(current => current.map(order => order.id === editingOrderId ? { ...order, ...values } : order));
      closeOrderForm();
      return;
      }
    const createdIdentity = await createB2BOrder({ ...values, category: 'b2b' });
    const created: B2BOrder = { ...createdIdentity, ...values, category: 'b2b', driverName: '' };
    setOrders(current => [created, ...current]);
    closeOrderForm();
    openOrderCard(created.id);
    } catch (submitError) {
      setOrderFormError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить заказ.');
    }
  };

  const closePaymentForm = () => {
    setPaymentFormOpen(false);
    setEditingPaymentId(null);
    setPaymentForm({ ...EMPTY_PAYMENT_FORM, paymentDate: new Date().toISOString().slice(0, 10) });
    setPaymentFormError('');
  };

  const openPaymentForm = (payment?: B2BPaymentRecord) => {
    if (!selectedOrder) return;
    if (payment) {
      setEditingPaymentId(payment.id);
      setPaymentForm({ amount: String(payment.amount), method: payment.method, paymentDate: payment.paymentDate, comment: payment.comment });
      setPaymentFormError('');
      setPaymentFormOpen(true);
      return;
    }
    setEditingPaymentId(null);
    const remaining = Math.max(0, selectedOrder.total - effectivePaidFor(selectedOrder));
    setPaymentForm({ ...EMPTY_PAYMENT_FORM, amount: remaining ? String(remaining) : '', paymentDate: new Date().toISOString().slice(0, 10) });
    setPaymentFormError('');
    setPaymentFormOpen(true);
  };

  const createPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrder) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setPaymentFormError('Укажите сумму оплаты больше нуля.');
    const values = { amount, method: paymentForm.method, paymentDate: paymentForm.paymentDate, comment: paymentForm.comment.trim() };
    try {
      if (editingPaymentId) await updateB2BClientPayment(editingPaymentId, values);
      else await createB2BClientPayment({ orderId: selectedOrder.id, orderNumber: selectedOrder.number, clientName: selectedOrder.client, ...values });
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.payments });
      closePaymentForm();
    } catch (submitError) { setPaymentFormError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить оплату.'); }
  };

  const selectDriver = async (driverId: string) => {
    if (!selectedOrder) return;
    const driver = drivers.find(item => item.driverId === driverId);
    const assignmentId = await saveB2BAssignment(selectedOrder, driverId, selectedOrder.driverPricePerUnit ?? 0);
    setOrders(current => current.map(order => order.id === selectedOrder.id
      ? { ...order, assignmentId, driverId, driverName: driver?.fullName ?? '', status: 'driver_assigned' }
      : order));
  };

  const setDriverPrice = (value: string) => {
    if (!selectedOrder) return;
    const driverPricePerUnit = Math.max(0, Number(value) || 0);
    setOrders(current => current.map(order => order.id === selectedOrder.id ? { ...order, driverPricePerUnit } : order));
  };

  const closeDriverPayoutForm = () => {
    setDriverPayoutFormOpen(false);
    setEditingDriverPayoutId(null);
    setDriverPayoutForm({ ...EMPTY_DRIVER_PAYOUT_FORM, paymentDate: new Date().toISOString().slice(0, 10) });
    setDriverPayoutFormError('');
  };

  const openDriverPayoutForm = (payout?: B2BDriverPayout) => {
    if (payout) {
      setEditingDriverPayoutId(payout.id);
      setDriverPayoutForm({ amount: String(payout.amount), method: payout.method, paymentDate: payout.paymentDate, comment: payout.comment });
      setDriverPayoutFormError('');
      setDriverPayoutFormOpen(true);
      return;
    }
    setEditingDriverPayoutId(null);
    setDriverPayoutForm({ ...EMPTY_DRIVER_PAYOUT_FORM, amount: selectedDriverDebt ? String(selectedDriverDebt) : '', paymentDate: new Date().toISOString().slice(0, 10) });
    setDriverPayoutFormError('');
    setDriverPayoutFormOpen(true);
  };

  const submitDriverPayout = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrder?.driverId || !selectedOrder.driverName) return setDriverPayoutFormError('Сначала выберите водителя.');
    const amount = Number(driverPayoutForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setDriverPayoutFormError('Укажите сумму выплаты больше нуля.');
    const existingAmount = editingDriverPayoutId ? driverPayouts.find(payout => payout.id === editingDriverPayoutId)?.amount ?? 0 : 0;
    const available = selectedDriverDebt + existingAmount;
    if (amount > available) return setDriverPayoutFormError(`Сумма превышает доступный остаток ${available.toLocaleString()} сом.`);
    try {
      if (editingDriverPayoutId) return setDriverPayoutFormError('Редактирование перенесённых выплат пока недоступно.');
      await createB2BDriverPayout(selectedOrder, amount, driverPayoutForm.method, driverPayoutForm.paymentDate, driverPayoutForm.comment.trim());
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.payouts });
      closeDriverPayoutForm();
    } catch (submitError) { setDriverPayoutFormError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить выплату.'); }
  };

  return (
    <div className="b2b-orders">
      <div className="b2b-panel-head b2b-orders-head">
        <div><h2>Заказы</h2><p>Табличный список корпоративных перевозок</p></div>
        <div className="b2b-orders-head-actions">
          <div className="b2b-orders-total">{orders.length} всего</div>
          <button className="b2b-primary-button" type="button" onClick={openNewOrderForm}><Plus size={17} /> Новый заказ</button>
        </div>
      </div>

      <div className="b2b-order-statuses" aria-label="Фильтр по статусу">
        <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Все <span>{orders.length}</span></button>
        {B2B_ORDER_STATUSES.map(status => (
          <button key={status.key} className={`status-${status.key}${statusFilter === status.key ? ' active' : ''}`} onClick={() => setStatusFilter(status.key)}>
            <i />{status.label}<span>{orders.filter(order => order.status === status.key).length}</span>
          </button>
        ))}
      </div>

      <div className="b2b-orders-search">
        <Search size={16} />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по номеру, клиенту или маршруту..." />
      </div>

      <div className="b2b-orders-table-wrap">
        <table className="b2b-orders-table">
          <thead><tr>
            {sortableHead('№ заказа', 'number')}{sortableHead('Клиент', 'client')}{sortableHead('Маршрут', 'route')}
            {sortableHead('Дата заявки', 'requestDate')}{sortableHead('Дата выезда', 'departureDate')}{sortableHead('Транспорт', 'transport')}
            {sortableHead('Кол-во', 'transportCount', true)}{sortableHead('Итого', 'total', true)}{sortableHead('Оплачено', 'paid', true)}
            {sortableHead('Остаток', 'remaining', true)}{sortableHead('Статус', 'status')}{sortableHead('Водитель', 'driverName')}
          </tr></thead>
          <tbody>
            {sortedOrders.length === 0 ? (
              <tr><td colSpan={12} className="b2b-orders-empty"><ClipboardList size={29} /><strong>Заказов пока нет</strong><span>Новые заказы появятся в этой таблице.</span></td></tr>
            ) : sortedOrders.map(order => {
              const effectivePaid = effectivePaidFor(order);
              return (
              <tr key={order.id} className="b2b-order-row" onClick={() => openOrderCard(order.id)}>
                <td className="order-number">{order.number}</td><td className="order-client">{order.client}</td>
                <td><span className="b2b-order-route">{order.routeFrom}<b>→</b>{order.routeTo}</span></td>
                <td>{order.requestDate}</td><td>{order.departureDate || '—'}</td><td>{order.transport}</td>
                <td className="number">{order.transportCount}</td><td className="number">{order.total.toLocaleString()} сом</td>
                <td className="number paid">{effectivePaid.toLocaleString()} сом</td><td className="number debt">{Math.max(0, order.total - effectivePaid).toLocaleString()} сом</td>
                <td>
                  <select className={`b2b-order-status status-${order.status}`} value={order.status} onClick={event => event.stopPropagation()} onChange={event => changeStatus(order.id, event.target.value as OrderStatus)}>
                    {B2B_ORDER_STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}
                  </select>
                </td>
                <td><span className={`b2b-order-driver${order.driverName ? ' assigned' : ''}`}>{order.driverName || 'Не назначен'}</span></td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedOrderId(null); }}>
          <article className="b2b-order-card" role="dialog" aria-modal="true" aria-labelledby="b2b-order-card-title">
            <header className="b2b-order-card-head">
              <div><span>Карточка заказа</span><h2 id="b2b-order-card-title">{selectedOrder.number}</h2></div>
              <div className="b2b-order-card-head-actions">
                <select className={`b2b-order-status status-${selectedOrder.status}`} value={selectedOrder.status} onChange={event => changeStatus(selectedOrder.id, event.target.value as OrderStatus)}>
                  {B2B_ORDER_STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}
                </select>
                <button type="button" onClick={() => openEditOrderForm(selectedOrder)} aria-label="Редактировать заказ"><Pencil size={16} /></button>
                <button type="button" onClick={() => setSelectedOrderId(null)} aria-label="Закрыть"><X size={18} /></button>
              </div>
            </header>

            <nav className="b2b-order-card-tabs" aria-label="Разделы карточки заказа">
              {([
                ['main', 'Основной', ClipboardList], ['payment', 'Оплата', CreditCard],
                ['driver', 'Водитель', Truck], ['documents', 'Документы', FileText],
              ] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" className={orderCardTab === key ? 'active' : ''} onClick={() => setOrderCardTab(key)}><Icon size={15} />{label}</button>
              ))}
            </nav>

            {orderCardTab === 'main' && (
              <div className="b2b-order-card-grid">
                <section><h3><UserRound size={16} /> Клиент</h3><strong>{selectedOrder.client}</strong><span>Корпоративный заказчик</span></section>
                <section><h3><CalendarDays size={16} /> Даты</h3><div><span>Заявка</span><strong>{selectedOrder.requestDate}</strong></div><div><span>Выезд</span><strong>{selectedOrder.departureDate || 'Не указан'}</strong></div></section>
                <section className="wide"><h3><MapPin size={16} /> Маршрут</h3><div className="b2b-order-card-route"><span><i>A</i>{selectedOrder.routeFrom}</span><b /><span><i>B</i>{selectedOrder.routeTo}</span></div></section>
                <section className="wide"><h3><Truck size={16} /> Транспорт</h3><div><span>Вид транспорта</span><strong>{selectedOrder.transport}</strong></div><div><span>Количество</span><strong>{selectedOrder.transportCount}</strong></div><div><span>Цена за единицу</span><strong>{selectedOrder.pricePerUnit.toLocaleString()} сом</strong></div><div><span>Общая сумма</span><strong>{selectedOrder.total.toLocaleString()} сом</strong></div></section>
              </div>
            )}

            {orderCardTab === 'payment' && (
              <div className="b2b-order-tab-panel">
                <div className="b2b-payment-panel-head">
                  <div className="b2b-payment-summary">
                    <div><span>Итого по заказу</span><strong>{selectedOrder.total.toLocaleString()} сом</strong></div>
                    <div className="paid"><span>Подтверждено</span><strong>{selectedPaid.toLocaleString()} сом</strong></div>
                    <div className="debt"><span>Остаток</span><strong>{Math.max(0, selectedOrder.total - selectedPaid).toLocaleString()} сом</strong></div>
                  </div>
                  <button className="b2b-primary-button" type="button" onClick={() => openPaymentForm()}><Plus size={16} /> Добавить оплату</button>
                </div>
                {selectedPayments.length === 0 ? (
                  <div className="b2b-order-tab-empty"><CreditCard size={27} /><strong>История оплат</strong><span>Платежей по заказу пока нет.</span></div>
                ) : (
                  <div className="b2b-payment-history">
                    <div className="b2b-payment-history-title"><strong>История оплат</strong><span>{selectedPayments.length}</span></div>
                    {selectedPayments.map(payment => (
                      <div className="b2b-payment-history-row" key={payment.id}>
                        <span className="b2b-payment-method"><CircleDollarSign size={16} />{formatB2BPaymentMethod(payment.method)}</span>
                        <span>{payment.paymentDate}</span>
                        <strong>{payment.amount.toLocaleString()} сом</strong>
                        <span className={`b2b-payment-state ${payment.status}`}>{payment.status === 'pending' ? 'На проверке' : payment.status === 'confirmed' ? 'Подтверждено' : 'Отклонено'}</span>
                        <button className="b2b-history-edit" type="button" onClick={() => openPaymentForm(payment)} aria-label={`Редактировать оплату ${payment.amount.toLocaleString()} сом`}><Pencil size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {orderCardTab === 'driver' && (
              <div className="b2b-order-tab-panel">
                <div className="b2b-driver-editor">
                  <label className="wide"><span>Водитель из общего модуля *</span><select value={selectedOrder.driverId ?? ''} onChange={event => selectDriver(event.target.value)} disabled={driversLoading}><option value="">{driversLoading ? 'Загрузка водителей...' : 'Выберите водителя'}</option>{drivers.filter(driver => driver.status !== 'inactive').map(driver => <option key={driver.driverId} value={driver.driverId}>{driver.fullName}{driver.vehicleLabel ? ` · ${driver.vehicleLabel}` : ''}{driver.plateNumber ? ` · ${driver.plateNumber}` : ''}</option>)}</select></label>
                  <label><span>Количество</span><input value={selectedOrder.transportCount} readOnly /></label>
                  <label><span>Цена водителю за единицу, сом</span><input type="number" min="0" value={selectedOrder.driverPricePerUnit ?? ''} onChange={event => setDriverPrice(event.target.value)} placeholder="0" /></label>
                </div>

                <div className="b2b-driver-finance-head">
                  <div className="b2b-payment-summary">
                    <div><span>Начислено водителю</span><strong>{selectedDriverTotal.toLocaleString()} сом</strong></div>
                    <div className="paid"><span>Выплачено</span><strong>{selectedDriverPaid.toLocaleString()} сом</strong></div>
                    <div className="debt"><span>Наш долг</span><strong>{selectedDriverDebt.toLocaleString()} сом</strong></div>
                  </div>
                  <button className="b2b-primary-button" type="button" onClick={() => openDriverPayoutForm()} disabled={!selectedOrder.driverId || selectedDriverDebt <= 0}><Plus size={16} /> Добавить выплату</button>
                </div>

                {selectedDriverPayouts.length === 0 ? (
                  <div className="b2b-order-tab-empty b2b-driver-empty"><CircleDollarSign size={27} /><strong>История выплат</strong><span>Выплат водителю по этому заказу пока нет.</span></div>
                ) : (
                  <div className="b2b-payment-history">
                    <div className="b2b-payment-history-title"><strong>История выплат водителю</strong><span>{selectedDriverPayouts.length}</span></div>
                    {selectedDriverPayouts.map(payout => (
                      <div className="b2b-driver-payout-row" key={payout.id}>
                        <span className="b2b-payment-method"><CircleDollarSign size={16} />{formatB2BPaymentMethod(payout.method)}</span>
                        <span>{payout.paymentDate}</span><strong>{payout.amount.toLocaleString()} сом</strong><span title={payout.comment}>{payout.comment || 'Без комментария'}</span>
                        <button className="b2b-history-edit" type="button" onClick={() => openDriverPayoutForm(payout)} aria-label={`Редактировать выплату ${payout.amount.toLocaleString()} сом`}><Pencil size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {orderCardTab === 'documents' && (
              <div className="b2b-order-tab-panel"><B2BOrderDocuments order={selectedOrder} /></div>
            )}
          </article>
        </div>
      )}

      {orderFormOpen && (
        <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeOrderForm(); }}>
          <div className="b2b-order-form-modal" role="dialog" aria-modal="true" aria-labelledby="b2b-new-order-title">
            <div className="b2b-modal-head">
              <div><h2 id="b2b-new-order-title">{editingOrderId ? 'Редактировать заказ' : 'Новый заказ'}</h2><p>{editingOrderId ? 'Изменение данных корпоративного заказа' : 'Новая заявка на корпоративную перевозку'}</p></div>
              <button type="button" onClick={closeOrderForm} aria-label="Закрыть"><X size={18} /></button>
            </div>
            <form className="b2b-new-order-form" onSubmit={submitOrder}>
              <label className="full"><span>Клиент *</span><select autoFocus value={orderForm.client} onChange={event => setOrderForm(current => ({ ...current, client: event.target.value }))}><option value="">Выберите клиента</option>{clients.map(client => <option key={client.id} value={client.id}>{client.companyName || client.contactName}</option>)}</select></label>
              <label><span>Откуда *</span><input value={orderForm.routeFrom} onChange={event => setOrderForm(current => ({ ...current, routeFrom: event.target.value }))} placeholder="Адрес отправления" /></label>
              <label><span>Куда *</span><input value={orderForm.routeTo} onChange={event => setOrderForm(current => ({ ...current, routeTo: event.target.value }))} placeholder="Адрес назначения" /></label>
              <label><span>Дата заявки *</span><input type="date" value={orderForm.requestDate} onChange={event => setOrderForm(current => ({ ...current, requestDate: event.target.value }))} /></label>
              <label><span>Дата и время выезда *</span><input type="datetime-local" value={orderForm.departureDate} onChange={event => setOrderForm(current => ({ ...current, departureDate: event.target.value }))} /></label>
              <label><span>Вид транспорта *</span><select value={orderForm.transport} onChange={event => setOrderForm(current => ({ ...current, transport: event.target.value }))}><option>Легковое</option><option>Комфорт</option><option>Минивэн</option><option>Микроавтобус</option></select></label>
              <label><span>Количество транспорта *</span><input type="number" min="1" value={orderForm.transportCount} onChange={event => setOrderForm(current => ({ ...current, transportCount: event.target.value }))} /></label>
              <label><span>Цена за единицу, сом</span><input type="number" min="0" value={orderForm.pricePerUnit} onChange={event => setOrderForm(current => ({ ...current, pricePerUnit: event.target.value }))} placeholder="0" /></label>
              <label><span>Оплачено, сом</span><input type="number" min="0" value={orderForm.paid} onChange={event => setOrderForm(current => ({ ...current, paid: event.target.value }))} placeholder="0" /></label>
              <label className="full"><span>Статус</span><select value={orderForm.status} onChange={event => setOrderForm(current => ({ ...current, status: event.target.value as OrderStatus }))}>{B2B_ORDER_STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select></label>
              <div className="b2b-new-order-total"><span>Итого</span><strong>{((Number(orderForm.transportCount) || 0) * (Number(orderForm.pricePerUnit) || 0)).toLocaleString()} сом</strong></div>
              {orderFormError && <div className="b2b-form-error">{orderFormError}</div>}
              <div className="b2b-form-actions"><button className="b2b-cancel-button" type="button" onClick={closeOrderForm}>Отмена</button><button className="b2b-primary-button" type="submit">{editingOrderId ? 'Сохранить изменения' : 'Создать заказ'}</button></div>
            </form>
          </div>
        </div>
      )}

      {paymentFormOpen && selectedOrder && (
        <div className="b2b-modal-overlay b2b-payment-form-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closePaymentForm(); }}>
          <div className="b2b-payment-form-modal" role="dialog" aria-modal="true" aria-labelledby="b2b-new-payment-title">
            <div className="b2b-modal-head">
              <div><h2 id="b2b-new-payment-title">{editingPaymentId ? 'Редактировать оплату' : 'Добавить оплату'}</h2><p>{selectedOrder.number} · {selectedOrder.client}</p></div>
              <button type="button" onClick={closePaymentForm} aria-label="Закрыть"><X size={18} /></button>
            </div>
            <form className="b2b-payment-form" onSubmit={createPayment}>
              <div className="b2b-payment-notice"><CircleDollarSign size={18} /><div><strong>{editingPaymentId ? 'Изменение оплаты' : 'Оплата будет отправлена кассиру'}</strong><span>{editingPaymentId ? 'Текущий статус проверки оплаты будет сохранён.' : 'Сумма попадёт в «Оплачено» только после подтверждения.'}</span></div></div>
              <label><span>Сумма, сом *</span><input autoFocus type="number" min="1" value={paymentForm.amount} onChange={event => setPaymentForm(current => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
              <label><span>Способ оплаты *</span><select value={paymentForm.method} onChange={event => setPaymentForm(current => ({ ...current, method: event.target.value as B2BPaymentMethod }))}>{B2B_PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              <label><span>Дата оплаты *</span><input type="date" value={paymentForm.paymentDate} onChange={event => setPaymentForm(current => ({ ...current, paymentDate: event.target.value }))} /></label>
              <label className="full"><span>Комментарий</span><textarea value={paymentForm.comment} onChange={event => setPaymentForm(current => ({ ...current, comment: event.target.value }))} placeholder="Назначение платежа или примечание" /></label>
              {paymentFormError && <div className="b2b-form-error">{paymentFormError}</div>}
              <div className="b2b-form-actions"><button className="b2b-cancel-button" type="button" onClick={closePaymentForm}>Отмена</button><button className="b2b-primary-button" type="submit">{editingPaymentId ? 'Сохранить изменения' : 'Отправить на проверку'}</button></div>
            </form>
          </div>
        </div>
      )}

      {driverPayoutFormOpen && selectedOrder && (
        <div className="b2b-modal-overlay b2b-payment-form-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeDriverPayoutForm(); }}>
          <div className="b2b-payment-form-modal" role="dialog" aria-modal="true" aria-labelledby="b2b-driver-payout-title">
            <div className="b2b-modal-head">
              <div><h2 id="b2b-driver-payout-title">{editingDriverPayoutId ? 'Редактировать выплату' : 'Выплата водителю'}</h2><p>{selectedOrder.driverName} · {selectedOrder.number}</p></div>
              <button type="button" onClick={closeDriverPayoutForm} aria-label="Закрыть"><X size={18} /></button>
            </div>
            <form className="b2b-payment-form" onSubmit={submitDriverPayout}>
              <div className="b2b-payment-notice"><CircleDollarSign size={18} /><div><strong>Долг перед водителем: {selectedDriverDebt.toLocaleString()} сом</strong><span>После сохранения выплата появится в истории заказа.</span></div></div>
              <label><span>Сумма выплаты, сом *</span><input autoFocus type="number" min="1" max={selectedDriverDebt + (editingDriverPayoutId ? driverPayouts.find(payout => payout.id === editingDriverPayoutId)?.amount ?? 0 : 0)} value={driverPayoutForm.amount} onChange={event => setDriverPayoutForm(current => ({ ...current, amount: event.target.value }))} placeholder="0" /></label>
              <label><span>Как оплатили *</span><select value={driverPayoutForm.method} onChange={event => setDriverPayoutForm(current => ({ ...current, method: event.target.value as B2BPaymentMethod }))}>{B2B_PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              {driverPayoutForm.method === 'legal_account' && (() => { const tax = calculateB2BExpenseTax(Number(driverPayoutForm.amount), driverPayoutForm.method); return <div className="b2b-tax-preview"><span>Удержание налога 4% <strong>{tax.taxAmount.toLocaleString()} сом</strong></span><span>К перечислению водителю <strong>{tax.netAmount.toLocaleString()} сом</strong></span></div>; })()}
              <label><span>Когда оплатили *</span><input type="date" value={driverPayoutForm.paymentDate} onChange={event => setDriverPayoutForm(current => ({ ...current, paymentDate: event.target.value }))} /></label>
              <label className="full"><span>Комментарий</span><textarea value={driverPayoutForm.comment} onChange={event => setDriverPayoutForm(current => ({ ...current, comment: event.target.value }))} placeholder="Примечание к выплате" /></label>
              {driverPayoutFormError && <div className="b2b-form-error">{driverPayoutFormError}</div>}
              <div className="b2b-form-actions"><button className="b2b-cancel-button" type="button" onClick={closeDriverPayoutForm}>Отмена</button><button className="b2b-primary-button" type="submit">{editingDriverPayoutId ? 'Сохранить изменения' : 'Сохранить выплату'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
