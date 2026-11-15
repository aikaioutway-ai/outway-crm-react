import { supabase } from './supabase';
import { mapPayment } from './financeService';
import type { FamilyPayment } from '../types';
import type { StatementEntry } from '../modules/families/statementReconciliation';

// Выписки банка для «Сверки платежей» хранятся в базе построчно и общие для всех,
// кому открыта сверка. Сверку считает сервер (функция statement-api) в фоне,
// экран получает готовые счётчики и строки нужной группы.
export type BankStatementUpload = {
  name: string;
  entries: StatementEntry[];
  uploadedMonth?: string;
  range?: { from: string; to: string };
};
export type BankStatementFile = {
  id: string;
  name: string;
  uploadedMonth?: string;
  range: { from: string; to: string };
  uploadedByName?: string;
  // Сколько поступлений этот файл добавил; повторы из других выписок не считаются.
  newEntries: number;
};
export type ReconciliationGroup = '1' | '2' | 'Д' | 'Х' | 'missing';
export type ReconciliationCount = { pending: number; confirmed: number; rows: number; entries: number };
export type ReconciliationSummary = {
  run: { finishedAt: string; range: { from: string; to: string } | null; entries: number } | null;
  counts: Record<ReconciliationGroup, ReconciliationCount>;
  statements: BankStatementFile[];
};
export type ReconciliationPayment = FamilyPayment & { parentName?: string };
export type ReconciliationRow = {
  entry: StatementEntry & { id: string };
  group: Exclude<ReconciliationGroup, 'missing'>;
  candidates: ReconciliationPayment[];
  matchingCodes: string[];
};

async function callStatementApi(sessionToken: string | undefined, body: Record<string, unknown>) {
  if (!sessionToken) throw new Error('Сессия устарела. Выйдите и войдите в CRM снова.');
  const { data, error } = await supabase.functions.invoke('statement-api', {
    body,
    headers: { 'x-employee-session': sessionToken },
  });
  if (error) throw new Error(data?.error || error.message || 'Не удалось связаться с сервером выписок.');
  if (!data?.ok) throw new Error(data?.error || 'Не удалось связаться с сервером выписок.');
  return data;
}

// Сервер сохраняет файл, раскладывает его на строки и сразу пересчитывает сверку.
export async function saveBankStatement(statement: BankStatementUpload, sessionToken?: string): Promise<void> {
  const { name, entries, uploadedMonth, range } = statement;
  await callStatementApi(sessionToken, { action: 'add', statement: { name, entries, uploadedMonth, range } });
}

export async function deleteBankStatement(id: string, sessionToken?: string): Promise<void> {
  await callStatementApi(sessionToken, { action: 'delete', statementId: id });
}

export async function fetchReconciliationSummary(sessionToken?: string): Promise<ReconciliationSummary> {
  const data = await callStatementApi(sessionToken, { action: 'summary' });
  return { run: data.run, counts: data.counts, statements: data.statements };
}

export async function runReconciliation(sessionToken?: string): Promise<void> {
  await callStatementApi(sessionToken, { action: 'reconcile' });
}

function toEntry(row: any): StatementEntry & { id: string } {
  return {
    id: row.id, number: 0, document: row.document, amount: Number(row.amount), codes: row.codes ?? [],
    postingDate: row.posting_date, operationDate: row.operation_date ?? undefined, time: row.op_time ?? undefined,
    source: row.source ?? undefined,
  };
}

function toPayment(row: any): ReconciliationPayment {
  return { ...mapPayment(row), parentName: row.family?.parent_name ?? undefined };
}

// Строки одной группы последнего пересчёта. Для «Нет в выписке» — только платежи CRM.
export async function fetchReconciliationGroup(sessionToken: string | undefined, group: ReconciliationGroup,
  status: 'pending' | 'confirmed' | null): Promise<{ rows: ReconciliationRow[]; payments: ReconciliationPayment[] }> {
  const data = await callStatementApi(sessionToken, { action: 'group', group, status });
  if (group === 'missing') return { rows: [], payments: (data.rows as any[]).filter(row => row.payment).map(row => toPayment(row.payment)) };
  const byEntry = new Map<string, ReconciliationRow>();
  for (const row of data.rows as any[]) {
    if (!row.entry) continue;
    const current: ReconciliationRow = byEntry.get(row.entry.id) ?? {
      entry: { ...toEntry(row.entry), number: byEntry.size + 1 }, group: row.grp, candidates: [], matchingCodes: row.matching_codes ?? [],
    };
    if (row.payment) current.candidates.push(toPayment(row.payment));
    byEntry.set(row.entry.id, current);
  }
  return { rows: Array.from(byEntry.values()), payments: [] };
}
