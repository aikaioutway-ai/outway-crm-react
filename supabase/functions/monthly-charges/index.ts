// supabase/functions/monthly-charges/index.ts
// Автоначисление платежей — запускается 1-го числа каждого месяца в 06:00
// Cron: "0 6 1 * *"
//
// Деплой:
//   supabase functions deploy monthly-charges
//   supabase functions schedule monthly-charges --cron "0 6 1 * *"
//
// Также можно вызвать вручную из CRM (кнопка "Создать начисления за месяц")

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PRICE_RULES: Record<string, { zone1: number; zone2: number; zone3: number | null }> = {
  KINGS:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  LIGHT:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  BILIM:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  AES:     { zone1: 5500, zone2: 6000, zone3: 6500 },
  KAS:     { zone1: 5500, zone2: 6000, zone3: 6500 },
  EPSILON: { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS4: { zone1: 5500, zone2: 6000, zone3: 6500 },
  NOVA:    { zone1: 5500, zone2: 6000, zone3: 6500 },
  INDIGO:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  ERUDIT:  { zone1: 6000, zone2: 6500, zone3: null },
  TENSAY:  { zone1: 6400, zone2: 6800, zone3: null },
  EDISON:  { zone1: 6500, zone2: 7000, zone3: null },
};

function getPriceByZone(schoolCode: string, zone: number, vehicleType: string): number {
  if (vehicleType === 'minivan') return 9500;
  if (vehicleType === 'sedan')   return 10500;
  const rule = PRICE_RULES[schoolCode];
  if (!rule) return 0;
  if (zone === 1) return rule.zone1;
  if (zone === 2) return rule.zone2;
  if (zone === 3) return rule.zone3 ?? rule.zone2;
  return rule.zone1;
}

function getFamilyPrice(children: Array<{ school_code: string; zone: number; vehicle_type: string }>): number {
  return children.reduce((sum, kid, index) => {
    const base = getPriceByZone(kid.school_code, kid.zone, kid.vehicle_type);
    const price = index === 0 ? base : Math.round(base * 0.95);
    return sum + price;
  }, 0);
}

Deno.serve(async (req) => {
  // Разрешаем вызов из CRM (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Определяем период — можно передать вручную из CRM
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const now = new Date();
  const targetMonth: number = body.month ?? now.getMonth() + 1; // 1-based
  const targetYear: number  = body.year  ?? now.getFullYear();
  const periodKey = String(targetMonth);

  // Май (5) — покрывается депозитом, не создаём отдельную запись
  if (targetMonth === 5) {
    return Response.json({ ok: true, message: 'Май покрывается депозитом, начисления не создаются' });
  }

  // Проверяем сезон: только сентябрь–апрель
  const validMonths = [9, 10, 11, 12, 1, 2, 3, 4];
  if (!validMonths.includes(targetMonth)) {
    return Response.json({ ok: false, message: `Месяц ${targetMonth} не входит в учебный сезон` }, { status: 400 });
  }

  // Получаем все активные семьи
  const { data: families, error: famErr } = await supabase
    .from('families')
    .select('id, school_code, zone, vehicle_type')
    .eq('status', 'active');

  if (famErr) return Response.json({ ok: false, error: famErr.message }, { status: 500 });
  if (!families?.length) return Response.json({ ok: true, message: 'Нет активных семей' });

  // Получаем детей всех семей одним запросом
  const familyIds = families.map((f: any) => f.id);
  const { data: allChildren } = await supabase
    .from('children')
    .select('family_id, school_code, zone, vehicle_type')
    .in('family_id', familyIds);

  // Проверяем какие семьи уже имеют запись за этот период
  const { data: existing } = await supabase
    .from('payments')
    .select('family_id')
    .eq('period_key', periodKey)
    .eq('year', targetYear)
    .in('family_id', familyIds);

  const alreadyCharged = new Set((existing ?? []).map((p: any) => p.family_id));

  // Группируем детей по семьям
  const childrenByFamily = new Map<string, any[]>();
  (allChildren ?? []).forEach((c: any) => {
    if (!childrenByFamily.has(c.family_id)) childrenByFamily.set(c.family_id, []);
    childrenByFamily.get(c.family_id)!.push(c);
  });

  // Создаём начисления
  const toInsert: any[] = [];
  let skipped = 0;

  for (const family of families as any[]) {
    if (alreadyCharged.has(family.id)) {
      skipped++;
      continue;
    }

    const kids = childrenByFamily.get(family.id) ?? [];
    // Если нет детей — считаем по данным семьи
    const price = kids.length > 0
      ? getFamilyPrice(kids)
      : getPriceByZone(family.school_code, family.zone, family.vehicle_type);

    toInsert.push({
      family_id:         family.id,
      school_code:       family.school_code,
      period_key:        periodKey,
      month:             targetMonth,
      year:              targetYear,
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
  }

  if (toInsert.length === 0) {
    return Response.json({
      ok: true,
      message: `Все ${skipped} семей уже имеют начисление за ${targetMonth}/${targetYear}`,
      created: 0,
      skipped,
    });
  }

  const { error: insertErr } = await supabase.from('payments').insert(toInsert);
  if (insertErr) return Response.json({ ok: false, error: insertErr.message }, { status: 500 });

  // Также проставить Просрочено для старых неоплаченных (если после 5-го)
  if (now.getDate() > 5) {
    await supabase
      .from('payments')
      .update({ accountant_status: 'Просрочено' })
      .eq('accountant_status', 'Не оплачено')
      .neq('period_key', 'deposit')
      .neq('period_key', periodKey)
      .lt('year', targetYear);
  }

  return Response.json({
    ok: true,
    message: `Начисления за ${targetMonth}/${targetYear} созданы`,
    created: toInsert.length,
    skipped,
  });
});
