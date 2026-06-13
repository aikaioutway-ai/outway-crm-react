import { supabase } from './supabase';
import {
  Charge,
  Child,
  FamilyPayment,
  FinanceSnapshot,
  PaymentItem,
  PaymentStatus,
  PaymentType,
} from '../types';
import { getChildPrice } from '../utils/pricing';

function periodKey(month: number): string {
  return month === 0 ? 'deposit' : String(month);
}

function mapCharge(row: any, childName?: string): Charge {
  const amount = Number(row.amount ?? 0);
  const paidAmount = Number(row.paid_amount ?? 0);
  const penaltyAmount = Number(row.penalty_amount ?? 0);
  const debtAmount = Number(row.debt_amount ?? Math.max(0, amount + penaltyAmount - paidAmount));
  return {
    id: String(row.id),
    childId: String(row.child_id),
    familyId: String(row.family_id),
    childName,
    periodMonth: Number(row.period_month ?? row.month ?? 0),
    year: Number(row.year),
    amount,
    paidAmount,
    debtAmount,
    penaltyAmount,
    status: (row.status ?? row.accountant_status ?? 'Не оплачено') as PaymentStatus,
    isFrozen: Boolean(row.is_frozen),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapPayment(row: any): FamilyPayment {
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    periodMonth: row.period_month == null ? undefined : Number(row.period_month),
    year: row.year == null ? undefined : Number(row.year),
    amount: Number(row.amount ?? row.fact_amount ?? row.manager_amount ?? 0),
    paymentType: (row.payment_type ?? 'cash') as PaymentType,
    receiptUrl: row.receipt_url ?? undefined,
    paymentDate: String(row.payment_date ?? row.fact_date ?? row.manager_date ?? row.created_at ?? ''),
    status: row.status ?? row.accountant_status ?? 'На проверке',
    createdBy: row.created_by ?? undefined,
    confirmedBy: row.confirmed_by ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
    comment: row.comment ?? '',
    createdAt: String(row.created_at ?? ''),
  };
}

function mapPaymentItem(row: any): PaymentItem {
  return {
    id: String(row.id),
    paymentId: String(row.payment_id),
    childId: String(row.child_id),
    familyId: String(row.family_id),
    periodMonth: Number(row.period_month),
    year: Number(row.year),
    chargedAmount: Number(row.charged_amount ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    debtAmount: Number(row.debt_amount ?? 0),
    status: (row.status ?? 'Не оплачено') as PaymentStatus,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function fetchFinanceSnapshot(familyId: string, children: Child[]): Promise<FinanceSnapshot> {
  const childNameById = new Map(children.map(c => [String(c.id), c.childName]));

  const [chargeRes, paymentRes, itemRes] = await Promise.all([
    supabase
      .from('charges')
      .select('*')
      .eq('family_id', familyId)
      .order('year', { ascending: true })
      .order('period_month', { ascending: true }),
    supabase
      .from('payments')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('payment_items')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false }),
  ]);

  const charges = chargeRes.error
    ? []
    : (chargeRes.data ?? []).map((row: any) => mapCharge(row, childNameById.get(String(row.child_id))));

  const payments = paymentRes.error ? [] : (paymentRes.data ?? []).map(mapPayment);
  const paymentItems = itemRes.error ? [] : (itemRes.data ?? []).map(mapPaymentItem);

  return { charges, payments, paymentItems };
}

export async function createChargesForPeriod(
  familyId: string,
  children: Child[],
  periodMonth: number,
  year: number,
): Promise<void> {
  if (!children.length) return;

  const rows = children.map((child, index) => ({
    child_id: child.id,
    family_id: familyId,
    period_month: periodMonth,
    year,
    amount: getChildPrice(child, index),
    paid_amount: 0,
    penalty_amount: 0,
    status: 'Не оплачено',
    is_frozen: false,
  }));

  const { error } = await supabase
    .from('charges')
    .upsert(rows, { onConflict: 'child_id,period_month,year', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function updateCharge(chargeId: string, updates: Partial<Charge>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.amount !== undefined) row.amount = updates.amount;
  if (updates.paidAmount !== undefined) row.paid_amount = updates.paidAmount;
  if (updates.penaltyAmount !== undefined) row.penalty_amount = updates.penaltyAmount;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.isFrozen !== undefined) row.is_frozen = updates.isFrozen;

  const { error } = await supabase.from('charges').update(row).eq('id', chargeId);
  if (error) throw new Error(error.message);
}

export async function deleteCharge(chargeId: string): Promise<void> {
  const { error } = await supabase.from('charges').delete().eq('id', chargeId);
  if (error) throw new Error(error.message);
}

export async function createFamilyPayment(params: {
  familyId: string;
  amount: number;
  paymentType: PaymentType;
  paymentDate: string;
  comment?: string;
  createdBy?: string;
  charges: Charge[];
}): Promise<void> {
  const { familyId, amount, paymentType, paymentDate, comment, createdBy } = params;
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      family_id: familyId,
      amount,
      payment_type: paymentType,
      payment_date: paymentDate,
      status: 'Подтверждено',
      created_by: createdBy,
      confirmed_by: createdBy,
      confirmed_at: new Date().toISOString(),
      comment: comment || null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  if (!payment) throw new Error('Платёж не создан');

  let rest = amount;
  const targets = [...params.charges]
    .filter(c => c.debtAmount > 0)
    .sort((a, b) => (a.year - b.year) || (a.periodMonth - b.periodMonth));

  const items: any[] = [];
  const updates: Promise<void>[] = [];

  for (const charge of targets) {
    if (rest <= 0) break;
    const paid = Math.min(rest, charge.debtAmount);
    const nextPaid = charge.paidAmount + paid;
    const nextDebt = Math.max(0, charge.amount + charge.penaltyAmount - nextPaid);
    const status: PaymentStatus = nextDebt <= 0 ? 'Оплачено' : 'Частично оплачено';

    items.push({
      payment_id: payment.id,
      child_id: charge.childId,
      family_id: familyId,
      period_month: charge.periodMonth,
      year: charge.year,
      charged_amount: charge.amount + charge.penaltyAmount,
      paid_amount: paid,
      debt_amount: nextDebt,
      status,
    });

    updates.push(updateCharge(charge.id, { paidAmount: nextPaid, status }));
    rest -= paid;
  }

  if (items.length) {
    const { error: itemError } = await supabase.from('payment_items').insert(items);
    if (itemError) throw new Error(itemError.message);
  }

  await Promise.all(updates);
}

export function chargePeriodLabel(charge: Pick<Charge, 'periodMonth' | 'year'>): string {
  const label = periodKey(charge.periodMonth);
  return `${label}/${charge.year}`;
}
