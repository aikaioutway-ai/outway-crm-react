import { supabase } from './supabase';
import { ExpenseRecord } from '../modules/costs/expenseTypes';

export const ADVANCE_EDITABLE_FIELDS = ['amount', 'unitPrice', 'expenseDate', 'paymentMethod', 'paymentOrderNumber', 'comment'];

// Update the original payout so payroll and finance continue to share one record.
export async function updateAdvanceExpenseCell(row: ExpenseRecord, key: string, value: string): Promise<ExpenseRecord> {
  if (row.source !== 'advance' || !ADVANCE_EDITABLE_FIELDS.includes(key)) throw new Error('Это поле аванса нельзя изменить');
  const employee = row.id.startsWith('employee-advance-');
  const prefix = employee ? 'employee-advance-' : 'advance-';
  if (!row.id.startsWith(prefix) || !row.id.slice(prefix.length)) throw new Error('Не найдена исходная выплата');
  const field = ({amount:'amount',unitPrice:'amount',expenseDate:'date',paymentMethod:'payment_method',paymentOrderNumber:'payment_order_number',comment:'comment'} as Record<string,string>)[key];
  const numeric = key === 'amount' || key === 'unitPrice';
  const nextValue = numeric ? Number(value) : value;
  if (numeric && (!Number.isFinite(nextValue) || Number(nextValue) <= 0)) throw new Error('Сумма должна быть больше нуля');
  if (key === 'expenseDate' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) throw new Error('Введите дату в формате ГГГГ-ММ-ДД');
  if (key === 'paymentMethod' && !['cash','cashless'].includes(value)) throw new Error('Выберите способ оплаты');
  const {data, error} = await supabase.from(employee ? 'v2_employee_advances' : 'v2_driver_advances')
    .update({[field]: nextValue || null}).eq('id', row.id.slice(prefix.length)).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Выплата не найдена или нет доступа к редактированию');
  return numeric ? {...row, amount:Number(nextValue),unitPrice:Number(nextValue)} : {...row,[key]:value};
}

function advanceIdentity(row: ExpenseRecord) {
  const employee = row.id.startsWith('employee-advance-');
  const prefix = employee ? 'employee-advance-' : 'advance-';
  if (row.source !== 'advance' || !row.id.startsWith(prefix) || !row.id.slice(prefix.length)) throw new Error('Не найдена исходная выплата');
  return {table: employee ? 'v2_employee_advances' : 'v2_driver_advances', id:row.id.slice(prefix.length)};
}

export async function updateAdvanceExpense(row: ExpenseRecord, next: Pick<ExpenseRecord,'amount'|'expenseDate'|'paymentMethod'|'paymentOrderNumber'|'comment'> & Partial<Pick<ExpenseRecord,'employeeId'|'driverId'|'schoolKey'|'transferId'|'salaryPeriodKey'>>): Promise<ExpenseRecord> {
  const {table,id}=advanceIdentity(row);
  if (!Number.isFinite(next.amount) || next.amount<=0) throw new Error('Сумма должна быть больше нуля');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.expenseDate) || Number.isNaN(Date.parse(next.expenseDate))) throw new Error('Проверьте дату выплаты');
  if (!['cash','cashless'].includes(next.paymentMethod)) throw new Error('Выберите способ оплаты');
  const {data,error}=await supabase.from(table).update({amount:next.amount,date:next.expenseDate,payment_method:next.paymentMethod,payment_order_number:next.paymentOrderNumber||null,comment:next.comment||null,...(next.salaryPeriodKey?{salary_period_key:next.salaryPeriodKey,period_year:Number(next.salaryPeriodKey.slice(0,4)),period_month:Number(next.salaryPeriodKey.slice(5,7))}:{}),...(table==='v2_employee_advances' && next.employeeId?{employee_id:next.employeeId}:{}),...(table==='v2_driver_advances' && next.driverId?{driver_id:next.driverId,transfer_id:next.transferId||null}:{}),...('schoolKey' in next?{school_key:next.schoolKey || (table==='v2_employee_advances'?'OFFICE':null)}:{})}).eq('id',id).select('id').maybeSingle();
  if(error) throw new Error(error.message);
  if(!data) throw new Error('Выплата не найдена или нет доступа');
  return {...row,...next,unitPrice:next.amount,quantity:1};
}

export async function deleteAdvanceExpense(row: ExpenseRecord): Promise<void> {
  const {table,id}=advanceIdentity(row);
  const {data,error}=await supabase.from(table).delete().eq('id',id).select('id').maybeSingle();
  if(error) throw new Error(error.message);
  if(!data) throw new Error('Выплата не найдена или нет доступа');
}
