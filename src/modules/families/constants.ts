// Один источник правды для отображения школ, зон, транспорта

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

// Маппинг branch_name из БД → короткое название в CRM
export const BRANCH_SHORT: Record<string, string> = {
  // INDIGO
  'Индиго Kids':          'ING',
  'Индиго кидс':          'ING',
  'Asylkech Girls School':'ING_A',
  'AsylKech Girls School':'ING_A',
  'Indigo Prime Academy': 'ING_P',
  'Indigo West':          'ING_W',
  // GENIUS
  'Гениум — Чуйкова':    'GEN #2',
  'Гениум — Авангард':   'GEN #4',
  'Гениум Чуйкова':      'GEN #2',
  'Гениум Авангард':     'GEN #4',
  'Гениум Авангард Сити':'GEN #4',
  // Остальные
  'Edison':                        'EDI',
  'Эдисон':                        'EDI',
  'Эрудит-ISIT':                   'ERU',
  'Тенсай':                        'TIS',
  'American-European School':      'AES',
  'Kyrgyz-American School':        'KAS',
  'Билим Бишкек Kg':               'BKG',
  'Билим Бишкек KG':               'BKG',
  'Билим Бишкек kg':               'BKG',
  'Nova International School':     'NOVA',
  'Эпсилон':                       'EPS',
  'Light Academy':                 'LA',
  'Kings International School':    'KNG',
};

// Группировка branch_name по school_code для фильтра филиалов
// ING_A входит в ING (одна трансферная линия)
export const BRANCH_TO_FILTER: Record<string, string> = {
  'Индиго Kids':          'ING',
  'Индиго кидс':          'ING',
  'Asylkech Girls School':'ING',   // ING_A едет с ING
  'AsylKech Girls School':'ING',
  'Indigo Prime Academy': 'ING_P',
  'Indigo West':          'ING_W',
  'Гениум — Чуйкова':    'GEN2',
  'Гениум — Авангард':   'GEN4',
  'Гениум Чуйкова':      'GEN2',
  'Гениум Авангард':     'GEN4',
  'Гениум Авангард Сити':'GEN4',
  'American-European School': 'AES',
  'Kyrgyz-American School':   'KAS',
  'Edison': 'EDI',
  'Эдисон': 'EDI',
  'Эрудит-ISIT': 'ERU',
  'Тенсай': 'TIS',
  'Билим Бишкек Kg': 'BKG',
  'Билим Бишкек KG': 'BKG',
  'Билим Бишкек kg': 'BKG',
  'Nova International School': 'NOVA',
  'Эпсилон': 'EPS',
  'Light Academy': 'LA',
  'Kings International School': 'KNG',
};

export const SCHOOL_NAME: Record<string, string> = {
  KINGS: 'Kings', LIGHT: 'Light Academy', BILIM: 'Bilim KG',
  AES: 'AES', KAS: 'KAS', EPSILON: 'Epsilon',
  GENIUS: 'Genius', GENIUS4: 'Genius 4', NOVA: 'Nova',
  INDIGO: 'Indigo', ERUDIT: 'Erudit', TENSAY: 'Tensay', EDISON: 'Edison',
};

export const SCHOOL_SHORT: Record<string, string> = {
  KINGS: 'KNG', LIGHT: 'LA', BILIM: 'BKG',
  AES: 'AES', KAS: 'KAS', EPSILON: 'EPS',
  GENIUS: 'GEN #2', GENIUS4: 'GEN #4', NOVA: 'NOVA',
  INDIGO: 'ING', ERUDIT: 'ERU', TENSAY: 'TIS', EDISON: 'EDI',
  AES_KAS: 'AES',
};

export const SCHOOL_CODE_ALIASES: Record<string, string> = {
  KNG: 'KINGS',
  LA: 'LIGHT',
  BKG: 'BILIM',
  EPS: 'EPSILON',
  GEN2: 'GENIUS',
  GEN_2: 'GENIUS',
  'GEN #2': 'GENIUS',
  GEN4: 'GENIUS4',
  GEN_4: 'GENIUS4',
  'GEN #4': 'GENIUS4',
  ING: 'INDIGO',
  ING_A: 'INDIGO',
  ING_P: 'INDIGO',
  ING_W: 'INDIGO',
  ERU: 'ERUDIT',
  TIS: 'TENSAY',
  TENSAI: 'TENSAY',
  EDI: 'EDISON',
  EDi: 'EDISON',
  AES_KAS: 'AES_KAS',
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

export function normalizeVehicle(vt: unknown): string {
  if (!vt) return 'microbus';
  if (vt === 'minibus' || vt === 'bus' || vt === 'mini-bus') return 'microbus';
  return String(vt);
}

export function normalizeSchoolCode(code: unknown): string {
  if (!code) return '';
  const raw = String(code).trim();
  const upper = raw.toUpperCase();
  return SCHOOL_CODE_ALIASES[raw] ?? SCHOOL_CODE_ALIASES[upper] ?? upper;
}

export function getFilterFromSchoolCode(rawCode: unknown): string | null {
  if (!rawCode) return null;
  const raw = String(rawCode).trim();
  const upper = raw.toUpperCase();
  if (upper === 'ING_A') return 'ING';
  if (upper === 'ING_P') return 'ING_P';
  if (upper === 'ING_W') return 'ING_W';
  if (upper === 'AES_KAS') return 'AES';
  if (upper === 'GEN2' || upper === 'GEN_2' || upper === 'GEN #2') return 'GEN2';
  if (upper === 'GEN4' || upper === 'GEN_4' || upper === 'GEN #4') return 'GEN4';
  const schoolCode = normalizeSchoolCode(rawCode);
  return SCHOOL_SHORT[schoolCode] ?? schoolCode ?? null;
}

// Получить короткое название по branch_name или school_code
export function getBranchShort(branchName: string | null, schoolCode: string): string {
  if (branchName && BRANCH_SHORT[branchName]) return BRANCH_SHORT[branchName];
  return SCHOOL_SHORT[schoolCode] ?? schoolCode;
}

// Получить filter-ключ для фильтра филиалов
export function getBranchFilter(branchName: string | null, schoolCode: string): string {
  if (branchName && BRANCH_TO_FILTER[branchName]) return BRANCH_TO_FILTER[branchName];
  return SCHOOL_SHORT[schoolCode] ?? schoolCode;
}
