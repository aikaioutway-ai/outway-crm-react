import { useQuery, UseQueryResult, keepPreviousData } from '@tanstack/react-query';
import {
  fetchV2FamiliesTable,
  fetchV2FamiliesPage,
  fetchV2DriversTable,
  fetchPaymentsTable,
  fetchCashierPaymentsTable,
  fetchBranchStats,
  FamilyListRow,
  FamiliesPageParams,
  FamiliesPageResult,
  V2DriverTableRow,
  PaymentTableRow,
  CashierPaymentRow,
  BranchStat,
} from '../services/crmV2Service';
import { QK } from '../services/queryClient';

/** Единая точка загрузки таблицы семей — все компоненты с одинаковым
 * withFinance разделяют один запрос и один кэш (React Query дедуплицирует
 * параллельные вызовы и переиспользует данные, пока они не протухли). */
export function useFamiliesTable(withFinance = false, options?: { enabled?: boolean }): UseQueryResult<FamilyListRow[]> {
  return useQuery({
    queryKey: QK.familiesTable(withFinance),
    queryFn: (): Promise<FamilyListRow[]> => fetchV2FamiliesTable(withFinance),
    enabled: options?.enabled ?? true,
  });
}

/** Постраничная загрузка «Справочник»/«Заявки» через RPC get_families_page.
 * Все фильтры входят в queryKey — смена страницы/школы/поиска естественно
 * даёт отдельный (и кэшируемый) запрос вместо ручного релоада. keepPreviousData
 * не даёт таблице мигать пустым состоянием при листании страниц. */
export function useFamiliesPage(params: FamiliesPageParams, options?: { enabled?: boolean }): UseQueryResult<FamiliesPageResult> {
  return useQuery({
    queryKey: QK.familiesPage(params as Record<string, unknown>),
    queryFn: (): Promise<FamiliesPageResult> => fetchV2FamiliesPage(params),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useDriversTable(): UseQueryResult<V2DriverTableRow[]> {
  return useQuery({
    queryKey: QK.driversTable,
    queryFn: fetchV2DriversTable,
  });
}

export function usePaymentsTable(): UseQueryResult<PaymentTableRow[]> {
  return useQuery({
    queryKey: QK.paymentsTable,
    queryFn: fetchPaymentsTable,
  });
}

export function useCashierPaymentsTable(): UseQueryResult<CashierPaymentRow[]> {
  return useQuery({
    queryKey: QK.cashierPaymentsTable,
    queryFn: fetchCashierPaymentsTable,
  });
}

/** Лёгкий KPI-запрос: тянет агрегаты по филиалам через RPC get_branch_stats
 * (20-40 строк) вместо всей таблицы семей/детей (тысячи строк). Отдаёт
 * сырые BranchStat[] — схлопывание в SchoolStat[] по вкладкам школ живёт
 * рядом с computeSchoolStats в ManagerOverview.tsx (там же цвета/лейблы). */
export function useBranchStats(): UseQueryResult<BranchStat[]> {
  return useQuery({
    queryKey: QK.branchStats,
    queryFn: fetchBranchStats,
  });
}
