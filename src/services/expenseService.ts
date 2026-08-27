import { supabase } from './supabase';
import { ExpenseCategory, ExpensePaymentMethod, ExpenseRecord, NewExpenseRecord } from '../modules/costs/expenseTypes';

function mapExpense(row: any): ExpenseRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: row.category as ExpenseCategory,
    subcategory: String(row.subcategory ?? ''),
    unitPrice: Number(row.unit_price ?? 0),
    quantity: Number(row.quantity ?? 0),
    amount: Number(row.amount ?? 0),
    expenseDate: String(row.expense_date ?? ''),
    paymentMethod: row.payment_method as ExpensePaymentMethod,
    comment: String(row.comment ?? ''),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: String(row.created_at ?? ''),
  };
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      if (body?.error) return String(body.error);
    } catch {
      // тело ответа не JSON — используем сообщение supabase-js ниже
    }
  }
  return error instanceof Error ? error.message : 'Ошибка сервера расходов';
}

async function callExpenseApi(sessionToken: string | undefined, body: Record<string, unknown>): Promise<any> {
  if (!sessionToken) throw new Error('Сессия устарела. Выйдите и войдите в CRM снова.');
  const { data, error } = await supabase.functions.invoke('expense-api', {
    body,
    headers: { 'x-employee-session': sessionToken },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  if (!data?.ok) throw new Error(data?.error || 'Ошибка сервера расходов');
  return data;
}

export async function fetchExpenses(periodStart: string, periodEnd: string, sessionToken?: string): Promise<ExpenseRecord[]> {
  const data = await callExpenseApi(sessionToken, { action: 'list', periodStart, periodEnd });
  return (data.rows ?? []).map(mapExpense);
}

export async function createExpense(expense: NewExpenseRecord, sessionToken?: string): Promise<ExpenseRecord> {
  const data = await callExpenseApi(sessionToken, { action: 'create', expense });
  return mapExpense(data.row);
}
