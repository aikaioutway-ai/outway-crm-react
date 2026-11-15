import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { entryKey, paymentRange, reconcileBankStatement, type StatementEntry } from '../_shared/statementMatching.ts';

// Выписки банка для «Сверки платежей»: общие для всех, кому открыта сверка
// (кассир и руководство без ограничения по школам).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin', 'gen_director', 'director', 'cashier']);
const MAX_ENTRIES = 20000;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session, x-reconcile-token',
};

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

async function verifySession(token: string): Promise<{ sub: string; role: string } | null> {
  try {
    const [payloadPart, signaturePart, extra] = token.split('.');
    if (!payloadPart || !signaturePart || extra) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
    if (!payload?.sub || !payload?.role || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return { sub: String(payload.sub), role: String(payload.role) };
  } catch {
    return null;
  }
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validEntry(entry: any) {
  return entry && typeof entry === 'object' && isDate(entry.postingDate) &&
    typeof entry.document === 'string' && Number.isFinite(Number(entry.amount)) && Array.isArray(entry.codes);
}

function toStatement(row: any) {
  return {
    id: row.id, name: row.file_name, uploadedMonth: row.uploaded_month ?? undefined,
    range: { from: row.range_from, to: row.range_to }, entries: row.entries,
    uploadedByName: row.uploaded_by_name ?? undefined, createdAt: row.created_at,
  };
}

const COLUMNS = 'id,file_name,uploaded_month,range_from,range_to,entries,uploaded_by_name,created_at';
const META_COLUMNS = 'id,file_name,uploaded_month,range_from,range_to,uploaded_by_name,created_at';
const PAYMENT_COLUMNS = 'id,family_id,amount,payment_method,payment_order_number,receipt_url,receipt_code,receipt_time,' +
  'receipt_card_last4,receipt_bank,payment_date,actual_payment_date,status,submitted_by,reviewed_by,reviewed_at,comment,' +
  'cashier_comment,created_at,family:v2_families(parent_name)';
const ENTRY_COLUMNS = 'id,document,amount,posting_date,operation_date,op_time,codes,source';
const GROUPS = new Set(['1', '2', 'Д', 'Х', 'missing']);
const PAGE = 1000;

async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function insertChunks(db: SupabaseClient, table: string, rows: Record<string, unknown>[], upsert = false) {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const { error } = upsert
      ? await db.from(table).upsert(chunk, { onConflict: 'entry_key', ignoreDuplicates: true })
      : await db.from(table).insert(chunk);
    if (error) throw error;
  }
}

// Каждая банковская операция — отдельная строка; повтор из пересекающейся выписки отбрасывается по ключу.
async function storeEntries(db: SupabaseClient, statementId: string, entries: StatementEntry[]) {
  await insertChunks(db, 'v2_bank_statement_entries', entries.map(entry => ({
    entry_key: entryKey(entry), statement_id: statementId, document: entry.document, amount: Number(entry.amount),
    posting_date: entry.postingDate, operation_date: isDate(entry.operationDate) ? entry.operationDate : null,
    op_time: entry.time ?? null, codes: entry.codes ?? [], source: entry.source ?? null,
  })), true);
}

// Пересобрать строки из всех файлов выписок: нужно после удаления файла (общие строки
// с другими выписками удалились вместе с ним) и для первичного переноса.
async function storeAllEntries(db: SupabaseClient) {
  const statements = await selectAll<{ id: string; entries: StatementEntry[] }>((from, to) =>
    db.from('v2_bank_statements').select('id,entries').order('created_at', { ascending: false }).range(from, to));
  for (const statement of statements) await storeEntries(db, statement.id, statement.entries);
}

function toEntry(row: any, index: number): StatementEntry & { id: string } {
  return {
    id: row.id, number: index + 1, document: row.document, amount: Number(row.amount), codes: row.codes ?? [],
    postingDate: row.posting_date, operationDate: row.operation_date ?? undefined, time: row.op_time ?? undefined,
    source: row.source ?? undefined,
  };
}

// Сверка всех строк выписок с платежами CRM переводом. Результат — новый прогон;
// экран читает последний завершённый, старые прогоны удаляются.
async function reconcile(db: SupabaseClient, trigger: string) {
  const { data: run, error: runError } = await db.from('v2_reconciliation_runs').insert({ trigger }).select('id').single();
  if (runError) throw runError;
  try {
    const entries = (await selectAll<any>((from, to) => db.from('v2_bank_statement_entries').select(ENTRY_COLUMNS)
      .order('posting_date').order('op_time', { nullsFirst: true }).order('document').order('id').range(from, to))).map(toEntry);
    const range = entries.length ? paymentRange(entries) : null;
    const payments = range ? await selectAll<any>((from, to) => db.from('v2_payments')
      .select('id,amount,status,receipt_code,receipt_time,payment_date,actual_payment_date,created_at')
      .in('status', ['pending', 'confirmed']).eq('payment_method', 'transfer')
      .or(`and(payment_date.gte.${range.from},payment_date.lte.${range.to}),and(actual_payment_date.gte.${range.from},actual_payment_date.lte.${range.to})`)
      .order('id').range(from, to)) : [];
    const matchPayments = payments.map(row => ({
      id: String(row.id), amount: Number(row.amount ?? 0), status: row.status as string,
      receiptCode: row.receipt_code ?? undefined, receiptTime: row.receipt_time ?? undefined,
      paymentDate: String(row.payment_date ?? row.created_at ?? ''),
      actualPaymentDate: row.actual_payment_date ? String(row.actual_payment_date) : undefined,
    }));
    const results = reconcileBankStatement(entries, matchPayments);
    const rows: Record<string, unknown>[] = [];
    const matched = new Set<string>();
    results.forEach((result, ord) => {
      const entryId = (result.entry as { id: string }).id;
      // У всех строк одинаковый набор полей: иначе пачка вставки ставит null вместо значения по умолчанию.
      if (!result.candidates.length) rows.push({ run_id: run.id, grp: result.group, entry_id: entryId, payment_id: null,
        payment_status: null, matching_codes: [], ord });
      for (const payment of result.candidates) {
        matched.add(payment.id);
        rows.push({ run_id: run.id, grp: result.group, entry_id: entryId, payment_id: payment.id,
          payment_status: payment.status, matching_codes: result.matchingCodes, ord });
      }
    });
    for (const payment of matchPayments) {
      if (!matched.has(payment.id)) rows.push({ run_id: run.id, grp: 'missing', entry_id: null, payment_id: payment.id,
        payment_status: payment.status, matching_codes: [], ord: rows.length });
    }
    await insertChunks(db, 'v2_reconciliation_results', rows);
    const finishedAt = new Date().toISOString();
    const { error } = await db.from('v2_reconciliation_runs').update({
      finished_at: finishedAt, range_from: range?.from ?? null, range_to: range?.to ?? null,
      entries_count: entries.length, payments_count: payments.length,
    }).eq('id', run.id);
    if (error) throw error;
    await db.from('v2_reconciliation_runs').delete().lt('finished_at', finishedAt);
    await db.from('v2_reconciliation_runs').delete().is('finished_at', null).lt('started_at', new Date(Date.now() - 3600_000).toISOString());
  } catch (error) {
    await db.from('v2_reconciliation_runs').update({ error: String((error as Error)?.message ?? error).slice(0, 500) }).eq('id', run.id);
    throw error;
  }
}

async function latestRun(db: SupabaseClient) {
  const { data, error } = await db.from('v2_reconciliation_runs').select('id,finished_at,range_from,range_to,entries_count')
    .not('finished_at', 'is', null).is('error', null).order('finished_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// Счётчики групп и список файлов — без самих строк, это маленький ответ.
async function summary(db: SupabaseClient) {
  const [run, statements] = await Promise.all([
    latestRun(db),
    db.from('v2_bank_statements').select(META_COLUMNS).order('created_at', { ascending: false }),
  ]);
  if (statements.error) throw statements.error;
  const counts: Record<string, { pending: number; confirmed: number; rows: number; entries: number }> = {};
  for (const key of GROUPS) counts[key] = { pending: 0, confirmed: 0, rows: 0, entries: 0 };
  if (run) {
    const rows = await selectAll<{ grp: string; entry_id: string | null; payment_status: string | null }>((from, to) =>
      db.from('v2_reconciliation_results').select('grp,entry_id,payment_status').eq('run_id', run.id).order('id').range(from, to));
    const entriesByGroup = new Map<string, Set<string>>();
    for (const row of rows) {
      const count = counts[row.grp];
      count.rows++;
      if (row.payment_status === 'pending') count.pending++;
      if (row.payment_status === 'confirmed') count.confirmed++;
      if (row.entry_id) entriesByGroup.set(row.grp, (entriesByGroup.get(row.grp) ?? new Set()).add(row.entry_id));
    }
    for (const [key, ids] of entriesByGroup) counts[key].entries = ids.size;
  }
  // Сколько строк каждый файл добавил в базу (повторы из других выписок не считаются).
  const owners = await selectAll<{ statement_id: string }>((from, to) =>
    db.from('v2_bank_statement_entries').select('statement_id').order('id').range(from, to));
  const entryCounts = new Map<string, number>();
  for (const row of owners) entryCounts.set(row.statement_id, (entryCounts.get(row.statement_id) ?? 0) + 1);
  return {
    run: run ? { finishedAt: run.finished_at, range: run.range_from ? { from: run.range_from, to: run.range_to } : null, entries: run.entries_count ?? 0 } : null,
    counts,
    statements: (statements.data ?? []).map(row => ({
      id: row.id, name: row.file_name, uploadedMonth: row.uploaded_month ?? undefined, range: { from: row.range_from, to: row.range_to },
      uploadedByName: row.uploaded_by_name ?? undefined, createdAt: row.created_at, newEntries: entryCounts.get(row.id) ?? 0,
    })),
  };
}

// Строки одной группы последнего прогона: с самим поступлением из выписки и платежом CRM.
async function groupRows(db: SupabaseClient, group: string, status: string | null) {
  const run = await latestRun(db);
  if (!run) return [];
  return selectAll<any>((from, to) => {
    let query = db.from('v2_reconciliation_results')
      .select(`grp,matching_codes,ord,entry:v2_bank_statement_entries(${ENTRY_COLUMNS}),payment:v2_payments(${PAYMENT_COLUMNS})`)
      .eq('run_id', run.id).eq('grp', group);
    if (status) query = query.eq('payment_status', status);
    return query.order('ord').order('id').range(from, to);
  });
}

async function cronAllowed(db: SupabaseClient, token: string | null) {
  if (!token) return false;
  const { data, error } = await db.rpc('v2_statement_reconcile_token');
  return !error && typeof data === 'string' && data.length > 0 && data === token;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    // Фоновый запуск по расписанию (pg_cron): только пересчёт, без данных в ответе.
    if (await cronAllowed(db, req.headers.get('x-reconcile-token'))) {
      await reconcile(db, 'cron');
      return response({ ok: true });
    }
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);
    const { data: employee, error: employeeError } = await db.from('v2_employees')
      .select('id,full_name,role,status,school_keys').eq('id', session.sub).maybeSingle();
    if (employeeError) throw employeeError;
    const schools: string[] = employee?.school_keys ?? [];
    if (!employee || employee.status !== 'active' || !ALLOWED_ROLES.has(employee.role) ||
        (schools.length && !schools.includes('ALL'))) {
      return response({ ok: false, error: 'Нет доступа к сверке платежей' }, 403);
    }

    const body = await req.json();
    if (body.action === 'summary') return response({ ok: true, ...await summary(db) });

    if (body.action === 'group') {
      const group = String(body.group ?? '');
      const status = body.status === 'pending' || body.status === 'confirmed' ? body.status : null;
      if (!GROUPS.has(group)) return response({ ok: false, error: 'Неизвестная группа сверки' }, 400);
      return response({ ok: true, rows: await groupRows(db, group, status) });
    }

    if (body.action === 'reconcile') {
      if (body.resync === true) await storeAllEntries(db);
      await reconcile(db, body.resync === true ? 'resync' : 'manual');
      return response({ ok: true });
    }

    // Полные выписки со строками — для старой версии экрана, пока она открыта у сотрудников.
    if (body.action === 'list') {
      const { data, error } = await db.from('v2_bank_statements').select(COLUMNS).order('created_at', { ascending: false });
      if (error) throw error;
      return response({ ok: true, statements: (data ?? []).map(toStatement) });
    }

    if (body.action === 'add') {
      const statement = body.statement ?? {};
      const name = String(statement.name ?? '').trim().slice(0, 300);
      const entries = statement.entries;
      const uploadedMonth = /^\d{4}-\d{2}$/.test(String(statement.uploadedMonth ?? '')) ? statement.uploadedMonth : null;
      if (!name || !Array.isArray(entries) || !entries.length || entries.length > MAX_ENTRIES || !entries.every(validEntry)) {
        return response({ ok: false, error: 'Выписка повреждена. Загрузите файл заново.' }, 400);
      }
      const dates = entries.map((entry: any) => entry.postingDate).sort();
      const from = isDate(statement.range?.from) ? statement.range.from : dates[0];
      const to = isDate(statement.range?.to) ? statement.range.to : dates[dates.length - 1];
      const hash = await sha256(JSON.stringify([name, uploadedMonth, entries]));
      const { error } = await db.from('v2_bank_statements').upsert({
        file_name: name, uploaded_month: uploadedMonth, range_from: from, range_to: to, entries,
        content_hash: hash, uploaded_by: employee.id, uploaded_by_name: employee.full_name,
      }, { onConflict: 'content_hash', ignoreDuplicates: true });
      if (error) throw error;
      const saved = await db.from('v2_bank_statements').select(COLUMNS).eq('content_hash', hash).single();
      if (saved.error) throw saved.error;
      await storeEntries(db, saved.data.id, entries);
      await reconcile(db, 'upload');
      return response({ ok: true, statement: toStatement(saved.data) });
    }

    if (body.action === 'delete') {
      if (!isUuid(body.statementId)) return response({ ok: false, error: 'Не указана выписка' }, 400);
      const { error } = await db.from('v2_bank_statements').delete().eq('id', body.statementId);
      if (error) throw error;
      await storeAllEntries(db);
      await reconcile(db, 'delete');
      return response({ ok: true });
    }

    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    console.error(error);
    return response({ ok: false, error: 'Не удалось выполнить действие с выпиской' }, 500);
  }
});
