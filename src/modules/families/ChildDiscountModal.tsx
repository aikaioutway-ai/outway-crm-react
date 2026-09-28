import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Child } from '../../types';
import { calcChildPrice, money } from '../../utils/pricing';

const PERCENT_OPTIONS = Array.from({ length: 21 }, (_, i) => i * 5);

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface ChildDiscountInput {
  percent: number;
  amount: number;
  validFrom: string | null;
  validTo: string | null;
  reason: string;
}

/** Постоянная скидка ребёнка: процент и/или сумма, период действия, причина. */
export default function ChildDiscountModal({ child, onClose, onSave }: {
  child: Child;
  onClose: () => void;
  onSave: (input: ChildDiscountInput) => Promise<void>;
}) {
  const [percent, setPercent] = useState(Number(child.manualDiscountPercent || 0));
  const [amount, setAmount] = useState(String(Number(child.manualDiscountAmount || 0) || ''));
  const [validFrom, setValidFrom] = useState(child.discountValidFrom?.slice(0, 7) ?? '');
  const [validTo, setValidTo] = useState(child.discountValidTo?.slice(0, 7) ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amountValue = Number(amount || 0);
  const basePrice = Number(child.basePrice || 0);
  const previewMonth = validFrom && validFrom > currentMonth() ? validFrom : currentMonth();
  const preview = calcChildPrice({
    basePrice,
    manualDiscountPercent: percent,
    manualDiscountAmount: amountValue,
    discountValidFrom: validFrom || null,
    discountValidTo: validTo || null,
    siblingEligible: Boolean(child.siblingApplied),
  }, `${previewMonth}-01`);
  const hasCurrentDiscount = Number(child.manualDiscountPercent || 0) > 0 || Number(child.manualDiscountAmount || 0) > 0;

  async function submit(clear: boolean) {
    setError('');
    if (!reason.trim()) {
      setError('Укажите причину');
      return;
    }
    if (!clear && amountValue % 100 !== 0) {
      setError('Скидка суммой — с шагом 100 сом');
      return;
    }
    if (!clear && validFrom && validTo && validFrom > validTo) {
      setError('Месяц окончания раньше месяца начала');
      return;
    }
    setSaving(true);
    try {
      await onSave(clear
        ? { percent: 0, amount: 0, validFrom: null, validTo: null, reason: reason.trim() }
        : {
          percent,
          amount: amountValue,
          validFrom: validFrom ? `${validFrom}-01` : null,
          validTo: validTo ? `${validTo}-01` : null,
          reason: reason.trim(),
        });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить скидку');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={event => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Постоянная скидка</div>
            <div style={{ fontSize: 12, color: '#7B8491' }}>{child.childName} · тариф {money(basePrice)}</div>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Закрыть"><X size={16} /></button>
        </div>

        {child.fixedPrice != null && (
          <div style={noteStyle}>У ребёнка фиксированная цена {money(Number(child.fixedPrice))} — скидка не применится, пока она действует.</div>
        )}

        <div style={gridStyle}>
          <label style={labelStyle}>Скидка, %
            <select value={percent} onChange={event => setPercent(Number(event.target.value))} style={inputStyle}>
              {PERCENT_OPTIONS.map(value => <option key={value} value={value}>{value === 0 ? '—' : `${value}%`}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Скидка, сом
            <input type="number" min={0} step={100} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" style={inputStyle} />
          </label>
          <label style={labelStyle}>С месяца
            <input type="month" value={validFrom} onChange={event => setValidFrom(event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>По месяц (включительно)
            <input type="month" value={validTo} onChange={event => setValidTo(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Причина
            <textarea value={reason} onChange={event => setReason(event.target.value)} rows={2} placeholder="Почему даём скидку" style={{ ...inputStyle, resize: 'vertical' }} />
          </label>
        </div>

        <div style={{ fontSize: 12, color: '#4B5563', margin: '10px 0' }}>
          Пусто в «С месяца» — действует сразу, пусто в «По месяц» — бессрочно. Ручная скидка отключает семейную 5%.
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
          Цена с {previewMonth}: {money(preview)}
        </div>

        {error && <div style={{ color: '#B91C1C', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {hasCurrentDiscount && (
            <button type="button" onClick={() => submit(true)} disabled={saving} style={secondaryButtonStyle}>Убрать скидку</button>
          )}
          <button type="button" onClick={() => submit(false)} disabled={saving} style={primaryButtonStyle}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .35)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const panelStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 18, width: 'min(460px, 100%)',
  boxShadow: '0 24px 60px rgba(15, 23, 42, .2)',
};
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 11, fontWeight: 750, color: '#6B7280' };
const inputStyle: React.CSSProperties = {
  border: '1px solid #DDE3E8', borderRadius: 8, padding: '7px 9px', fontSize: 13, fontFamily: 'inherit', color: '#111827',
};
const noteStyle: React.CSSProperties = {
  background: '#FEF3C7', color: '#92400E', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 650, marginBottom: 10,
};
const iconButtonStyle: React.CSSProperties = {
  border: 'none', background: '#F3F4F6', borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer',
};
const primaryButtonStyle: React.CSSProperties = {
  border: 'none', background: '#111827', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 750, cursor: 'pointer',
};
const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #E5E7EB', background: '#fff', color: '#B91C1C', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 750, cursor: 'pointer',
};
