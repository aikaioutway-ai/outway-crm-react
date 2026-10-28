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

/** Два прошлых месяца и текущий, по порядку. */
export function paymentDotPeriods(now = new Date()): DotPeriod[] {
  return [2, 1, 0].map(back => {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    return { month: date.getMonth() + 1, year: date.getFullYear() };
  });
}

/** Статус начисления → цвет точки. Отменённое начисление считается как «нет начисления». */
export function chargeState(status: string | null | undefined): ChargeState {
  if (status === 'paid' || status === 'overpaid') return 'paid';
  if (status === 'partial') return 'partial';
  if (status === 'unpaid') return 'unpaid';
  return 'none';
}
