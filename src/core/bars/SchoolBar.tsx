import React from 'react';

// Все вкладки SchoolBar — по филиалам (005)
export const SCHOOL_TABS: { key: string; label: string; codes: string[]; branches: string[] }[] = [
  { key: 'ALL',   label: 'Все',    codes: [], branches: [] },
  { key: 'KNG',   label: 'KNG',   codes: ['KINGS'],   branches: [] },
  { key: 'LA',    label: 'LA',    codes: ['LIGHT'],   branches: [] },
  { key: 'BKG',   label: 'BKG',   codes: ['BILIM'],   branches: [] },
  { key: 'AES',   label: 'AES',   codes: ['AES'],     branches: [] },
  { key: 'KAS',   label: 'KAS',   codes: ['KAS'],     branches: [] },
  { key: 'EPS',   label: 'EPS',   codes: ['EPSILON'], branches: [] },
  { key: 'GEN2',  label: 'GEN #2',codes: ['GENIUS'],  branches: ['Гениум — Чуйкова','Гениум Чуйкова'] },
  { key: 'GEN4',  label: 'GEN #4',codes: ['GENIUS4'], branches: ['Гениум — Авангард','Гениум Авангард'] },
  { key: 'NOVA',  label: 'NOVA',  codes: ['NOVA'],    branches: [] },
  { key: 'ING',   label: 'ING',   codes: ['INDIGO'],  branches: ['Индиго Kids','Asylkech Girls School'] },
  { key: 'ING_P', label: 'ING_P', codes: ['INDIGO'],  branches: ['Indigo Prime Academy'] },
  { key: 'ING_W', label: 'ING_W', codes: ['INDIGO'],  branches: ['Indigo West'] },
  { key: 'TIS',   label: 'TIS',   codes: ['TENSAY'],  branches: [] },
  { key: 'ERU',   label: 'ERU',   codes: ['ERUDIT'],  branches: [] },
  { key: 'EDi',   label: 'EDi',   codes: ['EDISON'],  branches: [] },
];

interface SchoolBarProps {
  active: string;
  onChange: (key: string) => void;
  badges?: Record<string, number>;
}

export default function SchoolBar({ active, onChange, badges = {} }: SchoolBarProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      overflowX: 'auto',
      padding: '10px 20px',
      background: '#fff',
      borderBottom: '1px solid var(--border)',
      scrollbarWidth: 'none',
      alignItems: 'center',
      flexShrink: 0,
    }}>
      {SCHOOL_TABS.map(tab => (
        <SchoolBtn
          key={tab.key}
          label={tab.label}
          isActive={active === tab.key}
          onClick={() => onChange(tab.key)}
          badge={badges[tab.key]}
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
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 12px',
        borderRadius: 6,
        border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        background: isActive ? 'var(--accent)' : 'var(--bg)',
        color: isActive ? '#fff' : 'var(--text)',
        fontWeight: isActive ? 700 : 500,
        fontSize: 12,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: isActive ? 'rgba(255,255,255,0.85)' : hasBadge ? '#EF4444' : '#10B981',
      }} />
      {label}
      {hasBadge && (
        <span style={{
          background: isActive ? 'rgba(255,255,255,0.25)' : '#EF4444',
          color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700,
          padding: '0 5px', minWidth: 16, textAlign: 'center',
        }}>{badge}</span>
      )}
    </button>
  );
}
