import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { UserRole } from '../../types';
import {
  advanceMarketOrderStatus, createMarketOrder, fetchMarketClients, fetchMarketOrders, fetchMarketProducts,
  markMarketOrderPaid, markMarketOrderSettled,
} from '../../services/marketService';
import { MARKET_ORDER_STATUSES, MarketClient, MarketOrder, MarketOrderStatus, MarketProduct, nextMarketOrderStatus } from './marketTypes';

const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} сом`;
const displayDate = (value: string | null) => value ? new Date(value).toLocaleDateString('ru-RU') : '—';
const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

interface DraftItem { productId: string; quantity: string; }

function NewOrderModal({ clients, products, sessionToken, onClose, onCreated }: {
  clients: MarketClient[];
  products: MarketProduct[];
  sessionToken?: string;
  onClose: () => void;
  onCreated: (order: MarketOrder) => void;
}) {
  const [clientId, setClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [comment, setComment] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: '1' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeProducts = products.filter(p => p.active);
  const total = items.reduce((sum, item) => {
    const product = activeProducts.find(p => p.id === item.productId);
    const quantity = Number(item.quantity) || 0;
    return sum + (product ? product.salePrice * quantity : 0);
  }, 0);

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems(current => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const addItem = () => setItems(current => [...current, { productId: '', quantity: '1' }]);
  const removeItem = (index: number) => setItems(current => current.filter((_, i) => i !== index));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validItems = items.filter(item => item.productId && Number(item.quantity) > 0);
    if (!clientId || validItems.length === 0) {
      setError('Выберите клиента и добавьте хотя бы одну позицию с количеством.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createMarketOrder({
        clientId,
        deliveryDate,
        comment,
        items: validItems.map(item => ({ productId: item.productId, quantity: Number(item.quantity) })),
      }, sessionToken);
      onCreated(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать заказ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="market-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="market-modal wide" role="dialog" aria-modal="true" aria-label="Новый заказ">
        <div className="market-modal-head">
          <h2>Новый заказ</h2>
          <button className="market-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <form className="market-form" onSubmit={submit}>
          <div className="market-field"><label>Клиент</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">— Выберите клиента —</option>
              {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="market-field"><label>Дата доставки</label><input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>

          <div className="market-field full">
            <label>Позиции заказа</label>
            <div className="market-order-items">
              {items.map((item, index) => {
                const product = activeProducts.find(p => p.id === item.productId);
                const lineTotal = product ? product.salePrice * (Number(item.quantity) || 0) : 0;
                return (
                  <div className="market-order-item-row" key={index}>
                    <select value={item.productId} onChange={e => updateItem(index, { productId: e.target.value })}>
                      <option value="">— Товар —</option>
                      {activeProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                    </select>
                    <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateItem(index, { quantity: e.target.value })} placeholder="Кол-во" />
                    <span className="market-order-item-total">{money(lineTotal)}</span>
                    <button type="button" className="market-icon-btn danger" onClick={() => removeItem(index)} aria-label="Удалить позицию"><Trash2 size={15} /></button>
                  </div>
                );
              })}
              <button type="button" className="market-add-line" onClick={addItem}><Plus size={14} /> Добавить позицию</button>
            </div>
          </div>

          <div className="market-total-preview"><span>Сумма заказа (для школы)</span><strong>{money(total)}</strong></div>
          <div className="market-field full"><label>Комментарий</label><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Необязательно" /></div>
          {error && <div className="market-form-error">{error}</div>}
          <div className="market-form-actions">
            <button type="button" className="market-cancel" onClick={onClose}>Отмена</button>
            <button type="submit" className="market-save" disabled={saving}>{saving ? 'Создание…' : 'Создать заказ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CommentActionModal({ title, actionLabel, onClose, onSubmit }: {
  title: string; actionLabel: string; onClose: () => void; onSubmit: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(comment);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить');
      setSaving(false);
    }
  };

  return (
    <div className="market-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="market-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="market-modal-head"><h2>{title}</h2><button className="market-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div>
        <form className="market-form" onSubmit={submit}>
          <div className="market-field full"><label>Комментарий (необязательно)</label><textarea autoFocus value={comment} onChange={e => setComment(e.target.value)} /></div>
          {error && <div className="market-form-error">{error}</div>}
          <div className="market-form-actions">
            <button type="button" className="market-cancel" onClick={onClose}>Отмена</button>
            <button type="submit" className="market-save" disabled={saving}>{saving ? 'Сохранение…' : actionLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MarketOrdersTabProps { userName?: string; userRole?: UserRole; sessionToken?: string; }

export default function MarketOrdersTab({ sessionToken }: MarketOrdersTabProps) {
  const [statusFilter, setStatusFilter] = useState<MarketOrderStatus | 'ALL'>('ALL');
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [clients, setClients] = useState<MarketClient[]>([]);
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ orderId: string; kind: 'paid' | 'settled' } | null>(null);

  const loadOrders = (status: MarketOrderStatus | 'ALL') => {
    setLoading(true);
    fetchMarketOrders(status, sessionToken).then(setOrders).catch(reason => {
      setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить заказы');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadOrders(statusFilter); }, [statusFilter, sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([fetchMarketClients(sessionToken), fetchMarketProducts(sessionToken)])
      .then(([clientRows, productRows]) => { setClients(clientRows); setProducts(productRows); })
      .catch(() => { /* каталог/клиенты покажут свою ошибку на соответствующих вкладках */ });
  }, [sessionToken]);

  const totals = useMemo(() => {
    const saleSum = orders.reduce((sum, o) => sum + o.totalSaleAmount, 0);
    const marginSum = orders.reduce((sum, o) => sum + (o.totalSaleAmount - o.totalPurchaseAmount), 0);
    return { saleSum, marginSum, count: orders.length };
  }, [orders]);

  const handleCreated = (order: MarketOrder) => {
    setModalOpen(false);
    if (statusFilter === 'ALL' || statusFilter === order.status) setOrders(current => [order, ...current]);
  };

  const handleAdvance = async (order: MarketOrder) => {
    try {
      const updated = await advanceMarketOrderStatus(order.id, sessionToken);
      applyUpdate(updated);
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : 'Не удалось изменить статус');
    }
  };

  const applyUpdate = (updated: MarketOrder) => {
    setOrders(current => {
      if (statusFilter !== 'ALL' && statusFilter !== updated.status) return current.filter(o => o.id !== updated.id);
      return current.map(o => (o.id === updated.id ? updated : o));
    });
  };

  return (
    <div className="market-panel">
      <div className="market-panel-title">
        <span>Заказы</span>
        <div className="market-order-toolbar">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as MarketOrderStatus | 'ALL')}>
            <option value="ALL">Все статусы</option>
            {MARKET_ORDER_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="market-add" onClick={() => setModalOpen(true)}><Plus size={16} /> Новый заказ</button>
        </div>
      </div>

      <div className="market-order-stats">
        <div><span>Заказов</span><strong>{totals.count}</strong></div>
        <div><span>Сумма продажи</span><strong>{money(totals.saleSum)}</strong></div>
        <div><span>Маржа</span><strong>{money(totals.marginSum)}</strong></div>
      </div>

      {loadError && <div className="market-load-error">Не удалось загрузить данные: {loadError}. Проверьте, что миграция и функция market-api применены.</div>}
      {loading ? <div className="market-empty">Загрузка…</div> : orders.length === 0 ? (
        <div className="market-empty">Заказов пока нет</div>
      ) : (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead><tr>
              <th></th><th>№</th><th>Клиент</th><th>Доставка</th><th>Статус</th><th>Источник</th>
              <th className="number">Сумма</th><th className="number">Маржа</th><th></th>
            </tr></thead>
            <tbody>{orders.map(order => {
              const status = MARKET_ORDER_STATUSES.find(s => s.key === order.status)!;
              const next = nextMarketOrderStatus(order.status);
              const expanded = expandedId === order.id;
              return (
                <React.Fragment key={order.id}>
                  <tr>
                    <td><button className="market-icon-btn" onClick={() => setExpandedId(expanded ? null : order.id)} aria-label="Показать позиции">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                    <td className="market-name">№{order.orderNumber}</td>
                    <td>{order.clientName || '—'}</td>
                    <td>{displayDate(order.deliveryDate)}</td>
                    <td><span className="market-badge" style={{ background: status.soft, color: status.color }}>{status.label}</span></td>
                    <td><span className="market-badge muted">{order.createdVia === 'portal' ? 'Портал' : 'CRM'}</span></td>
                    <td className="number">{money(order.totalSaleAmount)}</td>
                    <td className="number">{money(order.totalSaleAmount - order.totalPurchaseAmount)}</td>
                    <td>
                      {next && <button className="market-order-action" onClick={() => handleAdvance(order)}>→ {MARKET_ORDER_STATUSES.find(s => s.key === next)!.label}</button>}
                      {order.status === 'delivered' && <button className="market-order-action" onClick={() => setActionModal({ orderId: order.id, kind: 'paid' })}>Отметить оплату</button>}
                      {order.status === 'paid' && <button className="market-order-action" onClick={() => setActionModal({ orderId: order.id, kind: 'settled' })}>Выплатить складу</button>}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="market-order-detail-row">
                      <td colSpan={9}>
                        <table className="market-order-detail-table">
                          <thead><tr><th>Товар</th><th>Ед.</th><th className="number">Кол-во</th><th className="number">Закупка</th><th className="number">Продажа</th></tr></thead>
                          <tbody>{order.items.map(item => (
                            <tr key={item.id}>
                              <td>{item.productName}</td><td>{item.unit}</td>
                              <td className="number">{item.quantity}</td>
                              <td className="number">{money(item.purchaseAmount)}</td>
                              <td className="number">{money(item.saleAmount)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                        {order.comment && <div className="market-order-comment">Комментарий: {order.comment}</div>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {modalOpen && <NewOrderModal clients={clients} products={products} sessionToken={sessionToken} onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
      {actionModal && (
        <CommentActionModal
          title={actionModal.kind === 'paid' ? 'Отметить оплату школой' : 'Отметить выплату складу'}
          actionLabel={actionModal.kind === 'paid' ? 'Оплачен' : 'Выплачено'}
          onClose={() => setActionModal(null)}
          onSubmit={async comment => {
            const updated = actionModal.kind === 'paid'
              ? await markMarketOrderPaid(actionModal.orderId, comment, sessionToken)
              : await markMarketOrderSettled(actionModal.orderId, comment, sessionToken);
            applyUpdate(updated);
            setActionModal(null);
          }}
        />
      )}
    </div>
  );
}
