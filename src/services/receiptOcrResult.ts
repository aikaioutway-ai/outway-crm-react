export { normalizeReceiptCode } from '../../supabase/functions/_shared/statementMatching';
import { normalizeReceiptCode } from '../../supabase/functions/_shared/statementMatching';

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
