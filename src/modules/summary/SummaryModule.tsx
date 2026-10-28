import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import '../../core/tables/DataTable.css';
import { QK } from '../../services/queryClient';
import { fetchSummaryForecast, fetchSummaryWorkingDays, setSummaryWorkingDays } from '../../services/summaryService';
import { money } from '../../utils/pricing';
import { ALL_PERIODS, currentPayrollPeriodKey } from '../families/constants';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import { KPI_COLORS } from '../families/ManagerOverview';
import { computeSummaryRows, sumSummaryRows, SummarySchoolRow, WORKING_DAYS_OPTIONS, workingDaysFor } from './summaryForecast';

const MONTH_PERIODS = ALL_PERIODS.filter(period => period.key !== 'deposit');
type SortKey = 'school' | keyof Omit<SummarySchoolRow, 'key' | 'label' | 'logo'>;
const EMPTY = '—';

interface Props {
  sessionToken?: string;
  onSelectSchool: (schoolKey: string, periodKey: string) => void;
}

export default function SummaryModule({ sessionToken, onSelectSchool }: Props) {
  const [periodKey, setPeriodKey] = useState(currentPayrollPeriodKey);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'revenue', dir: 'desc' });
  const [daysMenu, setDaysMenu] = useState<{ periodKey: string; x: number; y: number } | null>(null);
  const period = MONTH_PERIODS.find(item => item.key === periodKey) ?? MONTH_PERIODS[0];

  const forecastQuery = useQuery({
    queryKey: QK.summaryForecast(period.year, period.month),
    queryFn: () => fetchSummaryForecast(period.year, period.month),
  });
  const daysQuery = useQuery({ queryKey: QK.summaryWorkingDays, queryFn: fetchSummaryWorkingDays });
  const saveDays = useMutation({ mutationFn: (input: { year: number; month: number; days: number }) => setSummaryWorkingDays(sessionToken, input) });

  const workingDays = workingDaysFor(daysQuery.data, period.year, period.month);
  const rows = useMemo(() => computeSummaryRows(forecastQuery.data ?? [], workingDays), [forecastQuery.data, workingDays]);
  const totals = useMemo(() => sumSummaryRows(rows), [rows]);
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const cmp = sortState.key === 'school' ? a.label.localeCompare(b.label) : a[sortState.key] - b[sortState.key];
    return sortState.dir === 'asc' ? cmp : -cmp;
  }), [rows, sortState]);

  useEffect(() => {
    if (!daysMenu) return;
    const close = () => setDaysMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [daysMenu]);

  const menuPeriod = daysMenu ? MONTH_PERIODS.find(item => item.key === daysMenu.periodKey) : undefined;
  const menuDays = menuPeriod ? workingDaysFor(daysQuery.data, menuPeriod.year, menuPeriod.month) : null;

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', gap: 12, padding: '0 0 10px' }}>
      <DashboardTopPanel className="dashboard-control-row manager-overview-toolbar">
        <div role="tablist" aria-label="Раздел сводки" className="ow-seg">
          <button type="button" role="tab" className="ow-seg-btn" aria-selected>Прогноз</button>
        </div>
        <div className="manager-overview-period">
          <ManagerPeriodBar
            periodKey={period.key}
            onPeriodKeyChange={setPeriodKey}
            periods={MONTH_PERIODS}
            showAll={false}
            periodTitle={item => {
              const target = MONTH_PERIODS.find(p => p.key === item.key);
              const days = target ? workingDaysFor(daysQuery.data, target.year, target.month) : null;
              return `${item.label} · ${days ?? EMPTY} раб. дней. ПКМ — изменить`;
            }}
            onPeriodContextMenu={(key, event) => setDaysMenu({ periodKey: key, x: Math.min(event.clientX, window.innerWidth - 200), y: Math.min(event.clientY, window.innerHeight - 380) })}
          />
        </div>
      </DashboardTopPanel>

      {saveDays.isError && (
        <div role="alert" style={{ padding: '8px 14px', background: '#FBEAE9', border: '1px solid #F0C4C0', borderRadius: 10, color: '#B3261E', fontSize: 12.5, fontWeight: 600 }}>
          Не удалось сохранить рабочие дни: {saveDays.error.message}
        </div>
      )}

      {forecastQuery.isPending || daysQuery.isPending ? (
        <div role="status" style={{ padding: 24, fontSize: 13, color: 'var(--text-2)' }}>Загрузка прогноза…</div>
      ) : forecastQuery.isError || daysQuery.isError ? (
        <div role="alert" style={{ padding: 24, fontSize: 13 }}>
          Не удалось загрузить прогноз. <button type="button" className="ow-btn ow-btn--ghost" onClick={() => { void forecastQuery.refetch(); void daysQuery.refetch(); }}>Повторить</button>
        </div>
      ) : !rows.length ? (
        <div role="status" style={{ padding: 24, fontSize: 13, color: 'var(--text-2)' }}>За {period.label.toLowerCase()} нет активных микроавтобусов и начислений.</div>
      ) : (
        <SchoolDashboardTable
          commentScope="summary/SummaryModule:forecast"
          commentContext={`forecast:${period.key}`}
          columns={[
            { key: 'school', label: 'Школы', total: rows.length, color: '#64748B' },
            { key: 'microbusCount', label: 'Микроавтобусы', total: totals.microbusCount, color: KPI_COLORS.childrenCount },
            { key: 'revenue', label: 'Revenue', total: money(totals.revenue), color: KPI_COLORS.charged },
            { key: 'cogs', label: 'COGS', total: money(totals.cogs), color: '#B45309' },
            { key: 'revenueTax', label: 'Revenue Tax 4%', total: money(totals.revenueTax), color: '#64748B' },
            { key: 'grossProfit', label: 'Gross Profit', total: money(totals.grossProfit), color: totals.grossProfit < 0 ? 'var(--danger)' : KPI_COLORS.paid },
            { key: 'workingDays', label: 'Кол-во дней', total: workingDays, color: '#94A3B8' },
          ]}
          rows={sortedRows.map(row => ({
            key: row.key,
            label: row.label,
            logo: row.logo,
            values: {
              microbusCount: row.microbusCount,
              revenue: money(row.revenue),
              cogs: money(row.cogs),
              revenueTax: money(row.revenueTax),
              grossProfit: money(row.grossProfit),
              workingDays,
            },
          }))}
          sortKey={sortState.key}
          ascending={sortState.dir === 'asc'}
          onSort={key => { if (key === 'school' || key in totals) handleSort(key as SortKey); }}
          onSelect={key => onSelectSchool(key, period.key)}
        />
      )}

      {daysMenu && menuPeriod && (
        <div role="menu" aria-label="Рабочие дни" className="dt-ctx-menu" style={{ position: 'fixed', left: daysMenu.x, top: daysMenu.y, zIndex: 1000 }} onClick={event => event.stopPropagation()}>
          <div className="dt-ctx-section">{menuPeriod.label} · рабочие дни</div>
          {WORKING_DAYS_OPTIONS.map(days => (
            <button
              key={days}
              type="button"
              role="menuitemradio"
              aria-checked={menuDays === days}
              className="dt-ctx-item"
              disabled={saveDays.isPending}
              onClick={() => { saveDays.mutate({ year: menuPeriod.year, month: menuPeriod.month, days }); setDaysMenu(null); }}
            >
              {days} {menuDays === days ? '✓' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
