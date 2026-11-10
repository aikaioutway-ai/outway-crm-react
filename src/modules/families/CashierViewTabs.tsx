import React from 'react';
import { Hourglass, CircleCheckBig, HandCoins, ReceiptText, Scale } from 'lucide-react';
export type CashierView = 'pending' | 'confirmed' | 'refunds';
export default function CashierViewTabs({ value, onChange, onSpending, onReconciliation }: { compact?: boolean; value: CashierView | 'spending' | 'reconciliation'; onChange: (view: CashierView) => void; onSpending?: () => void; onReconciliation?: () => void }) {
  return <div role="tablist" aria-label="Раздел кассира" className="ow-seg">
    {([{ key: 'pending', label: 'На проверке', Icon: Hourglass }, { key: 'confirmed', label: 'Подтверждённые', Icon: CircleCheckBig }, { key: 'refunds', label: 'Возвраты', Icon: HandCoins }] as const).map(({key, label, Icon}) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-label={label} title={label} aria-selected={value === key} onClick={() => onChange(key)} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Icon size={18} aria-hidden="true" /></button>)}
    {onSpending && <button type="button" role="tab" className="ow-seg-btn" aria-label="Расходы" title="Расходы" aria-selected={value === 'spending'} onClick={onSpending} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><ReceiptText size={18} aria-hidden="true" /></button>}
    {onReconciliation && <button type="button" role="tab" className="ow-seg-btn" aria-label="Сверка" title="Сверка" aria-selected={value === 'reconciliation'} onClick={onReconciliation} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Scale size={18} aria-hidden="true" /></button>}
  </div>;
}
