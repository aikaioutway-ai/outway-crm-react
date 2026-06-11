import React from 'react';
import { SCHOOLS } from '../../utils/schools';
import { SchoolCode } from '../../types';

interface SchoolBarProps {
  active: SchoolCode | 'ALL';
  onChange: (code: SchoolCode | 'ALL') => void;
  badges?: Partial<Record<SchoolCode | 'ALL', number>>;
}

export default function SchoolBar({ active, onChange, badges = {} }: SchoolBarProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      overflowX: 'auto',
      padding: '12px 20px',
      background: '#fff',
      borderBottom: '1px solid var(--border)',
      scrollbarWidth: 'none',
      alignItems: 'center',
      flexShrink: 0,
    }}>
      <SchoolBtn
        label="Все школы"
        isActive={active === 'ALL'}
        onClick={() => onChange('ALL')}
        badge={badges['ALL']}
      />
      {SCHOOLS.map(s => (
        <SchoolBtn
          key={s.code}
          label={s.short ?? s.name}
          isActive={active === s.code}
          onClick={() => onChange(s.code)}
          badge={badges[s.code]}
        />
      ))}
    </div>
  );
}

interface BtnProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
}

function SchoolBtn({ label, isActive, onClick, badge }: BtnProps) {
  const hasBadge = badge != null && badge > 0;
  const dotColor = hasBadge ? '#EF4444' : '#10B981';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 6,
        border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        background: isActive ? 'var(--accent)' : 'var(--bg)',
        color: isActive ? '#fff' : 'var(--text)',
        fontWeight: isActive ? 700 : 500,
        fontSize: 13,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {/* dot: green by default, red if badge */}
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: isActive ? 'rgba(255,255,255,0.85)' : dotColor,
        flexShrink: 0,
      }} />

      {label}

      {hasBadge && (
        <span style={{
          background: isActive ? 'rgba(255,255,255,0.25)' : '#EF4444',
          color: '#fff',
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 700,
          padding: '0 6px',
          minWidth: 18,
          textAlign: 'center',
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}
