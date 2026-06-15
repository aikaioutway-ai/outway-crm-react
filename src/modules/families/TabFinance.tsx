import React, { useMemo, useState } from 'react';
import { Paperclip, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Charge, Child, Family, FamilyPayment, PaymentItem, PaymentStatus, PaymentType } from '../../types';
import { money } from '../../utils/pricing';
import { ALL_PERIODS, PERIOD_LABEL, PERIOD_ORDER } from './constants';
import { Section, Spinner, Empty } from './DrawerUI';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Оплачено':          { bg: '#D1FAE5', color: '#065F46' },
  'Частично оплачено': { bg: '#FEF3C7', color: '#92400E' },
  'Просрочено':        { bg: '#FEE2E2', color: '#991B1B' },
  'Заморожено':        { bg: '#E0E7FF', color: '#3730A3' },
  'Не оплачено':       { bg: '#F3F4F6', color: '#374151' },
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  cash: 'Наличные',
  transfer: 'Безналичный QR',
  card: 'Безналичный QR',
  other: 'Другое',
};

interface Props {
  charges: Charge[];
  payments: FamilyPayment[];
  paymentItems: PaymentItem[];
  loading: boolean;
  family: Family;
  children: Child[];
  mainBalance: number;
  depositBalance: number;
  isAdmin: boolean;
  isCashier: boolean;
  onSaveCharge: (charge: Charge, updates: Partial<Charge>) => Promise<boolean>;
  onDeleteCharge: (charge: Charge) => void;
  onAddCharges: (month: number, year: number) => void | Promise<void>;
  onCreatePayment: (amount: number, paymentType: PaymentType, comment: string, paymentDate: string, receiptFile?: File | null) => Promise<boolean>;
  onConfirmPayment: (payment: FamilyPayment, actualPaymentDate: string) => Promise<boolean>;
  onSavePayment: (payment: FamilyPayment, updates: Partial<FamilyPayment>) => Promise<boolean>;
  onDeletePayment: (payment: FamilyPayment) => Promise<boolean>;
}

export default function TabFinance({
  charges,
  payments,
  paymentItems,
  loading,
  children,
  mainBalance,
  depositBalance,
  isAdmin,
  isCashier,
  onSaveCharge,
  onDeleteCharge,
  onAddCharges,
  onCreatePayment,
  onConfirmPayment,
  onSavePayment,
  onDeletePayment,
}: Props) {
  const [subTab, setSubTab] = useState<'overview' | 'charges' | 'payments'>('overview');
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriodKey, setNewPeriodKey] = useState('9');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
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
  const totalPenalty = charges.reduce((s, c) => s + c.penaltyAmount, 0);
  const monthlyPlan = children.reduce((s, c) => s + Number(c.finalPrice ?? 0), 0);
  const depositPlan = monthlyPlan;
  const canCreatePayment = !isCashier || isAdmin;
  const canConfirmPayment = isCashier || isAdmin;

  const existingPeriodKeys = new Set(charges.map(c => `${c.periodMonth}:${c.year}`));
  const availablePeriods = ALL_PERIODS.filter(p => !existingPeriodKeys.has(`${p.month}:${p.year}`));

  if (loading) return <Spinner />;

  async function submitPayment() {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return;
    setSavingPayment(true);
    const ok = await onCreatePayment(amount, paymentType, comment, paymentDate, receiptFile);
    setSavingPayment(false);
    if (ok) {
      setMsg('Платёж отправлен кассиру на проверку');
      setPaymentAmount('');
      setReceiptFile(null);
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

  async function confirmPayment(payment: FamilyPayment, actualPaymentDate: string) {
    setConfirmingPaymentId(payment.id);
    const ok = await onConfirmPayment(payment, actualPaymentDate);
    setConfirmingPaymentId(null);
    setMsg(ok ? 'Платёж подтверждён и распределён' : 'Не удалось подтвердить платёж');
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div>
      {msg && (
        <div style={{ background: msg.includes('Не удалось') ? '#FEE2E2' : '#D1FAE5', color: msg.includes('Не удалось') ? '#991B1B' : '#065F46', borderRadius: 8, padding: '7px 12px', marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
          {msg}
        </div>
      )}

      <div style={subTabsStyle}>
        <SubTabButton active={subTab === 'overview'} onClick={() => setSubTab('overview')}>Обзор</SubTabButton>
        <SubTabButton active={subTab === 'charges'} onClick={() => setSubTab('charges')}>Начисления</SubTabButton>
        <SubTabButton active={subTab === 'payments'} onClick={() => setSubTab('payments')}>Платежи</SubTabButton>
      </div>

      {subTab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
        <SummaryTile label="Начислено" value={money(totalCharged)} />
        <SummaryTile label="Оплачено" value={money(totalPaid)} color="#065F46" bg="#D1FAE5" />
        <SummaryTile label="Долг" value={money(totalDebt)} color={totalDebt > 0 ? '#991B1B' : '#065F46'} bg={totalDebt > 0 ? '#FEE2E2' : '#D1FAE5'} />
        <SummaryTile label="Пеня" value={money(totalPenalty)} sub={`${children.length} детей`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <SummaryTile label="Баланс" value={money(mainBalance)} color={mainBalance < 0 ? '#991B1B' : '#065F46'} bg={mainBalance < 0 ? '#FEE2E2' : '#D1FAE5'} />
        <SummaryTile label="Депозит" value={money(depositBalance)} color="#3730A3" bg="#E0E7FF" />
        <SummaryTile label="План / месяц" value={money(monthlyPlan)} />
        <SummaryTile label="План депозит" value={money(depositPlan)} />
          </div>

          <Section title={`План по детям (${children.length})`}>
        {children.length === 0 ? <Empty text="Детей нет" /> : (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {children.map(child => (
              <div key={child.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 92px 92px',
                gap: 8,
                alignItems: 'center',
                padding: '7px 12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {child.childName || 'Без имени'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 1 }}>
                    {child.class ? `${child.class} кл.` : 'класс не указан'} · {child.branchShort || child.schoolCode}
                  </div>
                </div>
                <PlanCell label="Месяц" value={money(Number(child.finalPrice ?? 0))} />
                <PlanCell label="Депозит" value={money(Number(child.finalPrice ?? 0))} />
              </div>
            ))}
          </div>
        )}
          </Section>

          {canCreatePayment && <Section title="Внести платёж семьи">
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 135px', gap: 8, marginBottom: 8 }}>
            <input
              type="number"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              placeholder={totalDebt > 0 ? `Долг: ${totalDebt}` : 'Сумма платежа'}
              style={inputStyle}
            />
            <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
              <option value="cash">Наличные</option>
              <option value="transfer">Безналичный QR</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '145px 1fr', gap: 8, marginBottom: 8 }}>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              style={inputStyle}
            />
            <label style={fileInputStyle}>
              <Paperclip size={14} />
              <span>{receiptFile ? receiptFile.name : 'Прикрепить чек'}</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Комментарий"
            style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
          />
          <button onClick={submitPayment} disabled={savingPayment || !paymentAmount} style={{
            width: '100%', padding: '8px 12px', border: 'none', borderRadius: 8,
            background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: savingPayment || !paymentAmount ? 'default' : 'pointer', opacity: savingPayment || !paymentAmount ? 0.6 : 1,
          }}>
            {savingPayment ? 'Сохраняем...' : 'Отправить на проверку'}
          </button>
        </div>
          </Section>}
        </>
      )}

      {subTab === 'charges' && <Section
        title={`Начисления по детям (${charges.length})`}
        action={isAdmin && (
          <button onClick={() => setAddingPeriod(p => !p)} style={smallAccentBtn}>
            <Plus size={11} /> Период
          </button>
        )}
      >
        {addingPeriod && (
          <div style={{ background: '#EEF2FF', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Создать начисления всем детям</div>
            <div style={{ display: 'flex', gap: 7 }}>
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
      </Section>}

      {subTab === 'payments' && <Section title={`Платежи семьи (${payments.length})`}>
        {payments.length === 0 ? <Empty text="Платежей нет" /> : payments.map(payment => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            items={paymentItems.filter(i => i.paymentId === payment.id)}
            canConfirm={canConfirmPayment && payment.status === 'На проверке'}
            confirming={confirmingPaymentId === payment.id}
            onConfirm={(actualPaymentDate) => confirmPayment(payment, actualPaymentDate)}
            onSave={updates => onSavePayment(payment, updates)}
            onDelete={() => onDeletePayment(payment)}
            isAdmin={isAdmin}
          />
        ))}
      </Section>}
    </div>
  );
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      border: 'none',
      borderRadius: 7,
      padding: '7px 10px',
      background: active ? 'var(--accent)' : '#EEF2FF',
      color: active ? '#fff' : 'var(--accent)',
      fontSize: 12,
      fontWeight: 800,
      cursor: 'pointer',
    }}>
      {children}
    </button>
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
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const sc = STATUS_COLORS[charge.status] ?? STATUS_COLORS['Не оплачено'];
  const period = charge.periodMonth === 0 ? 'Депозит' : PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth);

  async function save() {
    if (!reason.trim()) {
      window.alert('Напишите комментарий: почему меняете начисление.');
      return;
    }
    setSaving(true);
    const ok = await onSave({ amount: Number(amount), status, isFrozen: status === 'Заморожено', comment: reason });
    setSaving(false);
    if (ok) {
      setReason('');
      setEditing(false);
    }
  }

  function cancel() {
    setAmount(String(charge.amount));
    setStatus(charge.status);
    setReason('');
    setEditing(false);
  }

  return (
    <div style={{ border: `1px solid ${sc.bg}`, borderLeft: `3px solid ${sc.color}`, borderRadius: 8, background: '#fff', padding: '9px 12px', marginBottom: 7 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 105px 105px auto', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{charge.childName ?? charge.childId}</div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 1 }}>{period} {charge.year}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{money(charge.amount)}</div>
          <div style={{ fontSize: 10, color: '#065F46' }}>опл. {money(charge.paidAmount)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: charge.debtAmount > 0 ? '#991B1B' : '#065F46' }}>{money(charge.debtAmount)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-2)' }}>долг</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: '3px 7px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {charge.status}
          </span>
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)} title="Редактировать" style={iconBtnStyle}>
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      {isAdmin && editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 155px auto auto auto', gap: 7, marginTop: 8 }}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
          <select value={status} onChange={e => setStatus(e.target.value as PaymentStatus)} style={inputStyle}>
            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={save} disabled={saving} title="Сохранить" style={smallAccentBtn}>
            {saving ? '...' : <><Save size={12} /> Сохранить</>}
          </button>
          <button onClick={cancel} title="Закрыть" style={{ ...smallAccentBtn, background: '#F3F4F6', color: 'var(--text)' }}>
            <X size={12} />
          </button>
          <button onClick={onDelete} style={{ ...smallAccentBtn, background: '#FEE2E2', color: '#991B1B' }}>
            <Trash2 size={12} />
          </button>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Комментарий к изменению"
            style={{ ...inputStyle, gridColumn: '1 / -1' }}
          />
        </div>
      )}
    </div>
  );
}

function PaymentRow({ payment, items, canConfirm, confirming, onConfirm, onSave, onDelete, isAdmin }: {
  payment: FamilyPayment;
  items: PaymentItem[];
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: (actualPaymentDate: string) => void;
  onSave: (updates: Partial<FamilyPayment>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [paymentType, setPaymentType] = useState<PaymentType>(payment.paymentType);
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate ? payment.paymentDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [actualPaymentDate, setActualPaymentDate] = useState(
    payment.actualPaymentDate
      ? payment.actualPaymentDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState(payment.status);
  const [comment, setComment] = useState(payment.comment ?? '');
  const [saving, setSaving] = useState(false);
  const statusStyle = payment.status === 'Подтверждено'
    ? { background: '#D1FAE5', color: '#065F46' }
    : payment.status === 'Отклонено'
      ? { background: '#FEE2E2', color: '#991B1B' }
      : { background: '#FEF3C7', color: '#92400E' };

  async function save() {
    setSaving(true);
    const ok = await onSave({
      amount: Number(amount),
      paymentType,
      paymentDate,
      actualPaymentDate,
      status,
      comment,
    });
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!window.confirm('Удалить платёж?')) return;
    setSaving(true);
    const ok = await onDelete();
    setSaving(false);
    if (!ok) window.alert('Подтверждённый платёж нельзя удалить простым удалением: сначала нужен откат.');
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{money(payment.amount)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 1 }}>
            {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('ru-RU') : 'без даты'} · {PAYMENT_TYPE_LABEL[payment.paymentType] ?? payment.paymentType}
            {payment.actualPaymentDate && <> · факт {new Date(payment.actualPaymentDate).toLocaleDateString('ru-RU')}</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...statusStyle, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700 }}>
            {payment.status}
          </div>
          {canConfirm && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                value={actualPaymentDate}
                onChange={e => setActualPaymentDate(e.target.value)}
                title="Факт дата оплаты"
                style={{ ...inputStyle, width: 130, height: 28, padding: '4px 7px' }}
              />
              <button onClick={() => onConfirm(actualPaymentDate)} disabled={confirming || !actualPaymentDate} style={smallAccentBtn}>
                {confirming ? '...' : 'Подтвердить'}
              </button>
            </div>
          )}
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)} title="Редактировать" style={iconBtnStyle}>
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
      {isAdmin && editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 135px 145px', gap: 7, marginTop: 8 }}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
          <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
            <option value="cash">Наличные</option>
            <option value="transfer">Безналичный QR</option>
          </select>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputStyle} />
          <input type="date" value={actualPaymentDate} onChange={e => setActualPaymentDate(e.target.value)} style={inputStyle} />
          <select value={status} onChange={e => setStatus(e.target.value as any)} style={inputStyle}>
            <option value="На проверке">На проверке</option>
            <option value="Отклонено">Отклонено</option>
            <option value="Черновик">Черновик</option>
            {payment.status === 'Подтверждено' && <option value="Подтверждено">Подтверждено</option>}
          </select>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий" style={{ ...inputStyle, gridColumn: '2 / -1' }} />
          <div style={{ display: 'flex', gap: 7, gridColumn: '1 / -1' }}>
            <button onClick={save} disabled={saving} style={smallAccentBtn}>{saving ? '...' : 'Сохранить'}</button>
            <button onClick={() => setEditing(false)} style={{ ...smallAccentBtn, background: '#F3F4F6', color: 'var(--text)' }}>Закрыть</button>
            <button onClick={remove} disabled={saving} style={{ ...smallAccentBtn, background: '#FEE2E2', color: '#991B1B' }}>
              <Trash2 size={12} /> Удалить
            </button>
          </div>
        </div>
      )}
      {payment.comment && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>{payment.comment}</div>}
      {payment.receiptUrl && (
        <a href={payment.receiptUrl} target="_blank" rel="noreferrer" style={receiptLinkStyle}>
          <Paperclip size={12} /> Чек
        </a>
      )}
      {items.length > 0 && (
        <div style={{ marginTop: 7, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', padding: '2px 0' }}>
              <span>{PERIOD_LABEL[String(item.periodMonth)] ?? item.periodMonth}/{item.year}</span>
              <span>{money(item.paidAmount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '7px 9px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 12,
  color: 'var(--text)',
  background: '#fff',
  boxSizing: 'border-box',
};

const subTabsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  marginBottom: 12,
};

const smallAccentBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '6px 10px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const fileInputStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '7px 9px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--accent)',
  background: '#fff',
  cursor: 'pointer',
  overflow: 'hidden',
};

const receiptLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  marginTop: 6,
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--accent)',
  textDecoration: 'none',
};

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 7,
  background: 'var(--accent)',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

function SummaryTile({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color?: string; bg?: string }) {
  return (
    <div style={{ background: bg ?? '#F3F4F6', borderRadius: 8, padding: '9px 11px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: color ? color + 'AA' : 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--text)', marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
