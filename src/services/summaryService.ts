import { supabase } from './supabase';
import { queryClient, QK } from './queryClient';

export interface SummaryBranchForecast {
  branchId: string;
  branchCode: string;
  branchName: string;
  revenue: number;
  microbusCount: number;
}

export interface SummaryWorkingDays {
  year: number;
  month: number;
  days: number;
}

/** Итоги по филиалам за месяц одним запросом (20–40 строк), см. get_summary_forecast. */
export async function fetchSummaryForecast(year: number, month: number): Promise<SummaryBranchForecast[]> {
  const { data, error } = await supabase.rpc('get_summary_forecast', { p_year: year, p_month: month });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    branchId: String(row.branch_id),
    branchCode: row.branch_code ?? '',
    branchName: row.branch_name ?? row.branch_code ?? '',
    revenue: Number(row.revenue ?? 0),
    microbusCount: Number(row.microbus_count ?? 0),
  }));
}

export async function fetchSummaryWorkingDays(): Promise<SummaryWorkingDays[]> {
  const { data, error } = await supabase
    .from('v2_summary_working_days')
    .select('period_year, period_month, days');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({ year: Number(row.period_year), month: Number(row.period_month), days: Number(row.days) }));
}

export async function setSummaryWorkingDays(sessionToken: string | undefined, input: SummaryWorkingDays): Promise<void> {
  if (!sessionToken) throw new Error('Сессия недействительна или истекла — войдите заново');
  const { data, error } = await supabase.functions.invoke('summary-api', {
    body: { action: 'setWorkingDays', ...input },
    headers: { 'x-employee-session': sessionToken },
  });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json();
        message = payload?.error || message;
      } catch {
        // Ответ функции может не содержать JSON — тогда показываем исходную ошибку.
      }
    }
    throw new Error(message);
  }
  if (!data?.ok) throw new Error(data?.error || 'Не удалось сохранить рабочие дни');
  queryClient.invalidateQueries({ queryKey: QK.summaryWorkingDays });
}
