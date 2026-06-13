// Один источник правды для отображения школ, зон, транспорта

// Маппинг branch_name из БД → короткое название в CRM
export const BRANCH_SHORT: Record<string, string> = {
  // INDIGO
  'Индиго Kids':          'ING',
  'Asylkech Girls School':'ING_A',
  'Indigo Prime Academy': 'ING_P',
  'Indigo West':          'ING_W',
  // GENIUS
  'Гениум — Чуйкова':    'GEN #2',
  'Гениум — Авангард':   'GEN #4',
  'Гениум Чуйкова':      'GEN #2',
  'Гениум Авангард':     'GEN #4',
  // Остальные
  'Эдисон':                        'EDi',
  'Эрудит-ISIT':                   'ERU',
  'Тенсай':                        'TIS',
  'American-European School':      'AES',
  'Kyrgyz-American School':        'KAS',
  'Билим Бишкек KG':               'BKG',
  'Nova International School':     'NOVA',
  'Эпсилон':                       'EPS',
  'Light Academy':                 'LA',
  'Kings International School':    'KNG',
};

// Группировка branch_name по school_code для SchoolBar
export const BRANCH_TO_FILTER: Record<string, string> = {
  'Индиго Kids':          'ING',
  'Asylkech Girls School':'ING',
  'Indigo Prime Academy': 'ING_P',
  'Indigo West':          'ING_W',
  'Гениум — Чуйкова':    'GEN2',
  'Гениум — Авангард':   'GEN4',
  'Гениум Чуйкова':      'GEN2',
  'Гениум Авангард':     'GEN4',
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
  INDIGO: 'ING', ERUDIT: 'ERU', TENSAY: 'TIS', EDISON: 'EDi',
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

// Нормализация school_code из БД → канонический код
// Обрабатывает случаи когда в БД записано полное название школы вместо кода
const SCHOOL_CODE_MAP: Record<string, string> = {
  // Полные английские названия
  'Kings International School':    'KINGS',
  'Light Academy':                 'LIGHT',
  'Bilim KG':                      'BILIM',
  'Билим Бишкек KG':               'BILIM',
  'American-European School':      'AES',
  'Kyrgyz-American School':        'KAS',
  'Epsilon':                       'EPSILON',
  'Эпсилон':                       'EPSILON',
  'Nova International School':     'NOVA',
  'Эрудит-ISIT':                   'ERUDIT',
  'Эрудит':                        'ERUDIT',
  'Тенсай':                        'TENSAY',
  'ТЕНСАЙ':                        'TENSAY',
  'Tensai':                        'TENSAY',
  'TENSAI':                        'TENSAY',
  'Эдисон':                        'EDISON',
  'Edison':                        'EDISON',
  'ЭДИСОН':                        'EDISON',
  // Indigo варианты
  'Индиго Kids':                   'INDIGO',
  'Indigo Prime Academy':          'INDIGO',
  'Indigo West':                   'INDIGO',
  'Asylkech Girls School':         'INDIGO',
  // Genius варианты
  'Гениум — Чуйкова':              'GENIUS',
  'Гениум Чуйкова':                'GENIUS',
  'GENIUS #2':                     'GENIUS',
  'GENIUS2':                       'GENIUS',
  'Гениум — Авангард':             'GENIUS4',
  'Гениум Авангард':               'GENIUS4',
  'GENIUS #4':                     'GENIUS4',
  // Уже правильные коды — пропускаем через identity
  'KINGS': 'KINGS', 'LIGHT': 'LIGHT', 'BILIM': 'BILIM',
  'AES': 'AES', 'KAS': 'KAS', 'EPSILON': 'EPSILON',
  'GENIUS': 'GENIUS', 'GENIUS4': 'GENIUS4', 'NOVA': 'NOVA',
  'INDIGO': 'INDIGO', 'ERUDIT': 'ERUDIT', 'TENSAY': 'TENSAY', 'EDISON': 'EDISON',
};

export function normalizeSchoolCode(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  return SCHOOL_CODE_MAP[trimmed] ?? trimmed.toUpperCase();
}

// Получить короткое название по branch_name или school_code
export function getBranchShort(branchName: string | null, schoolCode: string): string {
  if (branchName && BRANCH_SHORT[branchName]) return BRANCH_SHORT[branchName];
  return SCHOOL_SHORT[schoolCode] ?? schoolCode;
}

// Получить filter-ключ для SchoolBar
export function getBranchFilter(branchName: string | null, schoolCode: string): string {
  if (branchName && BRANCH_TO_FILTER[branchName]) return BRANCH_TO_FILTER[branchName];
  return SCHOOL_SHORT[schoolCode] ?? schoolCode;
}
