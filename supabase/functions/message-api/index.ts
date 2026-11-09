import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { channelsFor, cleanLink, dmChannel, dmPeer, NOTIFY_ROLES } from './access.ts';
import { overdueBySchool } from './overdue.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session',
};
const PAGE_SIZE = 50;

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

/** Та же подпись сессии сотрудника, что у task-api (выдаёт employee-login). */
async function verifySession(token: string): Promise<{ sub: string } | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  if (!payload?.sub || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub) };
}

const checked = (result: any) => { if (result.error) throw result.error; return result.data; };
const bishkekDate = (now: Date) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bishkek' });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const employee = checked(await db.from('v2_employees').select('id,full_name,role,status').eq('id', session.sub).maybeSingle());
    if (!employee || employee.status !== 'active' || employee.role === 'driver') return response({ ok: false, error: 'Нет доступа к сообщениям' }, 403);
    const body = await req.json();
    const channels = channelsFor(String(employee.role));
    const activeEmployee = async (id: string) => checked(await db.from('v2_employees').select('id,full_name,role,status').eq('id', id).neq('role', 'driver').maybeSingle());
    /** Группа или личный канал, если сотруднику можно в него. Для личного — собеседник должен быть активен для записи. */
    const channelOf = (name: unknown) => {
      const value = String(name ?? '');
      const group = channels.find(item => item.channel === value);
      if (group) return group;
      const peer = dmPeer(value, String(employee.id));
      return peer ? { channel: value, title: '', readOnly: false, peer } : undefined;
    };

    if (body.action === 'channels') {
      const dmRows = checked(await db.rpc('v2_message_dm_channels', { p_employee_id: employee.id })) ?? [];
      const dms = dmRows.map((row: any) => ({ channel: String(row.channel), peer: dmPeer(String(row.channel), String(employee.id)) })).filter((row: any) => row.peer);
      const peers = dms.length ? checked(await db.from('v2_employees').select('id,full_name,role').in('id', dms.map((row: any) => row.peer))) ?? [] : [];
      const peerById = new Map(peers.map((row: any) => [String(row.id), row]));
      const all = [
        ...channels,
        ...dms.map((row: any) => ({ channel: row.channel, title: peerById.get(row.peer)?.full_name ?? 'Сотрудник', readOnly: false, peerId: row.peer, peerRole: peerById.get(row.peer)?.role ?? null })),
      ];
      const summary = checked(await db.rpc('v2_message_channel_summary', { p_employee_id: employee.id, p_channels: all.map(item => item.channel) })) ?? [];
      const byChannel = new Map(summary.map((row: any) => [row.channel, row]));
      return response({ ok: true, channels: all.map(item => {
        const row: any = byChannel.get(item.channel) ?? {};
        return { ...item, unread: Number(row.unread ?? 0), lastBody: row.last_body ?? null, lastAuthor: row.last_author ?? null, lastAt: row.last_at ?? null };
      }) });
    }

    // Кому можно написать лично: активные сотрудники, кроме водителей и себя.
    if (body.action === 'contacts') {
      const rows = checked(await db.from('v2_employees').select('id,full_name,role').eq('status', 'active').neq('role', 'driver').neq('id', employee.id).order('full_name')) ?? [];
      return response({ ok: true, contacts: rows, groups: channels.filter(item => !item.readOnly) });
    }

    if (body.action === 'messages') {
      const channel = channelOf(body.channel);
      if (!channel) return response({ ok: false, error: 'Нет доступа к этой группе' }, 403);
      let query = db.from('v2_messages').select('id,channel,author_id,author_name,body,kind,link,created_at').eq('channel', channel.channel).order('created_at', { ascending: false }).limit(PAGE_SIZE);
      if (body.before) query = query.lt('created_at', String(body.before));
      const rows = checked(await query) ?? [];
      return response({ ok: true, messages: rows.reverse(), hasMore: rows.length === PAGE_SIZE });
    }

    if (body.action === 'send') {
      // Личное сообщение можно начать по id сотрудника: канал создаётся с первым сообщением.
      const channelName = body.toEmployeeId ? dmChannel(String(employee.id), String(body.toEmployeeId)) : body.channel;
      const channel: any = channelOf(channelName);
      if (!channel || channel.readOnly) return response({ ok: false, error: 'В эту группу писать нельзя' }, 403);
      if (channel.peer) {
        const peer = await activeEmployee(channel.peer);
        if (!peer || peer.status !== 'active') return response({ ok: false, error: 'Сотрудник не найден или неактивен' }, 404);
      }
      const link = body.link ? cleanLink(body.link) : null;
      const text = String(body.body ?? '').trim();
      if (!text) return response({ ok: false, error: 'Пустое сообщение' }, 400);
      if (text.length > 4000) return response({ ok: false, error: 'Сообщение длиннее 4000 символов' }, 400);
      const message = checked(await db.from('v2_messages').insert({ channel: channel.channel, author_id: employee.id, author_name: employee.full_name, body: text, link })
        .select('id,channel,author_id,author_name,body,kind,link,created_at').single());
      await db.from('v2_message_reads').upsert({ employee_id: employee.id, channel: channel.channel, last_read_at: message.created_at });
      return response({ ok: true, message });
    }

    if (body.action === 'read') {
      const channel = channelOf(body.channel);
      if (!channel) return response({ ok: false, error: 'Нет доступа к этой группе' }, 403);
      checked(await db.from('v2_message_reads').upsert({ employee_id: employee.id, channel: channel.channel, last_read_at: new Date().toISOString() }));
      return response({ ok: true });
    }

    // Раз в день: сводка просроченных новых заявок в «Уведомления». Повторный вызов в тот же день ничего не создаёт.
    if (body.action === 'notify-overdue') {
      if (!NOTIFY_ROLES.has(String(employee.role))) return response({ ok: true, created: false });
      const now = new Date();
      const dedupeKey = `overdue-requests:${bishkekDate(now)}`;
      const exists = checked(await db.from('v2_messages').select('id').eq('dedupe_key', dedupeKey).maybeSingle());
      if (exists) return response({ ok: true, created: false });
      const rows = checked(await db.from('v2_children')
        .select('transfer_mark,transfer_mark_at,transfer_comment_at,created_at,v2_school_branches!inner(active,code,short_name,name)')
        .eq('status', 'new').is('transfer_id', null).eq('v2_school_branches.active', true)) ?? [];
      const schools = overdueBySchool(rows, now.getTime());
      const total = schools.reduce((sum, school) => sum + school.count, 0);
      if (!total) return response({ ok: true, created: false });
      // body — коротко для списка групп; таблица по школам — в link.data.
      const text = `Просрочено новых заявок: ${total} в ${schools.length} школах.`;
      const { error } = await db.from('v2_messages').insert({
        channel: 'notifications', author_id: null, author_name: 'CRM', kind: 'notification', body: text,
        link: { type: 'overdue-requests', label: 'Открыть новые заявки', data: { total, schools, rules: { new: 2, inWork: 3, waiting: 5 } } }, dedupe_key: dedupeKey,
      });
      // Два руководителя открыли CRM одновременно — второе уведомление база не пустит, это не ошибка.
      if (error && error.code !== '23505') throw error;
      return response({ ok: true, created: !error });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error && typeof error === 'object' && 'message' in error ? String((error as any).message) : 'Ошибка сервера сообщений' }, 400);
  }
});
