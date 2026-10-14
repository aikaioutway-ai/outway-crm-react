import { EmployeeAdvance, fetchAllEmployeeAdvances } from '../services/employeeService';
import { useQuery, UseQueryResult, keepPreviousData } from '@tanstack/react-query';
import {
  fetchV2FamiliesTable,
  fetchV2FamiliesPage,
  fetchV2DriversTable,
  fetchPaymentsTable,
  fetchRefundsTable,
  fetchBranchStats,
  fetchSchoolApplicationCounts,
  fetchV2PayrollEntriesForPeriod,
  fetchV2PayrollApproval,
  fetchV2PayrollApprovalsForPeriod,
  fetchV2PayrollPaymentsForPeriod,
  fetchV2DriverAdvancesForPeriod,
  FamilyListRow,
  FamiliesPageParams,
  FamiliesPageResult,
  V2DriverTableRow,
  PaymentTableRow,
  RefundTableRow,
  BranchStat,
  V2PayrollEntry,
  V2PayrollApproval,
  V2PayrollPayment,
  V2DriverAdvance,
} from '../services/crmV2Service';
import { fetchEmployees } from '../services/employeeService';
import { Employee } from '../types';
import { QK } from '../services/queryClient';

/** Таблица семей — самый тяжёлый запрос CRM. Одна копия на всё приложение
 * (меню, Логистика, FamiliesPage): данные с финансами нужны части экранов,
 * а лишний запрос ожидающих платежей стоит намного дешевле второй полной
 * загрузки. После правок кэш сбрасывает invalidateFamiliesCache. */
export const familiesTableQuery = {
  queryKey: QK.familiesTable,
  queryFn: (): Promise<FamilyListRow[]> => fetchV2FamiliesTable(true),
  staleTime: 5 * 60 * 1000,
};

export function useFamiliesTable(options?: { enabled?: boolean }): UseQueryResult<FamilyListRow[]> {
  return useQuery({
    ...familiesTableQuery,
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

export function usePaymentsTable(options?: { enabled?: boolean }): UseQueryResult<PaymentTableRow[]> {
  return useQuery({
    queryKey: QK.paymentsTable,
    queryFn: fetchPaymentsTable,
    enabled: options?.enabled ?? true,
  });
}

export function useRefundsTable(options?: { enabled?: boolean }): UseQueryResult<RefundTableRow[]> {
  return useQuery({
    queryKey: QK.refundsTable,
    queryFn: fetchRefundsTable,
    enabled: options?.enabled ?? true,
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

export function useSchoolApplicationCounts(): Record<string, number> | undefined {
  const { data } = useQuery({
    queryKey: QK.schoolApplicationCounts,
    queryFn: fetchSchoolApplicationCounts,
  });
  return data;
}

export function useEmployees(options?: { enabled?: boolean }): UseQueryResult<Employee[]> {
  return useQuery({
    queryKey: QK.employees,
    queryFn: fetchEmployees,
    enabled: options?.enabled ?? true,
  });
}

export function usePayrollEntriesForPeriod(periodMonth: number, periodYear: number, sessionToken?: string): UseQueryResult<V2PayrollEntry[]> {
  return useQuery({
    queryKey: QK.payrollEntries(periodMonth, periodYear),
    queryFn: () => fetchV2PayrollEntriesForPeriod(periodMonth, periodYear, sessionToken),
    enabled: Boolean(sessionToken),
  });
}

export function usePayrollApproval(schoolKey: string, periodMonth: number, periodYear: number, sessionToken?: string): UseQueryResult<V2PayrollApproval | null> {
  return useQuery({
    queryKey: QK.payrollApproval(schoolKey, periodMonth, periodYear),
    queryFn: () => fetchV2PayrollApproval(schoolKey, periodMonth, periodYear, sessionToken),
    enabled: Boolean(schoolKey && sessionToken),
    retry: false,
  });
}

export function usePayrollApprovalsForPeriod(periodMonth: number, periodYear: number, sessionToken?: string): UseQueryResult<V2PayrollApproval[]> {
  return useQuery({
    queryKey: QK.payrollApprovals(periodMonth, periodYear),
    queryFn: () => fetchV2PayrollApprovalsForPeriod(periodMonth, periodYear, sessionToken),
    enabled: Boolean(sessionToken),
    retry: false,
  });
}

export function usePayrollPaymentsForPeriod(periodMonth: number, periodYear: number, sessionToken?: string): UseQueryResult<V2PayrollPayment[]> {
  return useQuery({
    queryKey: QK.payrollPayments(periodMonth, periodYear),
    queryFn: () => fetchV2PayrollPaymentsForPeriod(periodMonth, periodYear, sessionToken),
    enabled: Boolean(sessionToken),
  });
}

export function useDriverAdvancesForPeriod(periodMonth: number, periodYear: number): UseQueryResult<V2DriverAdvance[]> {
  return useQuery({
    queryKey: QK.driverAdvancesForPeriod(periodMonth, periodYear),
    queryFn: () => fetchV2DriverAdvancesForPeriod(periodMonth, periodYear),
  });
}

export function useEmployeeAdvances(): UseQueryResult<EmployeeAdvance[]> {
  return useQuery({ queryKey: ['employeeAdvances'], queryFn: fetchAllEmployeeAdvances });
}
