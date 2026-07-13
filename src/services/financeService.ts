import { supabase } from './supabase';
import { safeStorageFileName, uploadToBucket } from './storage';
import {
  Charge,
  Child,
  FamilyPayment,
  FinanceSnapshot,
  PaymentItem,
  PaymentReviewStatus,
  PaymentStatus,
  PaymentType,
} from '../types';

function toPaymentStatus(status: string): PaymentStatus {
  if (status === 'paid') return 'Оплачено';
  if (status === 'partial') return 'Частично оплачено';
  if (status === 'cancelled') return 'Заморожено';
  return 'Не оплачено';
}

function toReviewStatus(status: string): PaymentReviewStatus {
  if (status === 'confirmed') return 'Подтверждено';
  if (status === 'rejected' || status === 'cancelled') return 'Отклонено';
  if (status === 'pending') return 'На проверке';
  return 'Черновик';
}

function fromPaymentStatus(status: PaymentStatus): string {
  if (status === 'Оплачено') return 'paid';
  if (status === 'Частично оплачено') return 'partial';
  if (status === 'Заморожено') return 'cancelled';
  return 'unpaid';
}

function mapCharge(row: any, childName?: string): Charge {
  const amount = Number(row.amount ?? 0);
  const paidAmount = Number(row.paid_amount ?? 0);
  const penaltyAmount = Number(row.penalty_amount ?? 0);
  const debtAmount = Math.max(0, Number(row.debt_amount ?? amount + penaltyAmount - paidAmount));
  return {
    id: String(row.id),
    childId: String(row.child_id),
    familyId: String(row.family_id),
    childName,
    periodMonth: Number(row.period_month),
    year: Number(row.period_year),
    chargeType: row.charge_type ?? undefined,
    amount,
    paidAmount,
    debtAmount,
    penaltyAmount,
    status: toPaymentStatus(row.status ?? 'unpaid'),
    isFrozen: Boolean(row.is_frozen ?? row.status === 'cancelled'),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapPayment(row: any): FamilyPayment {
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    amount: Number(row.amount ?? 0),
    paymentType: (row.payment_method ?? 'cash') as PaymentType,
    receiptUrl: row.receipt_url ?? undefined,
    paymentDate: String(row.payment_date ?? row.created_at ?? ''),
    actualPaymentDate: row.actual_payment_date ? String(row.actual_payment_date) : undefined,
    status: toReviewStatus(row.status ?? 'pending'),
    createdBy: row.submitted_by ?? undefined,
    confirmedBy: row.reviewed_by ?? undefined,
    confirmedAt: row.reviewed_at ?? undefined,
    comment: row.comment ?? '',
    createdAt: String(row.created_at ?? ''),
  };
}

function mapPaymentItem(row: any): PaymentItem {
  const tx = row.v2_wallet_transactions;
  return {
    id: String(row.id),
    paymentId: String(tx?.source_id ?? row.wallet_transaction_id),
    childId: String(row.v2_charges?.child_id ?? ''),
    familyId: String(tx?.family_id ?? ''),
    periodMonth: Number(row.v2_charges?.period_month ?? 0),
    year: Number(row.v2_charges?.period_year ?? 0),
    chargedAmount: Number(row.v2_charges?.amount ?? 0),
    paidAmount: Number(row.amount ?? 0),
    debtAmount: Number(row.v2_charges?.debt_amount ?? 0),
    status: toPaymentStatus(row.v2_charges?.status ?? 'unpaid'),
    createdAt: String(row.created_at ?? ''),
  };
}

export async function fetchFinanceSnapshot(familyId: string, children?: Child[]): Promise<FinanceSnapshot> {
  const [chargeRes, paymentRes, walletRes, childrenRes] = await Promise.all([
    supabase
      .from('v2_charges')
      .select('*')
      .eq('family_id', familyId)
      .order('period_year', { ascending: true })
      .order('period_month', { ascending: true }),
    supabase
      .from('v2_payments')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('v2_family_wallets')
      .select('*')
      .eq('family_id', familyId)
      .maybeSingle(),
    children
      ? Promise.resolve({ data: children, error: null })
      : supabase.from('v2_children').select('*').eq('family_id', familyId),
  ]);

  const resolvedChildren: Child[] = children ?? (childrenRes.data ?? []);
  const childNameById = new Map(resolvedChildren.map((c: any) => [String(c.id ?? c.child_id), c.childName ?? c.child_name]));

  const charges = chargeRes.error
    ? []
    : (chargeRes.data ?? []).map((row: any) => mapCharge(row, childNameById.get(String(row.child_id))));

  const payments = paymentRes.error ? [] : (paymentRes.data ?? []).map(mapPayment);

  // Получаем аллокации только для платежей этой семьи, чтобы не тянуть всю таблицу
  const paymentIds = payments.map(p => p.id);
  let paymentItems: PaymentItem[] = [];
  if (paymentIds.length > 0) {
    const txRes = await supabase
      .from('v2_wallet_transactions')
      .select('id')
      .in('source_id', paymentIds);
    const txIds = (txRes.data ?? []).map((t: any) => String(t.id));
    if (txIds.length > 0) {
      const allocationRes = await supabase
        .from('v2_charge_allocations')
        .select('*, v2_wallet_transactions(*), v2_charges(*)')
        .in('wallet_transaction_id', txIds)
        .order('created_at', { ascending: false });
      if (!allocationRes.error) {
        paymentItems = (allocationRes.data ?? []).map(mapPaymentItem);
      }
    }
  }

  return {
    charges,
    payments,
    paymentItems,
    mainBalance: Number(walletRes.data?.main_balance ?? 0),
    depositBalance: Number(walletRes.data?.deposit_balance ?? 0),
  };
}

export async function createChargesForPeriod(
  familyId: string,
  children: Child[],
  periodMonth: number,
  year: number,
): Promise<void> {
  // Только посаженные на трансфер дети получают начисление
  const activeChildren = children.filter(c => c.status === 'boarded');
  if (!activeChildren.length) return;

  const rows = activeChildren.map(child => {
    const amount = Number(child.finalPrice ?? 0);
    return {
      child_id: child.id,
      family_id: familyId,
      period_month: periodMonth === 0 ? 5 : periodMonth,
      period_year: year,
      charge_type: periodMonth === 0 ? 'deposit' : periodMonth === 5 ? 'may' : 'monthly',
      original_amount: amount,
      amount,
      paid_amount: 0,
      status: 'unpaid',
    };
  });

  const { error } = await supabase
    .from('v2_charges')
    .upsert(rows, { onConflict: 'child_id,period_month,period_year,charge_type', ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  await supabase.rpc('v2_apply_wallet_to_charges', {
    p_family_id: familyId,
    p_wallet_type: periodMonth === 0 || periodMonth === 5 ? 'deposit' : 'main',
    p_created_by: 'CRM',
  });
}

export async function updateCharge(chargeId: string, updates: Partial<Charge>): Promise<void> {
  if (updates.amount !== undefined) {
    const { error } = await supabase.rpc('v2_adjust_charge', {
      p_charge_id: chargeId,
      p_new_amount: updates.amount,
      p_reason: updates.comment || 'CRM adjustment',
      p_adjusted_by: 'CRM',
    });
    if (error) throw new Error(error.message);
  }

  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = fromPaymentStatus(updates.status);
  if (updates.isFrozen !== undefined) row.is_frozen = updates.isFrozen;
  if (updates.penaltyAmount !== undefined) row.penalty_amount = updates.penaltyAmount;

  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('v2_charges').update(row).eq('id', chargeId);
  if (error) throw new Error(error.message);
}

export async function deleteCharge(chargeId: string): Promise<void> {
  const { error } = await supabase.from('v2_charges').delete().eq('id', chargeId);
  if (error) throw new Error(error.message);
}

function fromReviewStatus(status: PaymentReviewStatus): string {
  if (status === 'Подтверждено') return 'confirmed';
  if (status === 'Отклонено') return 'rejected';
  if (status === 'На проверке') return 'pending';
  return 'draft';
}

export async function updateFamilyPayment(paymentId: string, updates: {
  amount?: number;
  paymentType?: PaymentType;
  paymentDate?: string;
  actualPaymentDate?: string;
  status?: PaymentReviewStatus;
  comment?: string;
}): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.amount !== undefined) {
    row.amount = updates.amount;
    row.suggested_main_amount = updates.amount;
  }
  if (updates.paymentType !== undefined) row.payment_method = updates.paymentType;
  if (updates.paymentDate !== undefined) row.payment_date = updates.paymentDate;
  if (updates.actualPaymentDate !== undefined) row.actual_payment_date = updates.actualPaymentDate || null;
  if (updates.status !== undefined) row.status = fromReviewStatus(updates.status);
  if (updates.comment !== undefined) row.comment = updates.comment || null;

  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('v2_payments').update(row).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

export async function cancelConfirmedPayment(paymentId: string, reason: string, cancelledBy: string): Promise<void> {
  const { error } = await supabase.rpc('v2_cancel_payment', {
    p_payment_id: paymentId,
    p_reason: reason,
    p_cancelled_by: cancelledBy,
  });
  if (error) throw new Error(error.message);
}

export async function deleteFamilyPayment(payment: FamilyPayment): Promise<void> {
  if (payment.status === 'Подтверждено') {
    throw new Error('Подтверждённый платёж нельзя удалить простым удалением: используй cancelConfirmedPayment.');
  }
  const { error } = await supabase.from('v2_payments').delete().eq('id', payment.id);
  if (error) throw new Error(error.message);
}

export async function createFamilyPayment(params: {
  familyId: string;
  amount: number;
  paymentType: PaymentType;
  paymentDate: string;
  receiptFile?: File | null;
  receiptCode?: string;
  comment?: string;
  createdBy?: string;
}): Promise<FamilyPayment> {
  const receiptUrl = params.receiptFile
    ? await uploadPaymentReceipt(params.familyId, params.receiptFile)
    : null;

  const { data, error } = await supabase
    .from('v2_payments')
    .insert({
      family_id: params.familyId,
      amount: params.amount,
      suggested_main_amount: params.amount,
      suggested_deposit_amount: 0,
      payment_method: params.paymentType,
      payment_date: params.paymentDate,
      receipt_url: receiptUrl,
      receipt_code: params.receiptCode || null,
      status: 'pending',
      submitted_by: params.createdBy,
      comment: params.comment || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return mapPayment(data);
}

async function uploadPaymentReceipt(familyId: string, file: File): Promise<string> {
  const path = `${familyId}/${Date.now()}-${safeStorageFileName(file.name)}`;
  try {
    return await uploadToBucket('payment-receipts', path, file);
  } catch (error) {
    throw new Error(`Не удалось загрузить чек: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function confirmFamilyPayment(params: {
  payment: FamilyPayment;
  charges: Charge[];
  confirmedBy?: string;
  actualPaymentDate?: string;
}): Promise<void> {
  if (params.payment.status === 'Подтверждено') return;
  const { error } = await supabase.rpc('v2_confirm_payment', {
    p_payment_id: params.payment.id,
    p_main_amount: params.payment.amount,
    p_deposit_amount: 0,
    p_reviewed_by: params.confirmedBy ?? 'CRM',
    p_actual_payment_date: params.actualPaymentDate ?? params.payment.actualPaymentDate ?? params.payment.paymentDate,
  });
  if (error) throw new Error(error.message);
}

/**
 * Отменяет подтверждение платежа:
 * - статус → pending
 * - откатывает баланс кошелька
 * - снимает применение к начислениям
 */
export async function unconfirmFamilyPayment(payment: FamilyPayment): Promise<void> {
  const confirmedAmount = payment.amount;

  // 1. Откатываем статус платежа
  const { error: e1 } = await supabase
    .from('v2_payments')
    .update({
      status: 'pending',
      confirmed_main_amount: 0,
      confirmed_deposit_amount: 0,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq('id', payment.id);
  if (e1) throw new Error(e1.message);

  // 2. Вычитаем из кошелька
  const { error: e2 } = await supabase.rpc('v2_add_wallet_transaction', {
    p_family_id: payment.familyId,
    p_wallet_type: 'main',
    p_transaction_type: 'payment_reversed',
    p_amount: -confirmedAmount,
    p_source_type: 'payment',
    p_source_id: payment.id,
    p_comment: 'Отмена подтверждения',
    p_created_by: 'CRM',
  });
  if (e2) throw new Error(e2.message);

  // 3. Пересчитываем применение к начислениям
  await supabase.rpc('v2_apply_wallet_to_charges', {
    p_family_id: payment.familyId,
    p_wallet_type: 'main',
    p_created_by: 'CRM',
  });
}

// Учебный год: сентябрь(9)–май(5)
const ACADEMIC_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5];

function currentAcademicPeriod(): { month: number; year: number } | null {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const year = now.getFullYear();
  if (!ACADEMIC_MONTHS.includes(month)) return null; // июнь, июль, август — не сезон
  return { month, year };
}

async function familyHasDeposit(familyId: string): Promise<boolean> {
  const { data } = await supabase
    .from('v2_charges')
    .select('id')
    .eq('family_id', familyId)
    .eq('charge_type', 'deposit')
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function createDepositCharge(familyId: string, children: Child[]): Promise<void> {
  const activeChildren = children.filter(c => c.status === 'boarded');
  if (!activeChildren.length) return;
  const rows = activeChildren.map(child => ({
    child_id: child.id,
    family_id: familyId,
    period_month: 5, // депозит хранится как май
    period_year: new Date().getFullYear(),
    charge_type: 'deposit',
    original_amount: Number(child.finalPrice ?? 0),
    amount: Number(child.finalPrice ?? 0),
    paid_amount: 0,
    status: 'unpaid',
  }));
  const { error } = await supabase
    .from('v2_charges')
    .upsert(rows, { onConflict: 'child_id,period_month,period_year,charge_type', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await supabase.rpc('v2_apply_wallet_to_charges', {
    p_family_id: familyId,
    p_wallet_type: 'deposit',
    p_created_by: 'auto',
  });
}

/**
 * Вызывается при смене статуса ребёнка → boarded.
 * Логика:
 * - Август (8): ничего, начисление пойдёт 1 сентября
 * - Июнь/Июль: ничего, не сезон
 * - Сентябрь–Май: начисление за текущий месяц + депозит (если первый раз)
 */
export async function autoChargeOnBoarding(familyId: string, children: Child[]): Promise<void> {
  const period = currentAcademicPeriod();
  if (!period) return; // не сезон или август

  const hasDeposit = await familyHasDeposit(familyId);

  // Начисление за текущий месяц
  await createChargesForPeriod(familyId, children, period.month, period.year);

  // Депозит — только если ещё не было
  if (!hasDeposit) {
    await createDepositCharge(familyId, children);
  }
}
