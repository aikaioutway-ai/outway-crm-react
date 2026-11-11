import React from 'react';
import { Hourglass, CircleCheckBig, HandCoins, ReceiptText, Scale } from 'lucide-react';
export type CashierView = 'pending' | 'confirmed' | 'refunds';
export default function CashierViewTabs({ value, onChange, onSpending, onReconciliation, cards, summaries, extraMetrics }: { cards?: boolean; extraMetrics?: Partial<Record<'spending' | 'reconciliation', { label: string; value: string | number }[]>>; summaries?: Record<CashierView, { amount: string; count: string }>; compact?: boolean; value: CashierView | 'spending' | 'reconciliation'; onChange: (view: CashierView) => void; onSpending?: () => void; onReconciliation?: () => void }) {
  if (cards) {
    const tabs = [
      { key: 'pending', label: 'На проверке', Icon: Hourglass, select: () => onChange('pending') },
      { key: 'confirmed', label: 'Подтверждённые', Icon: CircleCheckBig, select: () => onChange('confirmed') },
      { key: 'refunds', label: 'Возвраты', Icon: HandCoins, select: () => onChange('refunds') },
      { key: 'spending', label: 'Расходы', Icon: ReceiptText, select: onSpending },
      { key: 'reconciliation', label: 'Сверка', Icon: Scale, select: onReconciliation },
    ];
    return <div role="tablist" aria-label="Раздел кассира" className="manager-mode-cards cashier2-mode-cards">
      {tabs.filter(tab => tab.select).map(({ key, label, Icon, select }) => (
        <button key={key} type="button" role="tab" className="manager-mode-card" aria-selected={value === key} onClick={select}>
          <Icon size={18} aria-hidden="true" />
          <span className="manager-mode-title">{label}</span>
          {summaries && (key === 'pending' || key === 'confirmed' || key === 'refunds') && <span className="manager-mode-metrics">
            <span className="manager-mode-metric"><span>Сумма</span><strong>{summaries[key].amount}</strong></span>
            <span className="manager-mode-metric"><span>Количество</span><strong>{summaries[key].count}</strong></span>
          </span>}
          {(key === 'spending' || key === 'reconciliation') && extraMetrics?.[key] && <span className="manager-mode-metrics">
            {extraMetrics[key]?.map(metric => <span className="manager-mode-metric" key={metric.label}>
              <span>{metric.label}</span><strong>{metric.value}</strong>
            </span>)}
          </span>}
        </button>
      ))}
    </div>;
  }
  return <div role="tablist" aria-label="Раздел кассира" className="ow-seg">
    {([{ key: 'pending', label: 'На проверке', Icon: Hourglass }, { key: 'confirmed', label: 'Подтверждённые', Icon: CircleCheckBig }, { key: 'refunds', label: 'Возвраты', Icon: HandCoins }] as const).map(({key, label, Icon}) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-label={label} title={label} aria-selected={value === key} onClick={() => onChange(key)} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Icon size={18} aria-hidden="true" /></button>)}
    {onSpending && <button type="button" role="tab" className="ow-seg-btn" aria-label="Расходы" title="Расходы" aria-selected={value === 'spending'} onClick={onSpending} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><ReceiptText size={18} aria-hidden="true" /></button>}
    {onReconciliation && <button type="button" role="tab" className="ow-seg-btn" aria-label="Сверка" title="Сверка" aria-selected={value === 'reconciliation'} onClick={onReconciliation} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Scale size={18} aria-hidden="true" /></button>}
  </div>;
}
