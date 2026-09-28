import React, { useMemo, useState } from 'react';
import { Charge, ChargeDiscount, ChargeDiscountReason, Child } from '../../types';
import { CHARGE_DISCOUNT_REASON_LABEL, money } from '../../utils/pricing';
import { PERIOD_LABEL } from './constants';
import { Empty, Section } from './DrawerUI';

function chargeLabel(charge: Charge, childName: string): string {
  const period = charge.chargeType === 'deposit'
    ? 'Депозит'
    : `${PERIOD_LABEL[String(charge.periodMonth)] ?? charge.periodMonth} ${charge.year}`;
  return `${childName} · ${period} · ${money(charge.amount)}`;
}

/** Разовые скидки на конкретное начисление (неполный месяц, перерасчёт и т.д.). */
export default function ChargeDiscountsSection({ charges, discounts, children, canManage, onAdd, onCancel }: {
  charges: Charge[];
  discounts: ChargeDiscount[];
  children: Child[];
  canManage: boolean;
  onAdd: (input: { chargeId: string; amount: number; reasonType: ChargeDiscountReason; comment: string }) => Promise<void>;
  onCancel: (discount: ChargeDiscount) => Promise<void>;
}) {
  const childNames = useMemo(() => new Map(children.map(child => [child.id, child.childName])), [children]);
  const chargeById = useMemo(() => new Map(charges.map(charge => [charge.id, charge])), [charges]);
  const discountable = charges.filter(charge => charge.status !== 'Заморожено' && charge.amount > 0);
  const [chargeId, setChargeId] = useState('');
  const [amount, setAmount] = useState('');
  const [reasonType, setReasonType] = useState<ChargeDiscountReason>('partial_month');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!canManage && discounts.length === 0) return null;

  const nameOf = (childId: string, charge?: Charge) => childNames.get(childId) ?? charge?.childName ?? 'Ребёнок';

  async function submit() {
    setError('');
    const charge = chargeById.get(chargeId);
    const value = Number(amount);
    if (!charge) { setError('Выберите начисление'); return; }
    if (!value || value <= 0) { setError('Введите сумму скидки'); return; }
    if (value > charge.amount) { setError(`Скидка больше начисления (${money(charge.amount)})`); return; }
    if (reasonType === 'other' && !comment.trim()) { setError('Для «Другое» нужен комментарий'); return; }
    setBusy(true);
    try {
      await onAdd({ chargeId, amount: value, reasonType, comment: comment.trim() });
      setChargeId('');
      setAmount('');
      setComment('');
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Не удалось добавить скидку');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(discount: ChargeDiscount) {
    if (!window.confirm(`Отменить разовую скидку ${money(discount.amount)}? Сумма вернётся в начисление.`)) return;
    setBusy(true);
    setError('');
    try {
      await onCancel(discount);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Не удалось отменить скидку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Разовые скидки">
      {canManage && (
        <div style={formStyle}>
          <select value={chargeId} onChange={event => setChargeId(event.target.value)} style={{ ...inputStyle, gridColumn: '1 / -1' }}>
            <option value="">Начисление…</option>
            {discountable.map(charge => (
              <option key={charge.id} value={charge.id}>{chargeLabel(charge, nameOf(charge.childId, charge))}</option>
            ))}
          </select>
          <input type="number" min={0} value={amount} onChange={event => setAmount(event.target.value)} placeholder="Сумма скидки" style={inputStyle} />
          <select value={reasonType} onChange={event => setReasonType(event.target.value as ChargeDiscountReason)} style={inputStyle}>
            {Object.entries(CHARGE_DISCOUNT_REASON_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input value={comment} onChange={event => setComment(event.target.value)} placeholder="Комментарий" style={{ ...inputStyle, gridColumn: '1 / -1' }} />
          <button type="button" onClick={submit} disabled={busy} style={{ ...buttonStyle, gridColumn: '1 / -1' }}>
            {busy ? 'Сохраняем...' : 'Дать скидку'}
          </button>
          {error && <div style={{ gridColumn: '1 / -1', color: '#B91C1C', fontSize: 12, fontWeight: 700 }}>{error}</div>}
        </div>
      )}
      {discounts.length === 0 ? <Empty text="Разовых скидок нет" /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {discounts.map(discount => {
            const charge = chargeById.get(discount.chargeId);
            const cancelled = Boolean(discount.cancelledAt);
            return (
              <div key={discount.id} style={{ ...rowStyle, opacity: cancelled ? 0.55 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, textDecoration: cancelled ? 'line-through' : undefined }}>
                    −{money(discount.amount)} · {CHARGE_DISCOUNT_REASON_LABEL[discount.reasonType] ?? discount.reasonType}
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>
                    {charge ? chargeLabel(charge, nameOf(discount.childId, charge)) : nameOf(discount.childId)}
                    {discount.comment ? ` · ${discount.comment}` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: '#9CA3AF' }}>
                    {discount.createdBy ?? '—'} · {discount.createdAt.slice(0, 10)}
                    {cancelled ? ` · отменил ${discount.cancelledBy ?? '—'}` : ''}
                  </div>
                </div>
                {canManage && !cancelled && (
                  <button type="button" onClick={() => cancel(discount)} disabled={busy} style={cancelButtonStyle}>Отменить</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

const formStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 };
const inputStyle: React.CSSProperties = {
  border: '1px solid #DDE3E8', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', minWidth: 0,
};
const buttonStyle: React.CSSProperties = {
  border: 'none', background: '#111827', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 750, cursor: 'pointer',
};
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  background: '#F8FAFC', borderRadius: 8, padding: '7px 10px',
};
const cancelButtonStyle: React.CSSProperties = {
  border: '1px solid #E5E7EB', background: '#fff', color: '#B91C1C', borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 750, cursor: 'pointer', flexShrink: 0,
};
