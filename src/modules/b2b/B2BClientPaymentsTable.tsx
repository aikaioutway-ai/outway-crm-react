import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Pencil, X } from 'lucide-react';
import { B2B_QUERY_KEYS } from '../../hooks/useB2BData';
import { updateB2BClientPayment } from '../../services/b2bDataService';
import {
  B2B_PAYMENT_METHODS,
  B2BPaymentMethod,
  B2BPaymentRecord,
  B2BPaymentStatus,
  formatB2BPaymentMethod,
  requiresB2BPaymentOrder,
} from '../../services/b2bPaymentService';
import { queryClient } from '../../services/queryClient';

type SortKey = 'paymentDate' | 'orderNumber' | 'method' | 'paymentOrderNumber' | 'amount' | 'status' | 'comment';
type SortDirection = 'asc' | 'desc';

const STATUS_LABELS: Record<B2BPaymentStatus, string> = {
  pending: 'На проверке',
  confirmed: 'Подтверждено',
  rejected: 'Отклонено',
};

interface PaymentDraft {
  paymentDate: string;
  method: B2BPaymentMethod;
  paymentOrderNumber: string;
  amount: string;
  status: B2BPaymentStatus;
  comment: string;
}

interface Props {
  payments: B2BPaymentRecord[];
  canEditStatus: boolean;
  onOpenOrder?: (orderId: string) => void;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'ru-RU', { numeric: true, sensitivity: 'base' });
}

export default function B2BClientPaymentsTable({ payments, canEditStatus, onOpenOrder }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'paymentDate', direction: 'desc' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sortedPayments = useMemo(() => [...payments].sort((left, right) => {
    const result = sort.key === 'amount'
      ? left.amount - right.amount
      : compareText(String(left[sort.key] ?? ''), String(right[sort.key] ?? ''));
    return sort.direction === 'asc' ? result : -result;
  }), [payments, sort]);

  const changeSort = (key: SortKey) => {
    setSort(current => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'paymentDate' || key === 'amount' ? 'desc' : 'asc' });
  };

  const openEdit = (payment: B2BPaymentRecord) => {
    setEditingId(payment.id);
    setDraft({
      paymentDate: payment.paymentDate,
      method: payment.method,
      paymentOrderNumber: payment.paymentOrderNumber ?? '',
      amount: String(payment.amount),
      status: payment.status,
      comment: payment.comment,
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setError('');
  };

  const saveEdit = async (payment: B2BPaymentRecord) => {
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!(amount > 0)) return setError('Сумма должна быть больше нуля.');
    if (!draft.paymentDate) return setError('Укажите дату платежа.');
    if (requiresB2BPaymentOrder(draft.method) && !draft.paymentOrderNumber.trim()) return setError('Укажите номер платёжного документа.');
    setSaving(true);
    setError('');
    try {
      await updateB2BClientPayment(payment.id, {
        amount,
        method: draft.method,
        paymentOrderNumber: draft.paymentOrderNumber.trim() || undefined,
        paymentDate: draft.paymentDate,
        comment: draft.comment.trim(),
        ...(canEditStatus ? { status: draft.status } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.payments });
      cancelEdit();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить платёж.');
    } finally {
      setSaving(false);
    }
  };

  const header = (key: SortKey, label: string, number = false) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
    return <th className={number ? 'number' : undefined}><button type="button" className={active ? 'b2b-payment-sort active' : 'b2b-payment-sort'} onClick={() => changeSort(key)}>{label}<Icon size={12} /></button></th>;
  };

  return <div className="b2b-client-orders-wrap">
    <table className="b2b-client-orders-table b2b-client-payments-table">
      <thead><tr>
        {header('paymentDate', 'Дата')}
        {header('orderNumber', 'Заказ')}
        {header('method', 'Способ')}
        {header('paymentOrderNumber', '№ платёжного документа')}
        {header('amount', 'Сумма', true)}
        {header('status', 'Статус')}
        {header('comment', 'Комментарий')}
        <th aria-label="Действия" />
      </tr></thead>
      <tbody>{sortedPayments.map(payment => {
        const editing = editingId === payment.id && draft;
        return <tr key={payment.id} className={editing ? 'is-editing' : undefined}>
          <td>{editing ? <input type="date" value={draft.paymentDate} onChange={event => setDraft({ ...draft, paymentDate: event.target.value })} /> : payment.paymentDate}</td>
          <td className="order-number"><button className="b2b-client-order-link" type="button" onClick={() => onOpenOrder?.(payment.orderId)} aria-label={`Открыть карточку заказа ${payment.orderNumber}`}>{payment.orderNumber}</button></td>
          <td>{editing ? <select value={draft.method} onChange={event => setDraft({ ...draft, method: event.target.value as B2BPaymentMethod })}>{B2B_PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select> : formatB2BPaymentMethod(payment.method)}</td>
          <td>{editing ? <input value={draft.paymentOrderNumber} onChange={event => setDraft({ ...draft, paymentOrderNumber: event.target.value })} placeholder={requiresB2BPaymentOrder(draft.method) ? 'Обязательно' : 'Необязательно'} /> : payment.paymentOrderNumber || '—'}</td>
          <td className="number">{editing ? <input className="number-input" type="number" min="1" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /> : `${payment.amount.toLocaleString()} сом`}</td>
          <td>{editing && canEditStatus ? <select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as B2BPaymentStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className={`b2b-client-payment-status ${payment.status}`}>{STATUS_LABELS[payment.status]}</span>}</td>
          <td>{editing ? <input value={draft.comment} onChange={event => setDraft({ ...draft, comment: event.target.value })} placeholder="Комментарий" /> : payment.comment || '—'}</td>
          <td className="b2b-payment-inline-actions">{editing ? <>
            <button type="button" className="save" disabled={saving} onClick={() => void saveEdit(payment)} title="Сохранить"><Check size={14} /></button>
            <button type="button" disabled={saving} onClick={cancelEdit} title="Отмена"><X size={14} /></button>
          </> : <button type="button" onClick={() => openEdit(payment)} title="Редактировать платёж"><Pencil size={14} /></button>}</td>
        </tr>;
      })}</tbody>
    </table>
    {error && <div className="b2b-payment-inline-error" role="alert">{error}</div>}
  </div>;
}
