export function normalizeReceiptOcrResult(parsed: Record<string, unknown>) {
  let code = typeof parsed.receipt_code==='string' ? parsed.receipt_code : null;
  // Убираем префикс времени вида "21:03:38/" если есть
  if (code) code = code.replace(/^\d{2}:\d{2}:\d{2}\//, '');
  // QR_/MBIZ_S_ без номера операции — выдуманный или обрезанный код (QR_OsOO_AiKai_Group, QR_452)
  if (code && /^\s*(QR_|MBIZ_S_)/i.test(code) && code.replace(/\D/g, '').length < 8) code = null;
  return {
    receipt_code: code,
    time: typeof parsed.time==='string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(parsed.time) ? parsed.time : null,
    card_last4: typeof parsed.card_last4==='string' && /^\d{4}$/.test(parsed.card_last4) ? parsed.card_last4 : null,
    bank: typeof parsed.bank==='string' ? parsed.bank.trim() || null : null,
    amount: parsed.amount != null && Number.isFinite(Number(parsed.amount)) ? Number(parsed.amount) : null,
    date: typeof parsed.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
  };
}
