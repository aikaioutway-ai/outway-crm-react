import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin', 'gen_director', 'cashier']);
const PERSONAL_DETAILS_ROLES = new Set(['admin', 'gen_director']);
const ALLOWED_CATEGORIES = new Set(['school', 'office', 'logistics', 'extra_trip', 'personal']);
const ALLOWED_METHODS = new Set(['cash', 'cashless']);
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
  if (!payload?.sub || !payload?.role || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub), role: String(payload.role) };
}

const CATEGORIES = new Set(['COGS','Revenue Tax','OPEX','CAPEX','Доп. Выезды','Logistics','Личное']);
// Возврат родителю списывает деньги с баланса семьи, поэтому сохраняется функцией базы целиком.
const isFamilyRefund = (row: Record<string, unknown> | undefined) => row?.category === 'OPEX' && row?.subcategory === 'Возврат родителю';
const refundFailure = (error: { message?: string } | null) => error?.message?.startsWith('REFUND: ') ? response({ok:false,error:error.message.slice(8)},400) : null;
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json();
    const driverRead = body.action === 'payments' && typeof body.driverId === 'string' && /^[0-9a-f-]{36}$/i.test(body.driverId) && !body.employeeId;
    const familyRead = body.action === 'list' && typeof body.familyId === 'string' && /^[0-9a-f-]{36}$/i.test(body.familyId);
    const { data: actor, error: actorError } = await db.from('v2_employees').select('role,status,full_name').eq('id',session.sub).maybeSingle();
    if (actorError) throw actorError;
    if (!actor || actor.status !== 'active' || !(ALLOWED_ROLES.has(actor.role) || familyRead && ['manager','director'].includes(actor.role) || driverRead && ['director','logist','senior_logist','b2b_logist'].includes(actor.role))) return response({ok:false,error:'Нет доступа к расходам'},403);
    const personal = PERSONAL_DETAILS_ROLES.has(actor.role);
    if (body.action === 'payments') {
      const driverId = typeof body.driverId === 'string' ? body.driverId : '';
      const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
      const offset = Number(body.offset ?? 0);
      if (Boolean(driverId) === Boolean(employeeId) || !Number.isSafeInteger(offset) || offset < 0 || (driverId && !/^[0-9a-f-]{36}$/i.test(driverId)) || employeeId.length > 200) return response({ok:false,error:'Выберите получателя'},400);
      // Копии из «Финансов» входят в историю выплат: их можно исправить, перенести или удалить в «Расходах».
      const query = db.from('v2_spending_entries').select('payload').is('deleted_at',null)
        .eq(driverId ? 'payload->>driverId' : 'payload->>employeeId',driverId || employeeId)
        .in('category',driverId ? ['COGS','Доп. Выезды','Logistics'] : ['OPEX'])
        .in('payload->>subcategory',driverId ? ['Авансы водителям','Зарплата водителей','Оплата водителю'] : ['Авансы сотрудникам','Зарплата офиса'])
        .order('expense_date',{ascending:false}).order('id').range(offset,offset+499);
      const {data,error} = await query;
      if (error) throw error;
      // Старые записи получателя, у которых уже есть копия в «Расходах» (даже удалённая или
      // переданная другому получателю): карточка показывает копию, а не старую запись.
      let replacedRefs: string[] = [];
      if (offset === 0) {
        const {data: copies,error: copiesError} = await db.from('v2_spending_entries').select('source_table,source_id')
          .not('source_table','is',null).eq(driverId ? 'source_record->>driver_id' : 'source_record->>employee_id',driverId || employeeId);
        if (copiesError) throw copiesError;
        replacedRefs = (copies ?? []).map(row => `${row.source_table}:${row.source_id}`);
      }
      return response({ok:true,rows:(data ?? []).map(row=>row.payload),replacedRefs});
    }
    if (body.action === 'list') {
      const offset = Number(body.offset ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return response({ok:false,error:'Некорректная страница'},400);
      let query = db.from('v2_spending_entries').select('payload').is('deleted_at',null).order('expense_date',{ascending:false}).order('id').range(offset,offset+499);
      if (!personal) query = query.neq('category','Личное');
      if (body.first) query = query.gte('expense_date',body.first);
      if (body.last) query = query.lte('expense_date',body.last);
      if (body.familyId) query = query.eq('payload->>familyId',String(body.familyId));
      const {data,error} = await query;
      if (error) throw error;
      return response({ok:true,rows:(data ?? []).map(row=>row.payload)});
    }
    if (body.action === 'save' || body.action === 'import') {
      if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > (body.action === 'import' ? 100 : 1000)) return response({ok:false,error:'Некорректный список расходов'},400);
      const rows = body.rows as Record<string,unknown>[];
      if (rows.some(row => !row || typeof row.id !== 'string' || row.id.length > 200 || !CATEGORIES.has(String(row.category)) || typeof row.subcategory !== 'string' || !row.subcategory.trim() || typeof row.description !== 'string' || typeof row.recipient !== 'string' || !['Наличные','Безналичные'].includes(String(row.method)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) || !Number.isFinite(Date.parse(String(row.date))) || typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount < 0)) return response({ok:false,error:'Проверьте поля расхода'},400);
      if (!personal && rows.some(row=>row.category === 'Личное')) return response({ok:false,error:'Нет доступа к личным расходам'},403);
      if (body.action === 'import' && rows.some(row=>!String(row.id).startsWith(`browser:${session.sub}:`))) return response({ok:false,error:'Некорректный источник'},400);
      const {data: previous,error: readError} = await db.from('v2_spending_entries').select('id,payload,category,deleted_at').in('id',rows.map(row=>row.id));
      if (readError) throw readError;
      if (!personal && previous?.some(row=>row.category==='Личное')) return response({ok:false,error:'Нет доступа к личным расходам'},403);
      const byId = new Map(previous?.map(row=>[row.id,row]) ?? []);
      if (body.action === 'save' && rows.some(row=>String(row.id).startsWith('finance:') && !byId.has(row.id))) return response({ok:false,error:'Исходная копия не найдена'},400);
      if (body.action === 'save' && previous?.some(row=>row.deleted_at)) return response({ok:false,error:'Расход уже удалён. Обновите страницу.'},409);
      const linkedRefund = (id: unknown) => Boolean(byId.get(String(id))?.payload?.refundId);
      const refundRows = body.action === 'save' ? rows.filter(row => linkedRefund(row.id) || (!byId.has(String(row.id)) && isFamilyRefund(row))) : [];
      if (body.action === 'save' && rows.some(row => byId.has(String(row.id)) && !linkedRefund(row.id) && isFamilyRefund(row) && !isFamilyRefund(byId.get(String(row.id))?.payload))) return response({ok:false,error:'Чтобы оформить возврат родителю, создайте новый расход'},400);
      if (refundRows.some(row => typeof row.familyId !== 'string' || !row.familyId)) return response({ok:false,error:'Выберите ребёнка для возврата'},400);
      for (const row of refundRows) {
        const {sourceRef, originalCategory, originalSubcategory, refundId, classificationChanged, ...fields} = row;
        const {error} = await db.rpc('v2_spending_refund_save',{p_entry:fields,p_actor_name:actor.full_name || session.sub});
        if (error) { const failure = refundFailure(error); if (failure) return failure; throw error; }
      }
      const plainRows = rows.filter(row => !refundRows.includes(row));
      if (!plainRows.length) return response({ok:true});
      const writes = plainRows.map(row=>{
        const old = byId.get(row.id)?.payload;
        const {sourceRef, originalCategory, originalSubcategory, ...fields} = row;
        return {id:row.id,payload:{...fields,...(old?.sourceRef ? {sourceRef:old.sourceRef,originalCategory:old.originalCategory,originalSubcategory:old.originalSubcategory}: {})},expense_date:row.date,amount:row.amount,...(!old ? {created_by:session.sub}: {})};
      });
      const {error} = await db.from('v2_spending_entries').upsert(writes,{onConflict:'id',ignoreDuplicates:body.action==='import'});
      if (error) throw error;
      return response({ok:true});
    }
    if (body.action === 'delete') {
      const {data: row,error: readError} = await db.from('v2_spending_entries').select('category,payload').eq('id',String(body.id)).maybeSingle();
      if (readError) throw readError;
      if (!row || (!personal && row.category==='Личное')) return response({ok:false,error:'Расход недоступен'},403);
      if (row.payload?.refundId) {
        const {error} = await db.rpc('v2_spending_refund_delete',{p_entry_id:String(body.id),p_actor_name:actor.full_name || session.sub});
        if (error) { const failure = refundFailure(error); if (failure) return failure; throw error; }
        return response({ok:true});
      }
      const {error} = await db.from('v2_spending_entries').update({deleted_at:new Date().toISOString()}).eq('id',String(body.id));
      if (error) throw error;
      return response({ok:true});
    }
    return response({ok:false,error:'Неизвестное действие'},400);
  } catch { return response({ok:false,error:'Не удалось выполнить операцию с расходами'},500); }
});
