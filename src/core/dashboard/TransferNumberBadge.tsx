import React from 'react';
import { VEHICLE_COLOR } from './TransferCell';
import HoverNote from './HoverNote';

const VEHICLE_LABEL: Record<string, string> = { microbus: 'Микроавтобус', minivan: 'Минивэн', sedan: 'Седан' };

const TRANSFER_X_COLOR = '#64748B';
// «!» — логист принял в работу, «?» — ожидание, «Х» — отказ.
const SPECIAL: Record<string, { label: string; title: string; color: string }> = {
  X: { label: 'Х', title: 'Трансфер Х · отказ', color: TRANSFER_X_COLOR },
  Х: { label: 'Х', title: 'Трансфер Х · отказ', color: TRANSFER_X_COLOR },
  '!': { label: '!', title: 'Принят логистом в работу', color: '#2563EB' },
  '?': { label: '?', title: 'Ожидание', color: '#B45309' },
};

export default function TransferNumberBadge({ number, vehicleType, note }: { number?: string | number | null; vehicleType?: string | null; /** Кто, когда и почему — в подсказке. */ note?: string | null }) {
  const special = SPECIAL[String(number ?? '')];
  if (special) {
    return <HoverNote note={note}><span title={note ? undefined : special.title} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, height: 24, padding: '0 7px', borderRadius: 6, background: special.color, color: '#fff', fontSize: 12.5, fontWeight: 700, boxSizing: 'border-box' }}>
      {special.label}
      {note && <span aria-hidden="true" style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, background: '#fff', boxShadow: `inset 0 0 0 2px ${special.color}` }} />}
    </span></HoverNote>;
  }
  const numbers = String(number ?? '').split(',').map(value => value.trim().replace(/^№\s*/, '')).filter(value => /^\d+$/.test(value) && Number(value) > 0);
  if (!numbers.length) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  const color = VEHICLE_COLOR[vehicleType ?? ''] ?? '#64748B';
  return <HoverNote note={note}><span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
    {numbers.map((value, index) => <span key={`${value}-${index}`} data-vehicle-color={color} title={note ? undefined : `${VEHICLE_LABEL[vehicleType ?? ''] ?? 'Тип ТС не указан'} · Трансфер №${value}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, height: 24, padding: '0 7px', borderRadius: 6, background: color, color: '#fff', fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>{value}</span>)}
  </span></HoverNote>;
}
