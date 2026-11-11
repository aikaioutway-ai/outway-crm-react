import { supabase } from './supabase';
import type { StatementEntry } from '../modules/families/statementReconciliation';

// Выписки банка для «Сверки платежей» хранятся в базе (таблица v2_bank_statements)
// и общие для всех, кому открыта сверка. Доступ — через функцию statement-api.
export type BankStatement = {
  id?: string;
  name: string;
  entries: StatementEntry[];
  uploadedMonth?: string;
  range?: { from: string; to: string };
  uploadedByName?: string;
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

export async function fetchBankStatements(sessionToken?: string): Promise<BankStatement[]> {
  const data = await callStatementApi(sessionToken, { action: 'list' });
  return data.statements as BankStatement[];
}

export async function saveBankStatement(statement: BankStatement, sessionToken?: string): Promise<BankStatement> {
  const { name, entries, uploadedMonth, range } = statement;
  const data = await callStatementApi(sessionToken, { action: 'add', statement: { name, entries, uploadedMonth, range } });
  return data.statement as BankStatement;
}

export async function deleteBankStatement(id: string, sessionToken?: string): Promise<void> {
  await callStatementApi(sessionToken, { action: 'delete', statementId: id });
}
