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
import { useLogisticsTable } from '../../hooks/useCrmQueries';
import { LIGHT_VEHICLE_TYPES } from '../families/familiesRowHelpers';
import type { VehicleType } from '../../types';
import { computeSummaryRows, sumSummaryRows, SummarySchoolRow, WORKING_DAYS_OPTIONS, workingDaysFor } from './summaryForecast';

const MONTH_PERIODS = ALL_PERIODS.filter(period => period.key !== 'deposit');
type SortKey = 'school' | keyof Omit<SummarySchoolRow, 'key' | 'label' | 'logo'>;
const EMPTY = '—';
const FORECAST_TABS = [['v1', '1.0'], ['v2', '2.0']] as const;
type ForecastTab = typeof FORECAST_TABS[number][0];

interface Props {
  sessionToken?: string;
  /** vehicleTypes — открыть школу только с этими типами машин (вкладка 2.0). */
  onSelectSchool: (schoolKey: string, periodKey: string, vehicleTypes?: readonly VehicleType[]) => void;
}

export default function SummaryModule({ sessionToken, onSelectSchool }: Props) {
  const [tab, setTab] = useState<ForecastTab>('v1');
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
  const logisticsQuery = useLogisticsTable({ enabled: tab === 'v2' });
  const logisticsRows = logisticsQuery.data;
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
  // Деньги появятся, когда владелец задаст ставки водителям за день.
  const lightRows = (() => {
    if (!isV2 || !logisticsRows) return [];
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
      return { key, label: forecastRow?.label ?? school?.label ?? key, logo: forecastRow?.logo ?? school?.logo, cars: stats.lightVehicleCount, passengers: stats.lightVehicleStudents };
    }).filter(row => rows.some(item => item.key === row.key) || row.cars > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  })();
  const lightTotals = lightRows.reduce((acc, row) => ({ cars: acc.cars + row.cars, passengers: acc.passengers + row.passengers }), { cars: 0, passengers: 0 });
  const columns = [
    { key: 'school', label: 'Школы', total: isV2 ? lightRows.length : rows.length, color: '#64748B' },
    ...(isV2
      ? [
        { key: 'cars', label: 'Cars', total: lightTotals.cars, color: KPI_COLORS.childrenCount },
        { key: 'passengers', label: 'Passengers', total: lightTotals.passengers, color: '#0F766E' },
      ]
      : [{ key: 'microbusCount', label: 'Buses', total: totals.microbusCount, color: KPI_COLORS.childrenCount }]),
    { key: 'revenue', label: 'Revenue', total: isV2 ? EMPTY : money(totals.revenue), color: KPI_COLORS.charged },
    { key: 'cogs', label: 'COGS', total: isV2 ? EMPTY : money(totals.cogs), color: '#B45309' },
    { key: 'revenueTax', label: 'Revenue Tax 4%', total: isV2 ? EMPTY : money(totals.revenueTax), color: '#64748B' },
    { key: 'grossProfit', label: 'Gross Profit', total: isV2 ? EMPTY : money(totals.grossProfit), color: !isV2 && totals.grossProfit < 0 ? 'var(--danger)' : KPI_COLORS.paid },
    ...(isV2 ? [] : [{ key: 'workingDays', label: 'Days', total: workingDays, color: '#94A3B8' }]),
  ];
  const tableRows = isV2
    ? lightRows.map(row => ({
      key: row.key,
      label: row.label,
      logo: row.logo,
      values: { cars: row.cars, passengers: row.passengers, revenue: EMPTY, cogs: EMPTY, revenueTax: EMPTY, grossProfit: EMPTY },
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
        <div role="tablist" aria-label="Раздел сводки" className="ow-seg">
          {FORECAST_TABS.map(([key, label]) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
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

      {isV2 && (
        <div role="status" style={{ padding: '0 4px', fontSize: 12.5, color: 'var(--text-2)' }}>Машины и пассажиры посчитаны по минивэнам и седанам. Revenue, COGS, налог и Gross Profit появятся, когда будут заданы ставки водителям.</div>
      )}

      {forecastQuery.isPending || daysQuery.isPending || (isV2 && logisticsQuery.isPending) ? (
        <div role="status" style={{ padding: 24, fontSize: 13, color: 'var(--text-2)' }}>Загрузка прогноза…</div>
      ) : forecastQuery.isError || daysQuery.isError || (isV2 && logisticsQuery.isError) ? (
        <div role="alert" style={{ padding: 24, fontSize: 13 }}>
          Не удалось загрузить прогноз. <button type="button" className="ow-btn ow-btn--ghost" onClick={() => { void forecastQuery.refetch(); void daysQuery.refetch(); if (isV2) void logisticsQuery.refetch(); }}>Повторить</button>
        </div>
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
          onSelect={key => isV2 ? onSelectSchool(key, period.key, LIGHT_VEHICLE_TYPES) : onSelectSchool(key, period.key)}
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
