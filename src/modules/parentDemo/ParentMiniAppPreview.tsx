import React from 'react';
import { AlertTriangle, ChevronLeft, User } from 'lucide-react';
import { TrackingState } from './parentDemoData';
import RouteMapPlaceholder from './RouteMapPlaceholder';

interface ParentMiniAppPreviewProps {
  state: TrackingState;
  transferName: string;
  childName: string;
  schoolName: string;
  driverName: string;
  vehiclePlate: string;
  onClose: () => void;
}

export default function ParentMiniAppPreview({ state, transferName, childName, schoolName, driverName, vehiclePlate, onClose }: ParentMiniAppPreviewProps) {
  const statusColor = state.isStale ? 'var(--warning)' : state.key === 'arrived' ? 'var(--success)' : 'var(--accent)';

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 380,
        margin: '0 auto',
        height: 640,
        maxHeight: '80vh',
        borderRadius: 26,
        overflow: 'hidden',
        background: '#000',
        boxShadow: '0 24px 60px rgba(16,24,40,.28)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* верхняя панель мини-приложения Telegram */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', zIndex: 3 }}>
        <button onClick={onClose} style={{ border: 'none', background: 'var(--surface-2)', width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{transferName}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)' }}>{schoolName}</div>
        </div>
      </div>

      {/* карта — основная часть экрана */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <RouteMapPlaceholder state={state} childName={childName} schoolName={schoolName} />

        {state.isStale && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              right: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 14,
              background: '#FFF1E0',
              border: '1px solid #F3D5A0',
              color: '#9A6300',
              boxShadow: '0 6px 18px rgba(154,99,0,.18)',
              zIndex: 4,
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>
              Геопозиция не обновлялась {state.lastUpdateMinutesAgo} мин — данные могут быть неточными
            </div>
          </div>
        )}
      </div>

      {/* нижняя панель — ETA, статус, водитель */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderTop: '1px solid var(--border)', padding: '14px 16px 18px', zIndex: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: statusColor }}>{state.statusLabel}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            {state.key !== 'arrived' ? (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.02em' }}>
                  {state.isStale ? 'Последнее ETA' : 'До остановки'}
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: state.isStale ? 'var(--text-2)' : 'var(--text)', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                  {state.etaMinutes} мин
                </div>
              </>
            ) : (
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--success)' }}>Машина на месте</div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 12px', minWidth: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={15} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{driverName}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)' }}>{vehiclePlate}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)' }}>
          Ребёнок: <span style={{ fontWeight: 800, color: 'var(--text)' }}>{childName}</span> · видна только ваша остановка
        </div>
      </div>
    </div>
  );
}
