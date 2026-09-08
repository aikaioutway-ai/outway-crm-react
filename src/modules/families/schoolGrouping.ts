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

// Раньше школы с несколькими филиалами (Genius, Indigo, Bilim, ABL) схлопывались
// в одну строку-шторку с суммой по sumFields. По решению пользователя это убрано —
// каждый филиал/школа теперь всегда своя отдельная строка. expandedGroups/sumFields
// оставлены в сигнатуре, чтобы не трогать вызывающий код всех 5 экранов Overview.
export function buildGroupedRows<T extends GroupableStat>(
  leafStats: T[],
  _expandedGroups: Set<string>,
  _sumFields: Array<keyof T>,
  compare: (a: GroupedRow<T>, b: GroupedRow<T>) => number,
): GroupedRow<T>[] {
  const rows: GroupedRow<T>[] = leafStats.map(s => ({
    key: s.key, label: s.label, color: s.color, logo: s.logo, isGroup: false, isChild: false, data: s,
  }));
  rows.sort(compare);
  return rows;
}

export function toggleGroupKey(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
