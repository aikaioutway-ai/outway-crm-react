import React from 'react';
import { Layers3 } from 'lucide-react';
import { ALL_PERIODS } from './constants';

interface ManagerPeriodBarProps {
  periodKey: string;
  onPeriodKeyChange: (key: string) => void;
  periods?: ReadonlyArray<{ key: string; month: number; year: number; label: string }>;
  showAll?: boolean;
}

export default function ManagerPeriodBar({
  periodKey,
  onPeriodKeyChange,
  periods = ALL_PERIODS,
  showAll = true,
}: ManagerPeriodBarProps) {
  const specialButtonStyle = (active: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    background: active ? '#2DD4BF' : 'transparent',
    color: active ? '#fff' : 'var(--text-2)',
    transition: 'background .15s ease, color .15s ease',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      height: 44,
      padding: 4,
      overflowX: 'auto',
      flexShrink: 0,
      width: '100%',
      minWidth: 0,
      scrollbarWidth: 'none',
      boxSizing: 'border-box',
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      {showAll && (
        <>
          <button
            onClick={() => onPeriodKeyChange('ALL')}
            style={specialButtonStyle(periodKey === 'ALL')}
            title="Все периоды"
            aria-label="Все периоды"
          >
            <Layers3 size={17} />
          </button>
          <span aria-hidden="true" style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
        </>
      )}
      {periods.map(period => {
        const active = periodKey === period.key;
        if (period.key === 'deposit') {
          return (
            <button
              key={period.key}
              onClick={() => onPeriodKeyChange(period.key)}
              style={specialButtonStyle(active)}
              title="Депозит"
              aria-label="Депозит"
            >
              <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1 }}>D</span>
            </button>
          );
        }
        return (
          <button
            key={period.key}
            onClick={() => onPeriodKeyChange(period.key)}
            title={period.label}
            aria-label={period.label}
            style={{ flex: 1, minWidth: 34, height: 36, padding: '0 6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 850 : 700, background: active ? '#2DD4BF' : 'transparent', color: active ? '#fff' : '#465066', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', transition: 'background .15s ease, color .15s ease' }}
          >
            {String(period.month).padStart(2, '0')}
          </button>
        );
      })}
    </div>
  );
}
