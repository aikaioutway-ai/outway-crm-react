import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN = requiredEnv('TELEGRAM_DRIVER_BOT_TOKEN');
const WEBHOOK_SECRET = requiredEnv('TELEGRAM_DRIVER_WEBHOOK_SECRET');
const SUPABASE_URL = requiredEnv('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const BOT_USERNAME = (Deno.env.get('TELEGRAM_DRIVER_BOT_USERNAME') ?? 'outway_driver_bot')
  .replace(/^@/, '')
  .trim();
const CRM_ADMIN_ROLES = new Set(['admin', 'manager', 'logist', 'senior_logist']);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date?: number;
  edit_date?: number;
  contact?: {
    phone_number: string;
    user_id?: number;
    first_name?: string;
    last_name?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    horizontal_accuracy?: number;
    live_period?: number;
    heading?: number;
  };
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: TelegramChatMemberUpdated;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type Driver = {
  id: string;
  full_name: string;
  phone: string;
  second_phone: string | null;
  status: string;
  telegram_user_id: number | null;
};

type Transfer = {
  id: string;
  transfer_number: number;
  driver_id: string | null;
  status: string;
  telegram_chat_id: number | null;
  v2_school_branches: {
    code: string;
    short_name: string | null;
    name: string;
  } | null;
};

type TelegramChatMember = {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
};

type TelegramChatMemberUpdated = {
  chat: TelegramChat;
  from: TelegramUser;
  new_chat_member: TelegramChatMember & {
    user?: TelegramUser & { is_bot?: boolean };
  };
};

type AuthorizedTransfer = {
  driver: {
    id: string;
    full_name: string;
    status: string;
  };
  transfer: Transfer;
};

type StartRunResult = {
  run_id: string;
  created: boolean;
  run_status: 'not_started' | 'active' | 'finished' | 'cancelled';
  run_direction: 'morning' | 'evening';
  stop_count: number;
  next_stop_order: number | null;
};

type EmployeeSession = {
  sub: string;
  role: string;
  schools: string[];
  exp: number;
};

type DriverTelegramGroup = {
  chat_id: number;
  title: string;
  status: 'pending' | 'linked' | 'disabled';
  transfer_id: string | null;
  driver_id: string | null;
  invite_token_hash: string | null;
  invite_expires_at: string | null;
  driver_confirmed_at: string | null;
  control_message_id: number | null;
  created_at: string;
  updated_at: string;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function commandFrom(text?: string): string | null {
  if (!text?.startsWith('/')) return null;
  return text.trim().split(/\s+/, 1)[0].slice(1).split('@', 1)[0].toLowerCase();
}

function commandArguments(text?: string): string[] {
  if (!text?.startsWith('/')) return [];
  return text.trim().split(/\s+/).slice(1);
}

function displayName(user?: TelegramUser): string {
  if (!user) return 'водитель';
  return [user.first_name, user.last_name].filter(Boolean).join(' ')
    || user.username
    || String(user.id);
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('996')
    ? digits.slice(-9)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits.slice(-9);
  return local.length === 9 ? `996${local}` : digits;
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyEmployeeSession(request: Request): Promise<EmployeeSession | null> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const [payloadPart, signaturePart, ...extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra.length) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SUPABASE_SERVICE_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(signaturePart),
      new TextEncoder().encode(payloadPart),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart))) as EmployeeSession;
    if (
      !payload.sub
      || !CRM_ADMIN_ROLES.has(payload.role)
      || !Number.isFinite(payload.exp)
      || payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      ...payload,
      schools: Array.isArray(payload.schools) ? payload.schools.map(String) : ['ALL'],
    };
  } catch {
    return null;
  }
}

function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return base64Url(bytes);
}

function currentRunDirection(): 'morning' | 'evening' {
  const hourText = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bishkek',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return Number(hourText) < 14 ? 'morning' : 'evening';
}

async function telegram(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json() as { ok?: boolean; result?: unknown; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method}: ${data.description ?? response.status}`);
  }
  return data.result;
}

async function sendMessage(
  chatId: number,
  text: string,
  replyTo?: number,
  replyMarkup?: Record<string, unknown>,
): Promise<TelegramMessage> {
  return await telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  }) as TelegramMessage;
}

async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  await telegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallback(
  callbackId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  await telegram('answerCallbackQuery', {
    callback_query_id: callbackId,
    ...(text ? { text } : {}),
    show_alert: showAlert,
  });
}

async function handleCrmAdmin(request: Request): Promise<Response> {
  const session = await verifyEmployeeSession(request);
  if (!session) {
    return Response.json(
      { ok: false, error: 'Сессия истекла. Войдите в CRM заново.' },
      { status: 401, headers: corsHeaders },
    );
  }

  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? '');

  if (action === 'list_groups') {
    const { data, error } = await supabase
      .from('v2_driver_telegram_groups')
      .select('chat_id,title,status,transfer_id,driver_id,driver_confirmed_at,created_at,updated_at')
      .neq('status', 'disabled')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Telegram groups lookup failed: ${error.message}`);
    return Response.json({ ok: true, groups: data ?? [] }, { headers: corsHeaders });
  }

  if (action === 'link_group') {
    const chatId = Number(body.chat_id);
    const transferId = String(body.transfer_id ?? '').trim();
    const driverId = String(body.driver_id ?? '').trim();
    if (!Number.isSafeInteger(chatId) || chatId >= 0 || !transferId || !driverId) {
      return Response.json(
        { ok: false, error: 'Не выбраны группа, трансфер или водитель.' },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from('v2_driver_telegram_groups')
      .select('chat_id,title,status,transfer_id,driver_id,created_at,updated_at')
      .eq('chat_id', chatId)
      .maybeSingle();
    if (groupError) throw new Error(`Telegram group lookup failed: ${groupError.message}`);
    if (!group || group.status === 'disabled') {
      return Response.json(
        { ok: false, error: 'Добавьте бота администратором в Telegram-группу и обновите список.' },
        { status: 404, headers: corsHeaders },
      );
    }
    if (group.transfer_id && group.transfer_id !== transferId) {
      return Response.json(
        { ok: false, error: 'Эта Telegram-группа уже подключена к другому трансферу.' },
        { status: 409, headers: corsHeaders },
      );
    }

    const { data: transferData, error: transferError } = await supabase
      .from('v2_transfers')
      .select('id,driver_id,status,telegram_chat_id,transfer_number,v2_school_branches(code,short_name,name)')
      .eq('id', transferId)
      .maybeSingle();
    if (transferError) throw new Error(`Transfer lookup failed: ${transferError.message}`);
    if (!transferData || transferData.status !== 'active') {
      return Response.json(
        { ok: false, error: 'Активный трансфер не найден.' },
        { status: 404, headers: corsHeaders },
      );
    }
    if (transferData.driver_id !== driverId) {
      return Response.json(
        { ok: false, error: 'Выбранный водитель не назначен на этот трансфер.' },
        { status: 409, headers: corsHeaders },
      );
    }
    if (transferData.telegram_chat_id && Number(transferData.telegram_chat_id) !== chatId) {
      return Response.json(
        { ok: false, error: 'У этого трансфера уже есть другая Telegram-группа.' },
        { status: 409, headers: corsHeaders },
      );
    }

    const branch = Array.isArray(transferData.v2_school_branches)
      ? transferData.v2_school_branches[0]
      : transferData.v2_school_branches;
    const branchCode = String(branch?.code ?? '');
    if (!session.schools.includes('ALL') && !session.schools.includes(branchCode)) {
      return Response.json(
        { ok: false, error: 'У вас нет доступа к филиалу этого трансфера.' },
        { status: 403, headers: corsHeaders },
      );
    }

    const { data: driver, error: driverError } = await supabase
      .from('v2_drivers')
      .select('id,full_name,status')
      .eq('id', driverId)
      .maybeSingle();
    if (driverError) throw new Error(`Driver lookup failed: ${driverError.message}`);
    if (!driver || driver.status !== 'active') {
      return Response.json(
        { ok: false, error: 'Водитель не найден или не активен.' },
        { status: 404, headers: corsHeaders },
      );
    }

    const inviteToken = newInviteToken();
    const inviteTokenHash = await sha256Hex(inviteToken);
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: transferUpdateError } = await supabase
      .from('v2_transfers')
      .update({
        telegram_chat_id: chatId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transferId);
    if (transferUpdateError) throw new Error(`Transfer link failed: ${transferUpdateError.message}`);

    const { error: driverUpdateError } = await supabase
      .from('v2_drivers')
      .update({
        telegram_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', driverId);
    if (driverUpdateError) throw new Error(`Driver approval reset failed: ${driverUpdateError.message}`);

    const { error: groupUpdateError } = await supabase
      .from('v2_driver_telegram_groups')
      .update({
        status: 'linked',
        transfer_id: transferId,
        driver_id: driverId,
        linked_by_employee_id: session.sub,
        invite_token_hash: inviteTokenHash,
        invite_expires_at: inviteExpiresAt,
        driver_confirmed_at: null,
      })
      .eq('chat_id', chatId);
    if (groupUpdateError) throw new Error(`Telegram group link failed: ${groupUpdateError.message}`);

    const branchName = branch?.short_name || branch?.name || branchCode;
    const inviteMessage = await sendMessage(
      chatId,
      `✅ <b>Группа подключена логистом</b>\n\n` +
        `<b>Филиал:</b> ${escapeHtml(String(branchName))}\n` +
        `<b>Трансфер:</b> №${transferData.transfer_number}\n` +
        `<b>Водитель:</b> ${escapeHtml(driver.full_name)}\n\n` +
        'Водителю нужно один раз нажать кнопку ниже. После подтверждения здесь появится кнопка запуска рейса.',
      undefined,
      {
        inline_keyboard: [[{
          text: '✅ Я водитель · Подтвердить',
          url: `https://t.me/${BOT_USERNAME}?start=driver_${inviteToken}`,
          style: 'primary',
        }]],
      },
    );

    const { error: messageUpdateError } = await supabase
      .from('v2_driver_telegram_groups')
      .update({ control_message_id: inviteMessage.message_id })
      .eq('chat_id', chatId);
    if (messageUpdateError) {
      console.error('control message id update error', messageUpdateError);
    }

    return Response.json({
      ok: true,
      group: {
        chat_id: chatId,
        title: group.title,
        status: 'linked',
        transfer_id: transferId,
        driver_id: driverId,
        driver_confirmed_at: null,
        created_at: group.created_at,
        updated_at: new Date().toISOString(),
      },
    }, { headers: corsHeaders });
  }

  return Response.json(
    { ok: false, error: 'Неизвестное действие.' },
    { status: 400, headers: corsHeaders },
  );
}

async function requestPhoneNumber(message: TelegramMessage): Promise<void> {
  if (message.chat.type !== 'private') {
    await sendMessage(
      message.chat.id,
      'Проверка водителя доступна только в личном чате с ботом.',
      message.message_id,
    );
    return;
  }

  await sendMessage(
    message.chat.id,
    'Нажмите кнопку ниже и поделитесь <b>своим</b> номером телефона. Бот сверит его с карточкой водителя в CRM.',
    message.message_id,
    {
      keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: 'Нажмите кнопку «Поделиться номером»',
    },
  );
}

async function verifyPhone(message: TelegramMessage): Promise<void> {
  const contact = message.contact;
  const user = message.from;
  if (!contact || !user) return;

  if (message.chat.type !== 'private') {
    await sendMessage(message.chat.id, 'Не отправляйте номер в группу. Выполните /verify в личном чате с ботом.');
    return;
  }
  if (contact.user_id !== user.id) {
    await sendMessage(
      message.chat.id,
      'Нужно нажать кнопку «Поделиться номером» и отправить именно свой контакт.',
      undefined,
      { remove_keyboard: true },
    );
    return;
  }

  const normalized = normalizePhone(contact.phone_number);
  const { data, error } = await supabase
    .from('v2_drivers')
    .select('id,full_name,phone,second_phone,status,telegram_user_id');
  if (error) throw new Error(`Driver lookup failed: ${error.message}`);

  const matches = (data as Driver[] | null ?? []).filter((driver) =>
    [driver.phone, driver.second_phone]
      .filter((phone): phone is string => Boolean(phone))
      .some((phone) => normalizePhone(phone) === normalized)
  );

  if (matches.length === 0) {
    await sendMessage(
      message.chat.id,
      'Номер не найден среди водителей CRM. Проверьте номер в карточке водителя или обратитесь к логисту.',
      undefined,
      { remove_keyboard: true },
    );
    return;
  }
  if (matches.length > 1) {
    await sendMessage(
      message.chat.id,
      'Этот номер указан у нескольких водителей. Логисту нужно убрать дубликат в CRM.',
      undefined,
      { remove_keyboard: true },
    );
    return;
  }

  const driver = matches[0];
  if (driver.status !== 'active') {
    await sendMessage(
      message.chat.id,
      `Карточка водителя <b>${escapeHtml(driver.full_name)}</b> сейчас не активна. Обратитесь к логисту.`,
      undefined,
      { remove_keyboard: true },
    );
    return;
  }
  if (driver.telegram_user_id && driver.telegram_user_id !== user.id) {
    await sendMessage(
      message.chat.id,
      'Этот водитель уже привязан к другому Telegram-аккаунту. Перепривязку должен подтвердить администратор.',
      undefined,
      { remove_keyboard: true },
    );
    return;
  }

  const { data: existingDriver, error: existingError } = await supabase
    .from('v2_drivers')
    .select('id,full_name')
    .eq('telegram_user_id', user.id)
    .maybeSingle();
  if (existingError) throw new Error(`Telegram lookup failed: ${existingError.message}`);
  if (existingDriver && existingDriver.id !== driver.id) {
    await sendMessage(
      message.chat.id,
      `Ваш Telegram уже привязан к другому водителю: <b>${escapeHtml(existingDriver.full_name)}</b>. Обратитесь к администратору.`,
      undefined,
      { remove_keyboard: true },
    );
    return;
  }

  if (!driver.telegram_user_id) {
    const { data: updated, error: updateError } = await supabase
      .from('v2_drivers')
      .update({
        telegram_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', driver.id)
      .is('telegram_user_id', null)
      .select('id')
      .maybeSingle();
    if (updateError) throw new Error(`Driver verification failed: ${updateError.message}`);
    if (!updated) {
      await sendMessage(
        message.chat.id,
        'Не удалось завершить привязку: карточка водителя была изменена. Попробуйте /verify ещё раз.',
        undefined,
        { remove_keyboard: true },
      );
      return;
    }
  }

  await sendMessage(
    message.chat.id,
    `✅ Водитель подтверждён: <b>${escapeHtml(driver.full_name)}</b>.\n\nТеперь вы сможете запускать назначенный трансфер из его Telegram-группы.`,
    undefined,
    { remove_keyboard: true },
  );
}

async function isGroupAdmin(chatId: number, userId: number): Promise<boolean> {
  const member = await telegram('getChatMember', {
    chat_id: chatId,
    user_id: userId,
  }) as TelegramChatMember;
  return member.status === 'creator' || member.status === 'administrator';
}

async function authorizeTransferDriver(
  chatId: number,
  telegramUserId: number,
): Promise<{ context: AuthorizedTransfer | null; error: string | null }> {
  const { data: transferData, error: transferError } = await supabase
    .from('v2_transfers')
    .select('id,transfer_number,driver_id,status,telegram_chat_id,v2_school_branches(code,short_name,name)')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();
  if (transferError) throw new Error(`Registered transfer lookup failed: ${transferError.message}`);
  if (!transferData) {
    return { context: null, error: 'Эта группа ещё не зарегистрирована за трансфером.' };
  }

  const { data: driver, error: driverError } = await supabase
    .from('v2_drivers')
    .select('id,full_name,status')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  if (driverError) throw new Error(`Verified driver lookup failed: ${driverError.message}`);
  if (!driver) {
    return { context: null, error: 'Сначала подтвердите водителя командой /verify в личном чате.' };
  }
  if (driver.status !== 'active') {
    return { context: null, error: 'Карточка водителя сейчас не активна.' };
  }

  const transfer = transferData as unknown as Transfer;
  if (transfer.status !== 'active') {
    return { context: null, error: 'Этот трансфер сейчас не активен.' };
  }
  if (transfer.driver_id !== driver.id) {
    return { context: null, error: 'Запустить рейс может только назначенный водитель.' };
  }

  return { context: { transfer, driver }, error: null };
}

function startRunButtonMarkup(): Record<string, unknown> {
  return {
    inline_keyboard: [[{
      text: '▶️ НАЧАТЬ РЕЙС',
      callback_data: 'run:start',
      style: 'success',
    }]],
  };
}

function liveLocationHelpMarkup(): Record<string, unknown> {
  return {
    inline_keyboard: [[{
      text: '📍 Как включить Live Location',
      callback_data: 'run:location_help',
      style: 'primary',
    }]],
  };
}

async function sendControlPanel(message: TelegramMessage): Promise<void> {
  const user = message.from;
  if (!user) return;
  if (message.chat.type !== 'group' && message.chat.type !== 'supergroup') {
    await sendMessage(
      message.chat.id,
      'Панель трансфера доступна только в зарегистрированной группе.',
      message.message_id,
    );
    return;
  }

  const { context, error } = await authorizeTransferDriver(message.chat.id, user.id);
  if (!context) {
    await sendMessage(message.chat.id, error ?? 'Доступ запрещён.', message.message_id);
    return;
  }

  const branchCode = context.transfer.v2_school_branches?.code ?? '—';
  await sendMessage(
    message.chat.id,
      `<b>OutWay · ${escapeHtml(branchCode)} №${context.transfer.transfer_number}</b>\n` +
      `Водитель: ${escapeHtml(context.driver.full_name)}\n\n` +
      'Нажмите кнопку перед началом рейса.',
    message.message_id,
    startRunButtonMarkup(),
  );
}

async function showDriverControlCard(params: {
  chatId: number;
  messageId?: number | null;
  branchCode: string;
  transferNumber: number;
  driverName: string;
}): Promise<number> {
  const text =
    `🚌 <b>OutWay · ${escapeHtml(params.branchCode)} №${params.transferNumber}</b>\n\n` +
    `Водитель: <b>${escapeHtml(params.driverName)}</b>\n` +
    'Статус: <b>готов к рейсу</b>\n\n' +
    'Перед выездом нажмите одну кнопку:';

  if (params.messageId) {
    await editMessage(
      params.chatId,
      params.messageId,
      text,
      startRunButtonMarkup(),
    );
    return params.messageId;
  }

  const message = await sendMessage(
    params.chatId,
    text,
    undefined,
    startRunButtonMarkup(),
  );
  return message.message_id;
}

async function confirmDriverInvite(message: TelegramMessage, token: string): Promise<void> {
  if (message.chat.type !== 'private' || !message.from) {
    await sendMessage(message.chat.id, 'Откройте приглашение в личном чате с ботом.');
    return;
  }

  const tokenHash = await sha256Hex(token);
  const { data: groupData, error: groupError } = await supabase
    .from('v2_driver_telegram_groups')
    .select('chat_id,title,status,transfer_id,driver_id,invite_expires_at,control_message_id')
    .eq('invite_token_hash', tokenHash)
    .maybeSingle();
  if (groupError) throw new Error(`Driver invitation lookup failed: ${groupError.message}`);
  if (!groupData || groupData.status !== 'linked' || !groupData.transfer_id || !groupData.driver_id) {
    await sendMessage(
      message.chat.id,
      'Приглашение уже использовано или отменено. Попросите логиста отправить новое.',
    );
    return;
  }
  if (
    !groupData.invite_expires_at
    || new Date(groupData.invite_expires_at).getTime() <= Date.now()
  ) {
    await sendMessage(
      message.chat.id,
      'Срок приглашения истёк. Логист может заново подключить группу из CRM.',
    );
    return;
  }

  const { data: transferData, error: transferError } = await supabase
    .from('v2_transfers')
    .select('id,driver_id,status,transfer_number,telegram_chat_id,v2_school_branches(code)')
    .eq('id', groupData.transfer_id)
    .maybeSingle();
  if (transferError) throw new Error(`Invitation transfer lookup failed: ${transferError.message}`);
  if (
    !transferData
    || transferData.status !== 'active'
    || transferData.driver_id !== groupData.driver_id
    || Number(transferData.telegram_chat_id) !== Number(groupData.chat_id)
  ) {
    await sendMessage(
      message.chat.id,
      'Назначение трансфера изменилось. Попросите логиста проверить группу в CRM.',
    );
    return;
  }

  const { data: driver, error: driverError } = await supabase
    .from('v2_drivers')
    .select('id,full_name,status,telegram_user_id')
    .eq('id', groupData.driver_id)
    .maybeSingle();
  if (driverError) throw new Error(`Invitation driver lookup failed: ${driverError.message}`);
  if (!driver || driver.status !== 'active') {
    await sendMessage(message.chat.id, 'Карточка водителя сейчас не активна. Обратитесь к логисту.');
    return;
  }

  const { data: otherDriver, error: otherDriverError } = await supabase
    .from('v2_drivers')
    .select('id,full_name')
    .eq('telegram_user_id', message.from.id)
    .neq('id', driver.id)
    .maybeSingle();
  if (otherDriverError) throw new Error(`Telegram identity lookup failed: ${otherDriverError.message}`);
  if (otherDriver) {
    await sendMessage(
      message.chat.id,
      `Этот Telegram уже связан с водителем <b>${escapeHtml(otherDriver.full_name)}</b>. ` +
        'Перепривязку должен выполнить логист.',
    );
    return;
  }

  const { error: driverUpdateError } = await supabase
    .from('v2_drivers')
    .update({
      telegram_user_id: message.from.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', driver.id);
  if (driverUpdateError) throw new Error(`Driver confirmation failed: ${driverUpdateError.message}`);

  const { error: groupUpdateError } = await supabase
    .from('v2_driver_telegram_groups')
    .update({
      invite_token_hash: null,
      invite_expires_at: null,
      driver_confirmed_at: new Date().toISOString(),
    })
    .eq('chat_id', groupData.chat_id)
    .eq('invite_token_hash', tokenHash);
  if (groupUpdateError) throw new Error(`Driver invitation close failed: ${groupUpdateError.message}`);

  const branch = Array.isArray(transferData.v2_school_branches)
    ? transferData.v2_school_branches[0]
    : transferData.v2_school_branches;
  const controlMessageId = await showDriverControlCard({
    chatId: Number(groupData.chat_id),
    messageId: groupData.control_message_id,
    branchCode: String(branch?.code ?? 'OutWay'),
    transferNumber: Number(transferData.transfer_number),
    driverName: driver.full_name,
  });
  await supabase
    .from('v2_driver_telegram_groups')
    .update({ control_message_id: controlMessageId })
    .eq('chat_id', groupData.chat_id);

  await sendMessage(
    message.chat.id,
    `✅ Вы подтверждены как водитель <b>${escapeHtml(driver.full_name)}</b>.\n\n` +
      `Рабочая кнопка уже появилась в группе «${escapeHtml(groupData.title)}».`,
  );
}

async function handleMyChatMember(update: TelegramChatMemberUpdated): Promise<void> {
  const chat = update.chat;
  if (chat.type !== 'group' && chat.type !== 'supergroup') return;
  const nextStatus = update.new_chat_member.status;
  const enabled = nextStatus === 'creator' || nextStatus === 'administrator' || nextStatus === 'member';

  const { data: existing, error: existingError } = await supabase
    .from('v2_driver_telegram_groups')
    .select('chat_id,status,transfer_id')
    .eq('chat_id', chat.id)
    .maybeSingle();
  if (existingError) throw new Error(`Telegram group state lookup failed: ${existingError.message}`);

  if (!enabled) {
    if (existing?.transfer_id) {
      await supabase
        .from('v2_transfers')
        .update({ telegram_chat_id: null, updated_at: new Date().toISOString() })
        .eq('id', existing.transfer_id)
        .eq('telegram_chat_id', chat.id);
    }
    await supabase
      .from('v2_driver_telegram_groups')
      .upsert({
        chat_id: chat.id,
        title: chat.title ?? String(chat.id),
        status: 'disabled',
        transfer_id: null,
        driver_id: null,
        invite_token_hash: null,
        invite_expires_at: null,
      });
    return;
  }

  if (existing?.status === 'linked') {
    await supabase
      .from('v2_driver_telegram_groups')
      .update({ title: chat.title ?? String(chat.id) })
      .eq('chat_id', chat.id);
    return;
  }
  if (existing?.status === 'pending') {
    await supabase
      .from('v2_driver_telegram_groups')
      .update({ title: chat.title ?? String(chat.id) })
      .eq('chat_id', chat.id);
    return;
  }

  const { error: upsertError } = await supabase
    .from('v2_driver_telegram_groups')
    .upsert({
      chat_id: chat.id,
      title: chat.title ?? String(chat.id),
      status: 'pending',
      transfer_id: null,
      driver_id: null,
      added_by_telegram_user_id: update.from.id,
      invite_token_hash: null,
      invite_expires_at: null,
      driver_confirmed_at: null,
      control_message_id: null,
    });
  if (upsertError) throw new Error(`Telegram group registration failed: ${upsertError.message}`);

  await sendMessage(
    chat.id,
    '✅ <b>OutWay Driver подключён</b>\n\n' +
      'Группа появилась в CRM со статусом «Ожидает подключения».\n' +
      'Дальше логист выберет водителя и трансфер — команды в группе вводить не нужно.',
  );
}

async function handleLiveLocation(message: TelegramMessage, isEdited: boolean): Promise<void> {
  const user = message.from;
  const location = message.location;
  if (!user || !location) return;
  if (message.chat.type !== 'group' && message.chat.type !== 'supergroup') {
    if (!isEdited) {
      await sendMessage(
        message.chat.id,
        'Live Location нужно включить в зарегистрированной группе трансфера.',
        message.message_id,
      );
    }
    return;
  }

  const { context, error } = await authorizeTransferDriver(message.chat.id, user.id);
  if (!context) {
    if (!isEdited) {
      await sendMessage(message.chat.id, error ?? 'Доступ запрещён.', message.message_id);
    }
    return;
  }

  const { data: run, error: runError } = await supabase
    .from('v2_transfer_runs')
    .select('id,next_stop_order,last_location_at,location_message_id')
    .eq('transfer_id', context.transfer.id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw new Error(`Active run lookup failed: ${runError.message}`);
  if (!run) {
    if (!isEdited) {
      await sendMessage(
        message.chat.id,
        'Сначала запустите рейс через кнопку «На линии».',
        message.message_id,
      );
    }
    return;
  }

  const isInitialLiveLocation = Number(location.live_period ?? 0) > 0;
  const isKnownLiveMessage = run.location_message_id === message.message_id;
  if (!isInitialLiveLocation && !isKnownLiveMessage) {
    if (!isEdited) {
      await sendMessage(
        message.chat.id,
        'Отправлена обычная точка. Выберите в Telegram «Геопозиция» → «Транслировать геопозицию».',
        message.message_id,
      );
    }
    return;
  }

  const eventUnix = message.edit_date ?? message.date ?? Math.floor(Date.now() / 1000);
  const eventAt = new Date(eventUnix * 1000).toISOString();
  if (run.last_location_at && new Date(run.last_location_at).getTime() > eventUnix * 1000) {
    return;
  }

  const { error: updateError } = await supabase
    .from('v2_transfer_runs')
    .update({
      last_latitude: location.latitude,
      last_longitude: location.longitude,
      last_location_accuracy: location.horizontal_accuracy ?? null,
      last_location_at: eventAt,
      location_message_id: message.message_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .eq('status', 'active');
  if (updateError) throw new Error(`Live location update failed: ${updateError.message}`);

  if (!isEdited && !isKnownLiveMessage) {
    const { data: nextStop, error: stopError } = await supabase
      .from('v2_transfer_run_stops')
      .select('child_name,stop_order')
      .eq('run_id', run.id)
      .eq('stop_order', run.next_stop_order ?? 1)
      .maybeSingle();
    if (stopError) throw new Error(`Next stop lookup failed: ${stopError.message}`);

    await sendMessage(
      message.chat.id,
      `📍 <b>Live Location подключена.</b>\n\n` +
        `Координаты машины поступают в CRM.` +
        (nextStop ? `\nСледующая остановка: <b>${escapeHtml(nextStop.child_name)}</b>.` : ''),
      message.message_id,
    );
  }
}

function scheduleLiveLocationReminder(params: {
  runId: string;
  chatId: number;
  driverName: string;
}): void {
  const reminderTask = new Promise(resolve => setTimeout(resolve, 90_000))
    .then(async () => {
      const { data: run, error } = await supabase
        .from('v2_transfer_runs')
        .select('status,last_location_at')
        .eq('id', params.runId)
        .maybeSingle();
      if (error || !run || run.status !== 'active' || run.last_location_at) return;
      await sendMessage(
        params.chatId,
        `⏰ <b>${escapeHtml(params.driverName)}, включите Live Location</b>\n\n` +
          'Без неё родители и логист не увидят машину на карте.\n' +
          'Скрепка → «Геопозиция» → «Транслировать геопозицию» → «8 часов».',
        undefined,
        liveLocationHelpMarkup(),
      );
    })
    .catch(error => console.error('live location reminder error', error));

  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(reminderTask);
  } else {
    void reminderTask;
  }
}

async function handleRunCallback(callback: TelegramCallbackQuery): Promise<void> {
  const message = callback.message;
  const data = callback.data;
  if (!message || !data) {
    await answerCallback(callback.id, 'Сообщение больше недоступно.', true);
    return;
  }

  const { context, error } = await authorizeTransferDriver(message.chat.id, callback.from.id);
  if (!context) {
    await answerCallback(callback.id, error ?? 'Доступ запрещён.', true);
    return;
  }

  if (data === 'run:location_help') {
    await answerCallback(
      callback.id,
      'Нажмите скрепку → Геопозиция → Транслировать геопозицию → 8 часов.',
      true,
    );
    return;
  }

  if (data !== 'run:start') {
    await answerCallback(callback.id, 'Неизвестная команда.', true);
    return;
  }

  const direction = currentRunDirection();
  await answerCallback(callback.id, 'Запускаю рейс…');
  const { data: runData, error: runError } = await supabase.rpc('v2_start_transfer_run', {
    p_transfer_id: context.transfer.id,
    p_driver_id: context.driver.id,
    p_direction: direction,
    p_confirmed_by: callback.from.id,
  });
  if (runError) {
    console.error('start transfer run error', runError);
    await editMessage(
      message.chat.id,
      message.message_id,
      `<b>Не удалось запустить рейс</b>\n\n${escapeHtml(runError.message)}`,
      startRunButtonMarkup(),
    );
    return;
  }

  const run = (runData as StartRunResult[] | null)?.[0];
  if (!run) throw new Error('Start run RPC returned no result');

  const { error: messageIdError } = await supabase
    .from('v2_transfer_runs')
    .update({ status_message_id: message.message_id })
    .eq('id', run.run_id)
    .is('status_message_id', null);
  if (messageIdError) {
    console.error('status message id update error', messageIdError);
  }

  const directionLabel = direction === 'morning' ? 'Утро · дома → школа' : 'Вечер · школа → дома';
  if (!run.created && run.run_status !== 'active') {
    await editMessage(
      message.chat.id,
      message.message_id,
      `<b>Рейс уже существует</b>\n\n` +
        `Направление: ${directionLabel}\n` +
        `Статус: ${escapeHtml(run.run_status)}\n\n` +
        'Повторный рейс на эту дату не создаётся.',
    );
    return;
  }

  await editMessage(
    message.chat.id,
    message.message_id,
    `${run.created ? '✅ <b>Рейс запущен</b>' : 'ℹ️ <b>Рейс уже активен</b>'}\n\n` +
      `<b>Направление:</b> ${directionLabel}\n` +
      `<b>Остановок:</b> ${run.stop_count}\n` +
      `<b>Водитель:</b> ${escapeHtml(context.driver.full_name)}\n\n` +
      '📍 <b>Остался один шаг</b>\n' +
      'Нажмите скрепку → «Геопозиция» → «Транслировать геопозицию» → «8 часов».\n\n' +
      'Telegram не разрешает боту включать геолокацию без подтверждения водителя.',
    liveLocationHelpMarkup(),
  );
  scheduleLiveLocationReminder({
    runId: run.run_id,
    chatId: message.chat.id,
    driverName: context.driver.full_name,
  });
}

async function registerTransferGroup(message: TelegramMessage): Promise<void> {
  const user = message.from;
  if (!user) return;
  if (message.chat.type !== 'group' && message.chat.type !== 'supergroup') {
    await sendMessage(
      message.chat.id,
      'Регистрация трансфера выполняется только внутри его Telegram-группы.',
      message.message_id,
    );
    return;
  }

  const [branchArg, transferArg, ...extraArgs] = commandArguments(message.text);
  const branchCode = branchArg?.trim().toUpperCase();
  const transferNumber = Number(transferArg);
  if (
    !branchCode
    || !/^[A-Z0-9_-]{2,20}$/.test(branchCode)
    || !Number.isSafeInteger(transferNumber)
    || transferNumber <= 0
    || extraArgs.length > 0
  ) {
    await sendMessage(
      message.chat.id,
      'Формат команды: <code>/register_transfer TIS 1</code>',
      message.message_id,
    );
    return;
  }

  if (!await isGroupAdmin(message.chat.id, user.id)) {
    await sendMessage(
      message.chat.id,
      'Зарегистрировать трансфер может только администратор этой группы.',
      message.message_id,
    );
    return;
  }

  const { data: driver, error: driverError } = await supabase
    .from('v2_drivers')
    .select('id,full_name,status')
    .eq('telegram_user_id', user.id)
    .maybeSingle();
  if (driverError) throw new Error(`Verified driver lookup failed: ${driverError.message}`);
  if (!driver) {
    await sendMessage(
      message.chat.id,
      'Сначала подтвердите водителя командой /verify в личном чате с ботом.',
      message.message_id,
    );
    return;
  }
  if (driver.status !== 'active') {
    await sendMessage(
      message.chat.id,
      'Карточка подтверждённого водителя сейчас не активна.',
      message.message_id,
    );
    return;
  }

  const { data: transfers, error: transferError } = await supabase
    .from('v2_transfers')
    .select('id,transfer_number,driver_id,status,telegram_chat_id,v2_school_branches!inner(code,short_name,name)')
    .eq('transfer_number', transferNumber)
    .eq('v2_school_branches.code', branchCode)
    .limit(2);
  if (transferError) throw new Error(`Transfer lookup failed: ${transferError.message}`);
  if (!transfers?.length) {
    await sendMessage(
      message.chat.id,
      `Трансфер <b>${escapeHtml(branchCode)} №${transferNumber}</b> не найден в CRM.`,
      message.message_id,
    );
    return;
  }
  if (transfers.length > 1) {
    await sendMessage(
      message.chat.id,
      'В CRM найдено несколько трансферов с таким номером. Требуется проверка логиста.',
      message.message_id,
    );
    return;
  }

  const transfer = transfers[0] as unknown as Transfer;
  if (transfer.status !== 'active') {
    await sendMessage(message.chat.id, 'Этот трансфер сейчас не активен.', message.message_id);
    return;
  }
  if (transfer.driver_id !== driver.id) {
    await sendMessage(
      message.chat.id,
      `Трансфер назначен другому водителю. Вы подтверждены как <b>${escapeHtml(driver.full_name)}</b>.`,
      message.message_id,
    );
    return;
  }
  if (transfer.telegram_chat_id === message.chat.id) {
    await sendMessage(
      message.chat.id,
      `✅ Эта группа уже зарегистрирована за трансфером <b>${escapeHtml(branchCode)} №${transferNumber}</b>.`,
      message.message_id,
      startRunButtonMarkup(),
    );
    return;
  }
  if (transfer.telegram_chat_id) {
    await sendMessage(
      message.chat.id,
      'Этот трансфер уже зарегистрирован в другой Telegram-группе. Перепривязку должен подтвердить администратор.',
      message.message_id,
    );
    return;
  }

  const { data: chatTransfer, error: chatLookupError } = await supabase
    .from('v2_transfers')
    .select('id,transfer_number,v2_school_branches(code)')
    .eq('telegram_chat_id', message.chat.id)
    .maybeSingle();
  if (chatLookupError) throw new Error(`Group lookup failed: ${chatLookupError.message}`);
  if (chatTransfer) {
    const existingBranch = Array.isArray(chatTransfer.v2_school_branches)
      ? chatTransfer.v2_school_branches[0]?.code
      : chatTransfer.v2_school_branches?.code;
    await sendMessage(
      message.chat.id,
      `Эта группа уже связана с трансфером <b>${escapeHtml(existingBranch ?? '—')} №${chatTransfer.transfer_number}</b>.`,
      message.message_id,
    );
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from('v2_transfers')
    .update({
      telegram_chat_id: message.chat.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transfer.id)
    .is('telegram_chat_id', null)
    .select('id')
    .maybeSingle();
  if (updateError) throw new Error(`Group registration failed: ${updateError.message}`);
  if (!updated) {
    await sendMessage(
      message.chat.id,
      'Не удалось завершить регистрацию: трансфер был изменён. Повторите команду.',
      message.message_id,
    );
    return;
  }

  const branchName = transfer.v2_school_branches?.short_name
    || transfer.v2_school_branches?.name
    || branchCode;
  await sendMessage(
    message.chat.id,
    `✅ Группа зарегистрирована.\n\n` +
      `<b>Филиал:</b> ${escapeHtml(branchName)} (${escapeHtml(branchCode)})\n` +
      `<b>Трансфер:</b> №${transferNumber}\n` +
      `<b>Водитель:</b> ${escapeHtml(driver.full_name)}`,
    message.message_id,
    startRunButtonMarkup(),
  );
}

async function handleMessage(message: TelegramMessage, isEdited = false): Promise<void> {
  if (
    (message.chat.type === 'group' || message.chat.type === 'supergroup')
    && message.from
  ) {
    await handleMyChatMember({
      chat: message.chat,
      from: message.from,
      new_chat_member: { status: 'member' },
    });
  }

  if (message.location) {
    await handleLiveLocation(message, isEdited);
    return;
  }

  if (message.contact) {
    if (!isEdited) {
      await sendMessage(
        message.chat.id,
        'Отправлять номер больше не нужно: водителя подтверждает логист из CRM.',
        message.message_id,
        { remove_keyboard: true },
      );
    }
    return;
  }

  const command = commandFrom(message.text);
  if (!command) return;

  if (command === 'start') {
    const [startArgument] = commandArguments(message.text);
    if (startArgument?.startsWith('driver_')) {
      await confirmDriverInvite(message, startArgument.slice('driver_'.length));
      return;
    }

    const name = escapeHtml(displayName(message.from));
    await sendMessage(
      message.chat.id,
      message.chat.type === 'private'
        ? `Здравствуйте, <b>${name}</b>!\n\nЭто бот водителей OutWay. ` +
          'Дождитесь приглашения от логиста и нажмите в нём кнопку подтверждения.'
        : '<b>OutWay Driver подключён.</b>\n\nГруппа уже передана логисту в CRM. Команды вводить не нужно.',
      message.message_id,
    );
    return;
  }

  if (command === 'verify' || command === 'register_transfer' || command === 'panel') {
    await sendMessage(
      message.chat.id,
      'Эта команда больше не нужна. Группу и водителя подключает логист из CRM.',
      message.message_id,
    );
    return;
  }

  if (command === 'id') {
    const userId = message.from?.id ?? 'не определён';
    await sendMessage(
      message.chat.id,
      `<b>Telegram ID</b>\nПользователь: <code>${userId}</code>\nЧат: <code>${message.chat.id}</code>`,
      message.message_id,
    );
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method === 'GET') {
    return Response.json(
      { service: 'telegram-driver-bot', status: 'ok' },
      { headers: corsHeaders },
    );
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith('/admin/crm')) {
    try {
      return await handleCrmAdmin(request);
    } catch (error) {
      console.error('telegram driver crm admin error', error);
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500, headers: corsHeaders },
      );
    }
  }

  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });

  try {
    if (pathname.endsWith('/admin/refresh-webhook')) {
      const result = await telegram('setWebhook', {
        url: `${SUPABASE_URL}/functions/v1/telegram-driver-bot`,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
      });
      return Response.json({ ok: true, result });
    }
    const update = await request.json() as TelegramUpdate;
    if (update.my_chat_member) await handleMyChatMember(update.my_chat_member);
    if (update.message) await handleMessage(update.message);
    if (update.edited_message) await handleMessage(update.edited_message, true);
    if (update.callback_query) await handleRunCallback(update.callback_query);
  } catch (error) {
    console.error('telegram-driver-bot error', error);
  }

  return new Response('ok');
});
