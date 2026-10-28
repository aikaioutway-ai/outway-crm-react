import { supabase } from './supabase';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, EMPLOYEE_SESSION_EXPIRED_MESSAGE } from './employeeSession';
import { createExpense, deleteExpense, updateExpense, fetchDriverPayments, fetchTransferDriverHistory, reserveTemporaryDriverName } from './expenseService';

jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;
const expense = {
  name: 'QA expense',
  category: 'office' as const,
  subcategory: 'Прочее',
  unitPrice: 100,
  quantity: 2,
  expenseDate: '2026-08-28',
  paymentMethod: 'cashless' as const,
  comment: '',
};

beforeEach(() => invoke.mockReset());

test.each(['admin-session', 'gen-director-session'])('adds an expense with %s', async sessionToken => {
  invoke.mockResolvedValue({
    data: {
      ok: true,
      row: {
        id: `expense-${sessionToken}`,
        name: expense.name,
        category: expense.category,
        subcategory: expense.subcategory,
        unit_price: expense.unitPrice,
        quantity: expense.quantity,
        amount: 200,
        expense_date: expense.expenseDate,
        payment_method: expense.paymentMethod,
        created_at: '2026-08-28T00:00:00Z',
      },
    },
    error: null,
  });

  await expect(createExpense(expense, sessionToken)).resolves.toMatchObject({ amount: 200 });
  expect(invoke).toHaveBeenCalledWith('expense-api', expect.objectContaining({
    headers: { 'x-employee-session': sessionToken },
  }));
});

test('uses the expense-api response text and expires the cached session', async () => {
  const expired = jest.fn();
  window.addEventListener(EMPLOYEE_SESSION_EXPIRED_EVENT, expired);
  invoke.mockResolvedValue({
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: jest.fn().mockResolvedValue({ error: EMPLOYEE_SESSION_EXPIRED_MESSAGE }) },
    },
  });

  await expect(createExpense(expense, 'expired-session')).rejects.toThrow(EMPLOYEE_SESSION_EXPIRED_MESSAGE);
  expect(expired).toHaveBeenCalledTimes(1);
  window.removeEventListener(EMPLOYEE_SESSION_EXPIRED_EVENT, expired);
});

test('updates an expense through the protected expense API', async () => {
  invoke.mockResolvedValue({
    data: {
      ok: true,
      row: {
        id: 'expense-1',
        name: 'Updated expense',
        category: expense.category,
        subcategory: expense.subcategory,
        unit_price: 150,
        quantity: 2,
        amount: 300,
        expense_date: expense.expenseDate,
        payment_method: expense.paymentMethod,
        created_at: '2026-08-28T00:00:00Z',
      },
    },
    error: null,
  });

  await expect(updateExpense('expense-1', { ...expense, name: 'Updated expense', unitPrice: 150 }, 'admin-session'))
    .resolves.toMatchObject({ id: 'expense-1', amount: 300 });
  expect(invoke).toHaveBeenCalledWith('expense-api', expect.objectContaining({
    body: expect.objectContaining({ action: 'update', expenseId: 'expense-1' }),
  }));
});

test('deletes an expense through the protected expense API', async () => {
  invoke.mockResolvedValue({ data: { ok: true }, error: null });

  await expect(deleteExpense('expense-1', 'gen-director-session')).resolves.toBeUndefined();
  expect(invoke).toHaveBeenCalledWith('expense-api', expect.objectContaining({
    body: { action: 'delete', expenseId: 'expense-1' },
  }));
});

describe('recipient salaries and history',()=>{
const salaryExpense={name:'ЗП — Водитель',category:'school' as const,subcategory:'ЗП',unitPrice:1000,quantity:1,expenseDate:'2026-10-20',paymentMethod:'cash' as const,comment:'',driverId:'driver'};
test('an old API cannot silently save a salary without its recipient',async()=>{
  (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({data:{ok:false,error:'Неизвестное действие'}});
  await expect(createExpense(salaryExpense,'session')).rejects.toThrow('после обновления сервера');
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  expect(supabase.functions.invoke).toHaveBeenCalledWith('expense-api',expect.objectContaining({body:{action:'paymentCapabilities'}}));
});
test('recipient salary is sent only after API readiness is confirmed',async()=>{
  (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({data:{ok:true,recipientDetails:true}}).mockResolvedValueOnce({data:{ok:true,row:{id:'saved',driver_id:'driver'}}});
  await expect(createExpense(salaryExpense,'session')).resolves.toEqual(expect.objectContaining({id:'saved',driverId:'driver'}));
  expect(supabase.functions.invoke).toHaveBeenNthCalledWith(2,'expense-api',expect.objectContaining({body:{action:'create',expense:salaryExpense}}));
});

test('driver history requests and maps only the chosen driver across both payment sources',async()=>{
  (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({data:{ok:true,salaries:[{id:'same-id',driver_id:'chosen',expense_date:'2026-10-20',salary_period_key:'2026-10-1',amount:700},{id:'other',driver_id:'other-driver',amount:999}],advances:[{id:'same-id',driver_id:'chosen',date:'2026-10-19',period_month:10,period_year:2026,amount:300}]}});
  const rows=await fetchDriverPayments('chosen','session');
  expect(supabase.functions.invoke).toHaveBeenCalledWith('expense-api',expect.objectContaining({body:{action:'listDriverPayments',driverId:'chosen'}}));
  expect(rows).toEqual([expect.objectContaining({id:'salary-same-id',kind:'salary',periodKey:'2026-10-1',amount:700}),expect.objectContaining({id:'advance-same-id',kind:'advance',periodKey:'2026-10',amount:300})]);
});

});

test('transfer history preserves driver snapshots and sends the stable pagination cursor',async()=>{
  invoke.mockResolvedValue({data:{ok:true,rows:[{id:'event',transfer_id:'transfer',previous_driver_id:'old',driver_id:'new',previous_driver_name:'Старое имя',driver_name:'Новое имя',event_type:'change',recorded_at:'2026-10-26T08:00:00Z'}]},error:null});
  const before={recordedAt:'2026-10-27T08:00:00Z',id:'cursor'};
  await expect(fetchTransferDriverHistory('transfer','session',before)).resolves.toEqual([{id:'event',transferId:'transfer',previousDriverId:'old',driverId:'new',previousDriverName:'Старое имя',driverName:'Новое имя',eventType:'change',recordedAt:'2026-10-26T08:00:00Z'}]);
  expect(invoke).toHaveBeenCalledWith('expense-api',expect.objectContaining({body:{action:'listTransferDriverHistory',transferId:'transfer',before},headers:{'x-employee-session':'session'}}));
});

test('requests the next temporary driver name through the authenticated server',async()=>{
  invoke.mockResolvedValue({data:{ok:true,name:'Временный водитель №105'},error:null});
  await expect(reserveTemporaryDriverName('session')).resolves.toBe('Временный водитель №105');
  expect(invoke).toHaveBeenCalledWith('expense-api',expect.objectContaining({body:{action:'reserveTemporaryDriverName'},headers:{'x-employee-session':'session'}}));
});
