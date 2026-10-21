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
    <div className="ow-overlay" style={overlayStyle} onClick={onClose}>
      <div className="ow-modal" style={panelStyle} onClick={event => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Постоянная скидка</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{child.childName} · тариф {money(basePrice)}</div>
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
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Цена с {previewMonth}: {money(preview)}
        </div>

        {error && <div style={{ color: '#B91C1C', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {hasCurrentDiscount && (
            <button type="button" onClick={() => submit(true)} disabled={saving} style={{ ...secondaryButtonStyle, color: 'var(--danger)' }}>Убрать скидку</button>
          )}
          <button type="button" onClick={() => submit(false)} disabled={saving} style={primaryButtonStyle}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15, 23, 32, .42)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
export const panelStyle: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 12, padding: 20, width: 'min(460px, 100%)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
};
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
export const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)' };
export const inputStyle: React.CSSProperties = {
  height: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)',
};
export const noteStyle: React.CSSProperties = {
  background: '#FFF8EB', color: '#8A5A12', border: '1px solid #F5DFB5', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 500, marginBottom: 12,
};
export const iconButtonStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--text-2)', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer',
};
const primaryButtonStyle: React.CSSProperties = {
  height: 34, border: '1px solid var(--accent-h)', background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '0 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
export const secondaryButtonStyle: React.CSSProperties = {
  height: 34, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, padding: '0 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
