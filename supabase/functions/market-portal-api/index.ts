// supabase/functions/market-portal-api/index.ts
// Единственная точка доступа портала школ к данным Маркета. client_id
// берётся ИЗ токена (см. market-school-login), а не из тела запроса —
// школа не может подставить чужой id. Цены закупки, маржа и статус
// «выплачен складу» никогда не отдаются наружу.
//
// Деплой:
//   supabase functions deploy market-portal-api --no-verify-jwt
//
// Вызов из портала: supabase.functions.invoke('market-portal-api', { body: { action, ... }, headers: { 'x-market-session': token } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-market-session',
};

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifyClientSession(token: string): Promise<{ clientId: string } | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  if (!payload?.sub || payload.role !== 'market_client' || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { clientId: String(payload.sub) };
}

// Публичный вид каталога для портала — без цены закупки.
function publicProduct(row: any) {
  return {
    id: row.id, name: row.name, category: row.category, unit: row.unit, salePrice: Number(row.sale_price),
  };
}

// Публичный вид заказа для портала — без цены закупки, маржи и данных о выплате складу.
function publicOrder(row: any) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    deliveryDate: row.delivery_date,
    comment: row.comment,
    totalSaleAmount: Number(row.total_sale_amount),
    paidAt: row.paid_at,
    createdAt: row.created_at,
    items: (row.items ?? []).map((item: any) => ({
      productName: item.product_name, unit: item.unit, quantity: Number(item.quantity), saleAmount: Number(item.sale_amount),
    })),
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const session = await verifyClientSession(req.headers.get('x-market-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);

    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const action = String(body.action ?? '');

    if (action === 'getCatalog') {
      const { data, error } = await supabase.from('v2_market_products').select('*').eq('active', true).order('name');
      if (error) throw error;
      return response({ ok: true, rows: (data ?? []).map(publicProduct) });
    }

    if (action === 'listMyOrders') {
      const { data, error } = await supabase
        .from('v2_market_orders')
        .select('*, items:v2_market_order_items(*)')
        .eq('client_id', session.clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return response({ ok: true, rows: (data ?? []).map(publicOrder) });
    }

    if (action === 'submitOrder') {
      const o = body.order ?? {};
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length === 0) return response({ ok: false, error: 'Добавьте хотя бы одну позицию' }, 400);

      const productIds = items.map((item: any) => String(item.productId));
      const { data: products, error: productsError } = await supabase.from('v2_market_products').select('*').in('id', productIds).eq('active', true);
      if (productsError) throw productsError;
      const productMap = new Map((products ?? []).map((p: any) => [String(p.id), p]));

      const orderItemRows: Record<string, unknown>[] = [];
      for (const item of items) {
        const product = productMap.get(String(item.productId));
        const quantity = Number(item.quantity);
        if (!product || !Number.isFinite(quantity) || quantity <= 0) {
          return response({ ok: false, error: 'Проверьте позиции заказа' }, 400);
        }
        // Цены всегда пересчитываются из каталога на сервере — школа не может
        // подставить свою цену через devtools.
        orderItemRows.push({
          product_id: product.id, product_name: product.name, unit: product.unit,
          quantity, purchase_price: product.purchase_price, sale_price: product.sale_price,
        });
      }

      const { data: order, error: orderError } = await supabase.from('v2_market_orders').insert({
        client_id: session.clientId,
        delivery_date: o.deliveryDate || null,
        comment: String(o.comment ?? '').trim() || null,
        created_via: 'portal',
      }).select('id').single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from('v2_market_order_items').insert(
        orderItemRows.map(row => ({ ...row, order_id: order.id })),
      );
      if (itemsError) throw itemsError;

      const { data: fullOrder, error: fullOrderError } = await supabase
        .from('v2_market_orders').select('*, items:v2_market_order_items(*)').eq('id', order.id).single();
      if (fullOrderError) throw fullOrderError;
      return response({ ok: true, row: publicOrder(fullOrder) });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Ошибка сервера' }, 500);
  }
});
