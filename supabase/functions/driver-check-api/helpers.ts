export const LOGISTICS_CHECK_ROLES = new Set(['admin', 'gen_director', 'director', 'logist', 'senior_logist']);
const LEADERSHIP_ROLES = new Set(['admin', 'gen_director', 'director']);

export interface BranchRow {
  id: string;
  code: string | null;
  short_name: string | null;
  name: string | null;
}

export interface SchoolTab {
  key: string;
  label: string;
  codes: string[];
  branches: string[];
}

export const SCHOOL_TABS: SchoolTab[] = [
  { key: 'TIS',   label: 'TIS',        codes: ['TENSAY'],  branches: [] },
  { key: 'ERU',   label: 'ERU',        codes: ['ERUDIT'],  branches: [] },
  { key: 'EDI',   label: 'EDI',        codes: ['EDISON'],  branches: [] },
  { key: 'EPS',   label: 'EPS',        codes: ['EPSILON'], branches: [] },
  { key: 'AES',   label: 'AES',        codes: ['AES'],     branches: [] },
  { key: 'KAS',   label: 'KAS',        codes: ['KAS'],     branches: [] },
  { key: 'GEN2',  label: 'GEN #2',     codes: ['GENIUS'],  branches: ['Гениум — Чуйкова', 'Гениум Чуйкова'] },
  { key: 'GEN4',  label: 'GEN #4',     codes: ['GENIUS4'], branches: ['Гениум — Авангард', 'Гениум Авангард'] },
  { key: 'NOVA',  label: 'NOVA',       codes: ['NOVA'],    branches: [] },
  { key: 'ING',   label: 'ING',        codes: ['INDIGO'],  branches: ['Индиго Kids', 'Asylkech Girls School', 'Indigo Prime Academy'] },
  { key: 'ING_W', label: 'ING_W',      codes: ['INDIGO'],  branches: ['Indigo West'] },
  { key: 'LA',    label: 'LA',         codes: ['LIGHT'],   branches: ['Light Academy'] },
  { key: 'LA_P',  label: 'LA Primary', codes: ['LIGHT'],   branches: ['Light Academy Primary'] },
  { key: 'BKG',   label: 'BKG',        codes: ['BILIM'],   branches: ['Билим Бишкек Kg', 'Билим Бишкек KG', 'Билим Бишкек kg'] },
  { key: 'BJ',    label: 'BJ',         codes: ['BILIM'],   branches: ['Билим Жолу', 'Bilim Jolu'] },
  { key: 'ABL1',  label: 'ABL #2',     codes: ['ABL1'],    branches: [] },
  { key: 'ABL2',  label: 'ABL #1',     codes: ['ABL2'],    branches: [] },
  { key: 'SNP',   label: 'Sanarip',    codes: ['SANARIP'], branches: [] },
  { key: 'ELS',   label: 'Ellipse',    codes: ['ELLIPSE'], branches: [] },
];

export function resolveSchoolTab(branch: BranchRow | null | undefined): { key: string; label: string } {
  if (!branch) return { key: '', label: 'Школа' };
  const exact = SCHOOL_TABS.find(
    tab => tab.key === branch.short_name || tab.label === branch.short_name || tab.branches.includes(branch.name ?? ''),
  );
  if (exact) return { key: exact.key, label: exact.label };
  const byCode = SCHOOL_TABS.find(tab => tab.codes.includes(branch.code ?? ''));
  if (byCode) return { key: byCode.key, label: byCode.label };
  return {
    key: String(branch.short_name || branch.code || '').trim(),
    label: String(branch.short_name || branch.name || branch.code || 'Школа').trim(),
  };
}

/** null означает доступ ко всем школам. */
export function allowedBranchIds(
  employee: { role: string; school_keys: string[] | null },
  branches: BranchRow[],
): string[] | null {
  const keys = (employee.school_keys ?? []).map(key => key.toUpperCase());
  if (LEADERSHIP_ROLES.has(employee.role) || !keys.length || keys.includes('ALL')) return null;
  return branches.filter(branch => keys.includes(resolveSchoolTab(branch).key.toUpperCase())).map(branch => branch.id);
}

export function bishkekToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bishkek',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function parseIsoDate(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const date = String(value).trim();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Некорректная дата');
  }
  return date;
}

export function isValidToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16,64}$/i.test(value.trim());
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** В каждом месяце 4 сверки: 1 (1–7), 2 (8–14), 3 (15–21), 4 (22–31). */
export function roundOfIsoDate(isoDate: string): 1 | 2 | 3 | 4 {
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day) || day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

export function monthDateBounds(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function sortChildrenForDriver<T extends { stop_order: number | null; child_name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrder = a.stop_order ?? 9999;
    const bOrder = b.stop_order ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.child_name ?? '').localeCompare(String(b.child_name ?? ''), 'ru');
  });
}
