import { supabase } from './supabase';
import { queryClient, QK } from './queryClient';
import { ChargeDiscountReason } from '../types';

async function callDiscountApi(sessionToken: string | undefined, body: Record<string, unknown>): Promise<any> {
  if (!sessionToken) throw new Error('Сессия недействительна или истекла — войдите заново');
  const { data, error } = await supabase.functions.invoke('discount-api', {
    body,
    headers: { 'x-employee-session': sessionToken },
  });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json();
        message = payload?.error || message;
      } catch {
        // Ответ функции может не содержать JSON — тогда показываем исходную ошибку.
      }
    }
    throw new Error(message);
  }
  if (!data?.ok) throw new Error(data?.error || 'Не удалось сохранить скидку');
  return data;
}

function invalidateDiscountCaches(): void {
  queryClient.invalidateQueries({ queryKey: QK.branchStats });
  queryClient.invalidateQueries({ queryKey: ['familiesTable'] });
  queryClient.invalidateQueries({ queryKey: ['familiesPage'] });
}

export async function setChildDiscount(sessionToken: string | undefined, input: {
  childId: string;
  percent: number;
  amount: number;
  validFrom?: string | null;
  validTo?: string | null;
  reason: string;
}): Promise<void> {
  await callDiscountApi(sessionToken, { action: 'setDiscount', ...input });
  invalidateDiscountCaches();
}

export async function setChildrenFixedPrice(sessionToken: string | undefined, input: {
  childIds: string[];
  fixedPrice: number | null;
  reason: string;
}): Promise<void> {
  await callDiscountApi(sessionToken, { action: 'setFixedPrice', ...input });
  invalidateDiscountCaches();
}

export async function addChargeDiscount(sessionToken: string | undefined, input: {
  chargeId: string;
  amount: number;
  reasonType: ChargeDiscountReason;
  comment: string;
}): Promise<void> {
  await callDiscountApi(sessionToken, { action: 'addChargeDiscount', ...input });
  invalidateDiscountCaches();
}

export async function cancelChargeDiscount(sessionToken: string | undefined, discountId: string): Promise<void> {
  await callDiscountApi(sessionToken, { action: 'cancelChargeDiscount', discountId });
  invalidateDiscountCaches();
}
