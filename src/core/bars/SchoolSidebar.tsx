import React from 'react';

export const SCHOOL_TABS: { key: string; label: string; codes: string[]; branches: string[] }[] = [
  { key: 'ALL',   label: 'Все',     codes: [], branches: [] },
  { key: 'KNG',   label: 'KNG',    codes: ['KINGS'],   branches: [] },
  { key: 'LA',    label: 'LA',     codes: ['LIGHT'],   branches: [] },
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

interface SchoolSidebarProps {
  active: string;
  onChange: (key: string) => void;
  counts?: Record<string, number>;  // количество записей
  badges?: Record<string, number>;  // новые заявки (красный)
}

export default function SchoolSidebar({ active, onChange, counts = {}, badges = {} }: SchoolSidebarProps) {
  return (
    <div style={{
      width: 110,
      flexShrink: 0,
      background: 'var(--bg)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {SCHOOL_TABS.map((tab, idx) => {
        const isActive = active === tab.key;
        const count = counts[tab.key] ?? 0;
        const badge = badges[tab.key] ?? 0;
        const hasBadge = badge > 0;
        const isAll = tab.key === 'ALL';

        return (
          <React.Fragment key={tab.key}>
            <button
              onClick={() => onChange(tab.key)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: isActive ? '9px 10px 9px 14px' : '8px 10px 8px 12px',
                border: 'none',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                background: isActive ? '#fff' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.12s',
                gap: 4,
              }}
            >
              <span style={{
                fontSize: isActive ? 13 : 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {tab.label}
              </span>

              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: hasBadge ? '#fff' : (isActive ? 'var(--accent)' : 'var(--text-2)'),
                background: hasBadge ? '#EF4444' : (isActive ? 'var(--accent-l)' : 'transparent'),
                borderRadius: 10,
                padding: hasBadge || isActive ? '1px 5px' : '0',
                minWidth: hasBadge || isActive ? 20 : 'auto',
                textAlign: 'center',
                flexShrink: 0,
              }}>
                {count > 0 ? count : ''}
              </span>
            </button>

            {/* Разделитель — тонкая линия между школами (не после последней) */}
            {idx < SCHOOL_TABS.length - 1 && !isAll && (
              <div style={{ height: 1, background: 'var(--border)', margin: '0 8px' }} />
            )}
            {/* После ALL — чуть жирнее */}
            {isAll && (
              <div style={{ height: 1, background: 'var(--border)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
