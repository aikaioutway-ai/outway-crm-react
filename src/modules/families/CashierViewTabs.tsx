import React from 'react';
export type CashierView = 'pending' | 'confirmed' | 'refunds';
export default function CashierViewTabs({ value, onChange }: { compact?: boolean; value: CashierView; onChange: (view: CashierView) => void }) {
  return <div role="tablist" aria-label="Раздел кассира" className="ow-seg">
    {([['pending', 'На проверке'], ['confirmed', 'Подтверждённые'], ['refunds', 'Возвраты']] as const).map(([key, label]) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-selected={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}
