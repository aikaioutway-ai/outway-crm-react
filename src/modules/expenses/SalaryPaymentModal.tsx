import React, { useMemo, useState } from 'react';
import { PayrollPaymentMethod, recordV2PayrollPayments, V2PayrollPayment } from '../../services/crmV2Service';
import { SalaryPaymentSubject, SalaryRecipientOption, salaryPaymentTotal } from './salaryPayment';

interface Props {
  subjects: SalaryPaymentSubject[];
  payments: V2PayrollPayment[];
  recipients: SalaryRecipientOption[];
  periodMonth: number;
  periodYear: number;
  paidByName?: string;
  onClose: () => void;
  onSaved: () => void;
}

const FIELD_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 11px', border: '1px solid #D9E2EC',
  borderRadius: 9, background: '#fff', color: '#17222F', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

function dateLabel(value: string): string {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU');
}

function todayValue(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

export default function SalaryPaymentModal({ subjects, payments, recipients, periodMonth, periodYear, paidByName, onClose, onSaved }: Props) {
  const isBulk = subjects.length > 1;
  const initialAmount = subjects[0]?.remainingAmount ?? 0;
  const defaultRecipient = isBulk ? null : recipients.find(item => item.id === subjects[0]?.subjectId) ?? null;
  const [amount, setAmount] = useState(String(initialAmount));
  const [paymentDate, setPaymentDate] = useState(todayValue);
  const [paymentMethod, setPaymentMethod] = useState<PayrollPaymentMethod>('cashless');
  const [recipientId, setRecipientId] = useState(defaultRecipient?.id ?? '');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const recipient = recipients.find(item => item.id === recipientId);
  const total = isBulk ? salaryPaymentTotal(subjects) : Math.max(0, Number(amount) || 0);
  const history = useMemo(() => {
    const keys = new Set(subjects.map(subject => `${subject.subjectType}:${subject.subjectId}`));
    return payments.filter(payment => keys.has(`${payment.subjectType}:${payment.subjectId}`));
  }, [payments, subjects]);

  const save = async () => {
    if (!recipient) return setError('Выберите, кому выдали деньги');
    if (!paymentDate) return setError('Укажите дату выплаты');
    if (total <= 0) return setError('Укажите сумму выплаты');
    if (!isBulk && total > initialAmount) return setError('Сумма превышает остаток зарплаты');

    setSaving(true);
    setError('');
    try {
      await recordV2PayrollPayments({
        periodMonth,
        periodYear,
        paymentDate,
        paymentMethod,
        recipientId: recipient.id,
        recipientName: recipient.name,
        paidByName,
        comment,
        payments: subjects
          .filter(subject => subject.remainingAmount > 0)
          .map(subject => ({
            subjectId: subject.subjectId,
            subjectType: subject.subjectType,
            amount: isBulk ? subject.remainingAmount : total,
          })),
      });
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить выплату');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, .42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label="Выдача зарплаты" style={{ width: 'min(580px, 100%)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', borderRadius: 18, background: '#fff', boxShadow: '0 24px 70px rgba(15, 23, 42, .22)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #EEF2F6', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 850, color: '#17222F' }}>{isBulk ? `Массовая выдача · ${subjects.length}` : 'Выдать зарплату'}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: '#7A859D' }}>{isBulk ? 'Одна выдача общему получателю' : subjects[0]?.name}</div>
          </div>
          <button onClick={onClose} aria-label="Закрыть" style={{ marginLeft: 'auto', width: 30, height: 30, border: 0, borderRadius: 8, background: '#F1F5F9', color: '#64748B', cursor: 'pointer', fontSize: 19 }}>×</button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 15 }}>
          {isBulk && (
            <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 10 }}>
              {subjects.map(subject => (
                <div key={`${subject.subjectType}:${subject.subjectId}`} style={{ padding: '9px 11px', display: 'flex', gap: 10, borderBottom: '1px solid #F1F5F9', fontSize: 12 }}>
                  <span style={{ minWidth: 0, flex: 1, fontWeight: 700, color: '#334155' }}>{subject.name}</span>
                  <span style={{ fontWeight: 800, color: '#0C7A74' }}>{subject.remainingAmount.toLocaleString('ru-RU')} сом</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 750, color: '#64748B' }}>
              СКОЛЬКО
              <input type="number" min={0} max={initialAmount} value={isBulk ? total : amount} disabled={isBulk} onChange={event => setAmount(event.target.value)} style={{ ...FIELD_STYLE, fontWeight: 800, color: '#0C7A74', background: isBulk ? '#F8FAFC' : '#fff' }} />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 750, color: '#64748B' }}>
              ДАТА ВЫПЛАТЫ
              <input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} style={FIELD_STYLE} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 750, color: '#64748B' }}>
              СПОСОБ ВЫПЛАТЫ
              <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PayrollPaymentMethod)} style={FIELD_STYLE}>
                <option value="cashless">Безналичный</option>
                <option value="cash">Наличные</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 750, color: '#64748B' }}>
              КОМУ ВЫДАЛИ
              <select value={recipientId} onChange={event => setRecipientId(event.target.value)} style={FIELD_STYLE}>
                <option value="">Выберите получателя</option>
                {recipients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 750, color: '#64748B' }}>
            КОММЕНТАРИЙ
            <input value={comment} onChange={event => setComment(event.target.value)} placeholder={isBulk ? 'Например: получил бригадир за водителей' : 'Необязательно'} style={FIELD_STYLE} />
          </label>

          {error && <div style={{ padding: '9px 11px', borderRadius: 9, background: '#FFF1F1', color: '#B42318', fontSize: 12, fontWeight: 700 }}>{error}</div>}

          {history.length > 0 && (
            <div>
              <div style={{ marginBottom: 7, fontSize: 11, fontWeight: 800, color: '#64748B' }}>ИСТОРИЯ ВЫПЛАТ</div>
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                {history.map(payment => (
                  <div key={payment.id} style={{ padding: '9px 11px', display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 8, borderBottom: '1px solid #F1F5F9', fontSize: 11 }}>
                    <span style={{ color: '#64748B' }}>{dateLabel(payment.paymentDate)}</span>
                    <span style={{ minWidth: 0, color: '#334155' }}>{payment.recipientName} · {payment.paymentMethod === 'cash' ? 'наличные' : 'безналичный'}</span>
                    <span style={{ fontWeight: 800, color: '#15803D' }}>{payment.amount.toLocaleString('ru-RU')} сом</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '13px 20px 18px', display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button onClick={onClose} disabled={saving} style={{ height: 38, padding: '0 16px', border: '1px solid #D9E2EC', borderRadius: 10, background: '#fff', color: '#475569', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={saving || total <= 0} style={{ height: 38, padding: '0 18px', border: 0, borderRadius: 10, background: '#158A87', color: '#fff', fontSize: 12, fontWeight: 850, cursor: saving ? 'default' : 'pointer', opacity: saving || total <= 0 ? .55 : 1 }}>{saving ? 'Сохранение…' : `Сохранить · ${total.toLocaleString('ru-RU')} сом`}</button>
        </div>
      </div>
    </div>
  );
}
