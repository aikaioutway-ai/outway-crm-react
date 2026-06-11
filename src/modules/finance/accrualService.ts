// ─── accrualService.ts ────────────────────────────────────────────────────────
// Сервис начислений OutWay CRM
//
// Отвечает за:
//   - создание периодов при новой заявке (депозит + сентябрь)
//   - ежемесячное начисление (октябрь–апрель)
//   - пересчёт при смене ТС / зоны / детей
//   - ручное редактирование суммы (только admin/director, шаг 100 сом)
//   - зачёт переплаты в следующий период
//
// Используется в: FamilyDrawer, AccrualsPage
// Роли: чтение — все; редактирование начислений — admin, director
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../services/supabase';
import { Payment, PeriodKey, PaymentStatus, UserRole } from '../../types';
import { getFamilyPrice } from '../../utils/pricing';

// ─── КОНСТАНТЫ ────────────────────────────────────────────────────────────────

// Периоды сезона по порядку начисления (май отдельно — покрывается депозитом)
const SEASON_PERIODS: { periodKey: PeriodKey; month: number; year: number }[] = [
  { periodKey: '9',  month: 9,  year: 2026 },
  { periodKey: '10', month: 10, year: 2026 },
  { periodKey: '11', month: 11, year: 2026 },
  { periodKey: '12', month: 12, year: 2026 },
  { periodKey: '1',  month: 1,  year: 2027 },
  { periodKey: '2',  month: 2,  year: 2027 },
  { periodKey: '3',  month: 3,  year: 2027 },
  { periodKey: '4',  month: 4,  year: 2027 },
  // periodKey '5' (май) — НЕ создаётся, покрывается депозитом
];

// Статусы при которых начисление считается оплаченным — не пересчитывать
const PAID_STATUSES: PaymentStatus[] = ['Оплачено', 'Частично оплачено'];

// Роли которые могут редактировать начисления вручную
const CAN_EDIT_ACCRUAL: UserRole[] = ['admin', 'director'];

// ─── ТИПЫ ─────────────────────────────────────────────────────────────────────

// Входные данные ребёнка для расчёта цены
interface KidInput {
  schoolCode: string;
  zone: 'A' | 'B' | 'C';
  vehicleType: 'microbus' | 'minivan' | 'sedan';
}

// Результат создания начислений
interface AccrualResult {
  success: boolean;
  error?: string;
}

// ─── МАППИНГ ──────────────────────────────────────────────────────────────────

// Преобразует запись из Supabase (snake_case) в Payment (camelCase)
function mapPayment(row: Record<string, unknown>): Payment {
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
    accountantStatus: String(row.accountant_status) as PaymentStatus,
    factAmount:       Number(row.fact_amount ?? 0),
    factDate:         String(row.fact_date ?? ''),
    isFrozen:         Boolean(row.is_frozen),
    comment:          String(row.comment ?? ''),
  };
}

// ─── СОЗДАНИЕ НАЧИСЛЕНИЙ ──────────────────────────────────────────────────────

// Создаёт начальные записи для новой заявки: депозит + сентябрь
// Вызывается один раз при принятии заявки
export async function initFamilyPayments(
  familyId: string,
  schoolCode: string,
  kids: KidInput[]
): Promise<AccrualResult> {
  // Считаем суммарную цену семьи (первый ребёнок полная цена, 2+ со скидкой 5%)
  const amount = getFamilyPrice(kids as Parameters<typeof getFamilyPrice>[0]);

  // Базовый шаблон записи — одинаков для депозита и сентября
  const base = {
    family_id:         familyId,
    school_code:       schoolCode,
    manager_amount:    0,
    manager_date:      null,
    has_receipt:       false,
    accountant_status: 'Не оплачено' as PaymentStatus,
    fact_amount:       0,
    fact_date:         null,
    is_frozen:         false,
    comment:           '',
  };

  const rows = [
    // Депозит — хранится отдельно, пеня на него НЕ начисляется
    { ...base, period_key: 'deposit', month: 0, year: 2026, amount },
    // Сентябрь — первый рабочий период сезона
    { ...base, period_key: '9', month: 9, year: 2026, amount },
  ];

  const { error } = await supabase.from('payments').insert(rows);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Создаёт начисление для нового месяца (вызывается 1-го числа каждого месяца)
// periodKey — ключ периода из SEASON_PERIODS
export async function createMonthlyAccrual(
  familyId: string,
  schoolCode: string,
  kids: KidInput[],
  periodKey: PeriodKey
): Promise<AccrualResult> {
  // Находим метаданные периода (месяц, год)
  const period = SEASON_PERIODS.find(p => p.periodKey === periodKey);
  if (!period) return { success: false, error: `Неизвестный период: ${periodKey}` };

  // Не создаём май — он покрывается депозитом
  if (periodKey === '5') return { success: false, error: 'Май покрывается депозитом' };

  const amount = getFamilyPrice(kids as Parameters<typeof getFamilyPrice>[0]);

  const { error } = await supabase.from('payments').insert({
    family_id:         familyId,
    school_code:       schoolCode,
    period_key:        period.periodKey,
    month:             period.month,
    year:              period.year,
    amount,
    manager_amount:    0,
    manager_date:      null,
    has_receipt:       false,
    accountant_status: 'Не оплачено',
    fact_amount:       0,
    fact_date:         null,
    is_frozen:         false,
    comment:           '',
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── ПЕРЕСЧЁТ ─────────────────────────────────────────────────────────────────

// Пересчитывает все неоплаченные и незамороженные периоды семьи
// Вызывается при смене: ТС / зоны / школы / добавлении или удалении ребёнка
// ВАЖНО: оплаченные и замороженные записи — НЕ ТРОГАЕМ
export async function recalcFamilyPayments(
  familyId: string,
  kids: KidInput[]
): Promise<AccrualResult> {
  // Загружаем все периоды семьи из базы
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('family_id', familyId);

  if (error) return { success: false, error: error.message };
  if (!data?.length) return { success: true }; // нечего пересчитывать

  const newAmount = getFamilyPrice(kids as Parameters<typeof getFamilyPrice>[0]);

  // Фильтруем только те что можно трогать: не оплачены и не заморожены
  const toUpdate = data.filter(row => {
    const isPaid = PAID_STATUSES.includes(row.accountant_status as PaymentStatus);
    return !isPaid && !row.is_frozen;
  });

  if (!toUpdate.length) return { success: true };

  // Обновляем сумму начисления для каждой подходящей записи
  const updates = toUpdate.map(row =>
    supabase.from('payments').update({ amount: newAmount }).eq('id', row.id)
  );

  await Promise.all(updates);
  return { success: true };
}

// ─── РУЧНОЕ РЕДАКТИРОВАНИЕ ────────────────────────────────────────────────────

// Позволяет Управляющему / Админу изменить сумму начисления вручную
// Только для неоплаченных и незамороженных периодов
// Сумма вводится с шагом 100 сом
// Все изменения логируются в audit_log
export async function editAccrualAmount(
  paymentId: string,
  newAmount: number,
  role: UserRole,
  userName: string
): Promise<AccrualResult> {
  // Проверяем права — только admin и director
  if (!CAN_EDIT_ACCRUAL.includes(role)) {
    return { success: false, error: 'Нет прав для редактирования начислений' };
  }

  // Проверяем шаг — сумма должна быть кратна 100
  if (newAmount % 100 !== 0) {
    return { success: false, error: 'Сумма должна быть кратна 100 сом' };
  }

  // Загружаем текущую запись чтобы зафиксировать старое значение в лог
  const { data: current, error: fetchError } = await supabase
    .from('payments')
    .select('amount, accountant_status, is_frozen')
    .eq('id', paymentId)
    .single();

  if (fetchError || !current) return { success: false, error: 'Запись не найдена' };

  // Нельзя редактировать оплаченные или замороженные
  const isPaid = PAID_STATUSES.includes(current.accountant_status as PaymentStatus);
  if (isPaid || current.is_frozen) {
    return { success: false, error: 'Нельзя редактировать оплаченный или замороженный период' };
  }

  const oldAmount = current.amount;

  // Сохраняем новую сумму
  const { error: updateError } = await supabase
    .from('payments')
    .update({ amount: newAmount })
    .eq('id', paymentId);

  if (updateError) return { success: false, error: updateError.message };

  // Пишем в историю изменений: кто, что изменил, было → стало
  await supabase.from('audit_log').insert({
    family_id:  current.family_id ?? null,
    user_name:  userName,
    action:     'Ручное редактирование начисления',
    field:      'amount',
    old_value:  String(oldAmount),
    new_value:  String(newAmount),
    start_date: new Date().toISOString().slice(0, 10),
    end_date:   '',
    created_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  });

  return { success: true };
}

// ─── ЗАЧЁТ ПЕРЕПЛАТЫ ─────────────────────────────────────────────────────────

// Если factAmount > amount — разница является переплатой
// При создании нового периода переплата зачитывается как частичная оплата
// Вызывается при createMonthlyAccrual если в предыдущем периоде есть переплата
export function calcOverpayment(payment: Payment): number {
  // Переплата = подтверждённая оплата минус начисленная сумма
  // Возвращает 0 если переплаты нет
  return Math.max(0, payment.factAmount - payment.amount);
}

// Применяет переплату предыдущего периода к новому начислению
// Устанавливает managerAmount и статус "Частично оплачено" автоматически
export async function applyOverpaymentToNext(
  familyId: string,
  newPeriodKey: PeriodKey,
  overpayment: number
): Promise<AccrualResult> {
  if (overpayment <= 0) return { success: true }; // нечего зачитывать

  // Находим запись нового периода
  const { data, error } = await supabase
    .from('payments')
    .select('id, amount')
    .eq('family_id', familyId)
    .eq('period_key', newPeriodKey)
    .single();

  if (error || !data) return { success: false, error: 'Период не найден' };

  // Зачитываем переплату: если переплата >= суммы — период полностью оплачен
  const isFullyCovered = overpayment >= data.amount;
  const status: PaymentStatus = isFullyCovered ? 'Оплачено' : 'Частично оплачено';

  await supabase.from('payments').update({
    manager_amount:    overpayment,
    manager_date:      new Date().toISOString().slice(0, 10),
    accountant_status: status,
    // Переплата зачитывается автоматически — чек не требуется
  }).eq('id', data.id);

  return { success: true };
}

// ─── ЗАГРУЗКА ДАННЫХ ──────────────────────────────────────────────────────────

// Загружает все периоды семьи из Supabase, сортированные по месяцу
export async function loadFamilyPayments(familyId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('family_id', familyId)
    .order('month', { ascending: true });

  if (error || !data) return [];

  // Преобразуем snake_case из БД в camelCase для фронтенда
  return data.map(mapPayment);
}

// Проверяет существует ли уже начисление для данного периода
// Защита от дублирования при повторном вызове createMonthlyAccrual
export async function periodExists(familyId: string, periodKey: PeriodKey): Promise<boolean> {
  const { data } = await supabase
    .from('payments')
    .select('id')
    .eq('family_id', familyId)
    .eq('period_key', periodKey)
    .single();

  return !!data;
}
