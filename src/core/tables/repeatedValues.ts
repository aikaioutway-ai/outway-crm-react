/** Compare actual column values, ignoring empty placeholders and surrounding whitespace. */
function repeatedValueKey(value: unknown): string | null {
  if (value == null) return null;
  const key = String(value).trim().toLocaleLowerCase('ru-RU');
  return ['', '-', '–', '—'].includes(key) ? null : key;
}

export function filterRepeatedValues<T>(rows: readonly T[], valueFor: (row: T) => unknown): T[] {
  const keys = rows.map(row => repeatedValueKey(valueFor(row)));
  const counts = new Map<string, number>();
  keys.forEach(key => { if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1); });
  return rows.filter((_, index) => keys[index] !== null && (counts.get(keys[index]!) ?? 0) > 1);
}
