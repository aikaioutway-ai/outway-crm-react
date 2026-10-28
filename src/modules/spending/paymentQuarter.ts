/** Quarters start in September: Sep–Nov, Dec–Feb, Mar–May, Jun–Aug. */
export function paymentQuarter(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const offset = (month - 9 + 12) % 12;
  const quarter = Math.floor(offset / 3);
  const startYear = year - (month < 9 ? 1 : 0);
  const months = Array.from({ length: 3 }, (_, index) => new Date(Date.UTC(startYear, 8 + quarter * 3 + index, 1)).toISOString().slice(0, 7));
  return { number: quarter + 1, months };
}
