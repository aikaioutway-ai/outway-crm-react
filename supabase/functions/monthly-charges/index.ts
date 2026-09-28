// supabase/functions/monthly-charges/index.ts
// Ежемесячное автоначисление (v2 таблицы)
// Cron: "0 6 1 * *" — 1-го в 06:00; вне учебного сезона функция ничего не делает.
//
// Сумма начисления считается в базе (v2_create_period_charges): тариф,
// постоянная скидка с учётом её периода действия, семейная 5%, цена учителя.
//
// Деплой:
//   supabase functions deploy monthly-charges --no-verify-jwt
//
// Ручной вызов:
//   POST /functions/v1/monthly-charges  body: { month: 10, year: 2025 }
//   GET  /functions/v1/monthly-charges  — использует текущую дату

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Учебный сезон
const ACADEMIC_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const now = new Date();
  const targetMonth: number = body.month ?? now.getMonth() + 1;
  const targetYear: number  = body.year  ?? now.getFullYear();

  if (!ACADEMIC_MONTHS.includes(targetMonth)) {
    return Response.json(
      { ok: false, message: `Месяц ${targetMonth} вне учебного сезона` },
      { headers: corsHeaders, status: 400 }
    );
  }

  const { data: created, error } = await supabase.rpc('v2_create_period_charges', {
    p_month: targetMonth,
    p_year: targetYear,
    p_created_by: 'cron',
  });
  if (error) return Response.json({ ok: false, error: error.message }, { headers: corsHeaders, status: 500 });

  return Response.json({
    ok: true,
    message: `Начисления за ${targetMonth}/${targetYear} созданы`,
    created,
  }, { headers: corsHeaders });
});
