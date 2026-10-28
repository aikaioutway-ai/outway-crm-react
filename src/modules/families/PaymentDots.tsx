import React from 'react';

import { MONTH_NAMES, periodKey, type ChargeState, type ChildPaymentDots, type DotPeriod } from './paymentDotsModel';

const STATE_LABEL: Record<ChargeState, string> = {
  paid: 'оплачено',
  partial: 'оплачено частично',
  unpaid: 'не оплачено',
  none: 'нет начисления',
};

const dotStyle = (state: ChargeState): React.CSSProperties => ({
  width: 9,
  height: 9,
  borderRadius: '50%',
  flex: 'none',
  boxSizing: 'border-box',
  background: state === 'paid' ? '#22C55E' : state === 'unpaid' ? '#EF4444' : state === 'partial' ? '#F59E0B' : 'transparent',
  border: state === 'none' ? '1.5px solid #CBD5E1' : 'none',
});

export default function PaymentDots({ dots, periods }: { dots?: ChildPaymentDots; periods: DotPeriod[] }) {
  if (!dots) return <span style={{ display: 'inline-flex', gap: 4, opacity: 0.35 }} aria-label="Загрузка оплат">{[0, 1, 2, 3].map(index => <span key={index} style={dotStyle('none')} />)}</span>;
  const items = [
    { label: 'Депозит', state: dots.deposit },
    ...periods.map(period => ({ label: MONTH_NAMES[period.month - 1], state: dots.months[periodKey(period)] ?? 'none' })),
  ];
  const title = items.map(item => `${item.label}: ${STATE_LABEL[item.state]}`).join('\n');
  return (
    <span title={title} aria-label={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={dotStyle(items[0].state)} />
      <span style={{ width: 6 }} />
      {items.slice(1).map(item => <span key={item.label} style={dotStyle(item.state)} />)}
    </span>
  );
}
