import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { FamilyPayment } from '../../types';
import { fetchFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import './CashierReceiptPanel.css';

type Props = {
  paymentId: string;
  parentName: string;
  receiptUrl: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (payment: FamilyPayment) => void;
};

export default function CashierReceiptPanel({ paymentId, parentName, receiptUrl, canEdit, onClose, onSaved }: Props) {
  const [payment, setPayment] = useState<FamilyPayment | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let current = true;
    fetchFamilyPayment(paymentId).then(value => { if (current) setPayment(value); }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить платёж'); });
    return () => { current = false; };
  }, [paymentId]);
  const change = (key: keyof FamilyPayment, value: string) => {
    setSaved(false);
    setPayment(previous => previous ? { ...previous, [key]: value } : previous);
  };
  const field = (key: keyof FamilyPayment, label: string, type = 'text') => <label>{label}<input type={type} value={String(payment?.[key] ?? '')} onChange={event => change(key, event.target.value)} disabled={!canEdit || saving} maxLength={key === 'receiptCardLast4' ? 4 : undefined} inputMode={key === 'receiptCardLast4' ? 'numeric' : undefined} step={type === 'time' ? 1 : undefined}/></label>;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!payment || !canEdit || saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateFamilyPayment(paymentId, {
        receiptCode: payment.receiptCode ?? '', receiptBank: payment.receiptBank ?? '',
        receiptTime: payment.receiptTime ?? '', receiptCardLast4: payment.receiptCardLast4 ?? '',
        paymentDate: payment.paymentDate.slice(0, 10), paymentOrderNumber: payment.paymentOrderNumber ?? '', comment: payment.comment ?? '',
      });
      const persisted = await fetchFamilyPayment(paymentId);
      setPayment(persisted); onSaved(persisted); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить платёж'); }
    finally { setSaving(false); }
  }
  const pdf = /\.pdf(?:[?#]|$)/i.test(receiptUrl);
  return <aside className="cashier-receipt-panel" aria-label="Чек и реквизиты платежа">
    <header><div><strong>Чек платежа</strong><small>{parentName}</small></div><button type="button" aria-label="Закрыть просмотр чека" onClick={onClose}><X size={18}/></button></header>
    <div className="cashier-receipt-document">{pdf ? <iframe key={receiptUrl} title="PDF чека" src={receiptUrl}/> : <img key={receiptUrl} src={receiptUrl} alt="Чек платежа"/>}</div>
    {!payment && !error && <p role="status">Загрузка реквизитов…</p>}
    {payment && <form onSubmit={save}>
      <div className="cashier-receipt-summary">Сумма: <strong>{payment.amount.toLocaleString('ru-RU')} сом</strong> · {payment.status}</div>
      <div className="cashier-receipt-fields">
        {field('paymentDate', 'Дата операции', 'date')}
        {field('receiptTime', 'Время операции', 'time')}
        {field('receiptBank', 'Банк отправителя')}
        {field('receiptCardLast4', 'Последние 4 цифры карты')}
        {field('receiptCode', 'Код чека')}
        {field('paymentOrderNumber', '№ платёжного поручения')}
        <label className="cashier-receipt-comment">Комментарий<textarea value={payment.comment ?? ''} onChange={event => change('comment', event.target.value)} disabled={!canEdit || saving}/></label>
      </div>
      {canEdit && <button className="cashier-receipt-save" disabled={saving} type="submit">{saving ? 'Сохранение…' : 'Сохранить изменения'}</button>}
      {saved && <p role="status">Изменения сохранены</p>}
    </form>}
    {error && <p className="cashier-receipt-error" role="alert">{error}</p>}
  </aside>;
}
