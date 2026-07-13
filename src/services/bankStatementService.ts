import * as XLSX from 'xlsx';
import { supabase } from './supabase';

export interface BankStatementRow {
  receipt_code: string;
  amount: number;
  statement_date: string; // YYYY-MM-DD
  raw_row?: Record<string, string>;
}

export interface BankStatementEntry {
  id: string;
  receipt_code: string;
  amount: number;
  statement_date: string;
  matched_payment_id: string | null;
  match_status: 'unmatched' | 'matched' | 'conflict' | 'manual';
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface UploadResult {
  inserted: number;   // новые строки добавлены
  skipped: number;    // дубли пропущены
  matched: number;    // совпали с платежом
  conflicts: number;  // расхождение суммы
  retriggered: number; // старые unmatched которые теперь совпали
}

export async function uploadBankStatement(
  rows: BankStatementRow[],
  uploadedBy: string,
): Promise<UploadResult> {
  if (!rows.length) return { inserted: 0, skipped: 0, matched: 0, conflicts: 0, retriggered: 0 };

  // ШАГ 1: Получаем все уже существующие коды из БД
  const incomingCodes = rows.map(r => r.receipt_code.trim());
  const { data: existing } = await supabase
    .from('bank_statements')
    .select('receipt_code')
    .in('receipt_code', incomingCodes);

  const existingCodes = new Set((existing ?? []).map((e: any) => e.receipt_code));

  // ШАГ 2: Фильтруем — берём только новые (дубли пропускаем)
  const newRows = rows.filter(r => !existingCodes.has(r.receipt_code.trim()));
  const skipped = rows.length - newRows.length;

  let inserted = 0;
  let matched = 0;
  let conflicts = 0;

  if (newRows.length > 0) {
    const insertData = newRows.map(r => ({
      receipt_code: r.receipt_code.trim(),
      amount: r.amount,
      statement_date: r.statement_date,
      uploaded_by: uploadedBy,
      raw_row: r.raw_row ?? null,
      match_status: 'unmatched',
    }));

    const { data: insertedRows, error } = await supabase
      .from('bank_statements')
      .insert(insertData)
      .select('id, receipt_code, amount, statement_date');

    if (error) throw new Error(error.message);
    inserted = (insertedRows ?? []).length;

    // ШАГ 3: Сверяем новые строки с платежами CRM
    for (const entry of insertedRows ?? []) {
      const result = await reconcileEntry(entry.id, entry.receipt_code, entry.amount, entry.statement_date);
      if (result === 'matched') matched++;
      if (result === 'conflict') conflicts++;
    }
  }

  // ШАГ 4: Ретросверка — перепроверяем старые unmatched строки
  // (вдруг менеджер только что добавил чек с кодом из старой выписки)
  const retriggered = await reconcileAllUnmatched();

  return { inserted, skipped, matched, conflicts, retriggered };
}

// Экранируем спецсимволы ilike (% и _), чтобы код чека не трактовался как маска
function escapeLikePattern(value: string): string {
  return value.replace(/[%_]/g, ch => `\\${ch}`);
}

// Сверяет одну строку выписки с платежами CRM
async function reconcileEntry(
  entryId: string,
  receiptCode: string,
  bankAmount: number,
  statementDate: string,
): Promise<'matched' | 'conflict' | 'unmatched'> {
  const { data: payments, error } = await supabase
    .from('v2_payments')
    .select('id, amount, status')
    .ilike('receipt_code', `%${escapeLikePattern(receiptCode)}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !payments?.length) return 'unmatched';

  // Если код совпал с несколькими платежами — предпочитаем тот, у которого
  // совпадает и сумма, а не первый попавшийся без сортировки
  const payment = payments.find(p => Math.abs(Number(p.amount) - bankAmount) < 1) ?? payments[0];
  const amountsMatch = Math.abs(Number(payment.amount) - bankAmount) < 1;

  if (amountsMatch) {
    await supabase
      .from('bank_statements')
      .update({ match_status: 'matched', matched_payment_id: payment.id })
      .eq('id', entryId);

    if (payment.status !== 'confirmed') {
      await supabase
        .from('v2_payments')
        .update({ actual_payment_date: statementDate })
        .eq('id', payment.id);
    }
    return 'matched';
  } else {
    await supabase
      .from('bank_statements')
      .update({ match_status: 'conflict', matched_payment_id: payment.id })
      .eq('id', entryId);
    return 'conflict';
  }
}

// Ретросверка: перепроверяет все unmatched строки
// Запускается при каждой загрузке выписки
async function reconcileAllUnmatched(): Promise<number> {
  const { data: unmatched } = await supabase
    .from('bank_statements')
    .select('id, receipt_code, amount, statement_date')
    .eq('match_status', 'unmatched');

  if (!unmatched?.length) return 0;

  // Сверяем пачками, а не по одной записи последовательно — иначе загрузка
  // выписки замедляется линейно с ростом числа накопленных unmatched строк
  const BATCH_SIZE = 8;
  let count = 0;
  for (let i = 0; i < unmatched.length; i += BATCH_SIZE) {
    const batch = unmatched.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(entry => reconcileEntry(entry.id, entry.receipt_code, entry.amount, entry.statement_date)),
    );
    count += results.filter(result => result === 'matched' || result === 'conflict').length;
  }
  return count;
}

export async function fetchBankStatements(filter?: {
  match_status?: BankStatementEntry['match_status'];
  limit?: number;
}): Promise<BankStatementEntry[]> {
  let query = supabase
    .from('bank_statements')
    .select('*')
    .order('uploaded_at', { ascending: false });

  if (filter?.match_status) query = query.eq('match_status', filter.match_status);
  if (filter?.limit) query = query.limit(filter.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as BankStatementEntry[];
}

export async function manualMatchStatement(entryId: string, paymentId: string): Promise<void> {
  await supabase
    .from('bank_statements')
    .update({ match_status: 'manual', matched_payment_id: paymentId })
    .eq('id', entryId);
}

export function parseBankCsv(text: string): BankStatementRow[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

  const codeCol = headers.findIndex(h =>
    h.includes('код') || h.includes('номер') || h.includes('transaction') || h.includes('ref') || h.includes('id')
  );
  const amountCol = headers.findIndex(h =>
    h.includes('сумма') || h.includes('amount') || h.includes('sum')
  );
  const dateCol = headers.findIndex(h =>
    h.includes('дата') || h.includes('date')
  );

  if (codeCol === -1 || amountCol === -1 || dateCol === -1) {
    throw new Error(
      `Не найдены колонки. Нужны: код транзакции, сумма, дата.\nНайдены заголовки: ${headers.join(', ')}`
    );
  }

  const rows: BankStatementRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    const receipt_code = cols[codeCol];
    const rawAmount = cols[amountCol].replace(/\s/g, '').replace(',', '.');
    const amount = parseFloat(rawAmount);
    const statement_date = normalizeDate(cols[dateCol]);

    if (!receipt_code || isNaN(amount) || !statement_date) continue;

    const raw_row: Record<string, string> = {};
    headers.forEach((h, idx) => { raw_row[h] = cols[idx] ?? ''; });

    rows.push({ receipt_code, amount, statement_date, raw_row });
  }

  return rows;
}

// Парсит Excel-выписку ДемирБанка:
// Колонки: Документ | Дата операции | Оборот Кт | Назначение платежа
// Код транзакции извлекается из "Назначение платежа" по шаблону MBIZ_S_xxxxx
export function parseBankXlsx(buffer: ArrayBuffer): BankStatementRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as any[][];

  if (raw.length < 2) return [];

  // Найти индексы колонок по заголовкам
  const headers = raw[0].map((h: any) => String(h).toLowerCase().trim());
  const dateCol   = headers.findIndex(h => h.includes('дата'));
  const amountCol = headers.findIndex(h => h.includes('оборот') || h.includes('кт') || h.includes('amount') || h.includes('сумма'));
  const descCol   = headers.findIndex(h => h.includes('назначение') || h.includes('описание') || h.includes('description'));

  if (amountCol === -1 || descCol === -1) {
    throw new Error(
      `Не найдены нужные колонки в Excel.\nНайдены: ${headers.join(', ')}\nОжидаются: "Дата операции", "Оборот Кт", "Назначение платежа"`
    );
  }

  const rows: BankStatementRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const desc   = String(row[descCol] ?? '');
    const rawAmt = String(row[amountCol] ?? '').replace(/\s/g, '').replace(',', '.');
    const amount = parseFloat(rawAmt);

    if (!desc || isNaN(amount) || amount <= 0) continue;

    // MBIZ_MBANK — банковский перевод без QR кода, пропускаем
    if (desc.startsWith('MBIZ_MBANK')) continue;
    // Извлекаем последние 12 hex-символов из любого QR кода в описании
    // Все форматы (QR_452, QR_130, MBIZ-uuid, MBIZ_S_uuid) заканчиваются уникальным 12-символьным хвостом
    const tailMatch = desc.match(/([0-9a-f]{12})(?=[.\s]|$)/i);
    if (!tailMatch) continue;
    const receipt_code = tailMatch[1];

    // Дата
    let statement_date: string | null = null;
    if (dateCol !== -1 && row[dateCol]) {
      const rawDate = row[dateCol];
      if (rawDate instanceof Date) {
        statement_date = rawDate.toISOString().slice(0, 10);
      } else {
        statement_date = normalizeDate(String(rawDate));
      }
    }
    if (!statement_date) continue;

    const raw_row: Record<string, string> = {};
    headers.forEach((h, idx) => { raw_row[h] = String(row[idx] ?? ''); });

    rows.push({ receipt_code, amount, statement_date, raw_row });
  }

  return rows;
}

// Правильный парсинг CSV строки — учитывает кавычки со значениями внутри
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeDate(raw: string): string | null {
  const clean = raw.trim();
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dotMatch = clean.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotMatch) return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
  const slashMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
  return null;
}
