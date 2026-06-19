// supabase/functions/daily-penalty/index.ts
// Ежедневное начисление пени: 100 сом/день после 6-го числа, макс 15% от суммы долга
// Cron: "0 8 7-31 * *"  — каждый день с 7-го по 31-е в 08:00

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PENALTY_PER_DAY = 100;
const PENALTY_MAX_PERCENT = 0.15;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const now = new Date();
  const day = now.getDate();

  // Пеня начисляется только с 7-го числа
  if (day < 7) {
    return Response.json(
      { ok: true, message: `День ${day} — пеня ещё не начисляется (с 7-го)`, updated: 0 },
      { headers: corsHeaders }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Получаем все неоплаченные начисления с долгом > 0 и незамороженной пеней
  const { data: charges, error } = await supabase
    .from('v2_charges')
    .select('id, amount, paid_amount, penalty_amount, is_frozen')
    .in('status', ['unpaid', 'partial'])
    .eq('is_frozen', false);

  if (error) return Response.json({ ok: false, error: error.message }, { headers: corsHeaders, status: 500 });
  if (!charges?.length) return Response.json({ ok: true, message: 'Нет долгов для пени', updated: 0 }, { headers: corsHeaders });

  let updated = 0;
  for (const charge of charges as any[]) {
    const debt = Math.max(charge.amount + charge.penalty_amount - charge.paid_amount, 0);
    if (debt <= 0) continue;

    const maxPenalty = Math.round(charge.amount * PENALTY_MAX_PERCENT);
    const currentPenalty = charge.penalty_amount ?? 0;
    if (currentPenalty >= maxPenalty) continue; // уже достигнут лимит

    const newPenalty = Math.min(currentPenalty + PENALTY_PER_DAY, maxPenalty);

    const { error: upErr } = await supabase
      .from('v2_charges')
      .update({ penalty_amount: newPenalty })
      .eq('id', charge.id);

    if (!upErr) updated++;
  }

  return Response.json({
    ok: true,
    message: `Пеня начислена`,
    updated,
    total: charges.length,
  }, { headers: corsHeaders });
});
