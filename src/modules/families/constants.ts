// Один источник правды для отображения школ, зон, транспорта
// Используется в FamiliesPage, FamilyDrawer и всех дочерних компонентах

export const SCHOOL_NAME: Record<string, string> = {
  KINGS: 'Kings', LIGHT: 'Light Academy', BILIM: 'Bilim KG',
  AES: 'AES', KAS: 'KAS', EPSILON: 'Epsilon',
  GENIUS: 'Genius', GENIUS4: 'Genius 4', NOVA: 'Nova',
  INDIGO: 'Indigo', ERUDIT: 'Erudit', TENSAY: 'Tensay', EDISON: 'Edison',
};

export const SCHOOL_SHORT: Record<string, string> = {
  KINGS: 'Kings', LIGHT: 'Light', BILIM: 'Bilim',
  AES: 'AES', KAS: 'KAS', EPSILON: 'Eps',
  GENIUS: 'Genius', GENIUS4: 'Gen4', NOVA: 'Nova',
  INDIGO: 'Indigo', ERUDIT: 'Erudit', TENSAY: 'Tensay', EDISON: 'Edison',
};

export const VT_LABEL: Record<string, string> = {
  microbus: 'Микроавтобус', minibus: 'Микроавтобус',
  bus: 'Микроавтобус', 'mini-bus': 'Микроавтобус',
  minivan: 'Минивэн', sedan: 'Седан', car: 'Седан',
};

export const ZONE_COLOR: Record<string, { bg: string; color: string }> = {
  A: { bg: '#E8F5E9', color: '#1B5E20' },
  B: { bg: '#EDE7F6', color: '#311B92' },
  C: { bg: '#E3F2FD', color: '#0D47A1' },
};

export const PERIOD_LABEL: Record<string, string> = {
  deposit: 'Депозит',
  '9': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь',
  '1': 'Январь',   '2': 'Февраль',  '3': 'Март',    '4': 'Апрель', '5': 'Май',
};

export const PERIOD_ORDER = ['deposit','9','10','11','12','1','2','3','4','5'];

export const ALL_PERIODS = [
  { key: 'deposit', month: 0,  year: 2026, label: 'Депозит' },
  { key: '9',       month: 9,  year: 2026, label: 'Сентябрь 2026' },
  { key: '10',      month: 10, year: 2026, label: 'Октябрь 2026' },
  { key: '11',      month: 11, year: 2026, label: 'Ноябрь 2026' },
  { key: '12',      month: 12, year: 2026, label: 'Декабрь 2026' },
  { key: '1',       month: 1,  year: 2027, label: 'Январь 2027' },
  { key: '2',       month: 2,  year: 2027, label: 'Февраль 2027' },
  { key: '3',       month: 3,  year: 2027, label: 'Март 2027' },
  { key: '4',       month: 4,  year: 2027, label: 'Апрель 2027' },
  { key: '5',       month: 5,  year: 2027, label: 'Май 2027' },
];

// Нормализация зоны из БД (1/2/3) в код (A/B/C) и обратно
export function normalizeZone(z: unknown, fallback = 'A'): string {
  if (z === 'A' || z === 'B' || z === 'C') return z as string;
  const n = Number(z);
  if (n === 1) return 'A';
  if (n === 2) return 'B';
  if (n === 3) return 'C';
  return fallback;
}

export function zoneToNum(z: string): number {
  return z === 'A' ? 1 : z === 'B' ? 2 : 3;
}

// Нормализация типа ТС из старых значений БД в единый формат
export function normalizeVehicle(vt: unknown): string {
  if (!vt) return 'microbus';
  if (vt === 'minibus' || vt === 'bus' || vt === 'mini-bus') return 'microbus';
  return String(vt);
}
