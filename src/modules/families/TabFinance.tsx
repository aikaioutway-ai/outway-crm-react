import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader, Paperclip, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { extractReceiptData } from '../../services/receiptOcr';
import { Charge, Child, Family, FamilyPayment, PaymentItem, PaymentStatus, PaymentType, UserRole } from '../../types';
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
  children,
  mainBalance,
  depositBalance,
  isAdmin,
  isCashier,
  userRole,
  onSaveCharge,
  onDeleteCharge,
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptCode, setReceiptCode] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState('');
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
    const ok = await onCreatePayment(amount, paymentType, comment, paymentDate, receiptFile, receiptCode || undefined);
    setSavingPayment(false);
    if (ok) {
      setMsg('Платёж отправлен кассиру на проверку');
      setPaymentAmount('');
      setReceiptFile(null);
      setReceiptCode('');
      setOcrMsg('');
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

      <div style={threeColumnsStyle}>
        {/* Левая колонка: платёж + прогноз */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canCreatePayment && (
            <Section title="Новый платёж">
              <div style={paymentPanelStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder={totalDebt > 0 ? `Долг: ${money(totalDebt)}` : 'Сумма'}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                  <select value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)} style={{ ...inputStyle, width: '100%' }}>
                    <option value="cash">Наличные</option>
                    <option value="transfer">Безналичный QR</option>
                  </select>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                  <input
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Комментарий"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                  <label style={{ ...fileInputStyle, width: '100%', boxSizing: 'border-box' }}>
                    {ocrLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Paperclip size={14} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {receiptFile ? receiptFile.name : 'Прикрепить чек'}
                    </span>
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
                          if (result.amount) setPaymentAmount(String(result.amount));
                          if (result.date) setPaymentDate(result.date);
                          setOcrMsg(result.receipt_code ? '✓ Данные извлечены' : 'Код не найден');
                        } catch (err: any) {
                          console.error('OCR error:', err);
                          setOcrMsg('OCR ошибка: ' + (err?.message ?? String(err)));
                        }
                        setOcrLoading(false);
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {ocrMsg && (
                    <div style={{ fontSize: 10, color: ocrMsg.startsWith('✓') ? '#065F46' : '#92400E', padding: '2px 2px' }}>
                      {ocrMsg}
                    </div>
                  )}
                  <input
                    value={receiptCode}
                    onChange={e => setReceiptCode(e.target.value)}
                    placeholder="Код чека"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                  <button onClick={submitPayment} disabled={savingPayment || !paymentAmount} style={{
                    width: '100%', height: 34, border: 'none', borderRadius: 8,
                    background: '#D7EEEE', color: '#237F81', fontSize: 12, fontWeight: 800,
                    cursor: savingPayment || !paymentAmount ? 'default' : 'pointer',
                    opacity: savingPayment || !paymentAmount ? 0.6 : 1,
                  }}>
                    {savingPayment ? 'Сохраняем...' : 'На проверку →'}
                  </button>
                </div>
              </div>
            </Section>
          )}

          <Section title="Прогноз">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {forecastRows.filter(row => row.state !== 'paid').map((row, i, arr) => (
                <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{row.label}</div>
                    {row.note && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{row.note}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: row.state === 'created' ? '#374151' : '#111827' }}>{money(row.amount)}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{row.state === 'created' ? 'создано' : 'план'}</div>
                  </div>
                </div>
              ))}
              {forecastRows.filter(r => r.state !== 'paid').length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E8EEF1', paddingTop: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#374151' }}>Итого</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#111827' }}>{money(forecastRows.filter(r => r.state !== 'paid').reduce((s, r) => s + r.amount, 0))}</span>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Средняя колонка: начисления */}
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
                userRole={userRole}
                onSave={updates => onSaveCharge(charge, updates)}
                onDelete={() => onDeleteCharge(charge)}
              />
            ))
          }
          {charges.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 105px 105px auto', gap: 8, padding: '8px 12px', borderTop: '2px solid #E8EEF1', marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#374151' }}>Итого</div>
              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#111827' }}>{money(charges.reduce((s, c) => s + c.amount, 0))}</div>
              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 800, color: charges.reduce((s, c) => s + c.debtAmount, 0) > 0 ? '#991B1B' : '#111827' }}>{money(charges.reduce((s, c) => s + c.debtAmount, 0))}</div>
              <div />
            </div>
          )}
        </Section>

        {/* Правая колонка: платежи */}
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
              onUnconfirm={onUnconfirmPayment && payment.status === 'Подтверждено' ? () => onUnconfirmPayment(payment) : undefined}
              isAdmin={isAdmin}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

const CAN_REMOVE_PENALTY: UserRole[] = ['admin', 'gen_director', 'director'];

function ChargeRow({ charge, isAdmin, userRole, onSave, onDelete }: {
  charge: Charge;
  isAdmin: boolean;
  userRole?: UserRole;
  onSave: (updates: Partial<Charge>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const canRemovePenalty = !!userRole && CAN_REMOVE_PENALTY.includes(userRole);
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
      {charge.penaltyAmount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '5px 8px', background: '#FEF2F2', borderRadius: 6, border: '1px solid #FECACA' }}>
          <AlertTriangle size={12} color="#DC2626" />
          <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700, flex: 1 }}>
            Пеня: {money(charge.penaltyAmount)} (макс. {money(Math.round(charge.amount * 0.15))})
          </span>
          {canRemovePenalty && (
            <button
              onClick={() => onSave({ penaltyAmount: 0 })}
              title="Убрать пеню"
              style={{ fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}
            >
              Убрать пеню
            </button>
          )}
        </div>
      )}
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
    if (!window.confirm('Удалить платёж?')) return;
    setSaving(true);
    const ok = await onDelete();
    setSaving(false);
    if (!ok) window.alert('Подтверждённый платёж нельзя удалить: сначала нужен откат.');
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

const threeColumnsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '220px minmax(0, 1fr) minmax(0, 1fr)',
  gap: 12,
  alignItems: 'start',
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

