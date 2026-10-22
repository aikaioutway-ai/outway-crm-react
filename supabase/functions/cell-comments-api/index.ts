import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeCell, validateTarget, targetKey } from './access.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin','gen_director','director','manager','logist','senior_logist','cashier','b2b_manager','b2b_logist']);
const LEADERS = new Set(['admin','gen_director','director']);
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


Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:corsHeaders});
  if (req.method !== 'POST') return response({ok:false,error:'Method not allowed'},405);
  try {
    let session; try { session=await verifySession(req.headers.get('x-employee-session') ?? ''); } catch { session=null; }
    if (!session) return response({ok:false,error:'Сессия недействительна или истекла'},401);
    const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
    const {data:employee,error:employeeError}=await db.from('v2_employees').select('id,full_name,role,status,school_keys').eq('id',session.sub).maybeSingle();
    if(employeeError)throw employeeError;
    if(!employee || employee.status!=='active' || !ALLOWED_ROLES.has(employee.role))return response({ok:false,error:'Нет доступа'},403);
    const body=await req.json();
    const cache=new Map<string,Promise<boolean>>();
    const allowed=(target:any)=>{
      const key=JSON.stringify([target.table,target.row,target.context,employee.role==='b2b_manager'?target.column:'']);
      if(!cache.has(key))cache.set(key,authorizeCell(db,employee,target));
      return cache.get(key)!;
    };
    if(body.action==='counts') {
      if(!Array.isArray(body.targets)||body.targets.length>200)throw new Error('Слишком много ячеек');
      const targets=body.targets.map(validateTarget);
      const keys:string[]=[];
      // Authorization is checked before reading even the presence of comments.
      for(const target of targets)if(await allowed(target))keys.push(targetKey(target));
      if(!keys.length)return response({ok:true,counts:{}});
      const {data,error}=await db.rpc('v2_cell_comment_counts',{p_keys:keys});
      if(error)throw error;
      return response({ok:true,counts:Object.fromEntries((data??[]).map((row:any)=>[row.target_key,Number(row.total)]))});
    }
    const target=validateTarget(body.target);
    if(!await allowed(target))return response({ok:false,error:'Нет доступа к комментариям этой записи'},403);
    const key=targetKey(target);
    if(body.action==='list') {
      let query=db.from('v2_cell_comments').select('id,author_id,author_name,body,created_at,updated_at').eq('target_key',key).is('deleted_at',null).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
      if(body.before){
        const [date,id]=String(body.before).split('|');
        if(!/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(date)||!isUuid(id))throw new Error('Некорректная страница');
        query=query.or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`);
      }
      const {data,error}=await query;if(error)throw error;
      return response({ok:true,comments:(data??[]).slice(0,50).map((comment:any)=>({...comment,can_edit:comment.author_id===employee.id})),hasMore:(data??[]).length>50});
    }
    if(body.action==='edit' || body.action==='delete') {
      if(!isUuid(body.commentId))throw new Error('Некорректный комментарий');
      const {data,error}=await db.rpc('v2_mutate_cell_comment',{p_id:body.commentId,p_target_key:key,p_actor_id:employee.id,p_operation:body.action,p_body:String(body.body??''),p_expected_updated_at:body.expectedUpdatedAt??null});
      if(error){
        if(error.code==='P0001')throw new Error(error.message);
        throw error;
      }
      return response({ok:true,comment:data?.comment??null});
    }
    if(body.action==='add') {
      const text=String(body.body??'').trim();
      if(!text||text.length>5000)throw new Error('Введите комментарий длиной до 5000 символов');
      if(!isUuid(body.requestId))throw new Error('Некорректный идентификатор отправки');
      const {error}=await db.from('v2_cell_comments').upsert({target_key:key,table_key:target.table,row_key:target.row,column_key:target.column,context_key:target.context,author_id:employee.id,author_name:employee.full_name,body:text,request_id:body.requestId},{onConflict:'author_id,request_id',ignoreDuplicates:true});
      if(error)throw error;
      const result=await db.from('v2_cell_comments').select('id,author_id,author_name,body,created_at,target_key').eq('author_id',employee.id).eq('request_id',body.requestId).single();
      if(result.error)throw result.error;
      if(result.data.target_key!==key || result.data.body!==text)throw new Error('Эта отправка уже использована для другого комментария');
      const {target_key:_,...comment}=result.data;
      return response({ok:true,comment});
    }
    throw new Error('Неизвестное действие');
  }catch(error){
    const message=error instanceof Error?error.message:'Не удалось выполнить действие с комментариями';
    // Database diagnostics are not exposed to browsers.
    return response({ok:false,error:message},400);
  }
});
function isUuid(value:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value??''));}
