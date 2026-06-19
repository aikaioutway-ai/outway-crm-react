import React, { useMemo, useState } from 'react';
import { Paperclip, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Charge, Child, Family, FamilyPayment, PaymentItem, PaymentStatus, PaymentType } from '../../types';
import { money } from '../../utils/pricing';
import { ALL_PERIODS, PERIOD_LABEL, PERIOD_ORDER } from './constants';
import { Section, Spinner, Empty } from './DrawerUI';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Оплачено':          { bg: '#F3F4F6', color: '#374151' },
  'Частично оплачено': { bg: '#F2F5E9', color: '#687C54' },
  'Просрочено':        { bg: '#FEE2E2', color: '#991B1B' },
  'Заморожено':        { bg: '#EEF2F5', color: '#475569' },
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
      PERIOD_ORDER.indexOf(periodKeyOfCharge(a)) -
      PERIOD_ORDER.indexOf(periodKeyOfCharge(b))
    ) || a.childName?.localeCompare(b.childName ?? '', 'ru') || 0);
  }, [charges]);

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const canCreatePayment = !isCashier || isAdmin;
  const canConfirmPayment = isCashier || isAdmin;

  const existingPeriodKeys = new Set(charges.map(c => `${periodKeyOfCharge(c)}:${c.year}`));
  const availablePeriods = ALL_PERIODS.filter(p => !existingPeriodKeys.has(`${p.month}:${p.year}`));
  const forecastRows = buildForecastRows(children, charges);
  const forecastTotal = forecastRows.filter(row => row.state === 'planned').reduce((sum, row) => sum + row.amount, 0);

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
        <div style={{ background: msg.includes('Не удалось') ? '#FEE2E2' : '#F7F9FB', color: msg.includes('Не удалось') ? '#991B1B' : '#374151', borderRadius: 8, padding: '7px 12px', marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
          {msg}
        </div>
      )}

      {canCreatePayment && <Section title="Новый платёж">
        <div style={paymentPanelStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 132px 132px auto', gap: 7, alignItems: 'center' }}>
            <input
              type="number"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              placeholder={totalDebt > 0 ? `Долг: ${money(totalDebt)}` : 'Сумма'}
              style={inputStyle}
            />
            <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
              <option value="cash">Наличные</option>
              <option value="transfer">Безналичный QR</option>
            </select>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              style={inputStyle}
            />
            <button onClick={submitPayment} disabled={savingPayment || !paymentAmount} style={{
              minWidth: 124, height: 31, padding: '0 12px', border: 'none', borderRadius: 8,
              background: '#D7EEEE', color: '#237F81', fontSize: 11, fontWeight: 800,
              cursor: savingPayment || !paymentAmount ? 'default' : 'pointer', opacity: savingPayment || !paymentAmount ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}>
              {savingPayment ? 'Сохраняем...' : 'На проверку'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 180px', gap: 7, marginTop: 7 }}>
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Комментарий"
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
        </div>
      </Section>}

      <Section title="Прогноз начислений">
        <div style={forecastPanelStyle}>
          <div style={forecastSummaryStyle}>
            <span>К созданию</span>
            <b>{money(forecastTotal)}</b>
          </div>
          <div style={forecastSummaryStyle}>
            <span>Баланс</span>
            <b>{money(mainBalance)}</b>
          </div>
          <div style={forecastSummaryStyle}>
            <span>Депозит</span>
            <b>{money(depositBalance)}</b>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {forecastRows.map(row => (
            <div key={row.key} style={forecastRowStyle}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 850, color: '#111827' }}>{row.label}</div>
                <div style={{ fontSize: 10, color: '#7B8491', marginTop: 1 }}>{row.note}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 850, color: '#111827' }}>{money(row.amount)}</div>
                <div style={{ fontSize: 10, color: row.state === 'planned' ? '#687C54' : '#7B8491', marginTop: 1 }}>
                  {row.state === 'paid' ? 'закрыто' : row.state === 'created' ? 'уже создано' : 'план'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div style={financeColumnsStyle}>
        <Section
          title={`Начисления (${charges.length})`}
          action={isAdmin && (
            <button onClick={() => setAddingPeriod(p => !p)} style={smallAccentBtn}>
              <Plus size={11} /> Период
            </button>
          )}
        >
          {addingPeriod && (
            <div style={{ background: '#F7F9FB', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 8 }}>Создать начисления всем детям</div>
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
        </Section>

        <Section title={`Платежи (${payments.length})`}>
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
        </Section>
      </div>
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
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const sc = STATUS_COLORS[charge.status] ?? STATUS_COLORS['Не оплачено'];
  const period = periodKeyOfCharge(charge) === 'deposit' ? 'Депозит' : PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth);

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
          <div style={{ fontSize: 10, color: '#6B7280' }}>опл. {money(charge.paidAmount)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: charge.debtAmount > 0 ? '#991B1B' : '#111827' }}>{money(charge.debtAmount)}</div>
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
    ? { background: '#F3F4F6', color: '#374151' }
    : payment.status === 'Отклонено'
      ? { background: '#FEE2E2', color: '#991B1B' }
      : { background: '#F2F5E9', color: '#687C54' };

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

type ForecastState = 'planned' | 'created' | 'paid';

interface ForecastRow {
  key: string;
  label: string;
  note: string;
  amount: number;
  state: ForecastState;
}

function periodKeyOfCharge(charge: Pick<Charge, 'periodMonth' | 'chargeType'>): string {
  return charge.chargeType === 'deposit' ? 'deposit' : String(charge.periodMonth);
}

function buildForecastRows(children: Child[], charges: Charge[]): ForecastRow[] {
  const activeChildren = children.filter(child => child.status === 'boarded');
  const monthlyAmount = activeChildren.reduce((sum, child) => sum + Number(child.finalPrice ?? 0), 0);
  const hasActiveChildren = activeChildren.length > 0;
  const byKey = new Map<string, Charge[]>();
  charges.forEach(charge => {
    const key = `${periodKeyOfCharge(charge)}:${charge.year}`;
    byKey.set(key, [...(byKey.get(key) ?? []), charge]);
  });

  const currentYear = new Date().getFullYear();
  const depositCharges = charges.filter(charge => periodKeyOfCharge(charge) === 'deposit');
  const depositAmount = hasActiveChildren ? monthlyAmount : 0;
  const depositPaid = depositCharges.length > 0 && depositCharges.every(charge => charge.debtAmount <= 0);
  const depositCreated = depositCharges.length > 0;
  const depositRow: ForecastRow = {
    key: 'deposit',
    label: 'Депозит',
    note: hasActiveChildren ? `${activeChildren.length} детей на трансфере` : 'посаженных детей нет',
    amount: depositCreated ? depositCharges.reduce((sum, charge) => sum + charge.amount, 0) : depositAmount,
    state: depositPaid ? 'paid' : depositCreated ? 'created' : 'planned',
  };

  const nextPeriod = ALL_PERIODS.find(period => {
    if (period.key === 'deposit') return false;
    const periodCharges = byKey.get(`${period.month}:${period.year}`) ?? [];
    return periodCharges.length === 0 || periodCharges.some(charge => charge.debtAmount > 0);
  }) ?? ALL_PERIODS.find(period => period.key !== 'deposit');

  const periodCharges = nextPeriod ? byKey.get(`${nextPeriod.month}:${nextPeriod.year}`) ?? [] : [];
  const periodPaid = periodCharges.length > 0 && periodCharges.every(charge => charge.debtAmount <= 0);
  const periodCreated = periodCharges.length > 0;
  const periodRow: ForecastRow = {
    key: nextPeriod?.key ?? 'month',
    label: nextPeriod?.label ?? 'Ближайший месяц',
    note: hasActiveChildren ? `${activeChildren.length} детей на трансфере` : 'посаженных детей нет',
    amount: periodCreated ? periodCharges.reduce((sum, charge) => sum + charge.amount, 0) : monthlyAmount,
    state: periodPaid ? 'paid' : periodCreated ? 'created' : 'planned',
  };

  if (!nextPeriod && currentYear) return [depositRow];
  return [depositRow, periodRow];
}

const inputStyle: React.CSSProperties = {
  height: 31,
  padding: '0 9px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text)',
  background: '#fff',
  boxSizing: 'border-box',
};

const financeColumnsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  alignItems: 'start',
};

const forecastPanelStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
};

const forecastSummaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  border: '1px solid #E8EEF1',
  borderRadius: 8,
  background: '#fff',
  padding: '8px 10px',
  color: '#6B7280',
  fontSize: 11,
  fontWeight: 800,
};

const forecastRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
  alignItems: 'center',
  border: '1px solid #E8EEF1',
  borderRadius: 8,
  background: '#fff',
  padding: '8px 10px',
};

const smallAccentBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '6px 10px',
  background: '#D7EEEE',
  color: '#237F81',
  border: 'none',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const fileInputStyle: React.CSSProperties = {
  minWidth: 0,
  height: 31,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '0 9px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 800,
  color: '#374151',
  background: '#fff',
  cursor: 'pointer',
  overflow: 'hidden',
};

const paymentPanelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #DDE7EB',
  borderRadius: 10,
  padding: 9,
  boxShadow: '0 8px 20px rgba(8,11,11,0.04)',
};

const receiptLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  marginTop: 6,
  fontSize: 11,
  fontWeight: 800,
  color: '#374151',
  textDecoration: 'none',
};

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 7,
  background: '#D7EEEE',
  color: '#237F81',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

