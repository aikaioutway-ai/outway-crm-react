import { supabase } from './supabase';
import { Payment, PaymentStatus, PeriodKey, AuditLog } from '../types';

// ─── МАППИНГ ─────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Payment {
  return {
    id:               String(row.id),
    familyId:         String(row.family_id),
    schoolCode:       row.school_code as Payment['schoolCode'],
    periodKey:        String(row.period_key) as PeriodKey,
    month:            Number(row.month),
    year:             Number(row.year),
    amount:           Number(row.amount),
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

/** Все платежи семьи */
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

/** Все платежи одной школы (для страницы финансов) */
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

// ─── СОЗДАНИЕ ────────────────────────────────────────────────────────────────

/**
 * Создать платёж (депозит + сентябрь) при новой заявке.
 * Вызывается один раз из модуля заявок.
 */
export async function initFamilyPayments(
  familyId: string,
  schoolCode: string,
  price: number,
): Promise<void> {
  const base = {
    family_id:        familyId,
    school_code:      schoolCode,
    amount:           price,
    manager_amount:   0,
    manager_date:     null,
    has_receipt:      false,
    accountant_status: 'Не оплачено',
    fact_amount:      0,
    fact_date:        null,
    is_frozen:        false,
    comment:          '',
  };

  const rows = [
    { ...base, period_key: 'deposit', month: 0,  year: 2026 },
    { ...base, period_key: '9',       month: 9,  year: 2026 },
  ];

  const { error } = await supabase.from('payments').insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Добавить начисление за новый месяц (вызывается 1-го числа каждого месяца).
 */
export async function addMonthlyPayment(
  familyId: string,
  schoolCode: string,
  price: number,
  month: number,
  year: number,
): Promise<void> {
  const periodKey = String(month) as PeriodKey;

  const { error } = await supabase.from('payments').insert({
    family_id:         familyId,
    school_code:       schoolCode,
    period_key:        periodKey,
    month,
    year,
    amount:            price,
    manager_amount:    0,
    manager_date:      null,
    has_receipt:       false,
    accountant_status: 'Не оплачено',
    fact_amount:       0,
    fact_date:         null,
    is_frozen:         false,
    comment:           '',
  });

  if (error) throw new Error(error.message);
}

// ─── ПЕРЕСЧЁТ ────────────────────────────────────────────────────────────────

/**
 * Пересчитать сумму всех неоплаченных/незамороженных периодов семьи.
 * Вызывается при смене ТС, зоны, добавлении/удалении ребёнка.
 */
export async function recalcFamilyPayments(
  familyId: string,
  newPrice: number,
): Promise<void> {
  const payments = await fetchFamilyPayments(familyId);

  const PAID: PaymentStatus[] = ['Оплачено', 'Частично оплачено'];

  const toUpdate = payments.filter(
    (p) => !PAID.includes(p.accountantStatus) && !p.isFrozen,
  );

  if (!toUpdate.length) return;

  const updates = toUpdate.map((p) =>
    supabase
      .from('payments')
      .update({ amount: newPrice })
      .eq('id', p.id),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

// ─── МЕНЕДЖЕР: ВНЕСТИ ОПЛАТУ ─────────────────────────────────────────────────

/**
 * Менеджер вводит сумму (и опционально прикрепляет чек).
 * Статус → "На проверке" / "На проверке (чек)"
 * Пеня замораживается.
 */
export async function managerSubmitPayment(
  paymentId: string,
  managerAmount: number,
  hasReceipt: boolean,
  managerDate: string,
): Promise<void> {
  const newStatus: PaymentStatus = hasReceipt ? 'На проверке (чек)' : 'На проверке';

  const { error } = await supabase
    .from('payments')
    .update({
      manager_amount:    managerAmount,
      manager_date:      managerDate,
      has_receipt:       hasReceipt,
      accountant_status: newStatus,
      is_frozen:         true,   // пеня замораживается
    })
    .eq('id', paymentId);

  if (error) throw new Error(error.message);
}

// ─── КАССИР: ПОДТВЕРДИТЬ ─────────────────────────────────────────────────────

/**
 * Кассир подтверждает оплату.
 * - factAmount === amount → "Оплачено"
 * - factAmount < amount  → "Частично оплачено"
 * Пеня размораживается.
 */
export async function cashierConfirm(
  paymentId: string,
  factAmount: number,
  factDate: string,
  chargedAmount: number,
): Promise<void> {
  const newStatus: PaymentStatus =
    factAmount >= chargedAmount ? 'Оплачено' : 'Частично оплачено';

  const { error } = await supabase
    .from('payments')
    .update({
      fact_amount:       factAmount,
      fact_date:         factDate,
      accountant_status: newStatus,
      is_frozen:         false,  // пеня размораживается
    })
    .eq('id', paymentId);

  if (error) throw new Error(error.message);
}

// ─── КАССИР: ОТКЛОНИТЬ ───────────────────────────────────────────────────────

/**
 * Кассир отклоняет оплату → "Не оплачено", пеня возобновляется.
 */
export async function cashierReject(
  paymentId: string,
  comment?: string,
): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update({
      manager_amount:    0,
      manager_date:      null,
      has_receipt:       false,
      accountant_status: 'Не оплачено' as PaymentStatus,
      is_frozen:         false,
      comment:           comment ?? '',
    })
    .eq('id', paymentId);

  if (error) throw new Error(error.message);
}

// ─── АДМИН: РУЧНОЕ РЕДАКТИРОВАНИЕ НАЧИСЛЕНИЯ ─────────────────────────────────

/**
 * Только Админ/Управляющий может изменить сумму начисления вручную.
 * Шаг 100 сом. Логируется через addAuditLog (вызывать отдельно).
 */
export async function adminEditAmount(
  paymentId: string,
  newAmount: number,
): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update({ amount: newAmount })
    .eq('id', paymentId);

  if (error) throw new Error(error.message);
}

// ─── ПРОСРОЧЕНО: АВТО-СТАТУС ─────────────────────────────────────────────────

/**
 * Пометить просроченные платежи.
 * Вызывать ежедневно после 5-го числа.
 * Затрагивает только "Не оплачено" за прошедшие периоды.
 */
export async function markOverdue(today = new Date()): Promise<void> {
  if (today.getDate() <= 5) return;

  const currentMonth = today.getMonth() + 1; // 1-based
  const currentYear  = today.getFullYear();

  // periodKey для текущего месяца чтобы НЕ трогать его
  const currentPeriod = String(currentMonth) as PeriodKey;

  const { error } = await supabase
    .from('payments')
    .update({ accountant_status: 'Просрочено' })
    .eq('accountant_status', 'Не оплачено')
    .neq('period_key', 'deposit')
    .neq('period_key', currentPeriod)
    .or(`year.lt.${currentYear},and(year.eq.${currentYear},month.lt.${currentMonth})`);

  if (error) throw new Error(error.message);
}

// ─── АУДИТ ───────────────────────────────────────────────────────────────────

export async function addAuditLog(
  entry: Omit<AuditLog, 'id' | 'createdAt'>,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    family_id:  entry.familyId,
    user_name:  entry.userName,
    action:     entry.action,
    field:      entry.field,
    old_value:  entry.oldValue,
    new_value:  entry.newValue,
    start_date: entry.startDate,
    end_date:   entry.endDate || null,
    created_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  });

  if (error) throw new Error(error.message);
}

export async function fetchAuditLog(familyId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
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
