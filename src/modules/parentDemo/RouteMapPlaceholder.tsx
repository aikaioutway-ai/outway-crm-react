import React from 'react';
import { Car, MapPin, School } from 'lucide-react';
import { TrackingState } from './parentDemoData';

interface RouteMapPlaceholderProps {
  state: TrackingState;
  childName: string;
  schoolName: string;
  compact?: boolean;
}

// Точки маршрута на условном холсте 400x300 — фиксированный красивый изгиб,
// не привязан к реальным координатам. Это временная визуальная заглушка,
// которую позже заменит 2ГИС-карта с настоящим маршрутом.
const ROUTE_START = { x: 24, y: 258 };
const ROUTE_CONTROL = { x: 150, y: 40 };
const STOP_POINT = { x: 232, y: 112 };
const SCHOOL_CONTROL = { x: 320, y: 34 };
const SCHOOL_POINT = { x: 374, y: 78 };

function quadraticPoint(t: number, p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function quadraticPath(p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
}

export default function RouteMapPlaceholder({ state, childName, schoolName, compact }: RouteMapPlaceholderProps) {
  const carPoint = quadraticPoint(state.routeProgress, ROUTE_START, ROUTE_CONTROL, STOP_POINT);
  const isLost = state.signal === 'lost';
  const isArrived = state.key === 'arrived';
  const iconScale = compact ? 0.82 : 1;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: compact ? 150 : '100%',
        minHeight: compact ? 150 : 260,
        borderRadius: compact ? 14 : 0,
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #E4F1F0 0%, #D7EEEE 55%, #CDE9E4 100%)',
      }}
    >
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
        {/* условная дорожная сетка */}
        <g stroke="#BFDAD9" strokeWidth={1}>
          {Array.from({ length: 8 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 40} x2={400} y2={i * 40} />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <line key={`v${i}`} x1={i * 44} y1={0} x2={i * 44} y2={300} />
          ))}
        </g>

        {/* оставшийся маршрут до остановки ребёнка — основная линия */}
        <path
          d={quadraticPath(ROUTE_START, ROUTE_CONTROL, STOP_POINT)}
          fill="none"
          stroke={isLost ? '#9AABB0' : 'var(--accent)'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={isLost ? '2 10' : undefined}
          opacity={isLost ? 0.55 : 0.9}
        />

        {/* продолжение маршрута до школы — второстепенная линия */}
        <path
          d={quadraticPath(STOP_POINT, SCHOOL_CONTROL, SCHOOL_POINT)}
          fill="none"
          stroke="#9AABB0"
          strokeWidth={3}
          strokeDasharray="3 7"
          strokeLinecap="round"
          opacity={0.6}
        />

        {/* остановка ребёнка */}
        <circle cx={STOP_POINT.x} cy={STOP_POINT.y} r={9} fill="#FFFFFF" stroke="var(--accent)" strokeWidth={3} />

        {/* школа */}
        <circle cx={SCHOOL_POINT.x} cy={SCHOOL_POINT.y} r={8} fill="#FFFFFF" stroke="#9AABB0" strokeWidth={2.5} />

        {/* машина */}
        {!isArrived && (
          <circle
            cx={carPoint.x}
            cy={carPoint.y}
            r={13}
            fill={isLost ? '#B9C3C6' : 'var(--accent)'}
            opacity={isLost ? 0.75 : 1}
            stroke="#fff"
            strokeWidth={3}
          />
        )}
        {isArrived && (
          <circle cx={STOP_POINT.x} cy={STOP_POINT.y} r={13} fill="var(--success)" stroke="#fff" strokeWidth={3} />
        )}

        {/* иконки/подписи — рисуются внутри того же viewBox через foreignObject,
            поэтому всегда совпадают с точками маршрута при любой обрезке (slice) */}
        <foreignObject x={STOP_POINT.x - 60} y={STOP_POINT.y - 62} width={120} height={54} overflow="visible">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <MapPin size={20 * iconScale} color="var(--accent)" fill="#fff" strokeWidth={2.4} />
            <span style={{ fontSize: 11 * iconScale, fontWeight: 800, color: 'var(--text)', background: 'rgba(255,255,255,.9)', padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap' }}>{childName}</span>
          </div>
        </foreignObject>

        <foreignObject x={SCHOOL_POINT.x - 60} y={SCHOOL_POINT.y - 56} width={120} height={50} overflow="visible">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <School size={17 * iconScale} color="#626C8B" strokeWidth={2.2} />
            {!compact && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', background: 'rgba(255,255,255,.88)', padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap' }}>{schoolName}</span>
            )}
          </div>
        </foreignObject>

        {!isArrived && (
          <foreignObject x={carPoint.x - 12} y={carPoint.y - 12} width={24} height={24} overflow="visible">
            <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={16 * iconScale} color="#fff" strokeWidth={2.6} />
            </div>
          </foreignObject>
        )}
        {isArrived && (
          <foreignObject x={STOP_POINT.x - 12} y={STOP_POINT.y - 12} width={24} height={24} overflow="visible">
            <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={14 * iconScale} color="#fff" strokeWidth={2.6} />
            </div>
          </foreignObject>
        )}
      </svg>

      <div style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 9, fontWeight: 700, color: '#7A859D', background: 'rgba(255,255,255,.82)', padding: '2px 8px', borderRadius: 8 }}>
        демо-карта · заменится на 2ГИС
      </div>
    </div>
  );
}
