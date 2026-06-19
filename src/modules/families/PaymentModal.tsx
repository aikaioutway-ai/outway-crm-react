import React, { useEffect, useState } from 'react';
import { X, CreditCard, Paperclip, Loader } from 'lucide-react';
import { Charge, Child, Family, PaymentType } from '../../types';
import { money } from '../../utils/pricing';
import { PERIOD_LABEL } from './constants';
import { createFamilyPayment, fetchFinanceSnapshot } from '../../services/financeService';
import { addV2Audit, fetchV2Children } from '../../services/crmV2Service';
import { extractReceiptData } from '../../services/receiptOcr';

interface Props {
  family: Family;
  onClose: () => void;
  userRole?: string;
  userName?: string;
}

export default function PaymentModal({ family, onClose, userName = 'Менеджер' }: Props) {
  const [children, setChildren] = useState<Child[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptCode, setReceiptCode] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const loadedChildren: Child[] = await fetchV2Children(family);
    setChildren(loadedChildren);

    const snapshot = await fetchFinanceSnapshot(family.id, loadedChildren);
    setCharges(snapshot.charges);
    const debt = snapshot.charges.reduce((s, c) => s + c.debtAmount, 0);
    if (debt > 0) {
      setAmount(prev => prev || String(debt));
    }
    setLoading(false);
  }

  const unpaid = charges
    .filter(c => c.debtAmount > 0)
    .sort((a, b) => (a.year - b.year) || (a.periodMonth - b.periodMonth));
  const totalDebt = unpaid.reduce((s, c) => s + c.debtAmount, 0);

  async function handleSubmit() {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return;

    setSaving(true);
    try {
      await createFamilyPayment({
        familyId: family.id,
        amount: numericAmount,
        paymentType,
        paymentDate,
        receiptFile,
        receiptCode: receiptCode || undefined,
        comment,
        createdBy: userName,
      });

      try {
        await addV2Audit({
          actorName: userName,
          action: 'create_payment',
          entityType: 'payment',
          entityId: family.id,
          oldValue: { debt: totalDebt },
          newValue: { pending: numericAmount },
          comment: 'Payment submitted for cashier review',
        });
      } catch { /* audit is optional during setup */ }

      setMsg('Платёж отправлен кассиру на проверку');
      setAmount('');
      setReceiptFile(null);
      setReceiptCode('');
      setOcrMsg('');
      setComment('');
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? 'Не удалось внести платёж');
    }
    setSaving(false);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(824px, calc(100vw - 32px))', maxHeight: '85vh',
        background: '#fff', zIndex: 501, borderRadius: 14,
        boxShadow: '0 16px 50px rgba(49,46,129,0.2)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ background: 'var(--accent)', padding: '14px 18px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={16} color="#fff" />
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Внести оплату</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{family.parentName}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {msg && (
            <div style={{ background: msg.includes('Не удалось') ? '#FEE2E2' : '#D1FAE5', color: msg.includes('Не удалось') ? '#991B1B' : '#065F46', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
              {msg}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-2)' }}>Загрузка...</div>
          ) : (
            <>
              <div style={{ background: '#F3F4F6', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Текущий долг</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: totalDebt > 0 ? '#991B1B' : '#065F46', marginTop: 4 }}>{money(totalDebt)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{children.length} детей · {unpaid.length} открытых начислений</div>
              </div>

              {unpaid.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    Будет закрываться по очереди
                  </div>
                  {unpaid.slice(0, 6).map(charge => (
                    <div key={charge.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text)' }}>{charge.childName ?? 'Ребёнок'} · {PERIOD_LABEL[String(charge.periodMonth)] ?? charge.periodMonth}/{charge.year}</span>
                      <b>{money(charge.debtAmount)}</b>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: '#F8F9FF', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10, marginBottom: 10 }}>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Сумма платежа"
                    style={inputStyle}
                  />
                  <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
                    <option value="cash">Наличные</option>
                    <option value="transfer">Безналичный QR</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, marginBottom: 10 }}>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    style={inputStyle}
                  />
                  <label style={fileInputStyle}>
                    {ocrLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Paperclip size={14} />}
                    <span>{receiptFile ? receiptFile.name : 'Прикрепить чек'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={async e => {
                        const file = e.target.files?.[0] ?? null;
                        setReceiptFile(file);
                        if (!file) return;
                        setOcrLoading(true);
                        setOcrMsg('');
                        try {
                          const result = await extractReceiptData(file);
                          if (result.receipt_code) setReceiptCode(result.receipt_code);
                          if (result.amount) setAmount(String(result.amount));
                          if (result.date) setPaymentDate(result.date);
                          setOcrMsg(result.receipt_code ? '✓ Данные извлечены из чека' : 'Код чека не найден — введите вручную');
                        } catch {
                          setOcrMsg('OCR недоступен — введите данные вручную');
                        }
                        setOcrLoading(false);
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {ocrMsg && (
                    <div style={{ fontSize: 11, color: ocrMsg.startsWith('✓') ? '#065F46' : '#92400E', padding: '4px 2px' }}>
                      {ocrMsg}
                    </div>
                  )}
                  <input
                    value={receiptCode}
                    onChange={e => setReceiptCode(e.target.value)}
                    placeholder="Код чека (авто или вручную)"
                    style={inputStyle}
                  />
                </div>
                <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий" style={{ ...inputStyle, width: '100%', marginBottom: 10 }} />
                <button
                  onClick={handleSubmit}
                  disabled={saving || !amount}
                  style={{
                    width: '100%', padding: '11px', background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', opacity: saving || !amount ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Сохраняем...' : 'Отправить на проверку'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--text)',
  background: '#fff',
  boxSizing: 'border-box',
};

const fileInputStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  background: '#fff',
  cursor: 'pointer',
  overflow: 'hidden',
};
