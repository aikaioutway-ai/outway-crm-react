import React from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Navigation } from 'lucide-react';
import { TrackingState } from './parentDemoData';

interface TelegramBotMessagePreviewProps {
  state: TrackingState;
  transferName: string;
  childName: string;
  lastUpdateTime: string;
  onOpenMap: () => void;
}

function statusVisual(state: TrackingState) {
  if (state.isStale) return { Icon: AlertTriangle, color: 'var(--warning)', bg: '#FFF6E7' };
  if (state.key === 'arrived') return { Icon: CheckCircle2, color: 'var(--success)', bg: '#E8F8F0' };
  if (state.key === 'enroute_near') return { Icon: Navigation, color: 'var(--accent)', bg: 'var(--active-bg)' };
  return { Icon: Navigation, color: 'var(--accent)', bg: 'var(--active-bg)' };
}

export default function TelegramBotMessagePreview({ state, transferName, childName, lastUpdateTime, onOpenMap }: TelegramBotMessagePreviewProps) {
  const { Icon, color, bg } = statusVisual(state);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 380,
        margin: '0 auto',
        background: '#E6EBE0',
        borderRadius: 20,
        padding: '18px 12px',
        backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,.5) 0, transparent 45%)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7C8B99', textAlign: 'center', marginBottom: 10 }}>
        Сегодня
      </div>

      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '4px 16px 16px 16px',
          padding: 14,
          boxShadow: '0 1px 2px rgba(16,24,32,.08)',
          fontFamily: 'var(--font)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            🚌
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3 }}>{transferName}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>OutWay · трансфер-бот</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: bg, marginBottom: 12 }}>
          <Icon size={18} color={color} strokeWidth={2.4} />
          <span style={{ fontSize: 13, fontWeight: 800, color }}>{state.statusLabel}</span>
        </div>

        {state.key !== 'arrived' ? (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 2 }}>
              {state.isStale ? 'Последнее известное время' : 'Время до остановки'}
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, color: state.isStale ? 'var(--text-2)' : 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {state.etaMinutes} мин
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success)' }}>Машина на месте</div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.02em' }}>Ребёнок</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{childName}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.02em' }}>Геопозиция</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: state.isStale ? 'var(--warning)' : 'var(--text)' }}>
              <Clock size={12} />
              {lastUpdateTime}
            </div>
          </div>
        </div>

        {state.isStale && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 10px', borderRadius: 12, background: '#FFF1E0', color: '#9A6300', fontSize: 11.5, fontWeight: 700, marginBottom: 10, lineHeight: 1.4 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            Геопозиция не обновлялась {state.lastUpdateMinutesAgo} мин — данные могут быть неточными.
          </div>
        )}

        <button
          onClick={onOpenMap}
          style={{
            width: '100%',
            height: 42,
            border: 'none',
            borderRadius: 12,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          Открыть карту машины
          <ArrowUpRight size={16} />
        </button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#A8B2C2', fontStyle: 'italic' }}>изменено</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#A8B2C2' }}>{lastUpdateTime}</span>
        </div>
      </div>
    </div>
  );
}
