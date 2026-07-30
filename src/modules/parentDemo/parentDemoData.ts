// Тестовые данные и типы для прототипа родительского интерфейса трансфера.
// Никаких обращений к Supabase/Telegram/2ГИС — только статичные демо-состояния.

export type TrackingStateKey = 'enroute_far' | 'enroute_near' | 'arrived' | 'stale';

export interface TrackingState {
  key: TrackingStateKey;
  switchLabel: string;
  statusLabel: string;
  etaMinutes: number | null;
  etaText: string;
  lastUpdateMinutesAgo: number;
  isStale: boolean;
  routeProgress: number; // 0..1 — доля пройденного пути от машины до остановки ребёнка
  signal: 'live' | 'lost';
}

export const TRACKING_STATES: Record<TrackingStateKey, TrackingState> = {
  enroute_far: {
    key: 'enroute_far',
    switchLabel: '12 минут',
    statusLabel: 'Машина едет к вашей остановке',
    etaMinutes: 12,
    etaText: 'примерно 12 минут',
    lastUpdateMinutesAgo: 0,
    isStale: false,
    routeProgress: 0.18,
    signal: 'live',
  },
  enroute_near: {
    key: 'enroute_near',
    switchLabel: '3 минуты',
    statusLabel: 'Машина рядом',
    etaMinutes: 3,
    etaText: 'примерно 3 минуты',
    lastUpdateMinutesAgo: 0,
    isStale: false,
    routeProgress: 0.78,
    signal: 'live',
  },
  arrived: {
    key: 'arrived',
    switchLabel: 'Приехала',
    statusLabel: 'Машина приехала',
    etaMinutes: 0,
    etaText: 'уже на месте',
    lastUpdateMinutesAgo: 0,
    isStale: false,
    routeProgress: 1,
    signal: 'live',
  },
  stale: {
    key: 'stale',
    switchLabel: 'Нет связи',
    statusLabel: 'Нет свежей геопозиции',
    etaMinutes: 12,
    etaText: 'по последним данным ~12 минут',
    lastUpdateMinutesAgo: 7,
    isStale: true,
    routeProgress: 0.42,
    signal: 'lost',
  },
};

export const TRACKING_STATE_ORDER: TrackingStateKey[] = ['enroute_far', 'enroute_near', 'arrived', 'stale'];

export const DEMO_CONTEXT = {
  transferName: 'Трансфер №7',
  schoolName: 'Light Academy',
  childName: 'Алина',
  driverName: 'Нурлан Асанов',
  vehiclePlate: '01 KG 234 ABC',
  lastUpdateBaseTime: '08:14',
};
