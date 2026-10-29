import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import '../../core/tables/DataTable.css';
import { QK } from '../../services/queryClient';
import { fetchSummaryForecast, fetchSummaryWorkingDays, setSummaryWorkingDays } from '../../services/summaryService';
import { money } from '../../utils/pricing';
import { ALL_PERIODS, currentPayrollPeriodKey, SCHOOL_DIRECTORY } from '../families/constants';
import ManagerPeriodBar from '../families/ManagerPeriodBar';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import { KPI_COLORS } from '../families/ManagerOverview';
import { transferStats } from '../families/LogisticsOverview';
import { useTestTransfers } from '../families/testTransfers';
import { useLogisticsTable, usePeriodChargeStats } from '../../hooks/useCrmQueries';
import { ChevronLeft } from 'lucide-react';
import SummarySchoolView, { SummarySchoolKpi } from './SummarySchoolView';
import { chargedByChild, computeSummaryRows, LIGHT_VEHICLE_TYPES, MICROBUS_TYPES, revenueBySchool, REVENUE_TAX_RATE, schoolChildren, sumSummaryRows, SummarySchoolRow, WORKING_DAYS_OPTIONS, workingDaysFor } from './summaryForecast';

const MONTH_PERIODS = ALL_PERIODS.filter(period => period.key !== 'deposit');
type SortKey = 'school' | keyof Omit<SummarySchoolRow, 'key' | 'label' | 'logo'>;
const EMPTY = '—';
const FORECAST_TABS = [['v1', '1.0'], ['v2', '2.0']] as const;
type ForecastTab = typeof FORECAST_TABS[number][0];

interface Props {
  sessionToken?: string;
  /** Открыть карточку семьи на этом ребёнке. */
  onOpenChild: (familyId: string, childId: string) => void;
}

export default function SummaryModule({ sessionToken, onOpenChild }: Props) {
  const [tab, setTab] = useState<ForecastTab>('v1');
  // Школа открывается здесь же: дети в трансферах вкладки (1.0 — микроавтобусы, 2.0 — минивэны и седаны) и их начисления.
  const [openSchoolKey, setOpenSchoolKey] = useState<string | null>(null);
  const [periodKey, setPeriodKey] = useState(currentPayrollPeriodKey);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'revenue', dir: 'desc' });
  const [daysMenu, setDaysMenu] = useState<{ periodKey: string; x: number; y: number } | null>(null);
  const period = MONTH_PERIODS.find(item => item.key === periodKey) ?? MONTH_PERIODS[0];

  const forecastQuery = useQuery({
    queryKey: QK.summaryForecast(period.year, period.month),
    queryFn: () => fetchSummaryForecast(period.year, period.month),
  });
  const daysQuery = useQuery({ queryKey: QK.summaryWorkingDays, queryFn: fetchSummaryWorkingDays });
  // 2.0: машины и пассажиры минивэнов и седанов — те же данные и правила подсчёта, что в Логистике.
  const needsChildren = tab === 'v2' || openSchoolKey !== null;
  const logisticsQuery = useLogisticsTable({ enabled: needsChildren });
  const logisticsRows = logisticsQuery.data;
  // Начисления за месяц по детям — тот же запрос и кеш, что у экрана менеджера.
  const chargesQuery = usePeriodChargeStats(period.key, { enabled: needsChildren });
  const chargedMap = useMemo(() => chargedByChild(chargesQuery.data), [chargesQuery.data]);
  // Подписка на пометки тестовых трансферов: они меняют подсчёт машин, как в Логистике.
  useTestTransfers();
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

  const isV2 = tab === 'v2';
  // 2.0 — минивэны и седаны: школы из 1.0 плюс школы, где есть легковые трансферы; без рабочих дней.
  // Revenue и налог — по начислениям за месяц; COGS и Gross Profit ждут ставок водителям за день.
  const lightRows = (() => {
    if (!isV2 || !logisticsRows) return [];
    const lightRevenue = revenueBySchool(logisticsRows, chargedMap, LIGHT_VEHICLE_TYPES);
    const bySchool = new Map<string, NonNullable<typeof logisticsRows>>();
    logisticsRows.forEach(row => {
      if (!row.branchFilter) return;
      const list = bySchool.get(row.branchFilter);
      if (list) list.push(row); else bySchool.set(row.branchFilter, [row]);
    });
    const keys = new Set([...rows.map(row => row.key), ...Array.from(bySchool.keys())]);
    return Array.from(keys).map(key => {
      const stats = transferStats(bySchool.get(key) ?? []);
      const school = SCHOOL_DIRECTORY.find(item => item.key === key);
      const forecastRow = rows.find(row => row.key === key);
      const revenue = lightRevenue.get(key) ?? 0;
      return { key, label: forecastRow?.label ?? school?.label ?? key, logo: forecastRow?.logo ?? school?.logo, cars: stats.lightVehicleCount, passengers: stats.lightVehicleStudents, revenue, tax: Math.round(revenue * REVENUE_TAX_RATE) };
    }).filter(row => rows.some(item => item.key === row.key) || row.cars > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  })();
  const lightTotals = lightRows.reduce((acc, row) => ({ cars: acc.cars + row.cars, passengers: acc.passengers + row.passengers, revenue: acc.revenue + row.revenue, tax: acc.tax + row.tax }), { cars: 0, passengers: 0, revenue: 0, tax: 0 });
  const openSchoolChildren = useMemo(
    () => (openSchoolKey && logisticsRows ? schoolChildren(logisticsRows, openSchoolKey, chargedMap, isV2 ? LIGHT_VEHICLE_TYPES : MICROBUS_TYPES) : []),
    [openSchoolKey, logisticsRows, chargedMap, isV2],
  );
  // Плашки школы — те же цифры, что в её строке таблицы «Прогноза».
  const openSchool: { label: string; logo?: string; kpi: SummarySchoolKpi } | undefined = (() => {
    if (!openSchoolKey) return undefined;
    if (isV2) {
      const row = lightRows.find(item => item.key === openSchoolKey);
      return row && { label: row.label, logo: row.logo, kpi: { countLabel: 'Cars · Passengers', count: `${row.cars} · ${row.passengers}`, revenue: row.revenue, cogs: null, tax: row.tax, grossProfit: null } };
    }
    const row = rows.find(item => item.key === openSchoolKey);
    return row && { label: row.label, logo: row.logo, kpi: { countLabel: 'Buses · Passengers', count: `${row.microbusCount} · ${openSchoolChildren.length}`, revenue: row.revenue, cogs: row.cogs, tax: row.revenueTax, grossProfit: row.grossProfit } };
  })();
  const columns = [
    { key: 'school', label: 'Школы', total: isV2 ? lightRows.length : rows.length, color: '#64748B' },
    ...(isV2
      ? [
        { key: 'cars', label: 'Cars', total: lightTotals.cars, color: KPI_COLORS.childrenCount },
        { key: 'passengers', label: 'Passengers', total: lightTotals.passengers, color: '#0F766E' },
      ]
      : [{ key: 'microbusCount', label: 'Buses', total: totals.microbusCount, color: KPI_COLORS.childrenCount }]),
    { key: 'revenue', label: 'Revenue', total: money(isV2 ? lightTotals.revenue : totals.revenue), color: KPI_COLORS.charged },
    { key: 'cogs', label: 'COGS', total: isV2 ? EMPTY : money(totals.cogs), color: '#B45309' },
    { key: 'revenueTax', label: 'Revenue Tax 4%', total: money(isV2 ? lightTotals.tax : totals.revenueTax), color: '#64748B' },
    { key: 'grossProfit', label: 'Gross Profit', total: isV2 ? EMPTY : money(totals.grossProfit), color: !isV2 && totals.grossProfit < 0 ? 'var(--danger)' : KPI_COLORS.paid },
    ...(isV2 ? [] : [{ key: 'workingDays', label: 'Days', total: workingDays, color: '#94A3B8' }]),
  ];
  const tableRows = isV2
    ? lightRows.map(row => ({
      key: row.key,
      label: row.label,
      logo: row.logo,
      values: { cars: row.cars, passengers: row.passengers, revenue: money(row.revenue), cogs: EMPTY, revenueTax: money(row.tax), grossProfit: EMPTY },
    }))
    : sortedRows.map(row => ({
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
    }));

  const menuPeriod = daysMenu ? MONTH_PERIODS.find(item => item.key === daysMenu.periodKey) : undefined;
  const menuDays = menuPeriod ? workingDaysFor(daysQuery.data, menuPeriod.year, menuPeriod.month) : null;

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', gap: 12, padding: '0 0 10px' }}>
      <DashboardTopPanel className="dashboard-control-row manager-overview-toolbar">
        {openSchool && (
          <button type="button" className="ow-btn ow-btn--ghost" onClick={() => setOpenSchoolKey(null)}>
            <ChevronLeft size={16} aria-hidden="true" />Все школы
          </button>
        )}
        <div role="tablist" aria-label="Раздел сводки" className="ow-seg">
          {FORECAST_TABS.map(([key, label]) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-selected={tab === key} onClick={() => { setTab(key); setOpenSchoolKey(null); }}>{label}</button>)}
        </div>
        <div className="manager-overview-period">
          <ManagerPeriodBar
            periodKey={period.key}
            onPeriodKeyChange={setPeriodKey}
            periods={MONTH_PERIODS}
            showAll={false}
            periodTitle={isV2 ? undefined : item => {
              const target = MONTH_PERIODS.find(p => p.key === item.key);
              const days = target ? workingDaysFor(daysQuery.data, target.year, target.month) : null;
              return `${item.label} · ${days ?? EMPTY} раб. дней. ПКМ — изменить`;
            }}
            onPeriodContextMenu={isV2 ? undefined : (key, event) => setDaysMenu({ periodKey: key, x: Math.min(event.clientX, window.innerWidth - 200), y: Math.min(event.clientY, window.innerHeight - 380) })}
          />
        </div>
      </DashboardTopPanel>

      {saveDays.isError && (
        <div role="alert" style={{ padding: '8px 14px', background: '#FBEAE9', border: '1px solid #F0C4C0', borderRadius: 10, color: '#B3261E', fontSize: 12.5, fontWeight: 600 }}>
          Не удалось сохранить рабочие дни: {saveDays.error.message}
        </div>
      )}

      {isV2 ? (
        <div role="status" style={{ padding: '0 4px', fontSize: 12.5, color: 'var(--text-2)' }}>Только минивэны и седаны. Revenue и налог — по начислениям за месяц. COGS, оплата водителю, остаток и Gross Profit появятся, когда будут заданы ставки водителям.</div>
      ) : openSchoolKey && (
        <div role="status" style={{ padding: '0 4px', fontSize: 12.5, color: 'var(--text-2)' }}>Только микроавтобусы. Оплата водителю и остаток по ребёнку появятся, когда будет решено, как ставка за микроавтобус делится на детей.</div>
      )}

      {forecastQuery.isPending || daysQuery.isPending || (needsChildren && (logisticsQuery.isPending || chargesQuery.isPending)) ? (
        <div role="status" style={{ padding: 24, fontSize: 13, color: 'var(--text-2)' }}>Загрузка прогноза…</div>
      ) : forecastQuery.isError || daysQuery.isError || (needsChildren && (logisticsQuery.isError || chargesQuery.isError)) ? (
        <div role="alert" style={{ padding: 24, fontSize: 13 }}>
          Не удалось загрузить прогноз. <button type="button" className="ow-btn ow-btn--ghost" onClick={() => { void forecastQuery.refetch(); void daysQuery.refetch(); if (needsChildren) { void logisticsQuery.refetch(); void chargesQuery.refetch(); } }}>Повторить</button>
        </div>
      ) : openSchool ? (
        <SummarySchoolView label={openSchool.label} logo={openSchool.logo} kpi={openSchool.kpi} rows={openSchoolChildren} onOpenChild={onOpenChild} />
      ) : (isV2 ? !lightRows.length : !rows.length) ? (
        <div role="status" style={{ padding: 24, fontSize: 13, color: 'var(--text-2)' }}>{isV2 ? 'Нет активных минивэнов и седанов.' : `За ${period.label.toLowerCase()} нет активных микроавтобусов и начислений.`}</div>
      ) : (
        <SchoolDashboardTable
          commentScope="summary/SummaryModule:forecast"
          commentContext={`forecast:${period.key}`}
          columns={columns}
          rows={tableRows}
          sortKey={isV2 ? 'school' : sortState.key}
          ascending={isV2 || sortState.dir === 'asc'}
          onSort={key => { if (!isV2 && (key === 'school' || key in totals)) handleSort(key as SortKey); }}
          onSelect={setOpenSchoolKey}
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
