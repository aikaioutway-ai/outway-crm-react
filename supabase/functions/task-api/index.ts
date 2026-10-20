import { taskReadScope, countTask, type TaskCounts } from './access.ts';
import { SCHOOL_TABS } from './schools.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

type Client = ReturnType<typeof createClient>;
type Target = { type: string; id: string; label: string; schoolKey?: string; schoolKeys?: string[]; group?: 'new' | 'rejected'; transferId?: string; transferNumber?: number; familyId?: string; childId?: string; driverId?: string };
const branchKey = (raw: any): string => {
  const branch = Array.isArray(raw) ? raw[0] : raw;
  if (!branch) return '';
  return SCHOOL_TABS.find(tab => tab.key !== 'ALL' && (tab.key === branch.short_name || tab.label === branch.short_name || tab.branches.includes(branch.name)))?.key
    ?? SCHOOL_TABS.find(tab => tab.codes.includes(branch.code))?.key ?? '';
};
const schoolAllowed = (employee: any, keys: string[]) => LEADERS.has(employee.role) || !keys.length || (employee.school_keys ?? []).includes('ALL') || keys.some(key => (employee.school_keys ?? []).includes(key));
const checked = (result: any) => { if (result.error) throw result.error; return result.data; };
const cleanSearch = (raw: unknown) => String(raw ?? '').slice(0,100).replace(/[^\p{L}\p{N}\s+@._-]/gu,'').trim();

async function resolveTarget(db: Client, input: any, employee: any): Promise<Target> {
  const type = String(input?.type ?? 'general');
  if (String(employee.role).startsWith('b2b_') && !['general','driver'].includes(type)) throw new Error('Этот раздел CRM недоступен вашей роли');
  const id = String(input?.id ?? '');
  let target: Target;
  if (type === 'general') return {type,id:'',label:'Общая задача'};
  if (type === 'school') {
    const school = SCHOOL_TABS.find(row => row.key === id && row.key !== 'ALL');
    if (!school) throw new Error('Школа не найдена');
    target = {type,id,label:school.label,schoolKey:id,schoolKeys:[id]};
  } else if (type === 'group') {
    const school = SCHOOL_TABS.find(row=>row.key===input.schoolKey && row.key!=='ALL');
    if (!school || !['new','rejected'].includes(input.group)) throw new Error('Выберите школу и группу заявок');
    target={type,id:`${school.key}:${input.group}`,label:`${school.label} · ${input.group==='new'?'Новые заявки':'Отказные'}`,schoolKey:school.key,schoolKeys:[school.key],group:input.group};
  } else if (type === 'child' || type === 'transfer') {
    let query = db.from(type === 'child' ? 'v2_children' : 'v2_transfers').select(type === 'child' ? '*, v2_school_branches(code,short_name,name), v2_transfers(transfer_number)' : '*, v2_school_branches(code,short_name,name)');
    if (type === 'transfer' && !id && input?.transferNumber && input?.schoolKey) {
      const branches = checked(await db.from('v2_school_branches').select('id,code,short_name,name')) ?? [];
      const ids = branches.filter((b: any) => branchKey(b) === input.schoolKey).map((b: any) => b.id);
      query = query.eq('transfer_number',Number(input.transferNumber)).in('branch_id',ids);
    } else query = query.eq('id',id);
    const row = checked(await query.maybeSingle());
    if (!row) throw new Error('Объект не найден: возможно, он удалён или перенесён');
    const schoolKey = branchKey(row.v2_school_branches);
    if (input.schoolKey && schoolKey!==input.schoolKey) throw new Error('Объект находится в другой школе. Обновите выбор');
    if (type==='child' && input.group && row.status!==input.group) throw new Error('Статус ребёнка изменился. Выберите его заново');
    if (type==='child' && input.transferId && row.transfer_id!==input.transferId) throw new Error('Ребёнок переведён в другой трансфер. Обновите выбор');
    const group = type==='child' && (input.group || (!input.transferId && ['new','rejected'].includes(row.status))) ? input.group || row.status : undefined;
    target = {type,id:row.id,label:type === 'child' ? row.child_name : `${schoolKey || row.v2_school_branches?.short_name || 'Школа'} · Трансфер № ${row.transfer_number}`,
      schoolKey,schoolKeys:schoolKey ? [schoolKey] : [],group,transferId:type === 'transfer' ? row.id : group ? undefined : row.transfer_id ?? undefined,
      transferNumber:type === 'transfer' ? row.transfer_number : row.v2_transfers?.transfer_number ?? undefined,
      ...(type === 'child' ? {childId:row.id,familyId:row.family_id} : {driverId:row.driver_id ?? undefined})};
  } else if (type === 'family') {
    const family = checked(await db.from('v2_families').select('id,parent_name').eq('id',id).maybeSingle());
    if (!family) throw new Error('Семья не найдена');
    const children = checked(await db.from('v2_children').select('v2_school_branches(code,short_name,name)').eq('family_id',id)) ?? [];
    const keys = [...new Set<string>(children.map((c: any) => branchKey(c.v2_school_branches)).filter(Boolean))];
    target={type,id,label:family.parent_name,familyId:id,schoolKey:keys[0],schoolKeys:keys};
  } else if (type === 'driver') {
    const driver = checked(await db.from('v2_drivers').select('id,full_name').eq('id',id).maybeSingle());
    if (!driver) throw new Error('Водитель не найден');
    const transfers = checked(await db.from('v2_transfers').select('v2_school_branches(code,short_name,name)').eq('driver_id',id)) ?? [];
    const keys = [...new Set<string>(transfers.map((t: any) => branchKey(t.v2_school_branches)).filter(Boolean))];
    target={type,id,label:driver.full_name,driverId:id,schoolKey:keys[0],schoolKeys:keys};
  } else throw new Error('Неизвестный тип привязки');
  if (!schoolAllowed(employee,target.schoolKeys ?? [])) throw new Error('Нет доступа к этой школе');
  return target;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
  if (req.method !== 'POST') return response({ok:false,error:'Method not allowed'},405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ok:false,error:'Сессия недействительна или истекла'},401);
    const db = createClient(SUPABASE_URL,SUPABASE_SERVICE_KEY);
    const employee = checked(await db.from('v2_employees').select('id,full_name,role,status,school_keys').eq('id',session.sub).maybeSingle());
    if (!employee || employee.status !== 'active' || !ALLOWED_ROLES.has(employee.role)) return response({ok:false,error:'Нет доступа к задачам'},403);
    const body = await req.json();
    const leader = LEADERS.has(employee.role);
    const scope = taskReadScope(employee.role);
    const colleagues = scope.roles.length ? checked(await db.from('v2_employees').select('id').in('role', scope.roles)) ?? [] : [];
    const colleagueIds = colleagues.map((row: any) => JSON.stringify(String(row.id))).join(',');
    const visible = (query: any) => scope.all ? query.is('deleted_at', null) : query.is('deleted_at', null).or(`creator_id.eq.${employee.id},assignee_id.eq.${employee.id},observer_id.eq.${employee.id}${colleagueIds ? `,assignee_id.in.(${colleagueIds})` : ''}`);
    if (body.action === 'metadata') {
      const employees = checked(await db.from('v2_employees').select('id,full_name,role,status').neq('role','driver').order('full_name'));
      return response({ok:true,employees,canViewAll:scope.team,targetTypes:String(employee.role).startsWith('b2b_')?['general','driver']:['general','school','transfer','child','family','driver','group']});
    }
    if (body.action === 'summary') {
      const summary=checked(await db.rpc('v2_task_summary',{p_actor_id:employee.id}));
      return response({ok:true,summary});
    }
    if (body.action === 'statistics') {
      const byEmployee: Record<string, TaskCounts> = {};
      const tracked = scope.all ? checked(await db.from('v2_employees').select('id').eq('status', 'active').neq('role', 'driver')) ?? [] : colleagues;
      for (const person of tracked) byEmployee[person.id] = { total: 0, open: 0, completed: 0, overdue: 0, review: 0 };
      const now = Date.now();
      for (let offset = 0; ; offset += 1000) {
        const rows = checked(await visible(db.from('v2_tasks').select('id,assignee_id,status,due_at')).order('id').range(offset, offset + 999)) ?? [];
        for (const row of rows) {
          const counts = countTask(row, now);
          const current = byEmployee[row.assignee_id] ?? { total: 0, open: 0, completed: 0, overdue: 0, review: 0 };
          for (const key of Object.keys(counts) as Array<keyof TaskCounts>) current[key] += counts[key];
          byEmployee[row.assignee_id] = current;
        }
        if (rows.length < 1000) break;
      }
      return response({ ok: true, byEmployee });
    }
    if (body.action === 'list') {
      let query = visible(db.from('v2_tasks').select('*',{count:'exact'}));
      const filters = body.filters ?? {};
      if (filters.view==='created') query=query.eq('creator_id',employee.id);
      else if (filters.view==='watching') query=query.eq('observer_id',employee.id);
      else if (filters.view!=='all' || !scope.team) query=query.eq('assignee_id',employee.id);
      if (filters.status && filters.status!=='active' && filters.status!=='all') query=query.eq('status',filters.status);
      else if (filters.status!=='all') query=query.in('status',['new','in_progress','review']);
      if (filters.assigneeId) query=query.eq('assignee_id',String(filters.assigneeId));
      if (filters.department) {
        const departments: Record<string,string[]>={logistics:['logist','senior_logist','b2b_logist'],management:['manager','b2b_manager'],finance:['cashier'],leadership:['admin','gen_director','director']};
        const roles=departments[String(filters.department)];
        if (!roles) throw new Error('Неизвестный отдел');
        const assignees=checked(await db.from('v2_employees').select('id').in('role',roles)) ?? [];
        query=query.in('assignee_id',assignees.map((e: any)=>e.id));
      }
      if (filters.schoolKey) {
        const key = String(filters.schoolKey);
        if (!SCHOOL_TABS.some(s=>s.key===key && key!=='ALL')) throw new Error('Некорректная школа');
        query=query.or(`school_key.eq.${key},target->schoolKeys.cs.["${key}"]`);
      }
      if (filters.entityType && filters.entityId) {
        const field: Record<string,string>={child:'childId',family:'familyId',transfer:'transferId',driver:'driverId'};
        const key=field[String(filters.entityType)];
        if (filters.entityType==='group') {
          const [school,group]=String(filters.entityId).split(':');
          if (!SCHOOL_TABS.some(s=>s.key===school) || !['new','rejected'].includes(group)) throw new Error('Неизвестная группа');
          query=query.eq('school_key',school).eq('target->>group',group);
        }
        if (key) query=query.eq(`target->>${key}`,String(filters.entityId));
      }
      if (filters.priority==='urgent') query=query.eq('priority','urgent');
      if (filters.due==='overdue') query=query.lt('due_at',new Date().toISOString()).in('status',['new','in_progress','review']);
      if (filters.due==='soon') query=query.gte('due_at',new Date().toISOString()).lte('due_at',new Date(Date.now()+86400000).toISOString()).in('status',['new','in_progress','review']);
      if (filters.search) query=query.ilike('title',`%${cleanSearch(filters.search)}%`);
      const page=Math.max(0,Math.min(10000,Number(body.page)||0));
      const result=await query.order('due_at').order('id').range(page*50,page*50+49);
      checked(result);
      return response({ok:true,rows:result.data ?? [],total:result.count ?? 0});
    }
    if (body.action==='detail') {
      const task=checked(await visible(db.from('v2_tasks').select('*').eq('id',String(body.taskId))).maybeSingle());
      if (!task) return response({ok:false,error:'Задача не найдена или нет доступа'},404);
      const events=checked(await db.from('v2_task_events').select('*').eq('task_id',task.id).order('created_at').order('id'));
      return response({ok:true,task,events});
    }
    if (body.action==='targets') {
      const type=String(body.type), search=cleanSearch(body.search);
      if (String(employee.role).startsWith('b2b_') && type!=='driver') throw new Error('Этот раздел CRM недоступен вашей роли');
      const branches=checked(await db.from('v2_school_branches').select('id,code,short_name,name')) ?? [];
      const allowed=branches.filter((b: any)=>schoolAllowed(employee,[branchKey(b)]) && (!body.schoolKey || branchKey(b)===body.schoolKey));
      const branchIds=allowed.map((b: any)=>b.id);
      let result: any;
      if (type==='transfer') {
        let query=db.from('v2_transfers').select('id,transfer_number,v2_school_branches(code,short_name,name)').in('branch_id',branchIds).eq('status','active');
        if (/^\d+$/.test(search)) query=query.eq('transfer_number',Number(search));
        result=await query.order('transfer_number').limit(50);
      } else if (type==='child') {
        let query=db.from('v2_children').select('id,child_name,transfer_id,status,v2_school_branches(code,short_name,name),v2_transfers(transfer_number)').in('branch_id',branchIds).ilike('child_name',`%${search}%`);
        if (body.transferId) query=query.eq('transfer_id',String(body.transferId));
        if (body.group) { if (!['new','rejected'].includes(body.group)) throw new Error('Некорректная группа'); query=query.eq('status',body.group); }
        result=await query.order('child_name').limit(50);
      } else if (type==='family') {
        // Inner join filters families by a child's allowed school before applying the limit.
        const restrict=(!leader && !(employee.school_keys ?? []).includes('ALL')) || Boolean(body.schoolKey);
        let query=db.from('v2_families').select(restrict ? 'id,parent_name,v2_children!inner(branch_id)' : 'id,parent_name,v2_children(branch_id)').ilike('parent_name',`%${search}%`).order('parent_name').limit(50);
        if (restrict) query=query.in('v2_children.branch_id',branchIds);
        result=await query;
      } else if (type==='driver') {
        let query=db.from('v2_drivers').select('id,full_name,v2_transfers(branch_id)').eq('status','active').ilike('full_name',`%${search}%`).order('full_name').limit(50);
        if ((!leader && !(employee.school_keys ?? []).includes('ALL')) || body.schoolKey) {
          query=db.from('v2_drivers').select('id,full_name,v2_transfers!inner(branch_id)').eq('status','active').in('v2_transfers.branch_id',branchIds).ilike('full_name',`%${search}%`).order('full_name').limit(50);
        }
        result=await query;
      } else throw new Error('Выберите тип привязки');
      const rows=checked(result) ?? [];
      return response({ok:true,targets:rows.map((r: any)=>({type,id:r.id,schoolKey:branchKey(r.v2_school_branches),transferId:type==='transfer'?r.id:r.transfer_id,transferNumber:type==='transfer'?r.transfer_number:r.v2_transfers?.transfer_number,group:type==='child' && ['new','rejected'].includes(r.status)?r.status:undefined,label:type==='transfer' ? `${branchKey(r.v2_school_branches)} · Трансфер № ${r.transfer_number}` : r.child_name ?? r.parent_name ?? r.full_name}))});
    }
    if (body.action==='resolveTarget') return response({ok:true,target:await resolveTarget(db,body.target,employee)});
    if (body.action==='mutate') {
      if (body.operation !== 'create') {
        const allowed = checked(await visible(db.from('v2_tasks').select('id').eq('id', String(body.taskId))).maybeSingle());
        if (!allowed) return response({ok:false,error:'Задача не найдена или нет доступа'},404);
      }
      const input={...(body.input ?? {})};
      if (input.target) input.target=await resolveTarget(db,input.target,employee);
      if (JSON.stringify(input).length>40000) throw new Error('Слишком большой текст задачи');
      const task=checked(await db.rpc('v2_mutate_task',{p_actor_id:employee.id,p_action:String(body.operation),p_task_id:body.taskId ?? null,p_input:input}));
      return response({ok:true,task});
    }
    return response({ok:false,error:'Неизвестное действие'},400);
  } catch (error) {
    return response({ok:false,error:error && typeof error==='object' && 'message' in error ? String(error.message) : 'Ошибка сервера задач'},400);
  }
});
