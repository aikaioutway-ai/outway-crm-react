export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export type IncomingReceipt = {
  instanceId: string;
  messageId: string;
  chatId: string;
  chatName: string | null;
  messageAt: string;
  senderId: string | null;
  senderPhone: string | null;
  senderName: string | null;
  caption: string | null;
  isForwarded: boolean;
  fileUrl: string;
  fileName: string | null;
  mimeType: string;
};

export type RecognizedReceipt = {
  receipt_code: string | null;
  time: string | null;
  card_last4: string | null;
  bank: string | null;
  amount: number | null;
  date: string | null;
};

export type ReceiptDuplicateMatch = { payment_id: string; match_type: string };

export type ReceiptDeps = {
  download: (url: string) => Promise<Uint8Array>;
  sha256: (bytes: Uint8Array) => Promise<string>;
  recognize: (bytes: Uint8Array, mimeType: string) => Promise<RecognizedReceipt>;
  storeFile: (path: string, bytes: Uint8Array, mimeType: string) => Promise<void>;
  findDuplicate: (params: { hash: string; receipt: RecognizedReceipt }) => Promise<ReceiptDuplicateMatch | null>;
  findFamilies: (phoneSuffix: string) => Promise<string[]>;
  now: () => string;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function safeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

// Green API сам ставит «Bearer» перед паролем; если его вписали и в настройках, слово придёт дважды.
export function webhookTokenMatches(header: string, token: string): boolean {
  if (!token) return false;
  const received = header.trim().replace(/^(Bearer\s+)+/i, '');
  return safeEqual(received, token);
}

// Настоящий телефон приходит только в формате номер@c.us; внутренний код @lid телефоном не является.
export function senderPhoneFromId(senderId: string | null): string | null {
  return senderId?.match(/^(\d{9,15})@c\.us$/)?.[1] ?? null;
}

// Бот принимает чеки только из явно перечисленных групп; пустой список не пропускает ничего.
export function parseAllowedChats(value: string | null | undefined): Set<string> {
  return new Set((value ?? '').split(',').map(chat => chat.trim()).filter(chat => chat.endsWith('@g.us')));
}

export function phoneSuffix(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

// Любое сообщение группы (входящее или отправленное с номера бота): по нему бот запоминает,
// в каких группах он состоит. Приглашение в группу личным сообщением даёт только кандидата —
// участие бота потом подтверждает синхронизация групп (verified: false).
const GROUP_WEBHOOKS = new Set(['incomingMessageReceived', 'outgoingMessageReceived', 'outgoingAPIMessageReceived']);
export function parseGreenApiGroup(payload: unknown): { instanceId: string; chatId: string; chatName: string | null; verified: boolean } | null {
  const body = record(payload);
  const instance = record(body?.instanceData);
  const sender = record(body?.senderData);
  if (typeof body?.typeWebhook !== 'string' || !GROUP_WEBHOOKS.has(body.typeWebhook) || !instance || !sender) return null;
  const instanceId = String(instance.idInstance ?? '');
  const invite = record(record(body.messageData)?.groupInviteMessageData);
  const inviteJid = text(invite?.groupJid);
  if (body.typeWebhook === 'incomingMessageReceived' && inviteJid?.endsWith('@g.us')) {
    return { instanceId, chatId: inviteJid, chatName: text(invite?.groupName), verified: false };
  }
  const chatId = text(sender.chatId);
  if (!chatId?.endsWith('@g.us')) return null;
  return { instanceId, chatId, chatName: text(sender.chatName), verified: true };
}

export function parseGreenApiReceipt(payload: unknown): IncomingReceipt | null {
  const body = record(payload);
  const instance = record(body?.instanceData);
  const sender = record(body?.senderData);
  const message = record(body?.messageData);
  const file = record(message?.fileMessageData);
  if (body?.typeWebhook !== 'incomingMessageReceived' || !instance || !sender || !message || !file) return null;

  const messageType = message.typeMessage;
  if (messageType !== 'imageMessage' && messageType !== 'documentMessage') return null;

  const chatId = text(sender.chatId);
  const messageId = text(body.idMessage);
  const fileUrl = text(file.downloadUrl);
  const timestamp = Number(body.timestamp);
  if (!chatId?.endsWith('@g.us') || !messageId || !Number.isFinite(timestamp) || timestamp <= 0) return null;

  const declaredType = text(file.mimeType)?.split(';')[0].trim().toLowerCase() ?? null;
  const mimeType = declaredType ?? (messageType === 'imageMessage' ? 'image/jpeg' : null);
  if (!mimeType || (!IMAGE_TYPES.has(mimeType) && mimeType !== 'application/pdf')) return null;

  const senderId = text(sender.sender);
  return {
    instanceId: String(instance.idInstance ?? ''),
    messageId,
    chatId,
    chatName: text(sender.chatName),
    messageAt: new Date(timestamp * 1000).toISOString(),
    senderId,
    senderPhone: senderPhoneFromId(senderId),
    senderName: text(sender.senderContactName) ?? text(sender.senderName),
    caption: text(file.caption),
    isForwarded: file.isForwarded === true,
    fileUrl: fileUrl ?? '',
    fileName: messageType === 'documentMessage' ? text(file.fileName) : null,
    mimeType,
  };
}

function senderFields(receipt: IncomingReceipt) {
  return {
    sender_id: receipt.senderId,
    sender_phone: receipt.senderPhone,
    sender_name: receipt.senderName,
    caption: receipt.caption,
    is_forwarded: receipt.isForwarded,
    file_name: receipt.fileName,
    mime_type: receipt.mimeType,
  };
}

async function matchFamily(receipt: IncomingReceipt, deps: ReceiptDeps) {
  const suffix = receipt.senderPhone ? phoneSuffix(receipt.senderPhone) : null;
  if (!suffix) return { match_status: 'no_phone', family_id: null, family_match_count: 0 };
  try {
    const families = await deps.findFamilies(suffix);
    if (families.length === 1) return { match_status: 'matched', family_id: families[0], family_match_count: 1 };
    return { match_status: families.length ? 'multiple' : 'none', family_id: null, family_match_count: families.length };
  } catch {
    return { match_status: 'lookup_failed', family_id: null, family_match_count: null };
  }
}

export async function processIncomingReceipt(id: string, receipt: IncomingReceipt, deps: ReceiptDeps): Promise<Record<string, unknown>> {
  const failed = (error: string, extra: Record<string, unknown> = {}) => ({
    status: 'failed',
    ...senderFields(receipt),
    ...extra,
    error,
    processed_at: deps.now(),
  });

  if (!receipt.fileUrl) return failed('missing_download_url');

  let bytes: Uint8Array;
  try {
    bytes = await deps.download(receipt.fileUrl);
  } catch {
    return failed('download_failed');
  }

  const path = `${id}.${EXTENSIONS[receipt.mimeType]}`;
  const hash = await deps.sha256(bytes);

  let recognized: RecognizedReceipt;
  try {
    recognized = await deps.recognize(bytes, receipt.mimeType);
  } catch {
    // Чек нельзя терять из-за сбоя распознавания: файл остаётся для ручного разбора.
    try {
      await deps.storeFile(path, bytes, receipt.mimeType);
      return failed('ocr_failed', { storage_path: path, file_sha256: hash });
    } catch {
      return failed('ocr_and_storage_failed', { file_sha256: hash });
    }
  }

  // Сохраняется каждый файл: менеджер сам решает, чек это или нет.
  try {
    await deps.storeFile(path, bytes, receipt.mimeType);
  } catch {
    return failed('storage_failed', { file_sha256: hash, amount: recognized.amount, receipt_date: recognized.date });
  }

  // Без суммы, даты и номера операции файл уходит в «Другие файлы» и удаляется через 30 дней.
  const looksLikeReceipt = Boolean((recognized.amount && recognized.amount > 0) || recognized.date || recognized.receipt_code);
  if (!looksLikeReceipt) {
    return {
      status: 'other',
      ...senderFields(receipt),
      storage_path: path,
      file_sha256: hash,
      ...await matchFamily(receipt, deps),
      processed_at: deps.now(),
    };
  }

  let duplicate: ReceiptDuplicateMatch | null = null;
  let error: string | null = null;
  try {
    duplicate = await deps.findDuplicate({ hash, receipt: recognized });
  } catch {
    error = 'duplicate_check_failed';
  }

  return {
    status: 'recognized',
    ...senderFields(receipt),
    storage_path: path,
    file_sha256: hash,
    amount: recognized.amount,
    receipt_date: recognized.date,
    receipt_time: recognized.time,
    receipt_card_last4: recognized.card_last4,
    receipt_bank: recognized.bank,
    receipt_code: recognized.receipt_code,
    ...await matchFamily(receipt, deps),
    duplicate_payment_id: duplicate?.payment_id ?? null,
    duplicate_match_type: duplicate?.match_type ?? null,
    error,
    processed_at: deps.now(),
  };
}
