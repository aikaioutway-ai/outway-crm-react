import { SCHOOL_GROUPS } from './constants';

export interface GroupableStat {
  key: string;
  label: string;
  color: string;
  logo?: string;
}

export interface GroupedRow<T extends GroupableStat> {
  key: string;
  label: string;
  color: string;
  logo?: string;
  isGroup: boolean;
  isChild: boolean;
  expanded?: boolean;
  data: T;
}

const GROUPED_CHILD_KEYS = new Set(SCHOOL_GROUPS.flatMap(g => g.children));

// Схлопывает школы с несколькими филиалами (Genius, Indigo, Bilim, ABL) в один ряд с суммой по sumFields;
// разворачивается в дочерние ряды (по одному на филиал) когда group.key есть в expandedGroups.
export function buildGroupedRows<T extends GroupableStat>(
  leafStats: T[],
  expandedGroups: Set<string>,
  sumFields: Array<keyof T>,
  compare: (a: GroupedRow<T>, b: GroupedRow<T>) => number,
): GroupedRow<T>[] {
  const statByKey = new Map(leafStats.map(s => [s.key, s]));
  const topLevel: { row: GroupedRow<T>; childRows: GroupedRow<T>[] }[] = [];

  SCHOOL_GROUPS.forEach(group => {
    const children = group.children.map(k => statByKey.get(k)).filter((s): s is T => !!s);
    if (!children.length) return;

    const aggData: T = { ...children[0] };
    sumFields.forEach(field => {
      (aggData as Record<string, unknown>)[field as string] =
        children.reduce((sum, c) => sum + (Number(c[field]) || 0), 0);
    });

    const row: GroupedRow<T> = {
      key: group.key,
      label: group.label,
      color: children[0].color,
      logo: group.logo,
      isGroup: true,
      isChild: false,
      expanded: expandedGroups.has(group.key),
      data: aggData,
    };
    const childRows: GroupedRow<T>[] = children.map(c => ({
      key: c.key, label: c.label, color: c.color, logo: c.logo,
      isGroup: false, isChild: true, data: c,
    }));
    topLevel.push({ row, childRows });
  });

  leafStats.forEach(s => {
    if (GROUPED_CHILD_KEYS.has(s.key)) return;
    topLevel.push({
      row: { key: s.key, label: s.label, color: s.color, logo: s.logo, isGroup: false, isChild: false, data: s },
      childRows: [],
    });
  });

  topLevel.sort((a, b) => compare(a.row, b.row));

  const result: GroupedRow<T>[] = [];
  topLevel.forEach(({ row, childRows }) => {
    result.push(row);
    if (row.isGroup && row.expanded) result.push(...childRows);
  });
  return result;
}

export function toggleGroupKey(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
