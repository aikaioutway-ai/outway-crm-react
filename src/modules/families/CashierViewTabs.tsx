import React from 'react';
export type CashierView = 'pending' | 'confirmed' | 'refunds';
export default function CashierViewTabs({ value, onChange, compact = false }: { compact?: boolean; value: CashierView; onChange: (view: CashierView) => void }) {
  return <div role="tablist" aria-label="Раздел кассира" style={{ display: 'flex', gap: 2, padding: 3, height: 34, marginBottom: compact ? 8 : 0, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 12, flexShrink: 0 }}>
    {([['pending', 'На проверке'], ['confirmed', 'Подтверждённые'], ['refunds', 'Возвраты']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} style={{ height: 26, padding: '0 14px', border: 'none', borderRadius: 8, background: value === key ? 'var(--accent)' : 'transparent', color: value === key ? '#fff' : 'var(--text-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>)}
  </div>;
}
