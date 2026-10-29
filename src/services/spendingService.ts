import { supabase } from './supabase';
import type { SpendingEntry } from '../modules/spending/SpendingModule';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, isEmployeeSessionExpiredMessage } from './employeeSession';

async function request(token: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('spending-api', { body, headers: { 'x-employee-session': token } });
  let message = error?.message || (!data?.ok ? data?.error || 'Не удалось загрузить расходы' : '');
  if (typeof Response !== 'undefined' && error?.context instanceof Response) {
    try { message = (await error.context.json()).error || message; } catch { /* Use the transport error when no JSON body exists. */ }
  }
  if (message) {
    if (isEmployeeSessionExpiredMessage(message)) window.dispatchEvent(new Event(EMPLOYEE_SESSION_EXPIRED_EVENT));
    throw new Error(message);
  }
  return data;
}
export async function fetchSpendingEntries(token: string, familyId?: string): Promise<SpendingEntry[]> {
  const result: SpendingEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const { rows } = await request(token, { action: 'list', offset, familyId });
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}
export async function saveSpendingEntries(token: string, rows: SpendingEntry[], importing = false): Promise<void> {
  if (!rows.length) return;
  if (!importing) { await request(token, { action: 'save', rows }); return; }
  for (let index = 0; index < rows.length; index += 100) await request(token, { action: 'import', rows: rows.slice(index, index + 100) });
}
export async function deleteSpendingEntry(token: string, id: string): Promise<void> {
  await request(token, { action: 'delete', id });
}

export async function fetchSpendingPayments(token: string, recipient: { driverId: string } | { employeeId: string }): Promise<SpendingEntry[]> {
  const result: SpendingEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const { rows } = await request(token, { action: 'payments', ...recipient, offset });
    result.push(...rows.filter((row: SpendingEntry) => !row.sourceRef));
    if (rows.length < 500) return result;
  }
}
