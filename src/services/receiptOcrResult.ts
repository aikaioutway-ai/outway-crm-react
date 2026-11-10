const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// mbiz:XXXXXXXX:XXXXXXXX — код QR-а АйКай Груп, он одинаковый во всех чеках, это не номер операции.
const SHARED_QR_CODE = /(?:mbiz:)?\d{8}:\d{8}/gi;
const COMPANY_ACCOUNT = '1033820000256673';

// Код чека должен совпадать с тем, что банк пишет в выписке Мбанка:
// клиент Мбанка — "MBIZ_S_<ID>/QR_452 <ID>", клиент другого банка — ID операции его банка (UUID).
export function normalizeReceiptCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().replace(/^\d{2}:\d{2}:\d{2}\//, '');
  // Длинный код переносится на новую строку ("MBI / Z_S_…", "…-93 / dc-…"), OCR вставляет пробел.
  const compact = code.replace(/\s+/g, '');

  const mbiz = compact.match(new RegExp(`S_(${UUID})`, 'i'))?.[1];
  const qr = compact.match(new RegExp(`(?<![0-9a-f])452[_-]?(${UUID})`, 'i'))?.[1];
  if (mbiz || qr) {
    return [mbiz && `MBIZ_S_${mbiz.toLowerCase()}`, qr && `QR_452 ${qr.toLowerCase()}`].filter(Boolean).join('/');
  }

  const id = compact.match(new RegExp(UUID, 'i'))?.[0];
  if (id) return id.toLowerCase();

  const rest = code.replace(SHARED_QR_CODE, '').replace(COMPANY_ACCOUNT, '').replace(/^[\s,:;/-]+|[\s,:;/-]+$/g, '');
  // Без номера операции (только название получателя, 4 цифры карты, обрезанный QR_452) — кода нет.
  if (rest.replace(/\D/g, '').length < 6) return null;
  if (/^\s*(QR_|MBIZ_S_)/i.test(rest) && rest.replace(/\D/g, '').length < 8) return null;
  return rest;
}

export function normalizeReceiptOcrResult(parsed: Record<string, unknown>) {
  return {
    receipt_code: normalizeReceiptCode(parsed.receipt_code),
    time: typeof parsed.time==='string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(parsed.time) ? parsed.time : null,
    card_last4: typeof parsed.card_last4==='string' && /^\d{4}$/.test(parsed.card_last4) ? parsed.card_last4 : null,
    bank: typeof parsed.bank==='string' ? parsed.bank.trim() || null : null,
    amount: parsed.amount != null && Number.isFinite(Number(parsed.amount)) ? Number(parsed.amount) : null,
    date: typeof parsed.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
  };
}
