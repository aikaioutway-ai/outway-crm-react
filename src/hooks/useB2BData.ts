import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { B2BClientRecord, B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord, fetchB2BClients, fetchB2BDriverPayouts, fetchB2BExpenses, fetchB2BOrders } from '../services/b2bDataService';

export const B2B_QUERY_KEYS = {
  orders: ['b2b', 'orders'] as const,
  clients: ['b2b', 'clients'] as const,
  payouts: ['b2b', 'driver-payouts'] as const,
  expenses: ['b2b', 'expenses'] as const,
  payments: ['b2b', 'client-payments'] as const,
};

export const useB2BOrders = (): UseQueryResult<B2BOrderRecord[]> => useQuery<B2BOrderRecord[]>({ queryKey: B2B_QUERY_KEYS.orders, queryFn: fetchB2BOrders });
export const useB2BClients = (): UseQueryResult<B2BClientRecord[]> => useQuery<B2BClientRecord[]>({ queryKey: B2B_QUERY_KEYS.clients, queryFn: fetchB2BClients });
export const useB2BDriverPayouts = (): UseQueryResult<B2BDriverPayoutRecord[]> => useQuery<B2BDriverPayoutRecord[]>({ queryKey: B2B_QUERY_KEYS.payouts, queryFn: fetchB2BDriverPayouts });
export const useB2BExpenses = (): UseQueryResult<B2BExpenseRecord[]> => useQuery<B2BExpenseRecord[]>({ queryKey: B2B_QUERY_KEYS.expenses, queryFn: fetchB2BExpenses });
