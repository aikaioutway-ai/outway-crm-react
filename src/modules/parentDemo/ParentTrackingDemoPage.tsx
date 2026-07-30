import React, { useState } from 'react';
import { MessageCircle, Smartphone } from 'lucide-react';
import { DEMO_CONTEXT, TRACKING_STATES, TRACKING_STATE_ORDER, TrackingStateKey } from './parentDemoData';
import TelegramBotMessagePreview from './TelegramBotMessagePreview';
import ParentMiniAppPreview from './ParentMiniAppPreview';

type ViewKey = 'bot_message' | 'mini_app';

function addMinutesToTime(base: string, minutesAgo: number): string {
  const [h, m] = base.split(':').map(Number);
  const total = h * 60 + m - minutesAgo;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export default function ParentTrackingDemoPage() {
  const [view, setView] = useState<ViewKey>('bot_message');
  const [stateKey, setStateKey] = useState<TrackingStateKey>('enroute_far');

  const state = TRACKING_STATES[stateKey];
  const lastUpdateTime = addMinutesToTime(DEMO_CONTEXT.lastUpdateBaseTime, state.lastUpdateMinutesAgo);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', backgroundImage: 'linear-gradient(135deg, rgba(170,212,212,.42), transparent 34%), linear-gradient(315deg, rgba(49,164,165,.13), transparent 32%)', padding: '20px 12px 40px' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-h)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            Прототип · родительский интерфейс
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            Живой трекинг школьного трансфера
          </h1>
        </div>

        {/* переключатель вида: сообщение бота / mini app */}
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 5, marginBottom: 14 }}>
          {([
            ['bot_message', 'Сообщение бота', MessageCircle],
            ['mini_app', 'Mini App', Smartphone],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                flex: 1,
                height: 38,
                border: 'none',
                borderRadius: 10,
                background: view === key ? 'var(--accent)' : 'transparent',
                color: view === key ? '#fff' : 'var(--text-2)',
                fontSize: 12.5,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'background .15s, color .15s',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* переключатель тестовых состояний */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
            Демо-состояние
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TRACKING_STATE_ORDER.map(key => {
              const option = TRACKING_STATES[key];
              const active = stateKey === key;
              return (
                <button
                  key={key}
                  onClick={() => setStateKey(key)}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 9,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--active-bg)' : 'var(--surface-2)',
                    color: active ? 'var(--accent-h)' : 'var(--text-2)',
                    fontSize: 12,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {option.switchLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* сама демонстрация */}
        {view === 'bot_message' ? (
          <TelegramBotMessagePreview
            state={state}
            transferName={DEMO_CONTEXT.transferName}
            childName={DEMO_CONTEXT.childName}
            lastUpdateTime={lastUpdateTime}
            onOpenMap={() => setView('mini_app')}
          />
        ) : (
          <ParentMiniAppPreview
            state={state}
            transferName={DEMO_CONTEXT.transferName}
            childName={DEMO_CONTEXT.childName}
            schoolName={DEMO_CONTEXT.schoolName}
            driverName={DEMO_CONTEXT.driverName}
            vehiclePlate={DEMO_CONTEXT.vehiclePlate}
            onClose={() => setView('bot_message')}
          />
        )}

        <div style={{ textAlign: 'center', marginTop: 22, fontSize: 11, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Данные тестовые. Supabase, Telegram Bot API и 2ГИС не подключены —<br />
          карта и координаты — визуальная заглушка.
        </div>
      </div>
    </div>
  );
}
