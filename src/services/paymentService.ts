import { supabase } from './supabase';
import { Payment, PaymentStatus, PeriodKey, AuditLog } from '../types';

// ─── МАППИНГ ─────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Payment {
  return {
    id:               String(row.id),
    familyId:         String(row.family_id),
    schoolCode:       row.school_code as Payment['schoolCode'],
    periodKey:        (row.month === 0 ? 'deposit' : String(row.period_key ?? row.month)) as PeriodKey,
    month:            Number(row.month),
    year:             Number(row.year),
    amount:           Number(row.amount ?? 0),
    managerAmount:    Number(row.manager_amount ?? 0),
    managerDate:      String(row.manager_date ?? ''),
    hasReceipt:       Boolean(row.has_receipt),
    accountantStatus: (row.accountant_status ?? 'Не оплачено') as PaymentStatus,
    factAmount:       Number(row.fact_amount ?? 0),
    factDate:         String(row.fact_date ?? ''),
    isFrozen:         Boolean(row.is_frozen),
    comment:          String(row.comment ?? ''),
  };
}

// ─── ЧТЕНИЕ ──────────────────────────────────────────────────────────────────

export async function fetchFamilyPayments(familyId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('family_id', familyId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function fetchSchoolPayments(schoolCode: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('school_code', schoolCode)
    .order('family_id')
    .order('year')
    .order('month');
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function periodExists(familyId: string, periodKey: PeriodKey): Promise<boolean> {
  const { data } = await supabase
    .from('payments')
    .select('id')
    .eq('family_id', familyId)
    .eq('period_key', periodKey)
    .single();
  return !!data;
}

// ─── СОЗДАНИЕ ────────────────────────────────────────────────────────────────

const PAID: PaymentStatus[] = ['Оплачено', 'Частично оплачено'];

function baseRow(familyId: string, schoolCode: string, amount: number) {
  return {
    family_id:         familyId,
    school_code:       schoolCode,
    amount,
    manager_amount:    0,
    manager_date:      null,
    has_receipt:       false,
    accountant_status: 'Не оплачено',
    fact_amount:       0,
    fact_date:         null,
    is_frozen:         false,
    comment:           '',
  };
}

export async function initFamilyPayments(familyId: string, schoolCode: string, price: number): Promise<void> {
  const base = baseRow(familyId, schoolCode, price);
  const { error } = await supabase.from('payments').insert([
    { ...base, period_key: 'deposit', month: 0, year: 2026 },
    { ...base, period_key: '9',       month: 9, year: 2026 },
  ]);
  if (error) throw new Error(error.message);
}

export async function addMonthlyPayment(
  familyId: string,
  schoolCode: string,
  price: number,
  month: number,
  year: number,
): Promise<void> {
  const { error } = await supabase.from('payments').insert({
    ...baseRow(familyId, schoolCode, price),
    period_key: String(month),
    month,
    year,
  });
  if (error) throw new Error(error.message);
}

// ─── ПЕРЕСЧЁТ ────────────────────────────────────────────────────────────────

export async function recalcFamilyPayments(familyId: string, newPrice: number): Promise<void> {
  const payments = await fetchFamilyPayments(familyId);
  const toUpdate = payments.filter(p => !PAID.includes(p.accountantStatus) && !p.isFrozen);
  if (!toUpdate.length) return;

  const results = await Promise.all(
    toUpdate.map(p => supabase.from('payments').update({ amount: newPrice }).eq('id', p.id))
  );
  const failed = results.find(r => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

// ─── МЕНЕДЖЕР ────────────────────────────────────────────────────────────────

export async function managerSubmitPayment(
  paymentId: string,
  managerAmount: number,
  hasReceipt: boolean,
  managerDate: string,
): Promise<void> {
  const { error } = await supabase.from('payments').update({
    manager_amount:    managerAmount,
    manager_date:      managerDate,
    has_receipt:       hasReceipt,
    accountant_status: hasReceipt ? 'На проверке (чек)' : 'На проверке',
    is_frozen:         true,
  }).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

// ─── КАССИР ──────────────────────────────────────────────────────────────────

export async function cashierConfirm(
  paymentId: string,
  factAmount: number,
  factDate: string,
  chargedAmount: number,
): Promise<void> {
  const { error } = await supabase.from('payments').update({
    fact_amount:       factAmount,
    fact_date:         factDate,
    accountant_status: factAmount >= chargedAmount ? 'Оплачено' : 'Частично оплачено',
    is_frozen:         false,
  }).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

export async function cashierReject(paymentId: string, comment?: string): Promise<void> {
  const { error } = await supabase.from('payments').update({
    manager_amount:    0,
    manager_date:      null,
    has_receipt:       false,
    accountant_status: 'Не оплачено' as PaymentStatus,
    is_frozen:         false,
    comment:           comment ?? '',
  }).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

// ─── ADMIN ───────────────────────────────────────────────────────────────────

export async function adminEditAmount(paymentId: string, newAmount: number): Promise<void> {
  const { error } = await supabase.from('payments').update({ amount: newAmount }).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

// ─── АВТО-СТАТУС ПРОСРОЧЕНО ──────────────────────────────────────────────────

export async function markOverdue(today = new Date()): Promise<void> {
  if (today.getDate() <= 5) return;
  const currentMonth = today.getMonth() + 1;
  const currentYear  = today.getFullYear();

  const { error } = await supabase
    .from('payments')
    .update({ accountant_status: 'Просрочено' })
    .eq('accountant_status', 'Не оплачено')
    .neq('period_key', 'deposit')
    .neq('period_key', String(currentMonth))
    .or(`year.lt.${currentYear},and(year.eq.${currentYear},month.lt.${currentMonth})`);

  if (error) throw new Error(error.message);
}

// ─── АУДИТ ───────────────────────────────────────────────────────────────────

export async function addAuditLog(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    family_id:  entry.familyId,
    user_name:  entry.userName,
    action:     entry.action,
    field:      entry.field,
    old_value:  entry.oldValue,
    new_value:  entry.newValue,
    start_date: entry.startDate,
    end_date:   entry.endDate || null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchAuditLog(familyId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (data ?? []).map(r => ({
    id:        String(r.id),
    familyId:  String(r.family_id),
    userName:  String(r.user_name),
    action:    String(r.action),
    field:     String(r.field),
    oldValue:  String(r.old_value ?? ''),
    newValue:  String(r.new_value ?? ''),
    startDate: String(r.start_date ?? ''),
    endDate:   String(r.end_date ?? ''),
    createdAt: String(r.created_at),
  }));
}
