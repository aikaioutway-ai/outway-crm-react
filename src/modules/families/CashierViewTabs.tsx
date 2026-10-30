import React from 'react';
import { Clock3, BadgeCheck, Undo2, WalletCards, FlaskConical } from 'lucide-react';
export type CashierView = 'pending' | 'confirmed' | 'refunds';
export default function CashierViewTabs({ value, onChange, onSpending, onPreview }: { compact?: boolean; value: CashierView | 'spending' | 'preview'; onChange: (view: CashierView) => void; onSpending?: () => void; onPreview?: () => void }) {
  return <div role="tablist" aria-label="Раздел кассира" className="ow-seg">
    {([{ key: 'pending', label: 'На проверке', Icon: Clock3 }, { key: 'confirmed', label: 'Подтверждённые', Icon: BadgeCheck }, { key: 'refunds', label: 'Возвраты', Icon: Undo2 }] as const).map(({key, label, Icon}) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-label={label} title={label} aria-selected={value === key} onClick={() => onChange(key)} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Icon size={18} aria-hidden="true" /></button>)}
    {onSpending && <button type="button" role="tab" className="ow-seg-btn" aria-label="Расходы" title="Расходы" aria-selected={value === 'spending'} onClick={onSpending} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><WalletCards size={18} aria-hidden="true" /></button>}
    {/* Тестовая вкладка: касса в стиле «Расходов», только просмотр. */}
    {onPreview && <button type="button" role="tab" className="ow-seg-btn" aria-label="Касса в стиле расходов (тест)" title="Касса в стиле расходов (тест)" aria-selected={value === 'preview'} onClick={onPreview} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><FlaskConical size={18} aria-hidden="true" /></button>}
  </div>;
}
