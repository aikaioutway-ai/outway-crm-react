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
  time:string|null;card_last4:string|null;bank:string|null;hash:string;
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
  const PROMPT = `Извлеки данные банковского чека. Верни только JSON:
{"receipt_code":null,"amount":null,"date":null,"time":null,"card_last4":null,"bank":null}
receipt_code: ID транзакции, ELQR ID или номер квитанции; если их нет — код из описания/комментария, включая mbiz:, MBIZ_S_, QR_. Сохрани весь код, не путай его с временем.
amount: итоговая сумма перевода без комиссии, число в сомах.
date: дата самой операции YYYY-MM-DD, не дата загрузки.
time: время самой операции HH:MM:SS, либо HH:MM, если секунды не указаны. Не добавляй отсутствующие секунды и не используй часы телефона.
card_last4: последние 4 цифры карты или счёта ОТПРАВИТЕЛЯ (поля «Откуда», «Счёт списания», Payer requisites). Верни строку из четырёх цифр, сохраняя нули. Не используй реквизиты получателя, mbiz или номер квитанции.
bank: название банка, выдавшего чек (например Optima Bank, Bakai Bank, DemirBank, MBANK). Не банк получателя или поставщик услуг c2b.mbank.kg.
Примеры форматов (не подставляй эти значения в ответ):
Optima24: поле «Откуда **** 7985», дата «06 окт. 2026, 17:39», операция с mbiz: — извлекай card_last4="7985", time="17:39", date="2026-10-06", bank="Optima Bank"; сам mbiz оставь в receipt_code.
Bakai: используй ELQR ID как код, время из «Дата создания», карту из «Счёт списания»; игнорируй mbiz комментария при наличии ELQR ID.
DemirBank: используй ID transaction как код, время из Transaction date and time, карту из Payer requisites.
MBANK: код может быть в «Детали операции» и содержать MBIZ_S_/QR_; банк определяется по логотипу чека.
Если поле отсутствует или неразборчиво — null. Не придумывай данные.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0,
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
  if (!match) return { receipt_code: null, amount: null, date: null,time:null,card_last4:null,bank:null };
  try {
    const parsed = JSON.parse(match[0]);
    let code = parsed.receipt_code ?? null;
    if (code) code = code.replace(/^\d{2}:\d{2}:\d{2}\//, '');
    return { time:typeof parsed.time==='string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(parsed.time)?parsed.time:null,card_last4:typeof parsed.card_last4==='string' && /^\d{4}$/.test(parsed.card_last4)?parsed.card_last4:null,bank:typeof parsed.bank==='string'?parsed.bank:null,receipt_code: code, amount: parsed.amount ? Number(parsed.amount) : null, date: parsed.date ?? null };
  } catch {
    return { receipt_code: null, amount: null, date: null,time:null,card_last4:null,bank:null };
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

async function createPendingPayment(familyId: string, amount: number, date: string, receiptUrl: string, receiptCode: string | null, submittedBy: string, details?:{time:string|null;card_last4:string|null;bank:string|null;hash:string}) {
  const { data, error } = await supabase.from('v2_payments').insert({
    family_id: familyId,
    amount,
    suggested_main_amount: amount,
    suggested_deposit_amount: 0,
    payment_method: 'transfer',
    payment_date: date,
    receipt_url: receiptUrl,
    receipt_code: receiptCode,
    receipt_sha256:details?.hash ?? null,receipt_time:details?.time ?? null,receipt_card_last4:details?.card_last4 ?? null,receipt_bank:details?.bank ?? null,
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
    const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
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
      time:ocr.time,card_last4:ocr.card_last4,bank:ocr.bank,hash,
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

    const {data:duplicates,error:checkError}=await supabase.rpc('find_receipt_duplicate',{p_code:receipt.receiptCode,p_hash:receipt.hash,p_bank:receipt.bank,p_time:receipt.time,p_card:receipt.card_last4,p_amount:receipt.amount,p_date:receipt.date});
    if(checkError){await sendMessage(chatId,'Не удалось проверить дубли. Повторите попытку позже.');return;}
    if(duplicates?.[0]){const duplicate=duplicates[0];await sendMessage(chatId,`Дубль чека: платёж уже есть у семьи ${String(duplicate.parent_name).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')} (${duplicate.family_id}), сумма ${duplicate.amount}, дата ${duplicate.payment_date}. Повторная отправка запрещена.`);return;}
    // Загружаем фото в Supabase Storage
    let receiptUrl = receipt.receiptUrl;
    try {
      receiptUrl = await uploadReceiptFromUrl(family.id, receipt.receiptUrl, 'tg-receipt.jpg');
    } catch (_) { /* если не загрузилось — используем telegram url */ }

    try { await createPendingPayment(
      family.id,
      receipt.amount,
      receipt.date,
      receiptUrl,
      receipt.receiptCode,
      `tg:${username}`,
      receipt,
    ); } catch(error){await sendMessage(chatId,String(error instanceof Error?error.message:'Не удалось создать платёж').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));return;}

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
