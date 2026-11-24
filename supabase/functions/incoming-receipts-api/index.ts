import { verifySession } from '../_shared/employeeApiSession.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { allowedBranchIds, canDeleteReceipts, schoolKey as branchSchoolKey, parseReceiptEdit, RECEIPT_FILTERS, RECEIPT_ROLES, summarizeBySchool, type ReceiptTransferCount } from '../_shared/incomingReceiptsAccess.ts';
import { SCHOOL_TABS } from '../task-api/schools.ts';
import { greenApiRequest, GreenApiError } from '../_shared/greenApiClient.ts';
import { HISTORY_COUNT, historyCandidates, historyPeriod, historyWeek, parseHistoryReceipt } from '../_shared/greenApiHistory.ts';
import { importHistoryReceipt } from '../_shared/importHistoryReceipt.ts';

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


function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    let session: { sub: string } | null;
    try { session = await verifySession(request.headers.get('x-employee-session') ?? '', SUPABASE_SERVICE_KEY); } catch { session = null; }
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

    if (body.action === 'history' || body.action === 'importHistoryFile' || body.action === 'historyStatus' || body.action === 'retryHistory') {
      if (!isUuid(body.transferId)) throw new UserError('Трансфер не найден');
      const { data: transfer, error } = await db.from('v2_transfers').select('id,branch_id,whatsapp_chat_id').eq('id', body.transferId).maybeSingle();
      if (error) throw error;
      if (!transfer || (scope !== null && !scope.includes(transfer.branch_id))) throw new UserError('Этот трансфер вам недоступен');
      const chatId = transfer.whatsapp_chat_id;
      if (!chatId || !chatId.endsWith('@g.us')) throw new UserError('Сначала привяжите группу к трансферу');
      // Не продолжать загрузку в другую группу, если привязка изменилась в соседнем окне.
      if (body.chatId !== chatId) throw new UserError('Группа трансфера изменилась. Откройте окно заново');
      if (body.action === 'retryHistory') {
        const { data, error: retryError } = await db.from('v2_whatsapp_history_jobs').update({
          status: 'queued', window_end: new Date().toISOString(), message_ids: null, position: 0, scanned: 0, imported: 0, existing: 0,
          other: 0, failed: 0, attempts: 0, discovery_attempts: 0, limited: false, error: null,
          lease_id: null, lease_until: null, next_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('chat_id', chatId).in('status', ['completed', 'failed', 'cancelled']).select('chat_id').maybeSingle();
        if (retryError) throw retryError;
        if (!data) throw new UserError('Загрузка уже идёт или ещё не поставлена в очередь');
        return response({ ok: true });
      }
      if (body.action === 'historyStatus') {
        const { data: job, error: jobError } = await db.from('v2_whatsapp_history_jobs')
          .select('status,position,total,scanned,imported,existing,other,failed,limited,error,updated_at').eq('chat_id', chatId).maybeSingle();
        if (jobError) throw jobError;
        return response({ ok: true, job });
      }
      const requestedPeriod = historyPeriod(body.dateFrom, body.dateTo);
      const week = historyWeek(Date.now());
      const period = { start: Math.max(week.start, requestedPeriod.start), end: Math.min(week.end, requestedPeriod.end) };
      if (period.start > period.end) throw new UserError('Можно загружать чеки только за последние 7 дней');
      const { data: group, error: groupError } = await db.from('v2_whatsapp_groups').select('name').eq('chat_id', chatId).maybeSingle();
      if (groupError) throw groupError;
      const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID') ?? '';
      if (body.action === 'history') {
        const rows = await greenApiRequest('getChatHistory', { chatId, count: HISTORY_COUNT });
        if (!Array.isArray(rows)) throw new GreenApiError('Green API вернул некорректную историю');
        const candidates = historyCandidates(rows, instanceId, chatId, group?.name ?? null, period);
        return response({ ok: true, messageIds: [...new Set(candidates.map(receipt => receipt.messageId))], scanned: rows.length, limited: rows.length >= HISTORY_COUNT });
      }
      const messageId = String(body.messageId ?? '');
      if (!messageId || messageId.length > 200) throw new UserError('Некорректное сообщение');
      const { data: existing, error: existingError } = await db.from('v2_incoming_receipts')
        .select('status,payment_id').eq('provider', 'green_api').eq('provider_message_id', messageId).maybeSingle();
      if (existingError) throw existingError;
      if (existing && (existing.status !== 'failed' || existing.payment_id)) return response({ ok: true, result: 'existing' });
      // Получаем файл с сервера провайдера: браузер не может подставить URL или чужую группу.
      const row = await greenApiRequest('getMessage', { chatId, idMessage: messageId });
      const receipt = parseHistoryReceipt(row, instanceId, chatId, group?.name ?? null);
      if (!receipt || receipt.messageId !== messageId || Date.parse(receipt.messageAt) < period.start || Date.parse(receipt.messageAt) > period.end) throw new UserError('Файл недоступен или находится вне выбранного периода');
      if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new UserError('Распознавание чеков не настроено');
      const result = await importHistoryReceipt(db, receipt);
      return response({ ok: true, result });
    }

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

    if (body.action === 'delete') {
      // Удаление навсегда: сначала файл, потом запись. Отправленный на проверку чек — уже платёж, его не трогаем.
      if (!canDeleteReceipts(employee.role)) throw new UserError('Удалять файлы может только руководство');
      if (receipt.payment_id) throw new UserError('Чек уже отправлен на проверку — его можно отклонить только в карточке семьи');
      if (receipt.storage_path) {
        const { error: removeError } = await db.storage.from(BUCKET).remove([receipt.storage_path]);
        if (removeError) throw removeError;
      }
      const { error } = await db.from('v2_incoming_receipts').delete().eq('id', receipt.id).is('payment_id', null);
      if (error) throw error;
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
    if (error instanceof GreenApiError) return response({ ok: false, error: error.message }, 400);
    if (error instanceof UserError) return response({ ok: false, error: error.message }, 400);
    if (error instanceof Error && /^Укажите/.test(error.message)) return response({ ok: false, error: error.message }, 400);
    // Подробности базы браузеру не передаются.
    console.error('incoming receipts api failed', error instanceof Error ? error.message : 'unknown');
    return response({ ok: false, error: 'Не удалось выполнить действие с чеком' }, 500);
  }
});
