/** Split in minor units, assigning remainder cents in stable order. */
export function splitPayment(total: number, count: number): number[] {
  if (!Number.isFinite(total) || total < 0 || count < 1) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  return Array.from({ length: count }, (_, index) => (base + (index < cents % count ? 1 : 0)) / 100);
}
