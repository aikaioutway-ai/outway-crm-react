import { Check, Clock3, X, XCircle } from 'lucide-react';
import useB2BPayments from '../../hooks/useB2BPayments';
import { formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { updateB2BPaymentStatus } from '../../services/b2bDataService';
import { queryClient } from '../../services/queryClient';
import { B2B_QUERY_KEYS } from '../../hooks/useB2BData';
import './B2BCashierReview.css';

export default function B2BCashierReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const payments = useB2BPayments();
  const setStatus = async (id: string, status: 'confirmed' | 'rejected') => {
    await updateB2BPaymentStatus(id, status);
    await queryClient.invalidateQueries({ queryKey: B2B_QUERY_KEYS.payments });
  };
  if (!open) return null;

  return (
    <div className="b2b-cashier-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="b2b-cashier-modal" role="dialog" aria-modal="true" aria-labelledby="b2b-cashier-title">
        <header><div><h2 id="b2b-cashier-title">Платежи B2B</h2><p>Проверка оплат по корпоративным заказам</p></div><button onClick={onClose} aria-label="Закрыть"><X size={18} /></button></header>
        <div className="b2b-cashier-table-wrap">
          <table><thead><tr><th>Заказ</th><th>Клиент</th><th>Дата</th><th>Способ</th><th className="num">Сумма</th><th>Статус</th><th></th></tr></thead>
            <tbody>{payments.length === 0 ? <tr><td colSpan={7} className="empty">Платежей B2B пока нет</td></tr> : payments.map(payment => (
              <tr key={payment.id}>
                <td className="order">{payment.orderNumber}</td><td>{payment.clientName}</td><td>{payment.paymentDate}</td><td>{formatB2BPaymentMethod(payment.method)}</td>
                <td className="num amount">{payment.amount.toLocaleString()} сом</td>
                <td><span className={`state ${payment.status}`}>{payment.status === 'pending' ? <Clock3 size={12} /> : payment.status === 'confirmed' ? <Check size={12} /> : <XCircle size={12} />}{payment.status === 'pending' ? 'На проверке' : payment.status === 'confirmed' ? 'Подтверждено' : 'Отклонено'}</span></td>
                <td>{payment.status === 'pending' && <div className="actions"><button className="approve" onClick={() => void setStatus(payment.id, 'confirmed')}><Check size={14} /> Подтвердить</button><button className="reject" onClick={() => void setStatus(payment.id, 'rejected')}><X size={14} /> Отклонить</button></div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
