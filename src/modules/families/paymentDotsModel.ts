export type ChargeState = 'paid' | 'partial' | 'unpaid' | 'none';

export interface DotPeriod {
  month: number;
  year: number;
}

export interface ChildPaymentDots {
  deposit: ChargeState;
  months: Record<string, ChargeState>;
}

export const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export const periodKey = (period: DotPeriod) => `${period.year}-${period.month}`;

/**
 * Два прошлых месяца и текущий, но не раньше сентября — начала сезона.
 * В сентябре одна точка, в октябре две, с ноября три.
 */
export function paymentDotPeriods(now = new Date()): DotPeriod[] {
  const seasonStart = new Date(now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1, 8, 1);
  return [2, 1, 0]
    .map(back => new Date(now.getFullYear(), now.getMonth() - back, 1))
    .filter(date => date >= seasonStart)
    .map(date => ({ month: date.getMonth() + 1, year: date.getFullYear() }));
}

/** Статус начисления → цвет точки. Отменённое начисление считается как «нет начисления». */
export function chargeState(status: string | null | undefined): ChargeState {
  if (status === 'paid' || status === 'overpaid') return 'paid';
  if (status === 'partial') return 'partial';
  if (status === 'unpaid') return 'unpaid';
  return 'none';
}
