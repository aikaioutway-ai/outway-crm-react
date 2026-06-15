import { supabase } from './supabase';
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
  const debtAmount = Math.max(0, amount - paidAmount);
  return {
    id: String(row.id),
    childId: String(row.child_id),
    familyId: String(row.family_id),
    childName,
    periodMonth: Number(row.period_month),
    year: Number(row.period_year),
    amount,
    paidAmount,
    debtAmount,
    penaltyAmount: 0,
    status: toPaymentStatus(row.status ?? 'unpaid'),
    isFrozen: row.status === 'cancelled',
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

export async function fetchFinanceSnapshot(familyId: string, children: Child[]): Promise<FinanceSnapshot> {
  const childNameById = new Map(children.map(c => [String(c.id), c.childName]));

  const [chargeRes, paymentRes, allocationRes, walletRes] = await Promise.all([
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
      .from('v2_charge_allocations')
      .select('*, v2_wallet_transactions(*), v2_charges(*)')
      .order('created_at', { ascending: false }),
    supabase
      .from('v2_family_wallets')
      .select('*')
      .eq('family_id', familyId)
      .maybeSingle(),
  ]);

  const charges = chargeRes.error
    ? []
    : (chargeRes.data ?? []).map((row: any) => mapCharge(row, childNameById.get(String(row.child_id))));

  const payments = paymentRes.error ? [] : (paymentRes.data ?? []).map(mapPayment);
  const paymentIds = new Set(payments.map(p => p.id));
  const paymentItems = allocationRes.error
    ? []
    : (allocationRes.data ?? [])
      .filter((row: any) => paymentIds.has(String(row.v2_wallet_transactions?.source_id ?? '')))
      .map(mapPaymentItem);

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
  if (updates.isFrozen !== undefined && updates.isFrozen) row.status = 'cancelled';

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

export async function deleteFamilyPayment(payment: FamilyPayment): Promise<void> {
  if (payment.status === 'Подтверждено') {
    throw new Error('Подтверждённый платёж нельзя удалить простым удалением: деньги уже попали в баланс/начисления. Нужен отдельный откат.');
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
  comment?: string;
  createdBy?: string;
}): Promise<FamilyPayment> {
  const receiptUrl = params.receiptFile
    ? await uploadPaymentReceipt(params.familyId, params.receiptFile)
    : null;

  const { data: payment, error } = await supabase
    .from('v2_payments')
    .insert({
      family_id: params.familyId,
      amount: params.amount,
      suggested_main_amount: params.amount,
      suggested_deposit_amount: 0,
      payment_method: params.paymentType,
      payment_date: params.paymentDate,
      receipt_url: receiptUrl,
      status: 'pending',
      submitted_by: params.createdBy,
      comment: params.comment || null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  if (!payment) throw new Error('Платёж не создан');
  return mapPayment(payment);
}

async function uploadPaymentReceipt(familyId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${familyId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from('payment-receipts')
    .upload(path, file, { upsert: false });
  if (error) throw new Error(`Не удалось загрузить чек: ${error.message}`);

  const { data } = supabase.storage.from('payment-receipts').getPublicUrl(path);
  return data.publicUrl;
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

export function chargePeriodLabel(charge: Pick<Charge, 'periodMonth' | 'year'>): string {
  return `${charge.periodMonth}/${charge.year}`;
}

export async function recalcSiblingDiscounts(familyId: string, children: Child[]): Promise<void> {
  // Пересчитываем скидку братьев/сестёр после добавления или удаления ребёнка
  // Первый ребёнок — без скидки, второй и далее — 5%
  const updates = children.map((child, index) => ({
    id: child.id,
    sibling_discount_percent: index === 0 ? 0 : 5,
    final_price: index === 0
      ? Number(child.basePrice ?? child.finalPrice ?? 0)
      : Math.round(Number(child.basePrice ?? child.finalPrice ?? 0) * 0.95),
  }));

  for (const u of updates) {
    await supabase
      .from('v2_children')
      .update({ sibling_discount_percent: u.sibling_discount_percent, final_price: u.final_price })
      .eq('id', u.id);
  }
}
