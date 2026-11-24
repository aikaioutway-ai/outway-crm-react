import { supabase } from './supabase';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, isEmployeeSessionExpiredMessage } from './employeeSession';
import { createFamilyPayment } from './financeService';

export type IncomingReceiptFilter = 'review' | 'submitted' | 'duplicates' | 'other' | 'all';

/** Файлы без чека удаляются через это число дней после сообщения. */
export const OTHER_FILES_RETENTION_DAYS = 30;

export interface IncomingReceiptChild { name: string; school: string | null; transfer: number | null }

export interface IncomingReceiptRow {
  id: string;
  kind: 'review' | 'submitted' | 'duplicates' | 'other';
  status: 'received' | 'recognized' | 'other' | 'failed';
  chatName: string | null;
  messageAt: string;
  senderPhone: string | null;
  senderName: string | null;
  caption: string | null;
  fileName: string | null;
  mimeType: string | null;
  hasFile: boolean;
  amount: number | null;
  receiptDate: string | null;
  receiptTime: string | null;
  receiptCardLast4: string | null;
  receiptBank: string | null;
  receiptCode: string | null;
  matchStatus: string | null;
  familyMatchCount: number | null;
  familyId: string | null;
  parentName: string | null;
  children: IncomingReceiptChild[];
  duplicateFamilyId: string | null;
  paymentId: string | null;
  submittedBy: string | null;
  error: string | null;
  transferId: string | null;
  transferNumber: number | null;
}

export interface ReceiptCounts { review: number; duplicates: number; other: number; total: number }
export interface ReceiptSchoolSummary extends ReceiptCounts { key: string; transfers: number; linked: number }
export interface ReceiptTransferSummary extends ReceiptCounts {
  transferId: string;
  schoolKey: string;
  transferNumber: number | null;
  chatId: string | null;
  groupName: string | null;
}
export interface IncomingReceiptsSummary { schools: ReceiptSchoolSummary[]; transfers: ReceiptTransferSummary[]; unassigned: ReceiptCounts }
export interface WhatsappGroup { chatId: string; name: string | null; lastSeenAt: string; transferId: string | null; transferNumber: number | null }
/** Какие чеки показывать: все доступные, одного трансфера или из групп без трансфера. */
export type ReceiptScope = { transferId?: string; unassigned?: boolean; dateFrom?: string; dateTo?: string; schoolKey?: string };

export interface IncomingReceiptsPage {
  rows: IncomingReceiptRow[];
  counts: Record<IncomingReceiptFilter, number>;
  pageSize: number;
}

async function callApi<T>(sessionToken: string | undefined, body: Record<string, unknown>): Promise<T> {
  if (!sessionToken) throw new Error('Войдите в CRM, чтобы работать с чеками');
  const { data, error } = await supabase.functions.invoke(['groups', 'syncGroups', 'linkGroup', 'historyStatus', 'retryHistory'].includes(String(body.action)) ? 'whatsapp-groups-api' : 'incoming-receipts-api', { body, headers: { 'x-employee-session': sessionToken } });
  let message = '';
  if (error) {
    message = /failed to send a request|failed to fetch/i.test(error.message) ? 'Не удалось подключиться к серверу чеков. Проверьте интернет и повторите.' : error.message;
    try { message = (await error.context?.clone().json())?.error || message; } catch { /* ответ не JSON */ }
  } else if (!data?.ok) message = data?.error || 'Не удалось выполнить действие с чеком';
  if (message) {
    if (isEmployeeSessionExpiredMessage(message)) window.dispatchEvent(new Event(EMPLOYEE_SESSION_EXPIRED_EVENT));
    throw new Error(message);
  }
  return data as T;
}

function mapRow(row: any): IncomingReceiptRow {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    chatName: row.chat_name ?? null,
    messageAt: row.message_at,
    senderPhone: row.sender_phone ?? null,
    senderName: row.sender_name ?? null,
    caption: row.caption ?? null,
    fileName: row.file_name ?? null,
    mimeType: row.mime_type ?? null,
    hasFile: Boolean(row.has_file),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    receiptDate: row.receipt_date ?? null,
    receiptTime: row.receipt_time ?? null,
    receiptCardLast4: row.receipt_card_last4 ?? null,
    receiptBank: row.receipt_bank ?? null,
    receiptCode: row.receipt_code ?? null,
    matchStatus: row.match_status ?? null,
    familyMatchCount: row.family_match_count ?? null,
    familyId: row.family_id ?? null,
    parentName: row.parent_name ?? null,
    children: row.children ?? [],
    duplicateFamilyId: row.duplicate_family_id ?? null,
    paymentId: row.payment_id ?? null,
    submittedBy: row.submitted_by ?? null,
    error: row.error ?? null,
    transferId: row.transfer_id ?? null,
    transferNumber: row.transfer_number ?? null,
  };
}

const counts = (row: any): ReceiptCounts => ({
  review: Number(row?.review ?? 0), duplicates: Number(row?.duplicates ?? 0), other: Number(row?.other ?? 0), total: Number(row?.total ?? 0),
});

export async function fetchIncomingReceiptsSummary(sessionToken: string | undefined, dates?: { dateFrom?: string; dateTo?: string }): Promise<IncomingReceiptsSummary> {
  const data = await callApi<{ schools: any[]; transfers: any[]; unassigned: any }>(sessionToken, { action: 'summary', ...dates });
  return {
    schools: data.schools.map(row => ({ ...counts(row), key: row.key, transfers: Number(row.transfers), linked: Number(row.linked) })),
    transfers: data.transfers.map(row => ({
      ...counts(row),
      transferId: row.transfer_id,
      schoolKey: row.school_key,
      transferNumber: row.transfer_number ?? null,
      chatId: row.chat_id ?? null,
      groupName: row.group_name ?? null,
    })),
    unassigned: counts(data.unassigned),
  };
}

export async function fetchWhatsappGroups(sessionToken: string | undefined, inviteLink?: string): Promise<WhatsappGroup[]> {
  return (await callApi<{ groups: WhatsappGroup[] }>(sessionToken, { action: 'groups', ...(inviteLink ? { inviteLink } : {}) })).groups;
}

export async function syncWhatsappGroups(sessionToken: string | undefined): Promise<number> {
  return (await callApi<{ count: number }>(sessionToken, { action: 'syncGroups' })).count;
}

export type ReceiptHistoryRequest = { transferId: string; chatId: string; dateFrom: string; dateTo: string };
export type ReceiptHistoryJob = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  position: number; total: number; scanned: number; imported: number; existing: number;
  other: number; failed: number; limited: boolean; error: string | null;
};
export async function fetchReceiptHistoryStatus(sessionToken: string | undefined, transferId: string, chatId: string): Promise<ReceiptHistoryJob | null> {
  return (await callApi<{ job: ReceiptHistoryJob | null }>(sessionToken, { action: 'historyStatus', transferId, chatId })).job;
}
export async function retryReceiptHistory(sessionToken: string | undefined, transferId: string, chatId: string): Promise<void> {
  await callApi(sessionToken, { action: 'retryHistory', transferId, chatId });
}
export async function fetchReceiptHistory(sessionToken: string | undefined, params: ReceiptHistoryRequest): Promise<{ messageIds: string[]; scanned: number; limited: boolean }> {
  return callApi(sessionToken, { action: 'history', ...params });
}

export async function importReceiptHistoryFile(sessionToken: string | undefined, params: ReceiptHistoryRequest, messageId: string): Promise<'imported' | 'existing' | 'other' | 'failed'> {
  return (await callApi<{ result: 'imported' | 'existing' | 'other' | 'failed' }>(sessionToken, { action: 'importHistoryFile', ...params, messageId })).result;
}

/** Привязывает группу WhatsApp к трансферу; null — отвязать. */
export async function linkTransferGroup(sessionToken: string | undefined, transferId: string, chatId: string | null): Promise<void> {
  await callApi(sessionToken, { action: 'linkGroup', transferId, chatId });
}

export async function fetchIncomingReceipts(sessionToken: string | undefined, params: { filter: IncomingReceiptFilter; search: string; page: number } & ReceiptScope): Promise<IncomingReceiptsPage> {
  const data = await callApi<{ rows: any[]; counts: IncomingReceiptsPage['counts']; pageSize: number }>(sessionToken, { action: 'list', ...params });
  return { rows: data.rows.map(mapRow), counts: data.counts, pageSize: data.pageSize };
}

export async function fetchIncomingReceiptFileUrl(sessionToken: string | undefined, id: string): Promise<string> {
  return (await callApi<{ url: string }>(sessionToken, { action: 'fileUrl', id })).url;
}

export async function updateIncomingReceipt(sessionToken: string | undefined, id: string, changes: { familyId?: string; amount: number; receiptDate: string }): Promise<void> {
  await callApi(sessionToken, { action: 'update', id, ...changes });
}

/** «Не чек»: убирает файл из списка, сам файл удалится через 30 дней. */
export async function dismissIncomingReceipt(sessionToken: string | undefined, id: string): Promise<void> {
  await callApi(sessionToken, { action: 'dismiss', id });
}

/** Удаляет файл и запись навсегда, без 30 дней ожидания. Только руководство. */
export async function deleteIncomingReceipt(sessionToken: string | undefined, id: string): Promise<void> {
  await callApi(sessionToken, { action: 'delete', id });
}

export function canSubmitIncomingReceipt(receipt: IncomingReceiptRow): boolean {
  return receipt.kind === 'review' && receipt.status === 'recognized' && receipt.hasFile
    && Boolean(receipt.familyId && receipt.amount && receipt.receiptDate);
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

/** Создаёт платёж «На проверке» той же функцией, что и карточка семьи, включая проверку дублей. */
export async function submitIncomingReceipt(sessionToken: string | undefined, receipt: IncomingReceiptRow, createdBy?: string): Promise<void> {
  if (!canSubmitIncomingReceipt(receipt)) throw new Error('Заполните семью, сумму и дату чека');
  const response = await fetch(await fetchIncomingReceiptFileUrl(sessionToken, receipt.id));
  if (!response.ok) throw new Error('Не удалось получить файл чека');
  const mimeType = receipt.mimeType ?? 'image/jpeg';
  const file = new File([await response.blob()], receipt.fileName || `${receipt.id}.${EXTENSIONS[mimeType] ?? 'jpg'}`, { type: mimeType });
  const time = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(receipt.receiptTime ?? '') ? receipt.receiptTime! : '';
  const cardLast4 = /^\d{4}$/.test(receipt.receiptCardLast4 ?? '') ? receipt.receiptCardLast4! : '';
  const comment = ['Чек из WhatsApp', receipt.chatName, receipt.caption].filter(Boolean).join(' · ');

  let paymentId: string;
  try {
    const payment = await createFamilyPayment({
      familyId: receipt.familyId!,
      amount: receipt.amount!,
      paymentType: 'transfer',
      paymentDate: receipt.receiptDate!,
      receiptFile: file,
      receiptCode: receipt.receiptCode ?? undefined,
      receiptDetails: { time, cardLast4, bank: receipt.receiptBank ?? '' },
      comment,
      createdBy,
    });
    paymentId = payment.id;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Дубль чека')) {
      await callApi(sessionToken, { action: 'recheckDuplicate', id: receipt.id }).catch(() => undefined);
    }
    throw error;
  }
  await callApi(sessionToken, { action: 'markSubmitted', id: receipt.id, paymentId });
}
