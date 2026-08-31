// supabase/functions/market-api/index.ts
// Модуль «Маркет»: единственная точка доступа сотрудников CRM к v2_market_*.
// Таблицы без RLS-policy — весь доступ идёт через сервис-роль здесь же,
// после проверки HMAC-сессии сотрудника (см. supabase/functions/expense-api).
//
// Деплой:
//   supabase functions deploy market-api --no-verify-jwt
//
// Вызов из CRM: supabase.functions.invoke('market-api', { body: { action, ... }, headers: { 'x-employee-session': token } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MARKET_OWNER_EMPLOYEE_ID = 'emp-admin';

const CATALOG_ROLES = new Set(['admin', 'gen_director', 'director', 'manager']);
const PAYMENT_ROLES = new Set(['admin', 'gen_director', 'director', 'manager', 'cashier']);

const ORDER_STATUS_SEQUENCE = ['new', 'sent_to_warehouse', 'packed', 'delivered', 'paid', 'settled'] as const;
type OrderStatus = typeof ORDER_STATUS_SEQUENCE[number];

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

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function flattenOrder(row: any) {
  return {
    ...row,
    client_name: row.client?.name ?? '',
    items: Array.isArray(row.items) ? row.items : [],
  };
}

const ORDER_SELECT = '*, client:v2_market_clients(name), items:v2_market_order_items(*)';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    if (session.sub !== MARKET_OWNER_EMPLOYEE_ID) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);

    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const action = String(body.action ?? '');

    // --- Каталог ---------------------------------------------------------
    if (action === 'listProducts') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      const { data, error } = await supabase.from('v2_market_products').select('*').order('name');
      if (error) throw error;
      return response({ ok: true, rows: data ?? [] });
    }
    if (action === 'createProduct' || action === 'updateProduct') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      const p = body.product ?? {};
      const name = String(p.name ?? '').trim();
      const unit = String(p.unit ?? 'шт').trim() || 'шт';
      const purchasePrice = Number(p.purchasePrice);
      const salePrice = Number(p.salePrice);
      if (!name || !Number.isFinite(purchasePrice) || purchasePrice < 0 || !Number.isFinite(salePrice) || salePrice < 0) {
        return response({ ok: false, error: 'Проверьте наименование и цены товара' }, 400);
      }
      const payload = {
        name, unit,
        category: String(p.category ?? '').trim() || null,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        active: p.active !== false,
      };
      const query = action === 'createProduct'
        ? supabase.from('v2_market_products').insert(payload)
        : supabase.from('v2_market_products').update(payload).eq('id', String(p.id));
      const { data, error } = await query.select('*').single();
      if (error) throw error;
      return response({ ok: true, row: data });
    }

    // --- Школы (для привязки клиента Маркета к существующей школе) ---------
    if (action === 'listSchools') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      const { data, error } = await supabase.from('v2_schools').select('id, name, code').eq('active', true).order('name');
      if (error) throw error;
      return response({ ok: true, rows: data ?? [] });
    }

    // --- Клиенты -----------------------------------------------------------
    if (action === 'listClients') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      const { data, error } = await supabase.from('v2_market_clients').select('*, school:v2_schools(name)').order('name');
      if (error) throw error;
      const rows = (data ?? []).map((row: any) => ({ ...row, school_name: row.school?.name ?? null }));
      return response({ ok: true, rows });
    }
    if (action === 'createClient' || action === 'updateClient') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      const c = body.client ?? {};
      const name = String(c.name ?? '').trim();
      const login = String(c.login ?? '').trim();
      if (!name || !login) return response({ ok: false, error: 'Укажите название клиента и логин для портала' }, 400);
      const payload: Record<string, unknown> = {
        name, login,
        school_id: c.schoolId ? String(c.schoolId) : null,
        contact_person: String(c.contactPerson ?? '').trim() || null,
        phone: String(c.phone ?? '').trim() || null,
        address: String(c.address ?? '').trim() || null,
        comment: String(c.comment ?? '').trim() || null,
      };
      if (c.password) payload.password_hash = await sha256Hex(String(c.password));
      const query = action === 'createClient'
        ? supabase.from('v2_market_clients').insert(payload)
        : supabase.from('v2_market_clients').update(payload).eq('id', String(c.id));
      const { data, error } = await query.select('*, school:v2_schools(name)').single();
      if (error) throw error;
      return response({ ok: true, row: { ...data, school_name: data.school?.name ?? null } });
    }

    // --- Заказы --------------------------------------------------------------
    if (action === 'listOrders') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      let query = supabase.from('v2_market_orders').select(ORDER_SELECT).order('created_at', { ascending: false });
      const status = String(body.status ?? 'ALL');
      if (status !== 'ALL') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return response({ ok: true, rows: (data ?? []).map(flattenOrder) });
    }
    if (action === 'createOrder') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      const o = body.order ?? {};
      const clientId = String(o.clientId ?? '');
      const items = Array.isArray(o.items) ? o.items : [];
      if (!clientId || items.length === 0) return response({ ok: false, error: 'Выберите клиента и добавьте хотя бы одну позицию' }, 400);

      const { data: client, error: clientError } = await supabase.from('v2_market_clients').select('id, active').eq('id', clientId).single();
      if (clientError || !client || !client.active) return response({ ok: false, error: 'Клиент не найден или неактивен' }, 400);

      const productIds = items.map((item: any) => String(item.productId));
      const { data: products, error: productsError } = await supabase.from('v2_market_products').select('*').in('id', productIds);
      if (productsError) throw productsError;
      const productMap = new Map((products ?? []).map((p: any) => [String(p.id), p]));

      const orderItemRows: Record<string, unknown>[] = [];
      for (const item of items) {
        const product = productMap.get(String(item.productId));
        const quantity = Number(item.quantity);
        if (!product || !product.active || !Number.isFinite(quantity) || quantity <= 0) {
          return response({ ok: false, error: 'Проверьте позиции заказа — товар не найден или некорректное количество' }, 400);
        }
        orderItemRows.push({
          product_id: product.id,
          product_name: product.name,
          unit: product.unit,
          quantity,
          purchase_price: product.purchase_price,
          sale_price: product.sale_price,
        });
      }

      const { data: order, error: orderError } = await supabase.from('v2_market_orders').insert({
        client_id: clientId,
        delivery_date: o.deliveryDate || null,
        comment: String(o.comment ?? '').trim() || null,
        created_via: 'crm',
        created_by: session.sub,
      }).select('id').single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from('v2_market_order_items').insert(
        orderItemRows.map(row => ({ ...row, order_id: order.id })),
      );
      if (itemsError) throw itemsError;

      const { data: fullOrder, error: fullOrderError } = await supabase.from('v2_market_orders').select(ORDER_SELECT).eq('id', order.id).single();
      if (fullOrderError) throw fullOrderError;
      return response({ ok: true, row: flattenOrder(fullOrder) });
    }
    if (action === 'advanceStatus') {
      if (!CATALOG_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к Маркету' }, 403);
      const orderId = String(body.orderId ?? '');
      const { data: current, error: currentError } = await supabase.from('v2_market_orders').select('status').eq('id', orderId).single();
      if (currentError || !current) return response({ ok: false, error: 'Заказ не найден' }, 404);
      const index = ORDER_STATUS_SEQUENCE.indexOf(current.status as OrderStatus);
      if (index < 0 || index >= 3) {
        return response({ ok: false, error: 'Для этого статуса используйте отметку оплаты/выплаты' }, 400);
      }
      const nextStatus = ORDER_STATUS_SEQUENCE[index + 1];
      const { data, error } = await supabase.from('v2_market_orders').update({ status: nextStatus }).eq('id', orderId).select(ORDER_SELECT).single();
      if (error) throw error;
      return response({ ok: true, row: flattenOrder(data) });
    }
    if (action === 'markPaid') {
      if (!PAYMENT_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к отметке оплаты' }, 403);
      const orderId = String(body.orderId ?? '');
      const { data: current, error: currentError } = await supabase.from('v2_market_orders').select('status').eq('id', orderId).single();
      if (currentError || !current) return response({ ok: false, error: 'Заказ не найден' }, 404);
      if (current.status !== 'delivered') return response({ ok: false, error: 'Оплату можно отметить только после доставки' }, 400);
      const { data, error } = await supabase.from('v2_market_orders').update({
        status: 'paid', paid_at: new Date().toISOString(), paid_comment: String(body.comment ?? '').trim() || null,
      }).eq('id', orderId).select(ORDER_SELECT).single();
      if (error) throw error;
      return response({ ok: true, row: flattenOrder(data) });
    }
    if (action === 'markSettled') {
      if (!PAYMENT_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к отметке выплаты складу' }, 403);
      const orderId = String(body.orderId ?? '');
      const { data: current, error: currentError } = await supabase.from('v2_market_orders').select('status').eq('id', orderId).single();
      if (currentError || !current) return response({ ok: false, error: 'Заказ не найден' }, 404);
      if (current.status !== 'paid') return response({ ok: false, error: 'Выплату складу можно отметить только после оплаты школой' }, 400);
      const { data, error } = await supabase.from('v2_market_orders').update({
        status: 'settled', settled_at: new Date().toISOString(), settled_comment: String(body.comment ?? '').trim() || null,
      }).eq('id', orderId).select(ORDER_SELECT).single();
      if (error) throw error;
      return response({ ok: true, row: flattenOrder(data) });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Ошибка сервера' }, 500);
  }
});
