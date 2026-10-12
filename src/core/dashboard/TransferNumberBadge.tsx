import React from 'react';
import { VEHICLE_COLOR } from './TransferCell';

const VEHICLE_LABEL: Record<string, string> = { microbus: 'Микроавтобус', minivan: 'Минивэн', sedan: 'Седан' };

export default function TransferNumberBadge({ number, vehicleType }: { number?: string | number | null; vehicleType?: string | null }) {
  const numbers = String(number ?? '').split(',').map(value => value.trim().replace(/^№\s*/, '')).filter(value => /^\d+$/.test(value) && Number(value) > 0);
  if (!numbers.length) return <span style={{ color: 'var(--text-2)' }}>—</span>;
  const color = VEHICLE_COLOR[vehicleType ?? ''] ?? '#64748B';
  return <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
    {numbers.map((value, index) => <span key={`${value}-${index}`} title={`${VEHICLE_LABEL[vehicleType ?? ''] ?? 'Тип ТС не указан'} · Трансфер №${value}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, height: 24, padding: '0 7px', borderRadius: 6, background: color, color: '#fff', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>{value}</span>)}
  </span>;
}
