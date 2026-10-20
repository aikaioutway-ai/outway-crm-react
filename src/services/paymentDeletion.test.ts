import { deleteFamilyPayment } from './financeService';
import { supabase } from './supabase';
import { queryClient } from './queryClient';
import type { FamilyPayment } from '../types';

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('./queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() }, QK: {} }));
const invoke = supabase.functions.invoke as jest.Mock;
const payment = { id: 'payment', status: 'Подтверждено' } as FamilyPayment;
beforeEach(() => jest.clearAllMocks());

test('requires an employee session before attempting payment deletion', async () => {
  await expect(deleteFamilyPayment(payment)).rejects.toThrow('Сессия устарела');
  expect(invoke).not.toHaveBeenCalled();
});

test('confirmed payment deletion goes through the authenticated server operation', async () => {
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
  await expect(deleteFamilyPayment(payment, 'session')).resolves.toBeUndefined();
  expect(invoke).toHaveBeenCalledWith('payment-management-api', {
    body: { action: 'delete', paymentId: payment.id }, headers: { 'x-employee-session': 'session' },
  });
  expect(queryClient.invalidateQueries).toHaveBeenCalled();
});

test('surfaces server denial and keeps caches intact', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: '403', context: { json: async () => ({ error: 'Нет доступа' }) } } });
  await expect(deleteFamilyPayment(payment, 'session')).rejects.toThrow('Нет доступа');
  expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
});
