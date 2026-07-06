import React, { useMemo, useState } from 'react';
import { Loader, Paperclip, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useReceiptOcr } from '../../hooks/useReceiptOcr';
import { Charge, Child, Family, FamilyPayment, PaymentItem, PaymentType, UserRole } from '../../types';
import { money } from '../../utils/pricing';
import { ALL_PERIODS, PERIOD_LABEL } from './constants';
import { Section, Spinner, Empty } from './DrawerUI';

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
  userRole?: UserRole;
  onSaveCharge: (charge: Charge, updates: Partial<Charge>) => Promise<boolean>;
  onDeleteCharge: (charge: Charge) => void;
  onAddCharges: (month: number, year: number) => void | Promise<void>;
  onCreatePayment: (amount: number, paymentType: PaymentType, comment: string, paymentDate: string, receiptFile?: File | null, receiptCode?: string) => Promise<boolean>;
  onConfirmPayment: (payment: FamilyPayment, actualPaymentDate: string) => Promise<boolean>;
  onUnconfirmPayment?: (payment: FamilyPayment) => Promise<boolean>;
  onSavePayment: (payment: FamilyPayment, updates: Partial<FamilyPayment>) => Promise<boolean>;
  onDeletePayment: (payment: FamilyPayment) => Promise<boolean>;
}

export default function TabFinance({
  charges,
  payments,
  paymentItems,
  loading,
  children: _children,
  mainBalance,
  depositBalance,
  isAdmin,
  isCashier,
  userRole: _userRole,
  onSaveCharge: _onSaveCharge,
  onDeleteCharge: _onDeleteCharge,
  onAddCharges,
  onCreatePayment,
  onConfirmPayment,
  onUnconfirmPayment,
  onSavePayment,
  onDeletePayment,
}: Props) {
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriodKey, setNewPeriodKey] = useState('9');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const { ocrLoading, ocrMsg, receiptFile, receiptCode, setReceiptCode, handleFileChange: handleOcrFile, reset: resetOcr } = useReceiptOcr();
  const [comment, setComment] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const canCreatePayment = !isCashier || isAdmin;
  const canConfirmPayment = isCashier || isAdmin;

  const existingPeriodKeys = new Set(charges.map(c => `${periodKeyOfCharge(c)}:${c.year}`));
  const availablePeriods = ALL_PERIODS.filter(p => !existingPeriodKeys.has(`${p.month}:${p.year}`));
  const periodRows = useMemo(() => buildPeriodRows(charges, payments, paymentItems), [charges, payments, paymentItems]);
  const sortedPayments = useMemo(() => [...payments].sort((a, b) => (
    new Date(b.createdAt || b.paymentDate || 0).getTime() - new Date(a.createdAt || a.paymentDate || 0).getTime()
  )), [payments]);

  if (loading) return <Spinner />;

  async function submitPayment() {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return;
    setSavingPayment(true);
    const ok = await onCreatePayment(amount, paymentType, comment, paymentDate, receiptFile, receiptCode || undefined);
    setSavingPayment(false);
    if (ok) {
      setMsg('Платёж отправлен кассиру на проверку');
      setPaymentAmount('');
      resetOcr();
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

      <div style={financeLayoutStyle}>
        <div style={financeTopGridStyle}>
          {canCreatePayment && (
            <Section title="Новый платёж">
              <div style={paymentPanelStyle}>
                <div style={newPaymentGridStyle}>
                  <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder={totalDebt > 0 ? `Долг: ${money(totalDebt)}` : 'Сумма'} style={inputStyle} />
                  <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
                    <option value="cash">Наличные</option>
                    <option value="transfer">Безналичный QR</option>
                  </select>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputStyle} />
                  <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий" style={inputStyle} />
                  <label style={{ ...fileInputStyle, width: '100%', boxSizing: 'border-box' }}>
                    {ocrLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Paperclip size={14} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receiptFile ? receiptFile.name : 'Прикрепить чек'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={e => handleOcrFile(e.target.files?.[0] ?? null, (amount, date) => {
                        if (amount) setPaymentAmount(String(amount));
                        if (date) setPaymentDate(date);
                      })}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <input value={receiptCode} onChange={e => setReceiptCode(e.target.value)} placeholder="Код чека" style={inputStyle} />
                  {ocrMsg && <div style={{ gridColumn: '1 / -1', fontSize: 10, color: ocrMsg.startsWith('✓') ? '#065F46' : '#92400E', padding: '0 2px' }}>{ocrMsg}</div>}
                  <button onClick={submitPayment} disabled={savingPayment || !paymentAmount} style={submitPaymentBtnStyle(savingPayment || !paymentAmount)}>
                    {savingPayment ? 'Сохраняем...' : 'На проверку →'}
                  </button>
                </div>
              </div>
            </Section>
          )}

          <Section title={`Платежи (${payments.length})`}>
            <div style={paymentsListStyle}>
              {sortedPayments.length === 0 ? <Empty text="Платежей нет" /> : sortedPayments.map(payment => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  items={paymentItems.filter(i => i.paymentId === payment.id)}
                  canConfirm={canConfirmPayment && payment.status === 'На проверке'}
                  confirming={confirmingPaymentId === payment.id}
                  onConfirm={(actualPaymentDate) => confirmPayment(payment, actualPaymentDate)}
                  onSave={updates => onSavePayment(payment, updates)}
                  onDelete={() => onDeletePayment(payment)}
                  onUnconfirm={onUnconfirmPayment && payment.status === 'Подтверждено' ? () => onUnconfirmPayment(payment) : undefined}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </Section>
        </div>

        <Section
          title="Месячная таблица"
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

          <div style={financeTableWrapStyle}>
            <table style={financeTableStyle}>
              <thead>
                <tr>
                  {['Месяц', 'Начисления', 'Оплата', 'Дата списания'].map(label => (
                    <th key={label} style={financeThStyle}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodRows.length === 0 ? (
                  <tr><td colSpan={4} style={financeEmptyCellStyle}>Начислений нет</td></tr>
                ) : periodRows.map(row => (
                  <tr key={row.key}>
                    <td style={financeTdStyle}>
                      <div style={{ fontWeight: 900, color: '#17222F' }}>{row.label}</div>
                      <div style={{ fontSize: 10, color: '#8A94A3', marginTop: 2 }}>{row.childrenCount} начисл.</div>
                    </td>
                    <td style={{ ...financeTdStyle, textAlign: 'right', fontWeight: 900 }}>{money(row.charged)}</td>
                    <td style={{ ...financeTdStyle, textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, color: row.debt > 0 ? '#991B1B' : '#17222F' }}>{money(row.paid)}</div>
                      {row.debt > 0 && <div style={{ fontSize: 10, color: '#C62828', marginTop: 2 }}>долг {money(row.debt)}</div>}
                    </td>
                    <td style={financeTdStyle}>{row.writeOffDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
              {periodRows.length > 0 && (
                <tfoot>
                  <tr>
                    <td style={financeTotalCellStyle}>Итого</td>
                    <td style={{ ...financeTotalCellStyle, textAlign: 'right' }}>{money(periodRows.reduce((sum, row) => sum + row.charged, 0))}</td>
                    <td style={{ ...financeTotalCellStyle, textAlign: 'right' }}>{money(periodRows.reduce((sum, row) => sum + row.paid, 0))}</td>
                    <td style={financeTotalCellStyle} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function PaymentRow({ payment, items, canConfirm, confirming, onConfirm, onUnconfirm, onSave, onDelete, isAdmin }: {
  payment: FamilyPayment;
  items: PaymentItem[];
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: (actualPaymentDate: string) => void;
  onUnconfirm?: () => void;
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
    ? { background: '#ECFDF5', color: '#065F46' }
    : payment.status === 'Отклонено'
      ? { background: '#FEE2E2', color: '#991B1B' }
      : { background: '#FEF9C3', color: '#92400E' };

  async function save() {
    setSaving(true);
    const ok = await onSave({ amount: Number(amount), paymentType, paymentDate, actualPaymentDate, status, comment });
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function remove() {
    const msg = payment.status === 'Подтверждено'
      ? 'Отменить подтверждённый платёж? Баланс и начисления будут откатаны.'
      : 'Удалить платёж?';
    if (!window.confirm(msg)) return;
    setSaving(true);
    await onDelete();
    setSaving(false);
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{money(payment.amount)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 1 }}>
            {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('ru-RU') : 'без даты'} · {PAYMENT_TYPE_LABEL[payment.paymentType] ?? payment.paymentType}
            {payment.actualPaymentDate && <> · факт {new Date(payment.actualPaymentDate).toLocaleDateString('ru-RU')}</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ ...statusStyle, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {payment.status}
          </div>
          {onUnconfirm && !editing && (
            <button
              onClick={() => { if (window.confirm('Отменить подтверждение? Баланс будет откатан.')) onUnconfirm(); }}
              title="Отменить подтверждение"
              style={{ ...iconBtnStyle, color: '#DC2626' }}
            >
              <X size={13} />
            </button>
          )}
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)} title="Редактировать" style={iconBtnStyle}>
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Кассир: подтверждение / отклонение */}
      {canConfirm && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="date"
            value={actualPaymentDate}
            onChange={e => setActualPaymentDate(e.target.value)}
            placeholder="Дата поступления"
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              onClick={() => onConfirm(actualPaymentDate)}
              disabled={confirming || !actualPaymentDate}
              style={{
                height: 30, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 800,
                cursor: confirming || !actualPaymentDate ? 'default' : 'pointer',
                background: confirming || !actualPaymentDate ? '#D1FAE5' : '#10B981',
                color: '#fff',
              }}
            >
              {confirming ? '...' : '✓ Подтвердить'}
            </button>
            <button
              onClick={() => onSave({ status: 'Отклонено' })}
              disabled={confirming}
              style={{
                height: 30, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 800,
                cursor: confirming ? 'default' : 'pointer',
                background: '#FEE2E2', color: '#991B1B',
              }}
            >
              ✕ Отклонить
            </button>
          </div>
        </div>
      )}

      {/* Админ: редактирование */}
      {isAdmin && editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Сумма" style={inputStyle} />
            <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={inputStyle}>
              <option value="cash">Наличные</option>
              <option value="transfer">Безналичный QR</option>
            </select>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={inputStyle} />
            <input type="date" value={actualPaymentDate} onChange={e => setActualPaymentDate(e.target.value)} style={inputStyle} />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value as any)} style={{ ...inputStyle, width: '100%' }}>
            <option value="На проверке">На проверке</option>
            <option value="Отклонено">Отклонено</option>
            <option value="Черновик">Черновик</option>
            {payment.status === 'Подтверждено' && <option value="Подтверждено">Подтверждено</option>}
          </select>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий" style={{ ...inputStyle, width: '100%' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save} disabled={saving} style={smallAccentBtn}>{saving ? '...' : <><Save size={12} /> Сохранить</>}</button>
            <button onClick={() => setEditing(false)} style={{ ...smallAccentBtn, background: '#F3F4F6', color: 'var(--text)' }}><X size={12} /></button>
            <button onClick={remove} disabled={saving} style={{ ...smallAccentBtn, background: '#FEE2E2', color: '#991B1B' }}><Trash2 size={12} /></button>
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

interface PeriodFinanceRow {
  key: string;
  label: string;
  charged: number;
  paid: number;
  debt: number;
  childrenCount: number;
  writeOffDate: string;
}

function periodKeyOfCharge(charge: Pick<Charge, 'periodMonth' | 'chargeType'>): string {
  return charge.chargeType === 'deposit' ? 'deposit' : String(charge.periodMonth);
}

function periodLabel(month: number, year: number, chargeType?: string): string {
  if (chargeType === 'deposit' || month === 0) return 'Депозит';
  return `${PERIOD_LABEL[String(month)] ?? month} ${year}`;
}

function formatShortDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU');
}

function buildPeriodRows(charges: Charge[], payments: FamilyPayment[], paymentItems: PaymentItem[]): PeriodFinanceRow[] {
  const paymentsById = new Map(payments.map(payment => [payment.id, payment]));
  const grouped = new Map<string, PeriodFinanceRow & { rawMonth: number; rawYear: number; dateValue: number }>();

  ALL_PERIODS.forEach(period => {
    grouped.set(`${period.key}:${period.year}`, {
      key: `${period.key}:${period.year}`,
      label: period.label,
      charged: 0,
      paid: 0,
      debt: 0,
      childrenCount: 0,
      writeOffDate: '',
      rawMonth: period.key === 'deposit' ? 0 : period.month,
      rawYear: period.year,
      dateValue: 0,
    });
  });

  charges.forEach(charge => {
    const key = `${periodKeyOfCharge(charge)}:${charge.year}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.charged += Number(charge.amount || 0);
      existing.paid += Number(charge.paidAmount || 0);
      existing.debt += Number(charge.debtAmount || 0);
      existing.childrenCount += 1;
      return;
    }
    grouped.set(key, {
      key,
      label: periodLabel(charge.periodMonth, charge.year, charge.chargeType),
      charged: Number(charge.amount || 0),
      paid: Number(charge.paidAmount || 0),
      debt: Number(charge.debtAmount || 0),
      childrenCount: 1,
      writeOffDate: '',
      rawMonth: charge.chargeType === 'deposit' ? 0 : charge.periodMonth,
      rawYear: charge.year,
      dateValue: 0,
    });
  });

  paymentItems.forEach(item => {
    const key = `${item.periodMonth}:${item.year}`;
    const row = grouped.get(key);
    if (!row) return;
    const payment = paymentsById.get(item.paymentId);
    const dateRaw = payment?.actualPaymentDate || payment?.paymentDate || item.createdAt;
    const dateTime = dateRaw ? new Date(dateRaw).getTime() : 0;
    if (dateTime >= row.dateValue) {
      row.dateValue = dateTime;
      row.writeOffDate = formatShortDate(dateRaw);
    }
  });

  return Array.from(grouped.values())
    .sort((a, b) => (a.rawYear - b.rawYear) || (a.rawMonth - b.rawMonth))
    .map(({ rawMonth, rawYear, dateValue, ...row }) => row);
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

const financeLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
};

const financeTopGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 14,
  alignItems: 'stretch',
};

const newPaymentGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
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

function submitPaymentBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    gridColumn: '1 / -1',
    width: '100%',
    height: 34,
    border: 'none',
    borderRadius: 8,
    background: '#31A4A5',
    color: '#fff',
    fontSize: 12,
    fontWeight: 850,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

const paymentsListStyle: React.CSSProperties = {
  maxHeight: 260,
  overflowY: 'auto',
  paddingRight: 2,
};

const financeTableWrapStyle: React.CSSProperties = {
  overflowX: 'auto',
  border: '1px solid #DDE7EB',
  borderRadius: 12,
  background: '#fff',
};

const financeTableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 720,
  borderCollapse: 'collapse',
};

const financeThStyle: React.CSSProperties = {
  height: 34,
  padding: '0 14px',
  background: '#F7FBFB',
  borderBottom: '1px solid #E8EEF1',
  color: '#667085',
  fontSize: 11,
  fontWeight: 900,
  textAlign: 'left',
};

const financeTdStyle: React.CSSProperties = {
  height: 44,
  padding: '8px 14px',
  borderBottom: '1px solid #F0F3F5',
  color: '#374151',
  fontSize: 12,
  fontWeight: 750,
};

const financeTotalCellStyle: React.CSSProperties = {
  height: 40,
  padding: '8px 14px',
  background: '#F8FCFC',
  color: '#17222F',
  fontSize: 12,
  fontWeight: 900,
};

const financeEmptyCellStyle: React.CSSProperties = {
  padding: '28px 14px',
  textAlign: 'center',
  color: '#7A859D',
  fontSize: 12,
  fontWeight: 750,
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
