import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,        // данные считаются свежими 30 сек
      gcTime: 5 * 60 * 1000,       // кэш хранится 5 минут
      retry: 1,                     // одна попытка повтора при ошибке
      refetchOnWindowFocus: false,  // не перегружать при переключении вкладок браузера
    },
  },
});

export const QK = {
  branchStats: ['branchStats'] as const,
  familiesTable: (withFinance: boolean) => ['familiesTable', withFinance] as const,
  familiesPage: (filters: Record<string, unknown>) => ['familiesPage', filters] as const,
  driversTable: ['driversTable'] as const,
  paymentsTable: ['paymentsTable'] as const,
  cashierPaymentsTable: ['cashierPaymentsTable'] as const,
};
