import { FormEvent, useState } from 'react';
import { CircleDollarSign, X } from 'lucide-react';
import { B2B_QUERY_KEYS } from '../../hooks/useB2BData';
import { B2BOrderRecord, updateB2BClientPayment, updateB2BOrder } from '../../services/b2bDataService';
import { B2B_PAYMENT_METHODS, B2BPaymentMethod, B2BPaymentRecord } from '../../services/b2bPaymentService';
import { queryClient } from '../../services/queryClient';
import { B2B_ORDER_STATUSES, OrderStatus } from './B2BOrders';

const toDateInput = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};

export function B2BClientOrderEditModal({ order, onClose }: { order: B2BOrderRecord; onClose: () => void }) {
  const [form, setForm] = useState({
    routeFrom: order.routeFrom, routeTo: order.routeTo, requestDate: toDateInput(order.requestDate),
    departureDate: toDateInput(order.departureDate), transport: order.transport,
    transportCount: String(order.transportCount), pricePerUnit: String(order.pricePerUnit), status: order.status,
  });
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const transportCount = Math.max(1, Number(form.transportCount) || 1);
    const pricePerUnit = Math.max(0, Number(form.pricePerUnit) || 0);
    if (!form.routeFrom.trim() || !form.routeTo.trim()) return setError('Укажите полный маршрут.');
    try {
      await updateB2BOrder(order.id, {
        routeFrom: form.routeFrom.trim(), routeTo: form.routeTo.trim(), requestDate: form.requestDate,
        departureDate: form.departureDate, transport: form.transport, transportCount, pricePerUnit,
        total: transportCount * pricePerUnit, status: form.status,
      });
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.orders });
      onClose();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить заказ.'); }
  };

  return <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="b2b-order-form-modal" role="dialog" aria-modal="true">
    <div className="b2b-modal-head"><div><h2>Редактировать заказ</h2><p>{order.number} · {order.client}</p></div><button type="button" onClick={onClose}><X size={18} /></button></div>
    <form className="b2b-new-order-form" onSubmit={submit}>
      <label><span>Откуда *</span><input autoFocus value={form.routeFrom} onChange={event => setForm(current => ({ ...current, routeFrom: event.target.value }))} /></label>
      <label><span>Куда *</span><input value={form.routeTo} onChange={event => setForm(current => ({ ...current, routeTo: event.target.value }))} /></label>
      <label><span>Дата заявки *</span><input type="date" value={form.requestDate} onChange={event => setForm(current => ({ ...current, requestDate: event.target.value }))} /></label>
      <label><span>Дата выезда</span><input type="date" value={form.departureDate} onChange={event => setForm(current => ({ ...current, departureDate: event.target.value }))} /></label>
      <label><span>Транспорт</span><select value={form.transport} onChange={event => setForm(current => ({ ...current, transport: event.target.value }))}><option>Легковое</option><option>Комфорт</option><option>Минивэн</option><option>Микроавтобус</option></select></label>
      <label><span>Количество</span><input type="number" min="1" value={form.transportCount} onChange={event => setForm(current => ({ ...current, transportCount: event.target.value }))} /></label>
      <label><span>Цена за единицу</span><input type="number" min="0" value={form.pricePerUnit} onChange={event => setForm(current => ({ ...current, pricePerUnit: event.target.value }))} /></label>
      <label><span>Статус</span><select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as OrderStatus }))}>{B2B_ORDER_STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select></label>
      <div className="b2b-new-order-total"><span>Итого</span><strong>{((Number(form.transportCount) || 0) * (Number(form.pricePerUnit) || 0)).toLocaleString()} сом</strong></div>
      {error && <div className="b2b-form-error">{error}</div>}
      <div className="b2b-form-actions"><button className="b2b-cancel-button" type="button" onClick={onClose}>Отмена</button><button className="b2b-primary-button" type="submit">Сохранить</button></div>
    </form>
  </div></div>;
}

export function B2BClientPaymentEditModal({ payment, onClose }: { payment: B2BPaymentRecord; onClose: () => void }) {
  const [form, setForm] = useState({ amount: String(payment.amount), method: payment.method, paymentDate: payment.paymentDate, comment: payment.comment });
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!(amount > 0)) return setError('Укажите сумму больше нуля.');
    try {
      await updateB2BClientPayment(payment.id, { amount, method: form.method, paymentDate: form.paymentDate, comment: form.comment.trim() });
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.payments });
      onClose();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить оплату.'); }
  };
  return <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="b2b-payment-form-modal" role="dialog" aria-modal="true">
    <div className="b2b-modal-head"><div><h2>Редактировать оплату</h2><p>{payment.orderNumber} · {payment.clientName}</p></div><button type="button" onClick={onClose}><X size={18} /></button></div>
    <form className="b2b-payment-form" onSubmit={submit}>
      <div className="b2b-payment-notice"><CircleDollarSign size={18} /><div><strong>Изменение оплаты</strong><span>После сохранения сумма и способ оплаты обновятся в карточке клиента.</span></div></div>
      <label><span>Сумма, сом *</span><input autoFocus type="number" min="1" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></label>
      <label><span>Способ оплаты *</span><select value={form.method} onChange={event => setForm(current => ({ ...current, method: event.target.value as B2BPaymentMethod }))}>{B2B_PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
      <label><span>Дата оплаты *</span><input type="date" value={form.paymentDate} onChange={event => setForm(current => ({ ...current, paymentDate: event.target.value }))} /></label>
      <label className="full"><span>Комментарий</span><textarea value={form.comment} onChange={event => setForm(current => ({ ...current, comment: event.target.value }))} /></label>
      {error && <div className="b2b-form-error">{error}</div>}
      <div className="b2b-form-actions"><button className="b2b-cancel-button" type="button" onClick={onClose}>Отмена</button><button className="b2b-primary-button" type="submit">Сохранить</button></div>
    </form>
  </div></div>;
}
