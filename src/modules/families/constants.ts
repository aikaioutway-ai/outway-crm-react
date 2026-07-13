// Один источник правды для отображения школ, зон, транспорта

export const SCHOOL_TABS: { key: string; label: string; codes: string[]; branches: string[]; logo?: string }[] = [
  { key: 'TIS',   label: 'TIS',   codes: ['TENSAY'],  branches: [], logo: '/school-logos/TIS.png' },
  { key: 'ERU',   label: 'ERU',   codes: ['ERUDIT'],  branches: [], logo: '/school-logos/ERU.png' },
  { key: 'EDi',   label: 'EDI',   codes: ['EDISON'],  branches: [], logo: '/school-logos/EDI.png' },
  { key: 'EPS',   label: 'EPS',   codes: ['EPSILON'], branches: [], logo: '/school-logos/EPS.png' },
  { key: 'AES',   label: 'AES',   codes: ['AES'],     branches: [], logo: '/school-logos/AES.png' },
  { key: 'KAS',   label: 'KAS',   codes: ['KAS'],     branches: [], logo: '/school-logos/KAS.png' },
  { key: 'GEN2',  label: 'GEN #2',codes: ['GENIUS'],  branches: ['Гениум — Чуйкова','Гениум Чуйкова'], logo: '/school-logos/GEN.png' },
  { key: 'GEN4',  label: 'GEN #4',codes: ['GENIUS4'], branches: ['Гениум — Авангард','Гениум Авангард'], logo: '/school-logos/GEN.png' },
  { key: 'NOVA',  label: 'NOVA',  codes: ['NOVA'],    branches: [], logo: '/school-logos/NOVA.png' },
  { key: 'ING',   label: 'ING',   codes: ['INDIGO'], branches: ['Индиго Kids','Asylkech Girls School'], logo: '/school-logos/ING.png' },
  { key: 'ING_P', label: 'ING_P', codes: ['INDIGO'], branches: ['Indigo Prime Academy'], logo: '/school-logos/ING.png' },
  { key: 'ING_W', label: 'ING_W', codes: ['INDIGO'], branches: ['Indigo West'], logo: '/school-logos/ING.png' },
  { key: 'LA',    label: 'LA',    codes: ['LIGHT'],   branches: [], logo: '/school-logos/LA.png' },
  { key: 'BKG',   label: 'BKG',   codes: ['BILIM'],   branches: ['Билим Бишкек Kg','Билим Бишкек KG','Билим Бишкек kg'], logo: '/school-logos/BKG.png' },
  { key: 'BJ',    label: 'BJ',    codes: ['BILIM'],   branches: ['Билим Жолу','Bilim Jolu'], logo: '/school-logos/BJ.png' },
  { key: 'KRT',   label: 'KRT',   codes: ['KRT'],  branches: [], logo: '/school-logos/KRT.png' },
  { key: 'ABL1',  label: 'ABL #1',codes: ['ABL1'], branches: [], logo: '/school-logos/ABL.png' },
  { key: 'ABL2',  label: 'ABL #2',codes: ['ABL2'], branches: [], logo: '/school-logos/ABL.png' },
  { key: 'KLM',   label: 'KLM',   codes: ['KLM'],  branches: [], logo: '/school-logos/KLM.png' },
  { key: 'TSL',   label: 'TSL',   codes: ['TSL'],  branches: [], logo: '/school-logos/TSL.png' },
  { key: 'ALL',   label: 'Все',   codes: [], branches: [] },
];

// Школы с несколькими филиалами — схлопываются в один ряд, разворачиваются по клику
export const SCHOOL_GROUPS: { key: string; label: string; logo?: string; children: string[] }[] = [
  { key: 'GENIUS', label: 'Genius', logo: '/school-logos/GEN.png', children: ['GEN2', 'GEN4'] },
  { key: 'INDIGO', label: 'Indigo', logo: '/school-logos/ING.png', children: ['ING', 'ING_P', 'ING_W'] },
  { key: 'BILIM',  label: 'Bilim',  logo: '/school-logos/BKG.png', children: ['BKG', 'BJ'] },
  { key: 'ABL',    label: 'ABL',    logo: '/school-logos/ABL.png', children: ['ABL1', 'ABL2'] },
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
  'Билим Жолу':                    'BJ',
  'Bilim Jolu':                    'BJ',
  'Nova International School':     'NOVA',
  'Эпсилон':                       'EPS',
  'Light Academy':                 'LA',
  'Креатив-Таалим':                'KRT',
  'Академия будущих лидеров (Авангард)':  'ABL #1',
  'Академия будущих лидеров(Авангард)':   'ABL #1',
  'Академия будущих лидеров (Мавлянова)': 'ABL #2',
  'Академия будущих лидеров(Мавлянова)':  'ABL #2',
  'Калем Академи Скуул':           'KLM',
  'Tesla Academy':                 'TSL',
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
  'Билим Жолу':      'BJ',
  'Bilim Jolu':      'BJ',
  'Nova International School': 'NOVA',
  'Эпсилон': 'EPS',
  'Light Academy': 'LA',
  'Креатив-Таалим': 'KRT',
  'Академия будущих лидеров (Авангард)':  'ABL1',
  'Академия будущих лидеров(Авангард)':   'ABL1',
  'Академия будущих лидеров (Мавлянова)': 'ABL2',
  'Академия будущих лидеров(Мавлянова)':  'ABL2',
  'Калем Академи Скуул': 'KLM',
  'Tesla Academy': 'TSL',
};

export const SCHOOL_NAME: Record<string, string> = {
  LIGHT: 'Light Academy', BILIM: 'Bilim KG',
  AES: 'AES', KAS: 'KAS', EPSILON: 'Epsilon',
  GENIUS: 'Genius', GENIUS4: 'Genius 4', NOVA: 'Nova',
  INDIGO: 'Indigo', ERUDIT: 'Erudit', TENSAY: 'Tensay', EDISON: 'Edison',
  KRT: 'Kreativ-Taalim', ABL1: 'ABL — Avangard', ABL2: 'ABL — Mavlyanova',
  KLM: 'Kalem Academy', TSL: 'Tesla Academy',
};

export const SCHOOL_SHORT: Record<string, string> = {
  LIGHT: 'LA', BILIM: 'BKG',
  AES: 'AES', KAS: 'KAS', EPSILON: 'EPS',
  GENIUS: 'GEN #2', GENIUS4: 'GEN #4', NOVA: 'NOVA',
  INDIGO: 'ING', ERUDIT: 'ERU', TENSAY: 'TIS', EDISON: 'EDI',
  AES_KAS: 'AES',
  KRT: 'KRT', ABL1: 'ABL #1', ABL2: 'ABL #2', KLM: 'KLM', TSL: 'TSL',
};

export const SCHOOL_CODE_ALIASES: Record<string, string> = {
  LA: 'LIGHT',
  BKG: 'BILIM',
  BJ: 'BILIM',
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
  'КRT': 'KRT',       // код из формы/таблицы записан с кириллической "К" — это опечатка в источнике
  'ABL #1': 'ABL1',
  'ABL_1': 'ABL1',
  'ABL #2': 'ABL2',
  'ABL_2': 'ABL2',
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

function getSeasonStartYear(): number {
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  return month >= 6 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
}

const SEASON_YEAR = getSeasonStartYear();
const NEXT_SEASON_YEAR = SEASON_YEAR + 1;

export const ALL_PERIODS = [
  { key: 'deposit', month: 0,  year: SEASON_YEAR,      label: 'Депозит' },
  { key: '9',       month: 9,  year: SEASON_YEAR,      label: `Сентябрь ${SEASON_YEAR}` },
  { key: '10',      month: 10, year: SEASON_YEAR,      label: `Октябрь ${SEASON_YEAR}` },
  { key: '11',      month: 11, year: SEASON_YEAR,      label: `Ноябрь ${SEASON_YEAR}` },
  { key: '12',      month: 12, year: SEASON_YEAR,      label: `Декабрь ${SEASON_YEAR}` },
  { key: '1',       month: 1,  year: NEXT_SEASON_YEAR, label: `Январь ${NEXT_SEASON_YEAR}` },
  { key: '2',       month: 2,  year: NEXT_SEASON_YEAR, label: `Февраль ${NEXT_SEASON_YEAR}` },
  { key: '3',       month: 3,  year: NEXT_SEASON_YEAR, label: `Март ${NEXT_SEASON_YEAR}` },
  { key: '4',       month: 4,  year: NEXT_SEASON_YEAR, label: `Апрель ${NEXT_SEASON_YEAR}` },
  { key: '5',       month: 5,  year: NEXT_SEASON_YEAR, label: `Май ${NEXT_SEASON_YEAR}` },
];

export const CASHIER_PERIODS = [
  { key: '6',  month: 6,  year: SEASON_YEAR,      label: `Июнь ${SEASON_YEAR}` },
  { key: '7',  month: 7,  year: SEASON_YEAR,      label: `Июль ${SEASON_YEAR}` },
  { key: '8',  month: 8,  year: SEASON_YEAR,      label: `Август ${SEASON_YEAR}` },
  { key: '9',  month: 9,  year: SEASON_YEAR,      label: `Сентябрь ${SEASON_YEAR}` },
  { key: '10', month: 10, year: SEASON_YEAR,      label: `Октябрь ${SEASON_YEAR}` },
  { key: '11', month: 11, year: SEASON_YEAR,      label: `Ноябрь ${SEASON_YEAR}` },
  { key: '12', month: 12, year: SEASON_YEAR,      label: `Декабрь ${SEASON_YEAR}` },
  { key: '1',  month: 1,  year: NEXT_SEASON_YEAR, label: `Январь ${NEXT_SEASON_YEAR}` },
  { key: '2',  month: 2,  year: NEXT_SEASON_YEAR, label: `Февраль ${NEXT_SEASON_YEAR}` },
  { key: '3',  month: 3,  year: NEXT_SEASON_YEAR, label: `Март ${NEXT_SEASON_YEAR}` },
  { key: '4',  month: 4,  year: NEXT_SEASON_YEAR, label: `Апрель ${NEXT_SEASON_YEAR}` },
  { key: '5',  month: 5,  year: NEXT_SEASON_YEAR, label: `Май ${NEXT_SEASON_YEAR}` },
];

export function currentCashierPeriodKey(): string {
  const month = new Date().getMonth() + 1;
  return CASHIER_PERIODS.find(period => period.month === month)?.key ?? '6';
}

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
  if (upper === 'ABL1' || upper === 'ABL_1' || upper === 'ABL #1') return 'ABL1';
  if (upper === 'ABL2' || upper === 'ABL_2' || upper === 'ABL #2') return 'ABL2';
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
