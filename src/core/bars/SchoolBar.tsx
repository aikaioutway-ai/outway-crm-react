import React from 'react';
import { SCHOOLS } from '../../utils/schools';
import { SchoolCode } from '../../types';

interface SchoolBarProps {
  active: SchoolCode | 'ALL';
  onChange: (code: SchoolCode | 'ALL') => void;
  badges?: Partial<Record<SchoolCode | 'ALL', number>>;
}

export default function SchoolBar({ active, onChange, badges = {} }: SchoolBarProps) {
  const tabs = [{ code: 'ALL' as const, name: 'Все школы' }, ...SCHOOLS];

  return (
    <div style={{
      display: 'flex', gap: 4, overflowX: 'auto', padding: '12px 20px',
      background: '#fff', borderBottom: '1px solid var(--border)',
      scrollbarWidth: 'none',
    }}>
      {tabs.map(s => {
        const isActive = active === s.code;
        const badge = badges[s.code];
        return (
          <button
            key={s.code}
            onClick={() => onChange(s.code)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 20, border: 'none',
              whiteSpace: 'nowrap', fontSize: 13, cursor: 'pointer',
              background: isActive ? 'var(--accent)' : 'var(--bg)',
              color: isActive ? '#fff' : 'var(--text)',
              fontWeight: isActive ? 600 : 400,
              transition: 'background 0.15s',
            }}
          >
            {s.name}
            {badge != null && badge > 0 && (
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--danger)',
                color: '#fff', borderRadius: 10, fontSize: 11,
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
