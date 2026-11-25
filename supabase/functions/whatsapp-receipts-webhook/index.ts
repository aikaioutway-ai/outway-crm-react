import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  parseAllowedChats,
  parseGreenApiGroup,
  parseGreenApiReceipt,
  webhookTokenMatches,
} from '../_shared/greenApiReceipt.ts';
import { createReceiptProcessor } from '../_shared/receiptProcessor.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const BUCKET = 'incoming-receipts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID') ?? '';
// Лишний пробел или перенос строки при вставке пароля в настройки не должен ломать приём.
const WEBHOOK_TOKEN = (Deno.env.get('GREEN_API_WEBHOOK_TOKEN') ?? '').trim();
const ALLOWED_CHATS = parseAllowedChats(Deno.env.get('GREEN_API_ALLOWED_CHATS'));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const processAndSave = createReceiptProcessor(supabase);

const RETENTION_DAYS = 30;
const CLEANUP_EVERY_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;

// Файлы без чека («Другие файлы» и «Не чек») хранятся 30 дней, затем удаляются вместе с записью.
// Запускается попутно с вебхуками, не чаще раза в час, по 50 файлов за раз.
async function cleanupExpiredFiles() {
  if (Date.now() - lastCleanupAt < CLEANUP_EVERY_MS) return;
  lastCleanupAt = Date.now();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('v2_incoming_receipts')
    .select('id,storage_path')
    .in('status', ['other', 'dismissed'])
    .is('payment_id', null)
    .lt('message_at', cutoff)
    .limit(50);
  if (error || !data?.length) {
    if (error) console.error('incoming files cleanup failed', error.code);
    return;
  }
  const paths = data.map(row => row.storage_path).filter((path): path is string => Boolean(path));
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) {
      console.error('incoming files cleanup failed', removeError.message);
      return;
    }
  }
  const { error: deleteError } = await supabase.from('v2_incoming_receipts').delete().in('id', data.map(row => row.id));
  if (deleteError) console.error('incoming files cleanup failed', deleteError.code);
}

// Список групп обновляется не чаще раза в час на группу, чтобы не писать в базу на каждое сообщение.
const GROUP_TOUCH_MS = 60 * 60 * 1000;
const groupTouchedAt = new Map<string, number>();
async function rememberGroup(chatId: string, chatName: string | null, verified: boolean) {
  if (Date.now() - (groupTouchedAt.get(chatId) ?? 0) < GROUP_TOUCH_MS) return;
  groupTouchedAt.set(chatId, Date.now());
  // Неподтверждённая группа (приглашение) записывается как «давно не видели»: синхронизация проверит участие бота.
  const row: Record<string, unknown> = { chat_id: chatId, last_seen_at: verified ? new Date().toISOString() : new Date(0).toISOString() };
  if (chatName) row.name = chatName;
  const { error } = await supabase.from('v2_whatsapp_groups').upsert(row, { onConflict: 'chat_id', ignoreDuplicates: !verified });
  if (error) {
    groupTouchedAt.delete(chatId);
    console.error('whatsapp group save failed', error.code);
  }
}

// Файлы принимаются из групп, привязанных к трансферу; ответ кешируется на минуту.
const LINK_CACHE_MS = 60 * 1000;
const linkedCache = new Map<string, { linked: boolean; at: number }>();
async function isLinkedToTransfer(chatId: string): Promise<boolean> {
  const cached = linkedCache.get(chatId);
  if (cached && Date.now() - cached.at < LINK_CACHE_MS) return cached.linked;
  const { count, error } = await supabase.from('v2_transfers').select('id', { count: 'exact', head: true }).eq('whatsapp_chat_id', chatId);
  if (error) throw new Error(error.message);
  const linked = Boolean(count);
  linkedCache.set(chatId, { linked, at: Date.now() });
  return linked;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!WEBHOOK_TOKEN || !INSTANCE_ID || !ANTHROPIC_KEY) return new Response('not configured', { status: 503 });
  const authorization = request.headers.get('authorization') ?? '';
  if (!webhookTokenMatches(authorization, WEBHOOK_TOKEN)) {
    // Только длины, без самих паролей: помогает понять, почему пароль из Green API не совпал.
    console.log('webhook unauthorized', JSON.stringify({
      header: authorization.length,
      withoutBearer: authorization.trim().replace(/^(Bearer\s+)+/i, '').length,
      expected: WEBHOOK_TOKEN.length,
    }));
    return new Response('unauthorized', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  EdgeRuntime.waitUntil(cleanupExpiredFiles().catch(() => undefined));

  const group = parseGreenApiGroup(payload);
  if (!group || group.instanceId !== INSTANCE_ID) return new Response('ignored');
  EdgeRuntime.waitUntil(rememberGroup(group.chatId, group.chatName, group.verified).catch(() => undefined));

  const receipt = parseGreenApiReceipt(payload);
  if (!receipt || Date.parse(receipt.messageAt) < Date.now() - 7 * 24 * 60 * 60 * 1000) return new Response('ignored');
  let allowed = ALLOWED_CHATS.has(receipt.chatId);
  if (!allowed) {
    try {
      allowed = await isLinkedToTransfer(receipt.chatId);
    } catch {
      // Без ответа базы файл не теряем: Green API повторит доставку.
      return new Response('retry', { status: 500 });
    }
  }
  if (!allowed) {
    console.log('receipt ignored, chat is not linked to a transfer', receipt.chatId);
    return new Response('ignored');
  }

  // Повторная доставка того же сообщения не создаёт вторую запись.
  const { data, error } = await supabase
    .from('v2_incoming_receipts')
    .upsert({
      provider: 'green_api',
      provider_message_id: receipt.messageId,
      chat_id: receipt.chatId,
      chat_name: receipt.chatName,
      message_at: receipt.messageAt,
    }, { onConflict: 'provider,provider_message_id', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('incoming receipt insert failed', error.code);
    return new Response('retry', { status: 500 });
  }
  if (data?.id) EdgeRuntime.waitUntil(processAndSave(data.id, receipt));
  return new Response('ok');
});
