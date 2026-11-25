import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import { useLogisticsTable } from '../../hooks/useCrmQueries';
import { fetchLogisticsReconciliationMonth } from '../../services/driverCheckService';
import { isSchoolAllowed, isSchoolInTier, SCHOOL_TABS } from './constants';
import { RECONCILIATION_PERIODS, resolveReconciliationPeriod } from './LogisticsReconciliation';
import { reconciliationRouteCounts } from './logisticsReconciliationStats';
import SchoolDashboardTable from './SchoolDashboardTable';
import type { SchoolTier } from './SchoolTierTabs';
import { isInTestTransfer, useTestTransfers } from './testTransfers';

/** School-level entry point shared with the logistics reconciliation counting rules. */
export default function LogisticsReconciliationOverview({ sessionToken, periodKey, onPeriodChange, onSelectSchool, allowedSchools, schoolTier }: {
  sessionToken?: string;
  periodKey: string;
  onPeriodChange: (key: string) => void;
  onSelectSchool: (key: string) => void;
  allowedSchools?: string[];
  schoolTier: SchoolTier;
}) {
  const period = resolveReconciliationPeriod(periodKey);
  const families = useLogisticsTable();
  useTestTransfers();
  const checks = useQuery({
    queryKey: ['logistics-reconciliation-month', period.year, period.month, 'ALL', sessionToken],
    queryFn: () => fetchLogisticsReconciliationMonth(sessionToken, { year: period.year, month: period.month }),
    enabled: Boolean(sessionToken),
    staleTime: 30_000,
  });
  const [ascending, setAscending] = useState(false);
  const workingRows = (families.data ?? []).filter(row => row.status !== 'rejected' && !isInTestTransfer(row));
  const rows = SCHOOL_TABS.filter(school => school.key !== 'ALL' && isSchoolInTier(school.key, schoolTier) && isSchoolAllowed(school.key, allowedSchools, schoolTier))
    .map(school => ({ key: school.key, label: school.label, logo: school.logo,
      values: { pending: checks.data ? reconciliationRouteCounts(checks.data, workingRows, school.key).pending : 0 } }))
    .sort((a, b) => ascending ? a.values.pending - b.values.pending : b.values.pending - a.values.pending);
  return <>
    <DashboardTopPanel>
      <div className="manager-period-tiles manager-period-tiles--months" role="group" aria-label="Период сверки">
        {RECONCILIATION_PERIODS.map(item => <button key={item.key} type="button" title={item.label} aria-pressed={period.key === item.key} onClick={() => onPeriodChange(item.key)}><span>{item.label.slice(0, 3)}</span></button>)}
      </div>
    </DashboardTopPanel>
    {checks.isPending || families.isPending ? <p role="status">Загрузка сверки…</p>
      : checks.isError || families.isError ? <p role="alert">Не удалось загрузить сверку. <button type="button" onClick={() => { void checks.refetch(); void families.refetch(); }}>Повторить</button></p>
      : <SchoolDashboardTable splitView compactTotals columns={[
        { key: 'pending', label: 'Не сделано', total: rows.reduce((sum, row) => sum + row.values.pending, 0), color: '#1D6FA4' },
      ]} rows={rows} sortKey="pending" ascending={ascending} onSort={() => setAscending(value => !value)} onSelect={onSelectSchool} />}
  </>;
}
