import { FamilyListRow } from '../services/crmV2Service';
import { SCHOOL_TABS, isSchoolAllowed } from '../modules/families/constants';
import { phoneMatchesQuery } from '../utils/format';

export type SchoolTab = (typeof SCHOOL_TABS)[number];

export function schoolsFor(allowedSchools?: string[]): SchoolTab[] {
  return SCHOOL_TABS.filter(tab => tab.key !== 'ALL' && isSchoolAllowed(tab.key, allowedSchools));
}

export function schoolByKey(key: string): SchoolTab | undefined {
  return SCHOOL_TABS.find(tab => tab.key === key);
}

export function schoolLabel(key: string): string {
  return schoolByKey(key)?.label ?? key;
}

export function groupBySchool(rows: FamilyListRow[]): Map<string, FamilyListRow[]> {
  const map = new Map<string, FamilyListRow[]>();
  rows.forEach(row => {
    const list = map.get(row.branchFilter);
    if (list) list.push(row);
    else map.set(row.branchFilter, [row]);
  });
  return map;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/** Поиск по ребёнку, родителю, контакту, адресу и любому телефону семьи. */
export function rowMatches(row: FamilyListRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (phoneMatchesQuery(q, row.phone, row.secondPhone, row.contactPhone)) return true;
  const needle = normalize(q);
  return [row.childName, row.parentName, row.contactName, row.streetAddress, row.childClass]
    .some(value => normalize(String(value ?? '')).includes(needle));
}

/** Как в полной версии: отказники в работу логистики не попадают. */
export function isLogisticsWorkRow(row: FamilyListRow): boolean {
  return row.status !== 'rejected';
}

export function byChildName(a: FamilyListRow, b: FamilyListRow): number {
  return a.childName.localeCompare(b.childName, 'ru');
}

export function transferSort(a: string, b: string): number {
  return Number(a) - Number(b) || a.localeCompare(b);
}
