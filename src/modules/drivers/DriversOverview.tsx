import LogisticsTabs, { LogisticsTab } from '../families/LogisticsTabs';
import HiddenSchoolsList from '../families/HiddenSchoolsList';
import SchoolDashboardTable from '../families/SchoolDashboardTable';
import { useEffect, useMemo, useState } from 'react';
import { V2DriverTableRow } from '../../services/crmV2Service';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed, SCHOOL_TABS, SCHOOL_TIER_2_KEYS } from '../families/constants';
import { DashboardSearch, DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from '../families/SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from '../families/schoolGrouping';
import { SchoolTier } from '../families/SchoolTierTabs';

export const DRIVER_RESERVE_KEY = 'RESERVE';
export const DRIVER_RESERVE_STATUSES = new Set(['vacation', 'reserve', 'waiting', 'pending']);

export function isReserveDriver(driver: V2DriverTableRow): boolean {
  const status = String(driver.status ?? '').toLowerCase();
  const matchesKnownSchool = SCHOOL_TABS
    .filter(tab => tab.key !== 'ALL')
    .some(tab => driverMatchesSchool(driver, tab));
  return driver.transferCount === 0 || !matchesKnownSchool || DRIVER_RESERVE_STATUSES.has(status);
}

type SortKey = 'school' | 'activeCount' | 'inactiveCount' | 'microbusCount' | 'minivanCount' | 'sedanCount' | 'incompleteDocumentsCount';

interface DriversOverviewProps {
  onSelectSchool: (key: string) => void;
  search?: string;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: LogisticsTab) => void;
  onSidebarWidthChange?: (width: number) => void;
  allowedSchools?: string[];
}

interface DriverSchoolStat {
  key: string;
  label: string;
  color: string;
  logo?: string;
  activeCount: number;
  inactiveCount: number;
  microbusCount: number;
  minivanCount: number;
  sedanCount: number;
  incompleteDocumentsCount: number;
}

const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#2563EB', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const KPI_COLORS: Record<SortKey, string> = {
  school: '#626C8B',
  activeCount: 'var(--success)',
  inactiveCount: '#EF7168',
  microbusCount: '#1D6FA4',
  minivanCount: '#15803D',
  sedanCount: '#2563EB',
  incompleteDocumentsCount: '#B45309',
};

const COLUMN_WEIGHTS: Record<SortKey, number> = {
  school: 1,
  activeCount: 1,
  microbusCount: 1,
  inactiveCount: 1,
  minivanCount: 1,
  sedanCount: 1,
  incompleteDocumentsCount: 1,
};

const GRID_TEMPLATE = ['school', 'activeCount', 'inactiveCount', 'microbusCount', 'minivanCount', 'sedanCount', 'incompleteDocumentsCount']
  .map(key => `minmax(0, ${COLUMN_WEIGHTS[key as SortKey]}fr)`)
  .join(' ');

const ROW_HEIGHT = 56;

function driverMatchesSchool(driver: V2DriverTableRow, tab: typeof SCHOOL_TABS[number]): boolean {
  return driver.branchCodes.includes(tab.key)
    || driver.branchShorts.includes(tab.label)
    || driver.branchNames.includes(tab.label);
}

function statFromRows(
  key: string,
  label: string,
  color: string,
  schoolRows: V2DriverTableRow[],
  logo?: string,
): DriverSchoolStat {
  return {
    key,
    label,
    color,
    logo,
    activeCount: schoolRows.filter(row => row.status === 'active').length,
    inactiveCount: schoolRows.filter(row => row.status !== 'active').length,
    microbusCount: schoolRows.filter(row => row.vehicleType === 'microbus').length,
    minivanCount: schoolRows.filter(row => row.vehicleType === 'minivan').length,
    sedanCount: schoolRows.filter(row => row.vehicleType === 'sedan').length,
    incompleteDocumentsCount: schoolRows.filter(row => row.hasIncompleteDocuments).length,
  };
}

function computeDriverStats(rows: V2DriverTableRow[], allowedSchools: string[] | undefined, tier: SchoolTier): DriverSchoolStat[] {
  const schoolStats = SCHOOL_TABS
    .filter(tab => tab.key !== 'ALL' && isSchoolAllowed(tab.key, allowedSchools) && SCHOOL_TIER_2_KEYS.includes(tab.key) === (tier === '2.0'))
    .map((tab, index) => {
      const schoolRows = rows.filter(row => !isReserveDriver(row) && driverMatchesSchool(row, tab));
      return statFromRows(tab.key, tab.label, SCHOOL_COLORS[index % SCHOOL_COLORS.length], schoolRows, tab.logo);
    });
  const reserveRows = rows.filter(isReserveDriver);
  return [
    ...schoolStats,
    statFromRows(DRIVER_RESERVE_KEY, 'Резерв', '#626C8B', reserveRows),
  ];
}

export default function DriversOverview({ onSelectSchool, onSidebarWidthChange, allowedSchools, search = '', onSearchChange, onTabChange }: DriversOverviewProps) {
  const { data: rows = null } = useDriversTable();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [schoolTier] = useState<SchoolTier>('1.0');
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));


  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  const stats = useMemo(() => computeDriverStats(rows ?? [], allowedSchools, schoolTier), [rows, allowedSchools, schoolTier]);
  const totals = useMemo(() => {
    const allRows = (rows ?? []).filter(row => isReserveDriver(row) || SCHOOL_TABS.some(tab => tab.key !== 'ALL' && !SCHOOL_TIER_2_KEYS.includes(tab.key) && isSchoolAllowed(tab.key, allowedSchools) && driverMatchesSchool(row, tab)));
    return {
      schools: stats.filter(stat => stat.activeCount + stat.inactiveCount > 0).length,
      activeCount: allRows.filter(row => row.status === 'active').length,
      inactiveCount: allRows.filter(row => row.status !== 'active').length,
      microbusCount: allRows.filter(row => row.vehicleType === 'microbus').length,
      minivanCount: allRows.filter(row => row.vehicleType === 'minivan').length,
      sedanCount: allRows.filter(row => row.vehicleType === 'sedan').length,
      incompleteDocumentsCount: allRows.filter(row => row.hasIncompleteDocuments).length,
    };
  }, [rows, stats, allowedSchools]);

  const displayRows = useMemo(() => {
    const reserve = stats.find(stat => stat.key === DRIVER_RESERVE_KEY);
    const schoolStats = stats.filter(stat => stat.key !== DRIVER_RESERVE_KEY);
    const rows = buildGroupedRows(
      schoolStats,
      expandedGroups,
      ['activeCount', 'inactiveCount', 'microbusCount', 'minivanCount', 'sedanCount', 'incompleteDocumentsCount'],
      (a, b) => {
        const av = sortState.key === 'school' ? a.label : a.data[sortState.key];
        const bv = sortState.key === 'school' ? b.label : b.data[sortState.key];
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
        return sortState.dir === 'asc' ? cmp : -cmp;
      },
    );
    if (!reserve) return rows;
    return [...rows, { key: reserve.key, label: reserve.label, color: reserve.color, logo: reserve.logo, isGroup: false, isChild: false, data: reserve }];
  }, [stats, expandedGroups, sortState]);

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <DashboardTopPanel className="dashboard-control-row">
          <LogisticsTabs value="drivers" onChange={onTabChange} />
          <div style={{ flex: 1 }} />
          <DashboardSearch value={search} onChange={onSearchChange} placeholder="Поиск школы…" />
          <HiddenSchoolsList onSelectSchool={onSelectSchool} allowedSchools={allowedSchools} />
        </DashboardTopPanel>
        <SchoolDashboardTable
          columns={[
            { key: 'school', label: 'Школа', total: totals.schools, color: KPI_COLORS.school },
            { key: 'activeCount', label: 'Активные', total: totals.activeCount, color: KPI_COLORS.activeCount },
            { key: 'inactiveCount', label: 'Неактивные', total: totals.inactiveCount, color: KPI_COLORS.inactiveCount },
            { key: 'microbusCount', label: 'Микробусы', total: totals.microbusCount, color: KPI_COLORS.microbusCount },
            { key: 'minivanCount', label: 'Минивэны', total: totals.minivanCount, color: KPI_COLORS.minivanCount },
            { key: 'sedanCount', label: 'Седаны', total: totals.sedanCount, color: KPI_COLORS.sedanCount },
            { key: 'incompleteDocumentsCount', label: 'Документы', total: totals.incompleteDocumentsCount, color: KPI_COLORS.incompleteDocumentsCount }
          ]}
          rows={displayRows.filter(row => row.label.toLowerCase().includes(search.trim().toLowerCase())).map(row => ({ ...row, values: { ...row.data } }))}
          sortKey={sortState.key}
          ascending={sortState.dir === 'asc'}
          onSort={key => handleSort(key as SortKey)}
          onSelect={key => displayRows.find(row => row.key === key)?.isGroup ? toggleGroup(key) : onSelectSchool(key)}
        />
      </div>

      <div aria-hidden="true" style={{ width: sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH, flexShrink: 0, transition: 'width .18s ease' }} />

      <SchoolDockSidebar
        items={stats.map(stat => ({ key: stat.key, label: stat.label, color: stat.color, logo: stat.logo }))}
        hidden={sidebarHidden}
        onHiddenChange={setSidebarHidden}
        onSelect={onSelectSchool}
      />
    </div>
  );
}
