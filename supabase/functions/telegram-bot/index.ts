// supabase/functions/telegram-bot/index.ts
// Telegram-бот для приёма чеков от менеджеров
//
// Деплой:
//   supabase functions deploy telegram-bot --no-verify-jwt
//   supabase secrets set TELEGRAM_BOT_TOKEN=<токен от @BotFather>
//   supabase secrets set ANTHROPIC_API_KEY=<ключ>
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<ключ>
//
// Регистрация webhook:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mmcxugtxnfsafgxbpbix.supabase.co/functions/v1/telegram-bot"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Временное хранилище состояния (живёт в памяти функции, достаточно для одного диалога)
// Для production лучше хранить в Supabase таблице, но для старта хватит
const pendingReceipts = new Map<number, {
  amount: number;
  date: string;
  receiptUrl: string;
  receiptCode: string | null;
}>();

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function getFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data = await res.json();
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
}

async function downloadFileAsBase64(url: string): Promise<{ base64: string; mediaType: string }> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  return { base64, mediaType: contentType.split(';')[0] };
}

async function ocrReceipt(base64: string, mediaType: string) {
  const PROMPT = `Извлеки из этого банковского чека:
1. receipt_code — значение поля "Идентификатор транзакции" или "ID транзакции". Если нет — "Описание". Без времени.
2. amount — сумма в сомах (только число)
3. date — дата в формате YYYY-MM-DD

Верни только JSON: {"receipt_code": "...", "amount": 5500, "date": "2026-06-10"}
Если поле не найдено — null.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });

  const data = await res.json();
  const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { receipt_code: null, amount: null, date: null };
  try {
    const parsed = JSON.parse(match[0]);
    let code = parsed.receipt_code ?? null;
    if (code) code = code.replace(/^\d{2}:\d{2}:\d{2}\//, '');
    return { receipt_code: code, amount: parsed.amount ? Number(parsed.amount) : null, date: parsed.date ?? null };
  } catch {
    return { receipt_code: null, amount: null, date: null };
  }
}

async function uploadReceiptFromUrl(familyId: string, imageUrl: string, filename: string): Promise<string> {
  const res = await fetch(imageUrl);
  const buffer = await res.arrayBuffer();
  const path = `${familyId}/${Date.now()}-${filename}`;
  const { error } = await supabase.storage.from('payment-receipts').upload(path, buffer, {
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('payment-receipts').getPublicUrl(path);
  return data.publicUrl;
}

async function findFamilyByPhone(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  const { data } = await supabase
    .from('v2_families')
    .select('id, parent_name, phone')
    .or(`phone.ilike.%${cleaned}%,second_phone.ilike.%${cleaned}%,contact_phone.ilike.%${cleaned}%`)
    .limit(3);
  return data ?? [];
}

async function createPendingPayment(familyId: string, amount: number, date: string, receiptUrl: string, receiptCode: string | null, submittedBy: string) {
  const { data, error } = await supabase.from('v2_payments').insert({
    family_id: familyId,
    amount,
    suggested_main_amount: amount,
    suggested_deposit_amount: 0,
    payment_method: 'transfer',
    payment_date: date,
    receipt_url: receiptUrl,
    receipt_code: receiptCode,
    status: 'pending',
    submitted_by: submittedBy,
    comment: 'Загружено через Telegram-бот',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data;
}

async function handleUpdate(update: any) {
  const msg = update.message;
  if (!msg) return;

  const chatId: number = msg.chat.id;
  const username = msg.from?.username ?? msg.from?.first_name ?? String(chatId);

  // Фото чека
  if (msg.photo || msg.document) {
    const fileId = msg.photo
      ? msg.photo[msg.photo.length - 1].file_id
      : msg.document.file_id;

    await sendMessage(chatId, '⏳ Читаю чек...');

    const fileUrl = await getFileUrl(fileId);
    const { base64, mediaType } = await downloadFileAsBase64(fileUrl);
    const ocr = await ocrReceipt(base64, mediaType);

    if (!ocr.amount || !ocr.date) {
      await sendMessage(chatId, '❌ Не удалось распознать чек. Отправьте чёткое фото чека.');
      return;
    }

    pendingReceipts.set(chatId, {
      amount: ocr.amount,
      date: ocr.date,
      receiptUrl: fileUrl,
      receiptCode: ocr.receipt_code,
    });

    await sendMessage(chatId,
      `✅ Чек распознан:\n` +
      `💰 Сумма: <b>${ocr.amount.toLocaleString('ru')} сом</b>\n` +
      `📅 Дата: <b>${ocr.date}</b>\n\n` +
      `Введите номер телефона клиента (или часть):`,
    );
    return;
  }

  // Текст — поиск клиента по телефону
  if (msg.text && pendingReceipts.has(chatId)) {
    const receipt = pendingReceipts.get(chatId)!;
    const query = msg.text.trim();

    if (query.startsWith('/')) {
      pendingReceipts.delete(chatId);
      await sendMessage(chatId, 'Отменено.');
      return;
    }

    const families = await findFamilyByPhone(query);

    if (families.length === 0) {
      await sendMessage(chatId, '❌ Клиент не найден. Проверьте номер и попробуйте снова.');
      return;
    }

    if (families.length > 1) {
      const list = families.map((f: any, i: number) => `${i + 1}. ${f.parent_name} — ${f.phone}`).join('\n');
      await sendMessage(chatId, `Найдено несколько клиентов, уточните номер:\n${list}`);
      return;
    }

    const family = families[0];

    // Загружаем фото в Supabase Storage
    let receiptUrl = receipt.receiptUrl;
    try {
      receiptUrl = await uploadReceiptFromUrl(family.id, receipt.receiptUrl, 'tg-receipt.jpg');
    } catch (_) { /* если не загрузилось — используем telegram url */ }

    await createPendingPayment(
      family.id,
      receipt.amount,
      receipt.date,
      receiptUrl,
      receipt.receiptCode,
      `tg:${username}`,
    );

    pendingReceipts.delete(chatId);

    await sendMessage(chatId,
      `✅ Платёж создан!\n` +
      `👤 Клиент: <b>${family.parent_name}</b>\n` +
      `💰 Сумма: <b>${receipt.amount.toLocaleString('ru')} сом</b>\n` +
      `📅 Дата: <b>${receipt.date}</b>\n\n` +
      `Статус: <i>На проверке</i> — менеджер подтвердит в CRM.`,
    );
    return;
  }

  // Команда /start
  if (msg.text === '/start') {
    await sendMessage(chatId,
      `👋 Привет! Я помогаю прикреплять чеки к клиентам.\n\n` +
      `Просто отправьте фото чека, и я сам распознаю сумму и дату.`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const update = await req.json();
    await handleUpdate(update);
  } catch (e) {
    console.error('Bot error:', e);
  }
  return new Response('ok');
});
