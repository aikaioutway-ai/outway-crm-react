// supabase/functions/discount-api/index.ts
// Скидки: постоянная скидка ребёнка, фиксированная цена (цена учителя) и
// разовые скидки на начисление. Менять скидки могут только директор,
// гендиректор и администратор — браузер напрямую писать эти поля не может
// (см. supabase/migrations/20260928120000_discount_rules.sql).
//
// Деплой:
//   supabase functions deploy discount-api --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DISCOUNT_ROLES = new Set(['admin', 'gen_director', 'director']);
const REASON_TYPES = new Set(['partial_month', 'recalculation', 'compensation', 'other']);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session',
};

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifySession(token: string): Promise<{ sub: string; role: string } | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  if (!payload?.sub || !payload?.role || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub), role: String(payload.role) };
}

function monthDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})/.exec(text);
  if (!match) throw new Error('Некорректный месяц');
  return `${match[1]}-${match[2]}-01`;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: employee, error: employeeError } = await supabase
      .from('v2_employees')
      .select('id, full_name, role, status')
      .eq('id', session.sub)
      .eq('status', 'active')
      .single();
    if (employeeError || !employee || employee.role !== session.role) return response({ ok: false, error: 'Сотрудник не найден' }, 403);
    if (!DISCOUNT_ROLES.has(employee.role)) {
      return response({ ok: false, error: 'Скидки назначают только директор, гендиректор или администратор' }, 403);
    }

    const body = await req.json();
    const actor = String(employee.full_name ?? 'CRM');

    if (body.action === 'setDiscount') {
      const { error } = await supabase.rpc('v2_set_child_discount', {
        p_child_id: String(body.childId ?? ''),
        p_percent: Number(body.percent ?? 0),
        p_amount: Number(body.amount ?? 0),
        p_valid_from: monthDate(body.validFrom),
        p_valid_to: monthDate(body.validTo),
        p_reason: String(body.reason ?? ''),
        p_actor: actor,
      });
      if (error) return response({ ok: false, error: error.message }, 400);
      return response({ ok: true });
    }

    if (body.action === 'setFixedPrice') {
      const childIds: string[] = Array.isArray(body.childIds) ? body.childIds.map(String) : [];
      if (!childIds.length) return response({ ok: false, error: 'Не выбраны дети' }, 400);
      const fixedPrice = body.fixedPrice === null || body.fixedPrice === undefined ? null : Number(body.fixedPrice);
      for (const childId of childIds) {
        const { error } = await supabase.rpc('v2_set_child_fixed_price', {
          p_child_id: childId,
          p_fixed_price: fixedPrice,
          p_reason: String(body.reason ?? ''),
          p_actor: actor,
        });
        if (error) return response({ ok: false, error: error.message }, 400);
      }
      return response({ ok: true });
    }

    if (body.action === 'addChargeDiscount') {
      const reasonType = String(body.reasonType ?? '');
      if (!REASON_TYPES.has(reasonType)) return response({ ok: false, error: 'Выберите причину скидки' }, 400);
      const { data, error } = await supabase.rpc('v2_add_charge_discount', {
        p_charge_id: String(body.chargeId ?? ''),
        p_amount: Number(body.amount ?? 0),
        p_reason_type: reasonType,
        p_comment: String(body.comment ?? ''),
        p_actor: actor,
      });
      if (error) return response({ ok: false, error: error.message }, 400);
      return response({ ok: true, id: data });
    }

    if (body.action === 'cancelChargeDiscount') {
      const { error } = await supabase.rpc('v2_cancel_charge_discount', {
        p_discount_id: String(body.discountId ?? ''),
        p_actor: actor,
      });
      if (error) return response({ ok: false, error: error.message }, 400);
      return response({ ok: true });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
