import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { allowedEmployeeRoles, canWriteEmployee } from './access.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session' };
function response(body: Record<string, unknown>, status=200) { return Response.json(body,{status,headers:corsHeaders}); }
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
  if (typeof payload?.sub !== 'string' || typeof payload?.role !== 'string' || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub), role: String(payload.role) };
}


Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:corsHeaders});
  if (req.method !== 'POST') return response({ok:false,error:'Method not allowed'},405);
  try {
    const session=await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ok:false,error:'Сессия недействительна или истекла'},401);
    const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
    const {data:viewer,error:viewerError}=await db.from('v2_employees').select('role,status').eq('id',session.sub).maybeSingle();
    if(viewerError) throw viewerError;
    if(!viewer || viewer.status!=='active' || viewer.role!==session.role) return response({ok:false,error:'Нет доступа'},403);
    const body=await req.json();
    if(!['saveEmployee','deleteEmployee'].includes(body.action)) return response({ok:false,error:'Неизвестное действие'},400);
    const raw=body.employee ?? {};
    const id=body.action==='deleteEmployee' ? String(body.employeeId ?? '') : String(raw.id ?? '');
    let existing: {role:string} | null=null;
    if(id) {
      const {data,error}=await db.from('v2_employees').select('role').eq('id',id).maybeSingle();
      if(error) throw error;
      if(!data) return response({ok:false,error:'Сотрудник не найден'},404);
      existing=data;
    }
    if(body.action==='deleteEmployee') {
      if(!existing || !canWriteEmployee(viewer.role,existing.role,existing.role,true)) return response({ok:false,error:'Нет доступа к удалению сотрудника'},403);
      const {error}=await db.from('v2_employees').delete().eq('id',id).eq('role',existing.role);
      if(error) throw error;
      return response({ok:true});
    }
    const role=String(raw.role ?? '');
    if(!allowedEmployeeRoles(viewer.role).includes(role) || !canWriteEmployee(viewer.role,role,existing?.role,Boolean(existing))) return response({ok:false,error:'Нет доступа к назначению этой роли'},403);
    const status=viewer.role==='cashier' ? 'inactive' : String(raw.status ?? '');
    if(!String(raw.full_name ?? '').trim() || !String(raw.login ?? '').trim() || !['active','inactive','dismissed'].includes(status) || (!existing && !raw.password_hash) || (raw.password_hash && !/^[0-9a-f]{64}$/i.test(raw.password_hash)) || !Array.isArray(raw.school_keys) || raw.school_keys.some((key:unknown)=>typeof key!=='string')) return response({ok:false,error:'Проверьте данные сотрудника'},400);
    const row:Record<string,unknown>={ full_name:String(raw.full_name).trim(),login:String(raw.login).trim(),role,status,school_keys:raw.school_keys.length?raw.school_keys:['ALL'],updated_at:new Date().toISOString() };
    for(const key of ['position','phone1','phone2','address','comment']) row[key]=String(raw[key] ?? '').trim();
    if(raw.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(raw.start_date)) return response({ok:false,error:'Некорректная дата'},400);
    row.start_date=raw.start_date || null;
    if(raw.password_hash) row.password_hash=raw.password_hash;
    const result=existing ? await db.from('v2_employees').update(row).eq('id',id).eq('role',existing.role).select('id').maybeSingle() : await db.from('v2_employees').insert({...row,id:`emp-${crypto.randomUUID()}`}).select('id').single();
    if(result.error) throw result.error;
    if(!result.data) return response({ok:false,error:'Сотрудник изменён, обновите карточку'},409);
    return response({ok:true});
  } catch(error) { return response({ok:false,error:error instanceof Error?error.message:'Ошибка сервера'},500); }
});
