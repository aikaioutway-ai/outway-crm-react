import React from 'react';
import { SCHOOLS } from '../../utils/schools';
import { SchoolCode } from '../../types';

interface SchoolBarProps {
  active: SchoolCode | 'ALL';
  onChange: (code: SchoolCode | 'ALL') => void;
  badges?: Partial<Record<SchoolCode | 'ALL', number>>;
}

const SHORT: Record<string, string> = {
  KINGS:   'Kings',
  LIGHT:   'Light',
  BILIM:   'Bilim',
  AES:     'AES',
  KAS:     'KAS',
  EPSILON: 'Eps',
  GENIUS:  'Genius',
  GENIUS4: 'Gen4',
  NOVA:    'Nova',
  INDIGO:  'Indigo',
  ERUDIT:  'Erudit',
  TENSAY:  'Tensay',
  EDISON:  'Edison',
};

export default function SchoolBar({ active, onChange, badges = {} }: SchoolBarProps) {
  const tabs = [{ code: 'ALL' as const, name: 'Все' }, ...SCHOOLS];

  return (
    <div style={{
      display: 'flex', gap: 5, overflowX: 'auto',
      padding: '14px 20px',
      background: '#fff', borderBottom: '1px solid var(--border)',
      scrollbarWidth: 'none', alignItems: 'center',
    }}>
      {tabs.map(s => {
        const isActive = active === s.code;
        const badge = badges[s.code as keyof typeof badges];
        const label = s.code === 'ALL' ? 'Все школы' : SHORT[s.code] ?? s.name;

        return (
          <button
            key={s.code}
            onClick={() => onChange(s.code)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8, border: 'none',
              whiteSpace: 'nowrap', fontSize: 13, cursor: 'pointer',
              background: isActive ? 'var(--accent)' : 'var(--bg)',
              color: isActive ? '#fff' : 'var(--text-2)',
              fontWeight: isActive ? 700 : 500,
              transition: 'all 0.15s',
            }}
          >
            {label}
            {badge != null && badge > 0 && (
              <span style={{
                background: isActive ? 'rgba(199,210,254,0.35)' : 'var(--danger)',
                color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700,
                padding: '0 6px', minWidth: 18, textAlign: 'center',
              }}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
