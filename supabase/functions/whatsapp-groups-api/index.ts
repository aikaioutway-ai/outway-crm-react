import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySession } from '../_shared/employeeApiSession.ts';
import { allowedBranchIds, RECEIPT_ROLES } from '../_shared/incomingReceiptsAccess.ts';
import { SCHOOL_TABS } from '../task-api/schools.ts';
import { greenApiRequest, GreenApiError } from '../_shared/greenApiClient.ts';
import { accountIds, verifyGroup, verifiedGroups, GroupLookupError } from '../_shared/greenApiGroups.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session' };
const response = (data: Record<string, unknown>, status = 200) => Response.json(data, { status, headers: cors });
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    let session: { sub: string } | null = null;
    try { session = await verifySession(request.headers.get('x-employee-session') ?? '', key); } catch { /* invalid session */ }
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
    const { data: employee, error: employeeError } = await db.from('v2_employees').select('id,role,status,school_keys').eq('id', session.sub).maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee || employee.status !== 'active' || !RECEIPT_ROLES.has(employee.role)) return response({ ok: false, error: 'Нет доступа' }, 403);
    const body = await request.json();
    if (body.action === 'groups' || body.action === 'syncGroups') {
      const { data: known, error } = await db.from('v2_whatsapp_groups').select('chat_id').limit(500);
      if (error) throw error;
      const groups = await verifiedGroups(greenApiRequest, (known ?? []).map(row => row.chat_id), body.inviteLink === undefined ? undefined : String(body.inviteLink));
      const now = new Date().toISOString();
      if (groups.length) {
        const { error: saveError } = await db.from('v2_whatsapp_groups').upsert(groups.map(group => ({ chat_id: group.chatId, name: group.name, last_seen_at: now })), { onConflict: 'chat_id' });
        if (saveError) throw saveError;
      }
      const { data: transfers, error: transferError } = await db.from('v2_transfers').select('id,transfer_number,whatsapp_chat_id').not('whatsapp_chat_id', 'is', null);
      if (transferError) throw transferError;
      const byChat = new Map((transfers ?? []).map(t => [t.whatsapp_chat_id, t]));
      return response({ ok: true, count: groups.length, groups: groups.map(group => ({
        chatId: group.chatId, name: group.name, lastSeenAt: now,
        transferId: byChat.get(group.chatId)?.id ?? null, transferNumber: byChat.get(group.chatId)?.transfer_number ?? null,
      })) });
    }
    if (body.action === 'linkGroup' || body.action === 'historyStatus' || body.action === 'retryHistory') {
      if (!uuid(body.transferId)) throw new GroupLookupError('Трансфер не найден');
      const { data: branches, error: branchError } = await db.from('v2_school_branches').select('id,code,short_name,name');
      if (branchError) throw branchError;
      const scope = allowedBranchIds(employee, branches ?? [], SCHOOL_TABS);
      const { data: transfer, error } = await db.from('v2_transfers').select('id,branch_id,whatsapp_chat_id').eq('id', body.transferId).maybeSingle();
      if (error) throw error;
      if (!transfer || (scope !== null && !scope.includes(transfer.branch_id))) throw new GroupLookupError('Этот трансфер вам недоступен');
      if (body.action !== 'linkGroup') {
        const chatId = transfer.whatsapp_chat_id;
        if (!chatId || chatId !== body.chatId) throw new GroupLookupError('Группа трансфера изменилась. Откройте окно заново');
      if (body.action === 'retryHistory') {
        const { data, error: retryError } = await db.from('v2_whatsapp_history_jobs').update({
          status: 'queued', window_end: new Date().toISOString(), message_ids: null, position: 0, scanned: 0, imported: 0, existing: 0,
          other: 0, failed: 0, attempts: 0, discovery_attempts: 0, limited: false, error: null,
          lease_id: null, lease_until: null, next_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('chat_id', chatId).in('status', ['completed', 'failed', 'cancelled']).select('chat_id').maybeSingle();
        if (retryError) throw retryError;
        if (!data) throw new GroupLookupError('Загрузка уже идёт или ещё не поставлена в очередь');
        return response({ ok: true });
      }
      if (body.action === 'historyStatus') {
        const { data: job, error: jobError } = await db.from('v2_whatsapp_history_jobs')
          .select('status,position,total,scanned,imported,existing,other,failed,limited,error,updated_at').eq('chat_id', chatId).maybeSingle();
        if (jobError) throw jobError;
        return response({ ok: true, job });
      }
      }
      const chatId = body.chatId === null ? null : String(body.chatId ?? '');
      if (chatId !== null) {
        if (!chatId.endsWith('@g.us')) throw new GroupLookupError('Группа не найдена');
        const group = verifyGroup(await greenApiRequest('getGroupData', { groupId: chatId }), chatId, accountIds(await greenApiRequest('getWaSettings')));
        if (!group) throw new GroupLookupError('Номер бота больше не состоит в этой группе');
        const { error: saveError } = await db.from('v2_whatsapp_groups').upsert({ chat_id: chatId, name: group.name, last_seen_at: new Date().toISOString() });
        if (saveError) throw saveError;
        const { data: other, error: otherError } = await db.from('v2_transfers').select('transfer_number').eq('whatsapp_chat_id', chatId).neq('id', transfer.id).maybeSingle();
        if (otherError) throw otherError;
        if (other) throw new GroupLookupError(`Эта группа уже привязана к трансферу ${other.transfer_number}`);
      }
      const { error: updateError } = await db.from('v2_transfers').update({ whatsapp_chat_id: chatId }).eq('id', transfer.id);
      if (updateError) throw updateError;
      return response({ ok: true });
    }
    throw new GroupLookupError('Неизвестное действие с группой');
  } catch (error) {
    if (error instanceof GreenApiError || error instanceof GroupLookupError) return response({ ok: false, error: error.message }, 400);
    return response({ ok: false, error: 'Не удалось выполнить действие с группой. Повторите попытку.' }, 500);
  }
});
