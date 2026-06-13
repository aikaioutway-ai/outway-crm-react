import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Charge, Child, Family, FamilyPayment, PaymentItem, PaymentStatus, PaymentType } from '../../types';
import { getChildPrice, money } from '../../utils/pricing';
import { ALL_PERIODS, PERIOD_LABEL, PERIOD_ORDER } from './constants';
import { Section, Spinner, Empty } from './DrawerUI';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Оплачено':          { bg: '#D1FAE5', color: '#065F46' },
  'Частично оплачено': { bg: '#FEF3C7', color: '#92400E' },
  'Просрочено':        { bg: '#FEE2E2', color: '#991B1B' },
  'Заморожено':        { bg: '#E0E7FF', color: '#3730A3' },
  'Не оплачено':       { bg: '#F3F4F6', color: '#374151' },
};

interface Props {
  charges: Charge[];
  payments: FamilyPayment[];
  paymentItems: PaymentItem[];
  loading: boolean;
  family: Family;
  children: Child[];
  editMode: boolean;
  isAdmin: boolean;
  isCashier: boolean;
  onSaveCharge: (charge: Charge, updates: Partial<Charge>) => Promise<boolean>;
  onDeleteCharge: (charge: Charge) => void;
  onAddCharges: (month: number, year: number) => void;
  onCreatePayment: (amount: number, paymentType: PaymentType, comment: string) => Promise<boolean>;
}

export default function TabFinance({
  charges,
  payments,
  paymentItems,
  loading,
  children,
  isAdmin,
  onSaveCharge,
  onDeleteCharge,
  onAddCharges,
  onCreatePayment,
}: Props) {
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriodKey, setNewPeriodKey] = useState('9');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [comment, setComment] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [msg, setMsg] = useState('');

  const sortedCharges = useMemo(() => {
    return [...charges].sort((a, b) => (
      PERIOD_ORDER.indexOf(String(a.periodMonth === 0 ? 'deposit' : a.periodMonth)) -
      PERIOD_ORDER.indexOf(String(b.periodMonth === 0 ? 'deposit' : b.periodMonth))
    ) || a.childName?.localeCompare(b.childName ?? '', 'ru') || 0);
  }, [charges]);

  const totalCharged = charges.reduce((s, c) => s + c.amount + c.penaltyAmount, 0);
  const totalPaid = charges.reduce((s, c) => s + c.paidAmount, 0);
  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const monthPrice = children.reduce((s, child, i) => s + getChildPrice(child, i), 0);

  const existingPeriodKeys = new Set(charges.map(c => `${c.periodMonth}:${c.year}`));
  const availablePeriods = ALL_PERIODS.filter(p => !existingPeriodKeys.has(`${p.month}:${p.year}`));

  if (loading) return <Spinner />;

  async function submitPayment() {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return;
    setSavingPayment(true);
    const ok = await onCreatePayment(amount, paymentType, comment);
    setSavingPayment(false);
    if (ok) {
      setMsg('Платёж внесён и распределён');
      setPaymentAmount('');
      setComment('');
      setTimeout(() => setMsg(''), 2500);
    } else {
      setMsg('Не удалось внести платёж');
    }
  }

  function addSelectedPeriod() {
    const period = ALL_PERIODS.find(p => p.key === newPeriodKey);
    if (!period) return;
    onAddCharges(period.month, period.year);
    setAddingPeriod(false);
  }

  return (
    <div>
      {msg && (
        <div style={{ background: msg.includes('Не удалось') ? '#FEE2E2' : '#D1FAE5', color: msg.includes('Не удалось') ? '#991B1B' : '#065F46', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        <SummaryTile label="Начислено" value={money(totalCharged)} />
        <SummaryTile label="Оплачено" value={money(totalPaid)} color="#065F46" bg="#D1FAE5" />
        <SummaryTile label="Долг" value={money(totalDebt)} color={totalDebt > 0 ? '#991B1B' : '#065F46'} bg={totalDebt > 0 ? '#FEE2E2' : '#D1FAE5'} />
        <SummaryTile label="Месяц" value={money(monthPrice)} sub={`${children.length} детей`} />
      </div>

      <Section title="Внести платёж семьи">
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, marginBottom: 10 }}>
            <input
              type="number"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              placeholder={totalDebt > 0 ? `Долг: ${totalDebt}` : 'Сумма платежа'}
              style={inputStyle}
            />
            <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
              <option value="cash">Наличные</option>
              <option value="transfer">Перевод</option>
              <option value="card">Карта</option>
              <option value="other">Другое</option>
            </select>
          </div>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Комментарий"
            style={{ ...inputStyle, width: '100%', marginBottom: 10 }}
          />
          <button onClick={submitPayment} disabled={savingPayment || !paymentAmount} style={{
            width: '100%', padding: '10px 12px', border: 'none', borderRadius: 8,
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: savingPayment || !paymentAmount ? 'default' : 'pointer', opacity: savingPayment || !paymentAmount ? 0.6 : 1,
          }}>
            {savingPayment ? 'Сохраняем...' : 'Внести и распределить'}
          </button>
        </div>
      </Section>

      <Section
        title={`Начисления по детям (${charges.length})`}
        action={isAdmin && (
          <button onClick={() => setAddingPeriod(p => !p)} style={smallAccentBtn}>
            <Plus size={11} /> Период
          </button>
        )}
      >
        {addingPeriod && (
          <div style={{ background: '#EEF2FF', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>Создать начисления всем детям</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={newPeriodKey} onChange={e => setNewPeriodKey(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                {availablePeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <button onClick={addSelectedPeriod} style={smallAccentBtn}>Создать</button>
            </div>
          </div>
        )}

        {sortedCharges.length === 0
          ? <Empty text="Начислений нет" />
          : sortedCharges.map(charge => (
            <ChargeRow
              key={charge.id}
              charge={charge}
              isAdmin={isAdmin}
              onSave={updates => onSaveCharge(charge, updates)}
              onDelete={() => onDeleteCharge(charge)}
            />
          ))
        }
      </Section>

      <Section title={`Платежи семьи (${payments.length})`}>
        {payments.length === 0 ? <Empty text="Платежей нет" /> : payments.map(payment => (
          <PaymentRow key={payment.id} payment={payment} items={paymentItems.filter(i => i.paymentId === payment.id)} />
        ))}
      </Section>
    </div>
  );
}

function ChargeRow({ charge, isAdmin, onSave, onDelete }: {
  charge: Charge;
  isAdmin: boolean;
  onSave: (updates: Partial<Charge>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState(String(charge.amount));
  const [status, setStatus] = useState<PaymentStatus>(charge.status);
  const [saving, setSaving] = useState(false);
  const sc = STATUS_COLORS[charge.status] ?? STATUS_COLORS['Не оплачено'];
  const period = charge.periodMonth === 0 ? 'Депозит' : PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth);

  async function save() {
    setSaving(true);
    await onSave({ amount: Number(amount), status, isFrozen: status === 'Заморожено' });
    setSaving(false);
  }

  return (
    <div style={{ border: `1px solid ${sc.bg}`, borderLeft: `3px solid ${sc.color}`, borderRadius: 10, background: '#fff', padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: 10, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{charge.childName ?? charge.childId}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{period} {charge.year}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{money(charge.amount)}</div>
          <div style={{ fontSize: 11, color: '#065F46' }}>опл. {money(charge.paidAmount)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: charge.debtAmount > 0 ? '#991B1B' : '#065F46' }}>{money(charge.debtAmount)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>долг</div>
        </div>
        <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {charge.status}
        </span>
      </div>

      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px auto auto', gap: 8, marginTop: 12 }}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
          <select value={status} onChange={e => setStatus(e.target.value as PaymentStatus)} style={inputStyle}>
            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={save} disabled={saving} style={smallAccentBtn}>{saving ? '...' : 'Сохранить'}</button>
          <button onClick={onDelete} style={{ ...smallAccentBtn, background: '#FEE2E2', color: '#991B1B' }}>
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentRow({ payment, items }: { payment: FamilyPayment; items: PaymentItem[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{money(payment.amount)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
            {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('ru-RU') : 'без даты'} · {payment.paymentType}
          </div>
        </div>
        <div style={{ background: '#EEF2FF', color: 'var(--accent)', borderRadius: 6, padding: '4px 9px', fontSize: 11, fontWeight: 700 }}>
          {payment.status}
        </div>
      </div>
      {payment.comment && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>{payment.comment}</div>}
      {items.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', padding: '3px 0' }}>
              <span>{PERIOD_LABEL[String(item.periodMonth)] ?? item.periodMonth}/{item.year}</span>
              <span>{money(item.paidAmount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 13,
  color: 'var(--text)',
  background: '#fff',
  boxSizing: 'border-box',
};

const smallAccentBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '7px 12px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

function SummaryTile({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color?: string; bg?: string }) {
  return (
    <div style={{ background: bg ?? '#F3F4F6', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: color ? color + 'AA' : 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? 'var(--text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
