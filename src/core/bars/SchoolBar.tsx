import React from 'react';
import { SCHOOLS } from '../../utils/schools';
import { SchoolCode } from '../../types';

interface SchoolBarProps {
  active: SchoolCode | 'ALL';
  onChange: (code: SchoolCode | 'ALL') => void;
  badges?: Partial<Record<SchoolCode | 'ALL', number>>;
}

// Цвет точки для каждой школы
const SCHOOL_COLORS: Record<string, string> = {
  KINGS:   '#EF4444',
  LIGHT:   '#F59E0B',
  BILIM:   '#EF4444',
  AES:     '#EF4444',
  KAS:     '#EF4444',
  EPSILON: '#10B981',
  GENIUS:  '#10B981',
  GENIUS4: '#10B981',
  NOVA:    '#10B981',
  INDIGO:  '#F59E0B',
  ERUDIT:  '#EF4444',
  TENSAY:  '#10B981',
  EDISON:  '#10B981',
};

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

      {/* Все школы */}
      <SchoolBtn
        label="Все школы"
        isActive={active === 'ALL'}
        onClick={() => onChange('ALL')}
        badge={badges['ALL']}
        color={null}
      />

      {SCHOOLS.map(s => (
        <SchoolBtn
          key={s.code}
          label={s.short ?? s.name}
          isActive={active === s.code}
          onClick={() => onChange(s.code)}
          badge={badges[s.code]}
          color={SCHOOL_COLORS[s.code] ?? '#6B7280'}
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
  color: string | null;
}

function SchoolBtn({ label, isActive, onClick, badge, color }: BtnProps) {
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
      {color && (
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isActive ? 'rgba(255,255,255,0.8)' : color,
          flexShrink: 0,
        }} />
      )}
      {label}
      {badge != null && badge > 0 && (
        <span style={{
          background: isActive ? 'rgba(199,210,254,0.4)' : '#EF4444',
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
