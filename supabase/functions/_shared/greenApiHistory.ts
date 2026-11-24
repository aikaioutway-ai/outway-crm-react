// @ts-ignore Deno requires explicit TypeScript extensions.
import { parseGreenApiReceipt, type IncomingReceipt } from './greenApiReceipt.ts';

export const HISTORY_COUNT = 10000;
export const HISTORY_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export function historyWeek(end: number) {
  if (!Number.isFinite(end)) throw new Error('Укажите корректный период загрузки');
  return { start: end - HISTORY_WEEK_MS, end };
}

export function historyPeriod(from: unknown, to: unknown) {
  const valid = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  };
  if (!valid(from) || !valid(to) || from > to) throw new Error('Укажите корректный период загрузки');
  // Даты в CRM относятся к Бишкеку, включая последний день целиком.
  return { start: Date.parse(`${from}T00:00:00+06:00`), end: Date.parse(`${to}T23:59:59.999+06:00`) };
}

export function parseHistoryReceipt(value: unknown, instanceId: string, chatId: string, chatName: string | null) {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const timestamp = Number(row.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > 8640000000000) return null;
  if (row.type !== 'incoming' || row.chatId !== chatId || row.isDeleted === true) return null;
  return parseGreenApiReceipt({
    typeWebhook: 'incomingMessageReceived', instanceData: { idInstance: instanceId },
    idMessage: row.idMessage, timestamp: row.timestamp,
    senderData: { chatId, chatName, sender: row.senderId, senderName: row.senderName, senderContactName: row.senderContactName },
    messageData: { typeMessage: row.typeMessage, fileMessageData: row },
  });
}

export function historyCandidates(rows: unknown[], instanceId: string, chatId: string, chatName: string | null, period: { start: number; end: number }) {
  return rows.map(row => parseHistoryReceipt(row, instanceId, chatId, chatName))
    .filter((receipt): receipt is IncomingReceipt => receipt !== null && Date.parse(receipt.messageAt) >= period.start && Date.parse(receipt.messageAt) <= period.end);
}
