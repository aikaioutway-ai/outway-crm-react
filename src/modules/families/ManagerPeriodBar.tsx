import React from 'react';
import { Layers3 } from 'lucide-react';
import { ALL_PERIODS } from './constants';

interface ManagerPeriodBarProps {
  periodKey: string;
  onPeriodKeyChange: (key: string) => void;
  periods?: ReadonlyArray<{ key: string; month: number; year: number; label: string }>;
  showAll?: boolean;
  useLabels?: boolean;
  activeColor?: string;
  allLabel?: string;
  periodCounts?: Readonly<Record<string, number>>;
  periodTitle?: (period: { key: string; label: string }) => string;
  onPeriodContextMenu?: (periodKey: string, event: React.MouseEvent) => void;
}

export default function ManagerPeriodBar({
  periodKey,
  onPeriodKeyChange,
  periods = ALL_PERIODS,
  showAll = true,
  useLabels = false,
  activeColor = 'var(--accent)',
  allLabel,
  periodCounts,
  periodTitle,
  onPeriodContextMenu,
}: ManagerPeriodBarProps) {
  const specialButtonStyle = (active: boolean): React.CSSProperties => ({
    width: 36,
    height: 28,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    background: active ? activeColor : 'transparent',
    color: active ? '#fff' : 'var(--text-2)',
    transition: 'background .15s ease, color .15s ease',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      height: 36,
      padding: 3,
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
            title={allLabel ?? "Все периоды"}
            aria-label={allLabel ?? "Все периоды"}
            aria-pressed={periodKey === 'ALL'}
          >
            {allLabel ?? <Layers3 size={17} />}
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
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1 }}>D</span>
            </button>
          );
        }
        return (
          <button
            key={period.key}
            onClick={() => onPeriodKeyChange(period.key)}
            onContextMenu={onPeriodContextMenu ? event => { event.preventDefault(); onPeriodContextMenu(period.key, event); } : undefined}
            title={periodTitle ? periodTitle(period) : period.label}
            aria-label={periodCounts ? `${period.label}: новых заявок ${periodCounts[period.key] ?? 0}` : period.label}
            aria-pressed={active}
            style={{ position: 'relative', flex: 1, minWidth: 34, height: 28, padding: '0 6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 850 : 700, background: active ? activeColor : 'transparent', color: active ? '#fff' : '#465066', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', transition: 'background .15s ease, color .15s ease' }}
          >
            {useLabels ? period.label : String(period.month).padStart(2, '0')}
            {!!periodCounts?.[period.key] && <span aria-hidden="true" style={{ position: 'absolute', top: -2, right: 0, minWidth: 14, height: 14, padding: '0 3px', boxSizing: 'border-box', borderRadius: 7, background: 'var(--danger)', color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: '14px', textAlign: 'center', pointerEvents: 'none' }}>{periodCounts[period.key]}</span>}
          </button>
        );
      })}
    </div>
  );
}
