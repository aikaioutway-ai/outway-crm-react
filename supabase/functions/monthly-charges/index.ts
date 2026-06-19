// supabase/functions/monthly-charges/index.ts
// Ежемесячное автоначисление (v2 таблицы)
// Cron: "0 6 1 9-12,1-5 *"  — только сентябрь–май, 1-го в 06:00
//
// Деплой:
//   supabase functions deploy monthly-charges --no-verify-jwt
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// Ручной вызов (например, из CRM):
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

  // Определяем период
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

  // Май — особый: начисление создаём, wallet_type = deposit
  const isMay = targetMonth === 5;
  const chargeType = isMay ? 'may' : 'monthly';
  const walletType = isMay ? 'deposit' : 'main';

  // Все boarded дети
  const { data: children, error: kidErr } = await supabase
    .from('v2_children')
    .select('id, family_id, final_price')
    .eq('status', 'boarded');

  if (kidErr) return Response.json({ ok: false, error: kidErr.message }, { headers: corsHeaders, status: 500 });
  if (!children?.length) return Response.json({ ok: true, message: 'Нет посаженных детей', created: 0 }, { headers: corsHeaders });

  // Строим строки для upsert
  const rows = children.map((c: any) => ({
    child_id:        c.id,
    family_id:       c.family_id,
    period_month:    targetMonth,
    period_year:     targetYear,
    charge_type:     chargeType,
    original_amount: Number(c.final_price ?? 0),
    amount:          Number(c.final_price ?? 0),
    paid_amount:     0,
    status:          'unpaid',
  }));

  const { error: insertErr } = await supabase
    .from('v2_charges')
    .upsert(rows, { onConflict: 'child_id,period_month,period_year,charge_type', ignoreDuplicates: true });

  if (insertErr) return Response.json({ ok: false, error: insertErr.message }, { headers: corsHeaders, status: 500 });

  // Применяем кошелёк ко всем семьям
  const familyIds = [...new Set(children.map((c: any) => c.family_id as string))];
  let walletApplied = 0;
  for (const fid of familyIds) {
    const { error } = await supabase.rpc('v2_apply_wallet_to_charges', {
      p_family_id:  fid,
      p_wallet_type: walletType,
      p_created_by: 'cron',
    });
    if (!error) walletApplied++;
  }

  return Response.json({
    ok: true,
    message: `Начисления за ${targetMonth}/${targetYear} (${chargeType}) созданы`,
    children: rows.length,
    families: familyIds.length,
    walletApplied,
  }, { headers: corsHeaders });
});
