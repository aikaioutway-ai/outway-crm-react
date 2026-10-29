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
  periodChargeStats: (periodKey: string) => ['manager-charge-stats', periodKey] as const,
  summaryForecast: (year: number, month: number) => ['summaryForecast', year, month] as const,
  summaryWorkingDays: ['summaryWorkingDays'] as const,
  schoolApplicationCounts: ['schoolApplicationCounts'] as const,
  logisticsBadgeCount: ['logisticsBadgeCount'] as const,
  schoolDirectoryStats: ['schoolDirectoryStats'] as const,
  schoolTransferStats: (branchIds: string[]) => ['schoolTransferStats', branchIds] as const,
  familySearch: (text: string, digits: string) => ['familySearch', text, digits] as const,
  v2Branches: ['v2Branches'] as const,
  familiesTable: ['familiesTable'] as const,
  logisticsTable: ['logisticsTable'] as const,
  familiesPage: (filters: Record<string, unknown>) => ['familiesPage', filters] as const,
  driversTable: ['driversTable'] as const,
  transfersDashboard: ['transfersDashboard'] as const,
  paymentsTable: ['paymentsTable'] as const,
  cashierPaymentsTable: ['cashierPaymentsTable'] as const,
  refundsTable: ['refundsTable'] as const,
  employees: ['employees'] as const,
  payrollEntries: (periodMonth: number, periodYear: number) => ['payrollEntries', periodMonth, periodYear] as const,
  payrollApproval: (schoolKey: string, periodMonth: number, periodYear: number) => ['payrollApproval', schoolKey, periodMonth, periodYear] as const,
  payrollApprovals: (periodMonth: number, periodYear: number) => ['payrollApprovals', periodMonth, periodYear] as const,
  payrollPayments: (periodMonth: number, periodYear: number) => ['payrollPayments', periodMonth, periodYear] as const,
  driverAdvancesForPeriod: (periodMonth: number, periodYear: number) => ['driverAdvancesForPeriod', periodMonth, periodYear] as const,
};
