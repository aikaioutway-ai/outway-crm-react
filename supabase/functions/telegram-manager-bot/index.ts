import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN = requiredEnv('TELEGRAM_MANAGER_BOT_TOKEN');
const BOT_USERNAME = requiredEnv('TELEGRAM_MANAGER_BOT_USERNAME').replace(/^@/, '').toLowerCase();
const WEBHOOK_SECRET = requiredEnv('TELEGRAM_MANAGER_WEBHOOK_SECRET');
const ANTHROPIC_KEY = requiredEnv('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = Deno.env.get('TELEGRAM_MANAGER_AI_MODEL') ?? 'claude-haiku-4-5-20251001';
const SUPABASE_URL = requiredEnv('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const DEFAULT_MANAGER_CHAT_ID = parseOptionalInt(Deno.env.get('TELEGRAM_MANAGER_CHAT_ID'));
const ADMIN_IDS = new Set(
  (Deno.env.get('TELEGRAM_MANAGER_ADMIN_IDS') ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isSafeInteger),
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  contact?: { phone_number: string; user_id?: number; first_name?: string; last_name?: string };
  reply_to_message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type RegisteredGroup = {
  chat_id: number;
  title: string;
  branch_id: string | null;
  response_mode: 'mention' | 'question' | 'all';
  manager_chat_id: number | null;
  enabled: boolean;
};

type KnowledgeItem = {
  topic: string;
  question: string;
  answer: string;
  keywords: string[];
};

type TariffItem = {
  branch_id: string | null;
  school_id: string | null;
  vehicle_type: 'microbus' | 'minivan' | 'sedan';
  zone: 'A' | 'B' | 'C';
  price: number | string;
};

type AiResult = {
  answer: string;
  confidence: number;
  needs_human: boolean;
};

type PrivateIdentity = {
  familyId: string;
  parentName: string;
  children: string[];
  mainBalance: number | null;
  depositBalance: number | null;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function displayName(user?: TelegramUser): string {
  if (!user) return 'Родитель';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id);
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('996') ? digits.slice(-9) : digits.startsWith('0') ? digits.slice(1) : digits.slice(-9);
  return local.length === 9 ? `996${local}` : digits;
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method}: ${data.description ?? response.status}`);
  }
  return data.result;
}

async function sendMessage(chatId: number, text: string, replyTo?: number, replyMarkup?: Record<string, unknown>) {
  return await telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function requestPhoneNumber(chatId: number) {
  await sendMessage(
    chatId,
    'Чтобы связать Telegram с записью в CRM, нажмите кнопку «Поделиться номером». Номер проверяется только в личном чате.',
    undefined,
    {
      keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  );
}

async function verifyPhone(message: TelegramMessage): Promise<void> {
  const contact = message.contact;
  if (!contact || !message.from) return;
  if (contact.user_id && contact.user_id !== message.from.id) {
    await sendMessage(message.chat.id, 'Пожалуйста, поделитесь своим номером через кнопку Telegram, а не контактом другого человека.');
    return;
  }

  const normalized = normalizePhone(contact.phone_number);
  const suffix = normalized.slice(-9);
  const { data: families, error } = await supabase
    .from('v2_families')
    .select('id,parent_name,phone,second_phone,contact_phone')
    .or(`phone.ilike.%${suffix}%,second_phone.ilike.%${suffix}%,contact_phone.ilike.%${suffix}%`)
    .limit(3);
  if (error) throw new Error(error.message);

  if (!families?.length) {
    await sendMessage(message.chat.id, 'Номер не найден в CRM. Проверьте номер или напишите менеджеру для ручной проверки.', undefined, { remove_keyboard: true });
    return;
  }
  if (families.length > 1) {
    await sendMessage(message.chat.id, 'По этому номеру найдено несколько записей. Для безопасной привязки нужен менеджер.', undefined, { remove_keyboard: true });
    return;
  }

  const family = families[0];
  const { error: upsertError } = await supabase.from('v2_telegram_users').upsert({
    telegram_user_id: message.from.id,
    telegram_username: message.from.username ?? null,
    phone_normalized: normalized,
    family_id: family.id,
    verified_at: new Date().toISOString(),
  });
  if (upsertError) throw new Error(upsertError.message);
  await sendMessage(
    message.chat.id,
    `✅ Номер подтверждён. Telegram привязан к записи <b>${escapeHtml(family.parent_name)}</b>.\n` +
      'Персональные вопросы теперь можно задавать в этом личном чате.',
    undefined,
    { remove_keyboard: true },
  );
}

async function loadGroup(chatId: number): Promise<RegisteredGroup | null> {
  const { data, error } = await supabase
    .from('v2_telegram_groups')
    .select('chat_id,title,branch_id,response_mode,manager_chat_id,enabled')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as RegisteredGroup | null;
}

async function loadKnowledge(branchId: string | null): Promise<KnowledgeItem[]> {
  let query = supabase
    .from('v2_bot_knowledge')
    .select('topic,question,answer,keywords')
    .eq('active', true)
    .order('priority', { ascending: true })
    .limit(80);

  query = branchId
    ? query.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    : query.is('branch_id', null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeItem[];
}

async function loadTariffContext(branchId: string | null): Promise<string> {
  if (!branchId) return 'Филиал не привязан к группе. Точную стоимость должен уточнить менеджер.';

  const { data: branch, error: branchError } = await supabase
    .from('v2_school_branches')
    .select('id,code,name,school_id')
    .eq('id', branchId)
    .maybeSingle();
  if (branchError) throw new Error(branchError.message);
  if (!branch) return 'Филиал не найден. Точную стоимость должен уточнить менеджер.';

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('v2_tariffs')
    .select('branch_id,school_id,vehicle_type,zone,price')
    .eq('active', true)
    .lte('active_from', today)
    .or(`active_to.is.null,active_to.gte.${today}`)
    .or(`branch_id.eq.${branchId},school_id.eq.${branch.school_id}`);
  if (error) throw new Error(error.message);

  const applicable = ((data ?? []) as TariffItem[]).filter((item) =>
    item.branch_id === branchId || (item.branch_id === null && item.school_id === branch.school_id)
  );
  const byVehicleAndZone = new Map<string, TariffItem>();
  for (const item of applicable.filter((row) => row.branch_id === null)) {
    byVehicleAndZone.set(`${item.vehicle_type}:${item.zone}`, item);
  }
  for (const item of applicable.filter((row) => row.branch_id === branchId)) {
    byVehicleAndZone.set(`${item.vehicle_type}:${item.zone}`, item);
  }

  if (!byVehicleAndZone.size) {
    return `Филиал: ${branch.name} (${branch.code}). Активные тарифы не найдены; стоимость должен уточнить менеджер.`;
  }

  const vehicleNames = { microbus: 'микроавтобус', minivan: 'минивэн', sedan: 'седан' } as const;
  const rows = [...byVehicleAndZone.values()]
    .sort((a, b) => `${a.vehicle_type}${a.zone}`.localeCompare(`${b.vehicle_type}${b.zone}`))
    .map((item) => {
      const price = new Intl.NumberFormat('ru-RU').format(Number(item.price));
      return `${vehicleNames[item.vehicle_type]}, зона ${item.zone}: ${price} сом в месяц`;
    });
  return `Филиал: ${branch.name} (${branch.code})\n${rows.join('\n')}`;
}

async function loadPrivateIdentity(telegramUserId: number): Promise<PrivateIdentity | null> {
  const { data: link, error: linkError } = await supabase
    .from('v2_telegram_users')
    .select('family_id,v2_families(id,parent_name)')
    .eq('telegram_user_id', telegramUserId)
    .not('family_id', 'is', null)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link?.family_id || !link.v2_families) return null;

  const [childrenResult, walletResult] = await Promise.all([
    supabase.from('v2_children').select('child_name').eq('family_id', link.family_id).order('child_name'),
    supabase.from('v2_family_wallets').select('main_balance,deposit_balance').eq('family_id', link.family_id).maybeSingle(),
  ]);
  if (childrenResult.error) throw new Error(childrenResult.error.message);
  if (walletResult.error) throw new Error(walletResult.error.message);

  return {
    familyId: String(link.family_id),
    parentName: String((link.v2_families as { parent_name?: string }).parent_name ?? ''),
    children: (childrenResult.data ?? []).map((child: { child_name?: string }) => String(child.child_name ?? '')).filter(Boolean),
    mainBalance: walletResult.data?.main_balance == null ? null : Number(walletResult.data.main_balance),
    depositBalance: walletResult.data?.deposit_balance == null ? null : Number(walletResult.data.deposit_balance),
  };
}

function isBotAddressed(message: TelegramMessage, mode: RegisteredGroup['response_mode']): boolean {
  const text = message.text?.trim() ?? '';
  if (!text) return false;
  const mentioned = text.toLowerCase().includes(`@${BOT_USERNAME}`);
  const repliedToBot = Boolean(
    message.reply_to_message?.from?.is_bot &&
    message.reply_to_message.from.username?.toLowerCase() === BOT_USERNAME,
  );
  if (mentioned || repliedToBot) return true;
  if (mode === 'all') return true;
  if (mode === 'question') {
    return /\?$/.test(text) || /^(как|когда|где|куда|сколько|почему|можно ли|что|кто|зачем)\b/i.test(text);
  }
  return false;
}

function cleanQuestion(text: string): string {
  return text
    .replace(new RegExp(`@${BOT_USERNAME}`, 'ig'), '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

async function askManagerAi(
  question: string,
  _groupTitle: string,
  knowledge: KnowledgeItem[],
  tariffContext: string,
  privateIdentity?: PrivateIdentity | null,
): Promise<AiResult> {
  const knowledgeText = knowledge
    .map((item, index) => `${index + 1}. Вопрос: ${item.question}\nОтвет: ${item.answer}`)
    .join('\n\n');

  const systemPrompt = `Ты — виртуальный менеджер OutWay, сервиса школьного трансфера. Ты отвечаешь родителям в общей Telegram-группе.

Правила:
- Отвечай только на основании БАЗЫ ЗНАНИЙ ниже. Не додумывай факты, цены, даты, маршруты и обещания.
- Пиши коротко, доброжелательно и понятно. Отвечай на языке вопроса: русском или кыргызском.
- Никогда не публикуй и не запрашивай в группе адрес, телефон, баланс, чек, ФИО ребёнка, маршрут конкретного ребёнка и другие персональные данные.
- Не подтверждай оплату, изменение маршрута, остановки, адреса или расторжение договора. Для таких действий нужен живой менеджер.
- На вопрос о стоимости используй только АКТУАЛЬНЫЕ ТАРИФЫ ФИЛИАЛА. Если из вопроса неясны транспорт или зона, объясни, от чего зависит цена, и попроси уточнить у менеджера без запроса адреса в группе.
- PRIVATE VERIFIED CONTEXT можно использовать только в личном чате после проверки номера. Не раскрывай его в группах и не придумывай отсутствующие данные.
- Если точного ответа в базе нет или требуется действие/персональная проверка, поставь needs_human=true и не придумывай ответ.

БАЗА ЗНАНИЙ:
${knowledgeText || 'База знаний пока пуста.'}

АКТУАЛЬНЫЕ ТАРИФЫ ФИЛИАЛА:
${tariffContext}

PRIVATE VERIFIED CONTEXT:
${privateIdentity ? JSON.stringify({ parent: privateIdentity.parentName, children: privateIdentity.children, main_balance: privateIdentity.mainBalance, deposit_balance: privateIdentity.depositBalance }) : 'Нет подтверждённой личности. Персональные вопросы передай менеджеру.'}

Верни только JSON без markdown:
{"answer":"краткий ответ или пустая строка","confidence":0.0,"needs_human":true}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Вопрос родителя:\n${question}` }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API: ${response.status}`);
  const data = await response.json();
  const raw = (data.content ?? [])
    .filter((block: { type?: string }) => block.type === 'text')
    .map((block: { text?: string }) => block.text ?? '')
    .join('');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI returned invalid JSON');

  const parsed = JSON.parse(match[0]);
  return {
    answer: typeof parsed.answer === 'string' ? parsed.answer.trim().slice(0, 3500) : '',
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    needs_human: parsed.needs_human !== false,
  };
}

async function registerIncoming(update: TelegramUpdate, message: TelegramMessage, question: string) {
  const { data, error } = await supabase
    .from('v2_bot_messages')
    .insert({
      update_id: update.update_id,
      chat_id: message.chat.id,
      message_id: message.message_id,
      telegram_user_id: message.from?.id ?? null,
      telegram_username: message.from?.username ?? null,
      parent_name: displayName(message.from),
      question,
      status: 'received',
    })
    .select('id')
    .single();

  if (error?.code === '23505') return null;
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function handoffToManager(
  group: RegisteredGroup,
  message: TelegramMessage,
  botMessageId: string,
  question: string,
) {
  const managerChatId = group.manager_chat_id ?? DEFAULT_MANAGER_CHAT_ID;
  const { error } = await supabase.from('v2_bot_handoffs').insert({
    bot_message_id: botMessageId,
    chat_id: message.chat.id,
    manager_chat_id: managerChatId,
  });
  if (error) throw new Error(error.message);

  if (!managerChatId) return;
  const username = message.from?.username ? `@${message.from.username}` : 'без username';
  await sendMessage(
    managerChatId,
    `🆘 <b>Нужен менеджер</b>\n` +
      `Группа: ${escapeHtml(message.chat.title ?? String(message.chat.id))}\n` +
      `Родитель: ${escapeHtml(displayName(message.from))} (${escapeHtml(username)})\n\n` +
      `${escapeHtml(question)}`,
  );
}

async function handleAdminCommand(message: TelegramMessage): Promise<boolean> {
  const text = message.text?.trim() ?? '';
  const match = text.match(/^\/(register|mode|status|help|id|verify)(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (!match) return false;

  const command = match[1].toLowerCase();
  const argument = match[2]?.trim();

  if (command === 'verify') {
    if (message.chat.type !== 'private') {
      await sendMessage(message.chat.id, 'Проверку номера можно пройти только в личном чате с ботом.', message.message_id);
      return true;
    }
    await requestPhoneNumber(message.chat.id);
    return true;
  }

  if (command === 'id') {
    await sendMessage(
      message.chat.id,
      `Ваш Telegram ID: <code>${message.from?.id ?? 'unknown'}</code>\n` +
        `ID этого чата: <code>${message.chat.id}</code>`,
      message.message_id,
    );
    return true;
  }

  if (command === 'help') {
    await sendMessage(
      message.chat.id,
      `<b>OutWay Бот-менеджер</b>\n\n` +
        `Родителям: отметьте @${BOT_USERNAME} и задайте вопрос.\n\n` +
        `Администратору:\n/register КОД_ФИЛИАЛА — подключить группу\n` +
        `/mode mention|question|all — режим ответов\n/status — состояние группы\n/id — ID пользователя и чата\n/verify — привязать свой номер к CRM`,
      message.message_id,
    );
    return true;
  }

  if (!message.from || !ADMIN_IDS.has(message.from.id)) {
    await sendMessage(message.chat.id, 'Эта команда доступна только администратору OutWay.', message.message_id);
    return true;
  }

  if (message.chat.type !== 'group' && message.chat.type !== 'supergroup') {
    await sendMessage(message.chat.id, 'Команду нужно выполнить внутри родительской группы.', message.message_id);
    return true;
  }

  if (command === 'register') {
    if (!argument) {
      await sendMessage(message.chat.id, 'Укажите код филиала: <code>/register KRT</code>', message.message_id);
      return true;
    }
    const { data: branch, error } = await supabase
      .from('v2_school_branches')
      .select('id,code,name')
      .eq('code', argument.toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!branch) {
      await sendMessage(message.chat.id, `Филиал «${escapeHtml(argument)}» не найден в CRM.`, message.message_id);
      return true;
    }

    const { error: upsertError } = await supabase.from('v2_telegram_groups').upsert({
      chat_id: message.chat.id,
      title: message.chat.title ?? String(message.chat.id),
      branch_id: branch.id,
      enabled: true,
      response_mode: 'mention',
      manager_chat_id: DEFAULT_MANAGER_CHAT_ID,
      registered_by: message.from.id,
    });
    if (upsertError) throw new Error(upsertError.message);
    await sendMessage(
      message.chat.id,
      `✅ Группа подключена к филиалу <b>${escapeHtml(branch.name)}</b>.\n` +
        `По умолчанию я отвечаю, когда меня отмечают: @${BOT_USERNAME}`,
      message.message_id,
    );
    return true;
  }

  const group = await loadGroup(message.chat.id);
  if (!group) {
    await sendMessage(message.chat.id, 'Сначала зарегистрируйте группу командой /register.', message.message_id);
    return true;
  }

  if (command === 'mode') {
    if (!argument || !['mention', 'question', 'all'].includes(argument)) {
      await sendMessage(message.chat.id, 'Режимы: <code>mention</code>, <code>question</code>, <code>all</code>.', message.message_id);
      return true;
    }
    const { error } = await supabase
      .from('v2_telegram_groups')
      .update({ response_mode: argument })
      .eq('chat_id', message.chat.id);
    if (error) throw new Error(error.message);
    await sendMessage(message.chat.id, `Режим изменён: <b>${escapeHtml(argument)}</b>.`, message.message_id);
    return true;
  }

  await sendMessage(
    message.chat.id,
    `Бот: <b>${group.enabled ? 'включён' : 'выключен'}</b>\nРежим: <b>${group.response_mode}</b>`,
    message.message_id,
  );
  return true;
}

async function handlePrivateQuestion(update: TelegramUpdate, message: TelegramMessage) {
  const question = message.text?.trim().slice(0, 1800) ?? '';
  if (!question) return;

  const privateGroup: RegisteredGroup = {
    chat_id: message.chat.id,
    title: 'Личный чат с ботом',
    branch_id: null,
    response_mode: 'mention',
    manager_chat_id: DEFAULT_MANAGER_CHAT_ID,
    enabled: true,
  };
  const botMessageId = await registerIncoming(update, message, question);
  if (!botMessageId) return;

  try {
    await telegram('sendChatAction', { chat_id: message.chat.id, action: 'typing' });
    const [knowledge, tariffContext] = await Promise.all([
      loadKnowledge(null),
      loadTariffContext(null),
    ]);
    const identity = await loadPrivateIdentity(message.from?.id ?? 0);
    const result = await askManagerAi(question, privateGroup.title, knowledge, tariffContext, identity);
    const needsHandoff = result.needs_human || result.confidence < 0.68 || !result.answer;

    if (needsHandoff) {
      await handoffToManager(privateGroup, message, botMessageId, question);
      await supabase
        .from('v2_bot_messages')
        .update({ status: 'handoff', answer: result.answer || null, confidence: result.confidence })
        .eq('id', botMessageId);
      await sendMessage(
        message.chat.id,
        result.answer && result.confidence >= 0.68
          ? `${escapeHtml(result.answer)}\n\n<i>Для уточнения я передал вопрос менеджеру.</i>`
          : 'Для точного ответа нужен живой менеджер. Я зафиксировал вопрос и передал его на уточнение.',
      );
      return;
    }

    await sendMessage(message.chat.id, escapeHtml(result.answer));
    await supabase
      .from('v2_bot_messages')
      .update({ status: 'answered', answer: result.answer, confidence: result.confidence })
      .eq('id', botMessageId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await supabase
      .from('v2_bot_messages')
      .update({ status: 'error', error_message: errorMessage.slice(0, 1000) })
      .eq('id', botMessageId);
    await sendMessage(message.chat.id, 'Сейчас не получилось подготовить точный ответ. Вопрос сохранён для менеджера.');
  }
}

async function handleUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message || message.from?.is_bot) return;

  if (message.contact) {
    if (message.chat.type === 'private') await verifyPhone(message);
    return;
  }
  if (!message.text) return;

  if (message.chat.type === 'private') {
    if (/^\/id(?:@\w+)?$/i.test(message.text.trim())) {
      await sendMessage(
        message.chat.id,
        `Ваш Telegram ID: <code>${message.from?.id ?? 'unknown'}</code>\n` +
          `ID этого чата: <code>${message.chat.id}</code>`,
      );
    } else if (/^\/verify(?:@\w+)?$/i.test(message.text.trim())) {
      await requestPhoneNumber(message.chat.id);
    } else if (/^\/(start|help)(?:@\w+)?$/i.test(message.text.trim())) {
      await sendMessage(
        message.chat.id,
        `Я отвечаю на общие вопросы родителей здесь и в группах OutWay.\n` +
          `В группе используйте @${BOT_USERNAME}.\n\n` +
          `Для привязки к CRM используйте /verify. Персональные вопросы без проверки передам менеджеру.`,
      );
    } else if (!message.text.trim().startsWith('/')) {
      await handlePrivateQuestion(update, message);
    }
    return;
  }

  if (message.chat.type !== 'group' && message.chat.type !== 'supergroup') return;
  if (await handleAdminCommand(message)) return;

  const group = await loadGroup(message.chat.id);
  if (!group?.enabled || !isBotAddressed(message, group.response_mode)) return;

  const question = cleanQuestion(message.text);
  if (!question) return;
  const botMessageId = await registerIncoming(update, message, question);
  if (!botMessageId) return;

  try {
    await telegram('sendChatAction', { chat_id: message.chat.id, action: 'typing' });
    const [knowledge, tariffContext] = await Promise.all([
      loadKnowledge(group.branch_id),
      loadTariffContext(group.branch_id),
    ]);
    const result = await askManagerAi(question, message.chat.title ?? group.title, knowledge, tariffContext);
    const needsHandoff = result.needs_human || result.confidence < 0.68 || !result.answer;

    if (needsHandoff) {
      await handoffToManager(group, message, botMessageId, question);
      await supabase
        .from('v2_bot_messages')
        .update({ status: 'handoff', answer: result.answer || null, confidence: result.confidence })
        .eq('id', botMessageId);
      await sendMessage(
        message.chat.id,
        result.answer && result.confidence >= 0.68
          ? `${escapeHtml(result.answer)}\n\n<i>Для уточнения я передал вопрос менеджеру.</i>`
          : 'Для точного ответа нужен живой менеджер. Я зафиксировал вопрос и передал его на уточнение.',
        message.message_id,
      );
      return;
    }

    await sendMessage(message.chat.id, escapeHtml(result.answer), message.message_id);
    await supabase
      .from('v2_bot_messages')
      .update({ status: 'answered', answer: result.answer, confidence: result.confidence })
      .eq('id', botMessageId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await supabase
      .from('v2_bot_messages')
      .update({ status: 'error', error_message: errorMessage.slice(0, 1000) })
      .eq('id', botMessageId);
    await sendMessage(
      message.chat.id,
      'Сейчас не получилось подготовить точный ответ. Вопрос сохранён — менеджер сможет его проверить.',
      message.message_id,
    );
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'GET') return new Response('telegram-manager-bot: ok');
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });

  try {
    const update = await request.json() as TelegramUpdate;
    await handleUpdate(update);
  } catch (error) {
    console.error('telegram-manager-bot error', error);
  }
  return new Response('ok');
});
