import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { allowedBranchIds, schoolKey as branchSchoolKey, parseReceiptEdit, RECEIPT_FILTERS, RECEIPT_ROLES, summarizeBySchool, type ReceiptTransferCount } from '../_shared/incomingReceiptsAccess.ts';
import { SCHOOL_TABS } from '../task-api/schools.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'incoming-receipts';
const PAGE_SIZE = 50;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session',
};

class UserError extends Error {}

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

async function verifySession(token: string): Promise<{ sub: string } | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart))) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  if (!payload?.sub || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub) };
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    let session: { sub: string } | null;
    try { session = await verifySession(request.headers.get('x-employee-session') ?? ''); } catch { session = null; }
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data: employee, error: employeeError } = await db.from('v2_employees').select('id,full_name,role,status,school_keys').eq('id', session.sub).maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee || employee.status !== 'active' || !RECEIPT_ROLES.has(employee.role)) return response({ ok: false, error: 'Нет доступа' }, 403);

    const { data: branches, error: branchError } = await db.from('v2_school_branches').select('id,code,short_name,name');
    if (branchError) throw branchError;
    const scope = allowedBranchIds(employee, branches ?? [], SCHOOL_TABS);

    const familyAllowed = async (familyId: string) => {
      if (scope === null) return true;
      if (!scope.length) return false;
      const { count, error } = await db.from('v2_children').select('id', { count: 'exact', head: true }).eq('family_id', familyId).in('branch_id', scope);
      if (error) throw error;
      return Boolean(count);
    };
    const loadReceipt = async (id: unknown) => {
      if (!isUuid(id)) throw new UserError('Чек не найден');
      const { data, error } = await db.from('v2_incoming_receipts').select('*').eq('id', id).neq('status', 'dismissed').maybeSingle();
      if (error) throw error;
      if (!data || (data.family_id && !await familyAllowed(data.family_id))) throw new UserError('Чек не найден');
      return data;
    };

    const body = await request.json();

    const listScope = body.schoolKey
      ? (branches ?? []).filter(branch => branchSchoolKey(branch, SCHOOL_TABS) === body.schoolKey && (scope === null || scope.includes(branch.id))).map(branch => branch.id)
      : scope;

    if (body.action === 'list') {
      const filter = RECEIPT_FILTERS.has(body.filter) ? body.filter : 'review';
      const page = Math.max(Number.parseInt(body.page, 10) || 0, 0);
      const { data, error } = await db.rpc('list_incoming_receipts', {
        p_filter: filter,
        p_search: String(body.search ?? '').trim().slice(0, 100),
        p_branch_ids: listScope,
        p_transfer_id: isUuid(body.transferId) ? body.transferId : null,
        p_unassigned: body.unassigned === true,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_school_branch_ids: body.schoolKey ? listScope : null,
        p_date_from: body.dateFrom ?? null,
        p_date_to: body.dateTo ?? null,
      });
      if (error) throw error;
      return response({ ok: true, pageSize: PAGE_SIZE, ...data });
    }

    if (body.action === 'summary') {
      const { data, error } = await db.rpc('incoming_receipts_summary', { p_branch_ids: scope, p_date_from: body.dateFrom ?? null, p_date_to: body.dateTo ?? null });
      if (error) throw error;
      const summary = summarizeBySchool((data?.transfers ?? []) as ReceiptTransferCount[], branches ?? [], SCHOOL_TABS);
      return response({ ok: true, ...summary, unassigned: data?.unassigned ?? { review: 0, duplicates: 0, other: 0, total: 0 } });
    }

    if (body.action === 'groups') {
      const [{ data: groups, error }, { data: linked, error: linkedError }] = await Promise.all([
        db.from('v2_whatsapp_groups').select('chat_id,name,last_seen_at').order('last_seen_at', { ascending: false }).limit(500),
        db.from('v2_transfers').select('id,transfer_number,whatsapp_chat_id').not('whatsapp_chat_id', 'is', null),
      ]);
      if (error) throw error;
      if (linkedError) throw linkedError;
      const transferByChat = new Map((linked ?? []).map(row => [row.whatsapp_chat_id, row]));
      return response({
        ok: true,
        groups: (groups ?? []).map(group => ({
          chatId: group.chat_id,
          name: group.name,
          lastSeenAt: group.last_seen_at,
          transferId: transferByChat.get(group.chat_id)?.id ?? null,
          transferNumber: transferByChat.get(group.chat_id)?.transfer_number ?? null,
        })),
      });
    }

    if (body.action === 'linkGroup') {
      if (!isUuid(body.transferId)) throw new UserError('Трансфер не найден');
      const { data: transfer, error } = await db.from('v2_transfers').select('id,branch_id,whatsapp_chat_id').eq('id', body.transferId).maybeSingle();
      if (error) throw error;
      if (!transfer || (scope !== null && !scope.includes(transfer.branch_id))) throw new UserError('Этот трансфер вам недоступен');
      const chatId = body.chatId === null ? null : String(body.chatId ?? '');
      if (chatId !== null) {
        const { data: group, error: groupError } = await db.from('v2_whatsapp_groups').select('chat_id').eq('chat_id', chatId).maybeSingle();
        if (groupError) throw groupError;
        if (!group) throw new UserError('Группа не найдена. Добавьте бота в группу и отправьте в неё любое сообщение');
        const { data: other, error: otherError } = await db.from('v2_transfers').select('transfer_number').eq('whatsapp_chat_id', chatId).neq('id', transfer.id).maybeSingle();
        if (otherError) throw otherError;
        if (other) throw new UserError(`Эта группа уже привязана к трансферу ${other.transfer_number}`);
      }
      const { error: updateError } = await db.from('v2_transfers').update({ whatsapp_chat_id: chatId }).eq('id', transfer.id);
      if (updateError) throw updateError;
      return response({ ok: true });
    }

    const receipt = await loadReceipt(body.id);

    if (body.action === 'fileUrl') {
      if (!receipt.storage_path) throw new UserError('Файл чека не сохранён');
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(receipt.storage_path, 300);
      if (error) throw error;
      return response({ ok: true, url: data.signedUrl });
    }

    if (body.action === 'update') {
      const patch: Record<string, unknown> = parseReceiptEdit(body);
      if (body.familyId !== undefined) {
        const familyId = String(body.familyId);
        const { data: family, error } = await db.from('v2_families').select('id').eq('id', familyId).maybeSingle();
        if (error) throw error;
        if (!family || !await familyAllowed(familyId)) throw new UserError('Эта семья вам недоступна');
        if (familyId !== receipt.family_id) Object.assign(patch, { family_id: familyId, match_status: 'manual' });
      }
      const amount = patch.amount ?? receipt.amount;
      const date = patch.receipt_date ?? receipt.receipt_date;
      // Вручную заполненный файл («Это чек») становится обычным чеком, готовым к отправке.
      if ((receipt.status === 'failed' || receipt.status === 'other') && receipt.storage_path && amount && date) Object.assign(patch, { status: 'recognized', error: null });
      const { data, error } = await db.from('v2_incoming_receipts').update(patch).eq('id', receipt.id).is('payment_id', null).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new UserError('Чек уже отправлен на проверку');
      return response({ ok: true });
    }

    if (body.action === 'dismiss') {
      // «Не чек»: файл пропадает из списка и удаляется вместе с другими через 30 дней.
      const { data, error } = await db.from('v2_incoming_receipts').update({ status: 'dismissed' })
        .eq('id', receipt.id).is('payment_id', null).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new UserError('Чек уже отправлен на проверку');
      return response({ ok: true });
    }

    if (body.action === 'recheckDuplicate') {
      const { data, error } = await db.rpc('find_receipt_duplicate', {
        p_code: receipt.receipt_code,
        p_hash: receipt.file_sha256,
        p_bank: receipt.receipt_bank,
        p_time: receipt.receipt_time,
        p_card: receipt.receipt_card_last4,
        p_amount: receipt.amount,
        p_date: receipt.receipt_date,
      });
      if (error) throw error;
      const duplicate = data?.[0];
      if (duplicate) {
        const { error: updateError } = await db.from('v2_incoming_receipts')
          .update({ duplicate_payment_id: duplicate.payment_id, duplicate_match_type: duplicate.match_type })
          .eq('id', receipt.id).is('payment_id', null);
        if (updateError) throw updateError;
      }
      return response({ ok: true });
    }

    if (body.action === 'markSubmitted') {
      if (!isUuid(body.paymentId)) throw new UserError('Платёж не найден');
      const { data: payment, error } = await db.from('v2_payments').select('id,family_id,amount,payment_date,receipt_sha256').eq('id', body.paymentId).maybeSingle();
      if (error) throw error;
      // Строку можно связать только с платежом, созданным из этого же файла.
      if (!payment || !receipt.file_sha256 || payment.receipt_sha256 !== receipt.file_sha256 || !await familyAllowed(payment.family_id)) {
        throw new UserError('Платёж не относится к этому чеку');
      }
      const { data, error: updateError } = await db.from('v2_incoming_receipts').update({
        payment_id: payment.id,
        family_id: payment.family_id,
        amount: payment.amount,
        receipt_date: payment.payment_date,
        submitted_by: employee.full_name,
        submitted_at: new Date().toISOString(),
      }).eq('id', receipt.id).is('payment_id', null).select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new UserError('Чек уже отправлен на проверку');
      return response({ ok: true });
    }

    throw new UserError('Неизвестное действие');
  } catch (error) {
    if (error instanceof UserError) return response({ ok: false, error: error.message }, 400);
    if (error instanceof Error && /^Укажите/.test(error.message)) return response({ ok: false, error: error.message }, 400);
    // Подробности базы браузеру не передаются.
    console.error('incoming receipts api failed', error instanceof Error ? error.message : 'unknown');
    return response({ ok: false, error: 'Не удалось выполнить действие с чеком' }, 500);
  }
});
