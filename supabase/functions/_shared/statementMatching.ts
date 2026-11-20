// Правила сверки банковской выписки с платежами CRM. Один файл на браузер (src) и сервер
// (функция statement-api), чтобы правила не разошлись. Файл без внешних зависимостей.

export type StatementCell = { label: string; value: string };
export type StatementEntry = {
  number: number;
  document: string;
  amount: number;
  codes: string[];
  postingDate: string;
  operationDate?: string;
  time?: string;
  source?: StatementCell[];
};
// Поля платежа CRM, по которым идёт сопоставление.
export type MatchPayment = {
  id: string;
  amount: number;
  receiptCode?: string;
  receiptTime?: string;
  paymentDate: string;
  actualPaymentDate?: string;
};

// 32 hex-символа ID; OCR иногда теряет дефисы внутри, поэтому дефисы необязательны.
const UUID = '(?:[0-9a-f]-?){31}[0-9a-f](?![0-9a-f])';
function formatId(value: string) {
  const hex = value.replace(/-/g, '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
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
    return [mbiz && `MBIZ_S_${formatId(mbiz)}`, qr && `QR_452 ${formatId(qr)}`].filter(Boolean).join('/');
  }

  // Сплошные 32 символа без дефисов (например «Чек» О!Деньги) — это не ID операции формата xxxxxxxx-…, не трогаем.
  const id = compact.match(new RegExp(`(?<![0-9a-f])${UUID}`, 'i'))?.[0];
  if (id?.includes('-')) return formatId(id);

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

// ID операций в строке выписки: у клиента Мбанка — MBIZ_S_<ID>/QR_452 <ID>,
// у клиента другого банка — ID операции его банка и QR_130 <ID>. Сравниваем по самим ID, без префиксов.
export function codes(text: string) {
  return Array.from(new Set(Array.from(text.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi),
    ([code]) => code.toLowerCase().replace(/-/g, ''))));
}

export function entryCodes(entry: StatementEntry) {
  const purpose = entry.source?.find(cell => cell.label === 'Назначение платежа')?.value;
  // Выписки, сохранённые до этого правила, хранят коды с префиксом mbiz_s_/qr_452.
  return purpose ? codes(purpose) : entry.codes.map(code => code.replace(/^(?:mbiz_s_|qr_452)/, ''));
}

// Дата оплаты в чеке — это дата операции. После подтверждения кассир ставит дату поступления,
// а она по умолчанию равна дате проводки в выписке, поэтому подходят обе.
function sameDate(entry: StatementEntry, payment: MatchPayment) {
  return [entry.operationDate ?? entry.postingDate, entry.postingDate].includes(payment.actualPaymentDate ?? payment.paymentDate);
}

function minutes(time?: string) {
  const [hours, mins, seconds = 0] = time?.split(':').map(Number) ?? [];
  return hours == null || mins == null ? null : hours * 60 + mins + seconds / 60;
}

// Чек показывает время с точностью до минуты, а часы банков расходятся на минуту-две.
function sameTime(entry: StatementEntry, payment: MatchPayment) {
  const entryTime = minutes(entry.time);
  const receiptTime = minutes(payment.receiptTime);
  return entryTime != null && receiptTime != null && Math.abs(entryTime - receiptTime) <= 3;
}

// Одна и та же банковская операция из пересекающихся выписок даёт один и тот же ключ.
export function entryKey(entry: StatementEntry) {
  const purpose = entry.source?.find(cell => cell.label === 'Назначение платежа')?.value ?? entry.codes.join(',');
  return [entry.document.replace(/\s+/g, ' '), entry.postingDate, entry.amount, purpose].join('|');
}

// Платежи CRM берём за все даты выписок: и дату операции, и дату проводки.
export function paymentRange(entries: StatementEntry[]) {
  const dates = entries.flatMap(entry => [entry.operationDate ?? entry.postingDate, entry.postingDate]).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

// Повторно загруженные выписки пересекаются (например, 7–10 и 10–15 число): одинаковые строки берём один раз.
export function mergeStatements(statements: Array<{ entries: StatementEntry[] }>): StatementEntry[] {
  const seen = new Set<string>();
  const merged: StatementEntry[] = [];
  for (const statement of statements) {
    for (const entry of statement.entries) {
      const key = entryKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...entry, number: merged.length + 1 });
    }
  }
  return merged;
}

// 1 — есть: код и сумма совпали; 2 — частично: код совпал, а сумма нет, или совпали только сумма и дата;
// Д — дубли: один и тот же чек привязан к нескольким платежам CRM, подтверждать можно только один; Х — нет.
export function reconcileBankStatement<T extends MatchPayment>(entries: StatementEntry[], payments: T[]) {
  const byCode = new Map<string, Array<{ payment: T; codes: string[] }>>();
  for (const payment of payments) {
    const item = { payment, codes: codes(normalizeReceiptCode(payment.receiptCode) ?? payment.receiptCode ?? '') };
    for (const code of item.codes) byCode.set(code, [...(byCode.get(code) ?? []), item]);
  }
  const byAmount = new Map<number, T[]>();
  for (const payment of payments) byAmount.set(payment.amount, [...(byAmount.get(payment.amount) ?? []), payment]);
  const statementCodes = entries.map(entryCodes);
  const exact = statementCodes.map(list => Array.from(new Set(list.flatMap(code => byCode.get(code) ?? []))));
  const claimed = new Set(exact.flatMap(matches => matches.map(({ payment }) => payment.id)));
  // Сумма и дата: каждый платёж CRM достаётся только одной строке выписки, иначе один и тот же чек
  // повторяется во всех поступлениях с той же суммой за день. Сначала пары, где совпало время чека
  // (ближайшее первым), потом остальные: дата операции важнее даты проводки, затем ближе по времени.
  const pairs: Array<{ index: number; payment: T; rank: number; distance: number }> = [];
  entries.forEach((entry, index) => {
    if (exact[index].length) return;
    for (const payment of byAmount.get(entry.amount) ?? []) {
      if (claimed.has(payment.id) || !sameDate(entry, payment)) continue;
      const entryTime = minutes(entry.time);
      const receiptTime = minutes(payment.receiptTime);
      const gap = entryTime != null && receiptTime != null ? Math.abs(entryTime - receiptTime) : Infinity;
      const operationDay = (payment.actualPaymentDate ?? payment.paymentDate) === (entry.operationDate ?? entry.postingDate);
      pairs.push({ index, payment, rank: sameTime(entry, payment) ? 0 : operationDay ? 1 : 2, distance: gap });
    }
  });
  pairs.sort((a, b) => a.rank - b.rank || a.distance - b.distance || a.index - b.index);
  const byAmountAndDate = new Map<number, T>();
  const taken = new Set<string>();
  const owner = new Map<string, number>();
  const locked = new Set<number>();
  for (const pair of pairs) {
    if (byAmountAndDate.has(pair.index) || taken.has(pair.payment.id)) continue;
    byAmountAndDate.set(pair.index, pair.payment);
    taken.add(pair.payment.id);
    owner.set(pair.payment.id, pair.index);
    if (pair.rank === 0) locked.add(pair.index);
  }
  // Строка без пары может забрать платёж у соседней, если той достанется другой подходящий платёж:
  // так в пары попадает как можно больше поступлений. Пары с совпавшим временем не переставляем.
  const options = new Map<number, T[]>();
  for (const pair of pairs) options.set(pair.index, [...(options.get(pair.index) ?? []), pair.payment]);
  const reassign = (index: number, seen: Set<string>): boolean => {
    for (const payment of options.get(index) ?? []) {
      if (seen.has(payment.id)) continue;
      seen.add(payment.id);
      const current = owner.get(payment.id);
      if (current === undefined || (!locked.has(current) && reassign(current, seen))) {
        owner.set(payment.id, index);
        byAmountAndDate.set(index, payment);
        return true;
      }
    }
    return false;
  };
  for (const index of Array.from(options.keys())) if (!byAmountAndDate.has(index)) reassign(index, new Set());
  return entries.map((entry, index) => {
    const matches = exact[index];
    const sameAmount = matches.filter(({ payment }) => payment.amount === entry.amount);
    const matching = sameAmount.length ? sameAmount : matches;
    if (matching.length) {
      return {
        entry, group: matching.length > 1 ? 'Д' as const : sameAmount.length ? '1' as const : '2' as const,
        candidates: matching.map(({ payment }) => payment),
        matchingCodes: statementCodes[index].filter(code => matching.some(item => item.codes.includes(code))),
      };
    }
    const paired = byAmountAndDate.get(index);
    const candidates = paired ? [paired] : [];
    return { entry, group: candidates.length ? '2' as const : 'Х' as const, candidates, matchingCodes: [] as string[] };
  });
}
