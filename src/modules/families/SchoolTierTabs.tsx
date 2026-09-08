import React from 'react';

export type SchoolTier = '1.0' | '2.0';

interface SchoolTierTabsProps {
  value: SchoolTier;
  onChange: (tier: SchoolTier) => void;
}

// Переключатель School 1.0 (постоянные школы) / School 2.0 (без постоянного
// контракта) — общий для всех экранов Overview (Менеджер, Кассир, Логистика,
// Водители, Зарплата), чтобы вид и поведение были одинаковыми везде.
export default function SchoolTierTabs({ value, onChange }: SchoolTierTabsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 44, padding: 4, flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxSizing: 'border-box' }}>
      {(['1.0', '2.0'] as const).map(tier => {
        const active = value === tier;
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onChange(tier)}
            title={tier === '1.0' ? 'Школы на постоянной основе' : 'Школы без постоянного контракта'}
            style={{ height: 36, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 850 : 700, background: active ? '#2DD4BF' : 'transparent', color: active ? '#fff' : '#465066', whiteSpace: 'nowrap', transition: 'background .15s ease, color .15s ease' }}
          >
            School {tier}
          </button>
        );
      })}
    </div>
  );
}
