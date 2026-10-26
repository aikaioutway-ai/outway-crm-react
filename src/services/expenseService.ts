import { supabase } from './supabase';
import { ExpenseCategory, ExpensePaymentMethod, ExpenseRecord, NewExpenseRecord } from '../modules/costs/expenseTypes';
import {
  EMPLOYEE_SESSION_EXPIRED_EVENT,
  isEmployeeSessionExpiredMessage,
} from './employeeSession';

function mapExpense(row: any): ExpenseRecord {
  return {
    id: String(row.id),
    schoolKey: row.school_key || undefined,
    departmentKey: row.department_key || undefined,
    driverId: row.driver_id || undefined,
    employeeId: row.employee_id || undefined,
    transferId: row.transfer_id || undefined,
    salaryPeriodKey: row.salary_period_key || undefined,
    name: String(row.name ?? ''),
    category: row.category as ExpenseCategory,
    subcategory: String(row.subcategory ?? ''),
    unitPrice: Number(row.unit_price ?? 0),
    quantity: Number(row.quantity ?? 0),
    amount: Number(row.amount ?? 0),
    expenseDate: String(row.expense_date ?? ''),
    paymentMethod: row.payment_method as ExpensePaymentMethod,
    paymentOrderNumber: row.payment_order_number ? String(row.payment_order_number) : undefined,
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
  const errorMessage = error
    ? await extractFunctionErrorMessage(error)
    : (!data?.ok ? String(data?.error || 'Ошибка сервера расходов') : '');
  if (errorMessage) {
    if (isEmployeeSessionExpiredMessage(errorMessage) && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(EMPLOYEE_SESSION_EXPIRED_EVENT));
    }
    throw new Error(errorMessage);
  }
  return data;
}

export async function fetchExpenses(periodStart: string, periodEnd: string, sessionToken?: string): Promise<ExpenseRecord[]> {
  const data = await callExpenseApi(sessionToken, { action: 'list', periodStart, periodEnd });
  return (data.rows ?? []).map(mapExpense);
}

export async function createExpense(expense: NewExpenseRecord, sessionToken?: string): Promise<ExpenseRecord> {
  if (expense.driverId || expense.employeeId) {
    try {
      const capabilities = await callExpenseApi(sessionToken, { action: 'paymentCapabilities' });
      if (!capabilities.recipientDetails) throw new Error('Сервер выплат ещё не обновлён');
    } catch (error) {
      if (error instanceof Error && error.message === 'Неизвестное действие') throw new Error('Сохранение зарплаты с получателем станет доступно после обновления сервера выплат');
      throw error;
    }
  }
  const data = await callExpenseApi(sessionToken, { action: 'create', expense });
  return mapExpense(data.row);
}

export async function updateExpense(expenseId: string, expense: NewExpenseRecord, sessionToken?: string): Promise<ExpenseRecord> {
  const data = await callExpenseApi(sessionToken, { action: 'update', expenseId, expense });
  return mapExpense(data.row);
}

export async function deleteExpense(expenseId: string, sessionToken?: string): Promise<void> {
  await callExpenseApi(sessionToken, { action: 'delete', expenseId });
}

export async function fetchSalaryExpenses(sessionToken?: string): Promise<ExpenseRecord[]> {
  const data = await callExpenseApi(sessionToken, { action: 'listSalary' });
  return (data.rows ?? []).map(mapExpense);
}

export async function fetchDriverPayments(driverId:string,sessionToken?:string):Promise<import('../modules/drivers/driverPayments').DriverPaymentRecord[]> {
  let data;
  try {data=await callExpenseApi(sessionToken,{action:'listDriverPayments',driverId});}
  catch(error){if(error instanceof Error && error.message==='Неизвестное действие')throw new Error('История выплат станет доступна после обновления сервера выплат');throw error;}
  const salaryRows=(data.salaries??[]).filter((row:any)=>row.driver_id===driverId).map((row:any)=>({
    id:`salary-${row.id}`,sourceId:String(row.id),kind:'salary' as const,date:String(row.expense_date??''),amount:Number(row.amount??0),periodKey:String(row.salary_period_key??String(row.expense_date??'').slice(0,7)),schoolKey:row.school_key??undefined,paymentMethod:row.payment_method??undefined,paymentOrderNumber:row.payment_order_number??undefined,comment:String(row.comment??''),createdAt:String(row.created_at??''),
  }));
  const advanceRows=(data.advances??[]).filter((row:any)=>row.driver_id===driverId).map((row:any)=>({
    id:`advance-${row.id}`,sourceId:String(row.id),kind:'advance' as const,date:String(row.date??''),amount:Number(row.amount??0),periodKey:row.salary_period_key || (row.period_year && row.period_month ? `${row.period_year}-${String(row.period_month).padStart(2,'0')}`:String(row.date??'').slice(0,7)),schoolKey:row.school_key??undefined,paymentMethod:row.payment_method??undefined,paymentOrderNumber:row.payment_order_number??undefined,comment:String(row.comment??''),createdAt:String(row.created_at??''),
  }));
  return [...salaryRows,...advanceRows].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
}

export interface TransferDriverHistoryEntry {
  id: string;
  transferId: string;
  previousDriverId: string | null;
  driverId: string | null;
  previousDriverName: string | null;
  driverName: string | null;
  eventType: 'initial' | 'change';
  recordedAt: string;
}

export async function fetchTransferDriverHistory(transferId: string, sessionToken?: string, before?: { recordedAt: string; id: string }): Promise<TransferDriverHistoryEntry[]> {
  const data = await callExpenseApi(sessionToken, { action: 'listTransferDriverHistory', transferId, before });
  return (data.rows ?? []).map((row: Record<string, any>) => ({
    id: String(row.id), transferId: String(row.transfer_id),
    previousDriverId: row.previous_driver_id ?? null, driverId: row.driver_id ?? null,
    previousDriverName: row.previous_driver_name ?? null, driverName: row.driver_name ?? null,
    eventType: row.event_type, recordedAt: String(row.recorded_at),
  }));
}

export async function fetchTransferDriversHistory(transferIds: string[], sessionToken?: string): Promise<TransferDriverHistoryEntry[]> {
  if (!transferIds.length) return [];
  const data = await callExpenseApi(sessionToken,{action:'listTransferDriversHistory',transferIds});
  return (data.rows ?? []).map((row: Record<string,any>)=>({id:String(row.id),transferId:String(row.transfer_id),previousDriverId:row.previous_driver_id??null,driverId:row.driver_id??null,previousDriverName:row.previous_driver_name??null,driverName:row.driver_name??null,eventType:row.event_type,recordedAt:String(row.recorded_at)}));
}
