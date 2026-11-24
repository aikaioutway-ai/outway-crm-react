import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { greenApiRequest } from '../_shared/greenApiClient.ts';
import { HISTORY_COUNT, historyCandidates, historyWeek, parseHistoryReceipt } from '../_shared/greenApiHistory.ts';
import { importHistoryReceipt } from '../_shared/importHistoryReceipt.ts';
import { runHistoryJob, type HistoryJob } from '../_shared/whatsappHistoryJob.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function processJob(job: HistoryJob) {
  const period = historyWeek(Date.parse(job.window_end));
  const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID') ?? '';
  const patch = await runHistoryJob(job, {
    now: Date.now,
    isLinked: async () => {
      const { count, error } = await db.from('v2_transfers').select('id', { head: true, count: 'exact' }).eq('whatsapp_chat_id', job.chat_id);
      if (error) throw new Error('Не удалось проверить привязку группы');
      return Boolean(count);
    },
    discover: async () => {
      const rows = await greenApiRequest('getChatHistory', { chatId: job.chat_id, count: HISTORY_COUNT });
      if (!Array.isArray(rows)) throw new Error('Некорректная история');
      const receipts = historyCandidates(rows, instanceId, job.chat_id, null, period);
      return { ids: [...new Set(receipts.map(receipt => receipt.messageId))], scanned: rows.length, limited: rows.length >= HISTORY_COUNT };
    },
    importFile: async messageId => {
      if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new Error('Распознавание не настроено');
      const { data: existing, error } = await db.from('v2_incoming_receipts').select('status,created_at,processed_at,payment_id')
        .eq('provider', 'green_api').eq('provider_message_id', messageId).maybeSingle();
      if (error) throw new Error('Не удалось проверить файл');
      if (existing && (existing.payment_id || (existing.status !== 'failed' && existing.status !== 'received'))) return 'existing';
      // Не считать ещё обрабатываемый вебхуком файл уже загруженным: проверить его после освобождения.
      if (existing?.status === 'received' && Date.parse(existing.processed_at ?? existing.created_at) > Date.now() - 180000) throw new Error('Файл ещё обрабатывается');
      const row = await greenApiRequest('getMessage', { chatId: job.chat_id, idMessage: messageId });
      const { data: group, error: groupError } = await db.from('v2_whatsapp_groups').select('name').eq('chat_id', job.chat_id).maybeSingle();
      if (groupError) throw new Error('Не удалось получить группу');
      const receipt = parseHistoryReceipt(row, instanceId, job.chat_id, group?.name ?? null);
      if (!receipt || receipt.messageId !== messageId || Date.parse(receipt.messageAt) < period.start || Date.parse(receipt.messageAt) > period.end) throw new Error('Файл недоступен');
      return await importHistoryReceipt(db, receipt);
    },
  });
  // Старый обработчик не может завершить перезапущенную задачу или чужую аренду.
  const { error } = await db.from('v2_whatsapp_history_jobs').update(patch).eq('chat_id', job.chat_id).eq('lease_id', job.lease_id);
  if (error) console.error('history job update failed', error.code);
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const token = request.headers.get('x-history-token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response('unauthorized', { status: 401 });
  const { data: valid, error: authError } = await db.rpc('v2_validate_whatsapp_history_token', { p_token: token });
  if (authError || valid !== true) return new Response('unauthorized', { status: 401 });
  const { data: jobs, error } = await db.rpc('v2_claim_whatsapp_history');
  if (error) return new Response('retry', { status: 500 });
  EdgeRuntime.waitUntil(Promise.allSettled((jobs ?? []).map((job: HistoryJob) => processJob(job))));
  return Response.json({ ok: true, claimed: jobs?.length ?? 0 });
});
