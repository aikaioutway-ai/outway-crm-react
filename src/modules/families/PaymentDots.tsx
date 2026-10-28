import React from 'react';

import { MONTH_NAMES, periodKey, type ChargeState, type ChildPaymentDots, type DotPeriod } from './paymentDotsModel';

const STATE_LABEL: Record<ChargeState, string> = {
  paid: 'оплачено',
  partial: 'оплачено частично',
  unpaid: 'не оплачено',
  none: 'нет начисления',
};

const STATE_COLOR: Record<ChargeState, string> = {
  paid: '#22C55E',
  partial: '#F59E0B',
  unpaid: '#EF4444',
  none: 'transparent',
};

const dotStyle = (state: ChargeState): React.CSSProperties => ({
  width: 9,
  height: 9,
  borderRadius: '50%',
  flex: 'none',
  boxSizing: 'border-box',
  background: STATE_COLOR[state],
  border: state === 'none' ? '1.5px solid #CBD5E1' : 'none',
});

const barStyle = (state: ChargeState): React.CSSProperties => ({
  display: 'block',
  width: 26,
  height: 5,
  borderRadius: 3,
  boxSizing: 'border-box',
  background: state === 'none' ? '#EEF1F4' : STATE_COLOR[state],
});

const SHORT_MONTH = (name: string) => name.slice(0, 3);

/**
 * Статус оплат: депозит, отступ, затем месяцы.
 * dots — маленькие точки для таблиц, bars — полоски с подписями для карточки.
 */
export default function PaymentDots({ dots, periods, variant = 'dots' }: { dots?: ChildPaymentDots; periods: DotPeriod[]; variant?: 'dots' | 'bars' }) {
  const items = [
    { label: 'Депозит', short: 'Деп', state: dots?.deposit ?? 'none' },
    ...periods.map(period => {
      const name = MONTH_NAMES[period.month - 1];
      return { label: name, short: SHORT_MONTH(name), state: dots?.months[periodKey(period)] ?? 'none' };
    }),
  ];
  const title = dots ? items.map(item => `${item.label}: ${STATE_LABEL[item.state]}`).join('\n') : 'Загрузка оплат';

  if (variant === 'bars') {
    return (
      <span title={title} aria-label={title} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 4, opacity: dots ? 1 : 0.4 }}>
        {items.map((item, index) => (
          <span key={item.label} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginRight: index === 0 ? 6 : 0 }}>
            <span style={barStyle(item.state)} />
            <span style={{ fontSize: 10, lineHeight: 1, color: 'var(--text-2, #64748B)', fontWeight: 500 }}>{item.short}</span>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span title={title} aria-label={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: dots ? 1 : 0.35 }}>
      <span style={dotStyle(items[0].state)} />
      <span style={{ width: 6 }} />
      {items.slice(1).map(item => <span key={item.label} style={dotStyle(item.state)} />)}
    </span>
  );
}
