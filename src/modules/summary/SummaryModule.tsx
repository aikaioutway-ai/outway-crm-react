import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Calculator, Wallet } from 'lucide-react';
import { createPortal } from 'react-dom';
import './SummaryModule.css';
import { useFamiliesTable, useMonthlyChargeStats } from '../../hooks/useCrmQueries';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import { ALL_PERIODS, isSchoolAllowed, SCHOOL_DIRECTORY } from '../families/constants';
import { useTestTransfers } from '../families/testTransfers';
import { microbusAverageTone } from '../families/familiesRowHelpers';
import { money } from '../../utils/pricing';
import { groupStats, SUMMARY_GROUPS, SUMMARY_SCHOOL_NAMES } from './summaryGroups';

interface Props {
  sessionToken?: string;
  allowedSchools?: string[];
  showGroupTotals?: boolean;
  onOpenChild?: (familyId: string, childId: string) => void;
}

type Stats = ReturnType<typeof groupStats>;
type GroupMetric = 'newRequests' | 'microbusAverage' | 'microbusCount' | 'lightVehicleCount' | 'debtorsCount' | 'debtSum';
type MetricKey = GroupMetric | 'pendingChecks';
type SortKey = 'school' | MetricKey;
type Metric = { key: MetricKey; label: string; color: string };
const metrics: Metric[] = [
  { key: 'newRequests', label: 'Новые заявки', color: '#378ADD' },
  { key: 'microbusAverage', label: 'Средний', color: '#2563EB' },
  { key: 'microbusCount', label: 'К-во бус', color: '#7F77DD' },
  { key: 'lightVehicleCount', label: 'К-во легковых', color: '#0F766E' },
  { key: 'debtorsCount', label: 'К-во должников', color: 'var(--danger)' },
  { key: 'debtSum', label: 'Сумма долга', color: 'var(--danger)' },
];
const totalMetrics: Metric[] = [
  ...metrics,
  { key: 'pendingChecks', label: 'Чеки на проверке', color: 'var(--danger)' },
];
const values = (stats: Stats) => ({ ...stats, microbusAverage: stats.microbusAverage.toFixed(1), debtSum: money(Math.round(stats.debtSum)) });

const chartMetrics = {
  debt: { label: 'Долг', title: 'Долг по месяцам', icon: CircleAlert },
  charged: { label: 'Начисления', title: 'Начисления по месяцам', icon: Calculator },
  pending: { label: 'Кассир — суммы на проверке', title: 'Суммы на проверке по месяцам', icon: Wallet },
} as const;
type ChartMetric = keyof typeof chartMetrics;
const chartMetricKeys: ChartMetric[] = ['debt', 'charged', 'pending'];

const debtMonths = ALL_PERIODS.filter(period => period.month > 0);
const debtMonthKeys = debtMonths.map(period => period.key);

export default function SummaryModule({ onOpenChild, allowedSchools, showGroupTotals = false }: Props) {
  const query = useFamiliesTable();
  useTestTransfers();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<MetricKey | null>(null);
  const [debtTooltip, setDebtTooltip] = useState<{ key: string; left: number; bottom: number } | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('debt');
  const dialog = useRef<HTMLDialogElement>(null);
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'school', ascending: true });
  const allRows = query.data ?? [];
  const groups = SUMMARY_GROUPS.map(group => {
    const schools = onOpenChild ? group.schools : group.schools.filter(key => isSchoolAllowed(key, allowedSchools));
    return { ...group, schools, stats: groupStats(allRows.filter(row => schools.includes(row.branchFilter))) };
  }).filter(group => group.schools.length);
  const visibleSchools = new Set(groups.flatMap(group => group.schools));
  const totalRows = allRows.filter(row => visibleSchools.has(row.branchFilter));
  const monthlyQueries = useMonthlyChargeStats(onOpenChild && showGroupTotals ? debtMonthKeys : []);
  const childSchools = new Map(totalRows.filter(row => row.status !== 'rejected').map(row => [row.rowId, row.branchFilter]));
  const familySchools = new Map(totalRows.map(row => [row.familyId, row.branchFilter]));
  const monthlyDebt = debtMonths.map((period, index) => {
    const entries = monthlyQueries[index]?.data;
    const bySchool = new Map<string, number>();
    let total = 0;
    for (const entry of entries ?? []) {
      const school = entry.childId ? childSchools.get(entry.childId) : familySchools.get(entry.familyId);
      if (!school) continue;
      const amount = entry[chartMetric];
      total += amount;
      bySchool.set(school, (bySchool.get(school) ?? 0) + amount);
    }
    const schools = Array.from(bySchool).filter(([, amount]) => amount !== 0).sort((a, b) => b[1] - a[1]);
    return { ...period, amount: entries ? total : undefined, schools };
  });
  const tooltipMonth = monthlyDebt.find(month => month.key === debtTooltip?.key);

  function showDebtTooltip(key: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(290, window.innerWidth - 24);
    const left = rect.right + 8 + width <= window.innerWidth - 12 ? rect.right + 8 : rect.left - 8 - width;
    setDebtTooltip({ key, left: Math.max(12, left), bottom: Math.max(12, window.innerHeight - rect.bottom) });
  }
  const chartTotal = monthlyDebt.every(month => month.amount !== undefined)
    ? monthlyDebt.reduce((sum, month) => sum + (month.amount ?? 0), 0)
    : undefined;
  const maxMonthlyDebt = Math.max(1, ...monthlyDebt.map(month => month.amount ?? 0));
  const totalStats = groupStats(totalRows);
  const totalValues = values(totalStats);
  const selected = groups.find(group => group.key === selectedKey);
  const selectedMetric = showGroupTotals ? totalMetrics.find(metric => metric.key === metricKey) : undefined;
  const dialogOpen = Boolean(selected || selectedMetric);
  useEffect(() => {
    if (dialogOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [dialogOpen, query.isPending, query.isError]);
  const schoolKeys = selectedMetric ? Array.from(visibleSchools) : selected?.schools ?? [];
  const schools = schoolKeys.map(key => {
    const school = SCHOOL_DIRECTORY.find(item => item.key === key);
    return { key, label: school?.label ?? key, logo: school?.logo, stats: groupStats(allRows.filter(row => row.branchFilter === key)) };
  }).filter(({ stats }) => !selectedMetric || (selectedMetric.key === 'microbusAverage'
    ? stats.microbusCount > 0 : stats[selectedMetric.key] > 0)).sort((a, b) => {
    const comparison = sort.key === 'school' ? a.label.localeCompare(b.label, 'ru') : a.stats[sort.key] - b.stats[sort.key];
    return sort.ascending ? comparison : -comparison;
  });

  const showPendingDebt = selectedMetric?.key === 'pendingChecks';
  const dialogMetrics = selectedMetric ? [selectedMetric] : metrics;
  const dialogValues = values(selected?.stats ?? totalStats);
  const pendingSchools = showPendingDebt ? new Set(schools.map(school => school.key)) : null;

  if (query.isPending) return <div role="status" style={{ padding: 24 }}>Загрузка сводки…</div>;
  if (query.isError) return <div role="alert" style={{ padding: 24 }}>Не удалось загрузить сводку. <button type="button" className="ow-btn ow-btn--ghost" onClick={() => { void query.refetch(); }}>Повторить</button></div>;

  return <div className={onOpenChild ? "summary-tiles-page" : "summary-tiles-embedded"}>
    {onOpenChild && showGroupTotals && groups.length > 0 && <section className="summary-total" aria-labelledby="summary-total-title">
      <h2 id="summary-total-title">Общая сводка</h2>
      <div className="summary-tile-metrics">
        {totalMetrics.map(({ key, label }) => <button type="button" key={key} className="summary-total-metric"
          aria-haspopup="dialog" onClick={() => {
            setSort({ key, ascending: false });
            setMetricKey(key);
          }}>
          <span>{label}</span>
          <strong data-tone={key === 'debtSum' || (key === 'pendingChecks' && totalStats.pendingChecks > 0) ? 'alert' : undefined}>{totalValues[key]}</strong>
        </button>)}
      </div>
    </section>}
    <div className="summary-tiles">
      {groups.map((group, index) => <button type="button" key={group.key} className={`summary-tile summary-tile-${index + 1}`} onClick={() => { setSort({ key: 'school', ascending: true }); setSelectedKey(group.key); }} aria-label={`Открыть ${group.label}`}>
        <div className="summary-tile-heading"><h2>{group.label}</h2><div className="summary-tile-logos">{group.schools.map(key => {
          const school = SCHOOL_DIRECTORY.find(item => item.key === key);
          return school?.logo ? <span className="summary-school-logo" key={key} tabIndex={0}><img src={school.logo} alt={SUMMARY_SCHOOL_NAMES[key] ?? school.label} /><span className="summary-school-tooltip" role="tooltip">{SUMMARY_SCHOOL_NAMES[key] ?? school.label}</span></span> : null;
        })}</div><span aria-hidden="true">→</span></div>
        <p className="summary-tile-team">Менеджер: {group.manager}<br />Логист: {group.logistics}</p>
        <div className="summary-tile-metrics">
          {metrics.map(({ key, label }) => {
            const value = values(group.stats)[key];
            const tone = key === 'microbusAverage' ? microbusAverageTone(value)
              : (key === 'newRequests' || key === 'debtSum') && group.stats[key] > 0 ? 'alert' : undefined;
            return <div key={key}><span>{label}</span><strong data-tone={tone}>{value}</strong></div>;
          })}
        </div>
        <span className="summary-tile-footer">Школы и показатели →</span>
      </button>)}
    </div>
    {onOpenChild && showGroupTotals && groups.length > 0 && <section className="summary-debt-chart" data-metric={chartMetric} aria-label={chartMetrics[chartMetric].title}>
      <header>
        <div className="summary-chart-switcher" role="group" aria-label="Показатель графика">
          {chartMetricKeys.map(key => {
            const { icon: Icon, label } = chartMetrics[key];
            return <button type="button" className="ow-btn ow-btn--ghost" key={key}
              data-chart-metric={key} aria-label={label} title={label} aria-pressed={chartMetric === key} onClick={() => { setDebtTooltip(null); setChartMetric(key); }}>
              <Icon size={18} aria-hidden="true" />
            </button>;
          })}
        </div>
        <div className="summary-chart-total">
          <span>Итого</span>
          <strong>{chartTotal === undefined ? '—' : `${money(Math.round(chartTotal))} сом`}</strong>
        </div>
      </header>
      {monthlyQueries.some(query => query.isError) && <p role="status">
        Часть данных не загрузилась. <button type="button" className="ow-btn ow-btn--ghost" onClick={() => {
          monthlyQueries.filter(query => query.isError).forEach(query => { void query.refetch(); });
        }}>Повторить</button>
      </p>}
      <div className="summary-debt-scroll">
        <ul className="summary-debt-bars" aria-busy={monthlyQueries.some(query => query.isPending)}>
          {monthlyDebt.map(month => <li key={month.key}
            tabIndex={month.schools.length ? 0 : undefined}
            aria-describedby={debtTooltip?.key === month.key ? 'summary-debt-tooltip' : undefined}
            onMouseEnter={event => { if (month.schools.length) showDebtTooltip(month.key, event.currentTarget); }}
            onMouseLeave={event => { if (document.activeElement !== event.currentTarget) setDebtTooltip(null); }}
            onFocus={event => showDebtTooltip(month.key, event.currentTarget)}
            onBlur={() => setDebtTooltip(null)}
            onKeyDown={event => { if (event.key === 'Escape') setDebtTooltip(null); }}>
            <div className="summary-debt-track">
              <div className="summary-debt-column" style={{ height: `${(month.amount ?? 0) / maxMonthlyDebt * 100}%` }}>
                <strong>{month.amount === undefined ? '—' : money(Math.round(month.amount))}</strong>
                <span className="summary-debt-fill" aria-hidden="true" />
              </div>
            </div>
            <span>{month.label}</span>
          </li>)}
        </ul>
      </div>
    </section>}
    {showGroupTotals && debtTooltip && tooltipMonth && createPortal(
      <aside id="summary-debt-tooltip" className="summary-debt-tooltip" data-metric={chartMetric} role="tooltip"
        style={{ left: debtTooltip.left, bottom: debtTooltip.bottom }}>
        <strong>{tooltipMonth.label}</strong>
        <ul>
          {tooltipMonth.schools.map(([school, amount]) => <li key={school}>
            <span>{SCHOOL_DIRECTORY.find(item => item.key === school)?.label ?? school}</span>
            <span>{money(Math.round(amount))} сом</span>
          </li>)}
        </ul>
      </aside>, document.body)}
    {dialogOpen && <dialog ref={dialog} className={selectedMetric ? `summary-dialog summary-dialog-metric${showPendingDebt ? ' summary-dialog-with-debt' : ''}` : 'summary-dialog'} onClose={() => { setSelectedKey(null); setMetricKey(null); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close(); } }} aria-labelledby="summary-dialog-title">
      <header className="summary-dialog-header"><div><h2 id="summary-dialog-title">{selectedMetric?.label ?? selected?.label}</h2>{selected && <p>Менеджер: {selected.manager} · Логист: {selected.logistics}</p>}</div><button autoFocus type="button" className="ow-btn ow-btn--ghost" onClick={() => dialog.current?.close()}>Закрыть</button></header>
      {schools.length === 0 && selectedMetric ? <p>Нет школ с данными по этому показателю.</p> : <SchoolDashboardTable
        commentScope="summary/SummaryModule:schools"
        commentContext={selected?.key ?? selectedMetric?.key}
        showAvatars={Boolean(selectedMetric)}
        columns={[
          { key: 'school', label: 'Школы', total: schools.length, color: 'var(--text-2)' },
          ...dialogMetrics.map(metric => ({ ...metric, total: dialogValues[metric.key] })),
          ...(pendingSchools ? [{
            key: 'debtSum', label: 'Сумма долга', color: 'var(--danger)',
            total: values(groupStats(totalRows.filter(row => pendingSchools.has(row.branchFilter)))).debtSum,
          }] : []),
        ]}
        rows={schools.map(school => ({ key: school.key, label: school.label, logo: school.logo, values: values(school.stats), disabled: true }))}
        sortKey={sort.key}
        ascending={sort.ascending}
        onSort={key => setSort(previous => ({ key: key as SortKey, ascending: previous.key === key ? !previous.ascending : key === 'school' }))}
        onSelect={() => {}}
      />}
    </dialog>}
  </div>;
}
