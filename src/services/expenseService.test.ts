import { supabase } from './supabase';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, EMPLOYEE_SESSION_EXPIRED_MESSAGE } from './employeeSession';
import { createExpense, deleteExpense, updateExpense } from './expenseService';

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
