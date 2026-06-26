import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';
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
    chargeType: row.charge_type ?? undefined,
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

  const [chargeRes, paymentRes, walletRes] = await Promise.all([
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
  ]);

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
  if (updates.isFrozen !== undefined && updates.isFrozen) row.status = 'cancelled';
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
  receiptCode?: string;
  comment?: string;
  createdBy?: string;
}): Promise<FamilyPayment> {
  const receiptUrl = params.receiptFile
    ? await uploadPaymentReceipt(params.familyId, params.receiptFile)
    : null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/v2_payments`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    let message = `Не удалось сохранить платёж (${response.status})`;
    try {
      const error = await response.json();
      message = error.message || error.details || message;
    } catch {
      // Response body is not always JSON.
    }
    throw new Error(message);
  }

  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`,
    familyId: params.familyId,
    amount: params.amount,
    paymentType: params.paymentType,
    receiptUrl: receiptUrl ?? undefined,
    paymentDate: params.paymentDate,
    status: 'На проверке',
    createdBy: params.createdBy,
    comment: params.comment ?? '',
    createdAt: new Date().toISOString(),
  };
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

/**
 * Ежемесячное начисление для всех семей с boarded детьми.
 * Вызывается 1-го числа каждого месяца (сентябрь–апрель).
 * Май — особый: списывается с депозитного кошелька.
 */
export async function monthlyAutoCharge(): Promise<{ charged: number; skipped: number }> {
  const period = currentAcademicPeriod();
  if (!period) return { charged: 0, skipped: 0 };

  // Получаем все семьи с boarded детьми
  const { data: children, error } = await supabase
    .from('v2_children')
    .select('id, family_id, final_price, status, school_id, branch_id, zone, vehicle_type')
    .eq('status', 'boarded');
  if (error || !children?.length) return { charged: 0, skipped: 0 };

  const familyMap = new Map<string, Child[]>();
  children.forEach((c: any) => {
    const fid = c.family_id;
    if (!familyMap.has(fid)) familyMap.set(fid, []);
    familyMap.get(fid)!.push({
      id: c.id,
      familyId: fid,
      childName: '',
      class: '',
      selfExitAllowed: false,
      schoolCode: 'KINGS' as any,
      schoolId: c.school_id,
      branchId: c.branch_id,
      zone: c.zone,
      vehicleType: c.vehicle_type,
      finalPrice: Number(c.final_price ?? 0),
      basePrice: Number(c.final_price ?? 0),
      status: 'boarded',
      transferNumber: undefined,
      stopNumber: undefined,
      timeMorning: undefined,
      siblingDiscountPercent: 0,
      manualDiscountPercent: 0,
      manualDiscountAmount: 0,
      latitude: undefined,
      longitude: undefined,
    });
  });

  let charged = 0;
  let skipped = 0;
  const entries = Array.from(familyMap.entries());
  for (const [familyId, kids] of entries) {
    try {
      await createChargesForPeriod(familyId, kids, period.month, period.year);
      charged++;
    } catch {
      skipped++;
    }
  }
  return { charged, skipped };
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
