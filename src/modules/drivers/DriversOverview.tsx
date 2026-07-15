import React, { useEffect, useMemo, useState } from 'react';
import { Bus, Car, ChevronDown, ChevronRight, ChevronUp, FileWarning, School, UserCheck, UserX } from 'lucide-react';
import { V2DriverTableRow } from '../../services/crmV2Service';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { SCHOOL_TABS } from '../families/constants';
import { KpiChip, SchoolAvatar } from '../families/ManagerOverview';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from '../families/SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from '../families/schoolGrouping';

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
  onSidebarWidthChange?: (width: number) => void;
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
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const KPI_COLORS: Record<SortKey, string> = {
  school: '#626C8B',
  activeCount: 'var(--success)',
  inactiveCount: '#EF7168',
  microbusCount: '#1D6FA4',
  minivanCount: '#15803D',
  sedanCount: '#BA7517',
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

function computeDriverStats(rows: V2DriverTableRow[]): DriverSchoolStat[] {
  const schoolStats = SCHOOL_TABS.filter(tab => tab.key !== 'ALL').map((tab, index) => {
    const schoolRows = rows.filter(row => !isReserveDriver(row) && driverMatchesSchool(row, tab));
    return statFromRows(tab.key, tab.label, SCHOOL_COLORS[index % SCHOOL_COLORS.length], schoolRows, tab.logo);
  });
  const reserveRows = rows.filter(isReserveDriver);
  return [
    ...schoolStats,
    statFromRows(DRIVER_RESERVE_KEY, 'Резерв', '#626C8B', reserveRows),
  ];
}

function ColumnCard({ sortKey, label, sortState, onSort, children }: {
  sortKey: SortKey;
  label: string;
  sortState: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sortState.key === sortKey;
  return (
    <div style={{ minWidth: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button
        onClick={() => onSort(sortKey)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          padding: '12px 16px',
          fontSize: 13,
          fontWeight: 800,
          color: active ? 'var(--accent)' : 'var(--text)',
          textTransform: 'uppercase',
          textAlign: 'left',
        }}
      >
        {label}
        {active && (sortState.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </button>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

export default function DriversOverview({ onSelectSchool, onSidebarWidthChange }: DriversOverviewProps) {
  const { data: rows = null } = useDriversTable();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  const stats = useMemo(() => computeDriverStats(rows ?? []), [rows]);
  const totals = useMemo(() => {
    const allRows = rows ?? [];
    return {
      schools: stats.filter(stat => stat.activeCount + stat.inactiveCount > 0).length,
      activeCount: allRows.filter(row => row.status === 'active').length,
      inactiveCount: allRows.filter(row => row.status !== 'active').length,
      microbusCount: allRows.filter(row => row.vehicleType === 'microbus').length,
      minivanCount: allRows.filter(row => row.vehicleType === 'minivan').length,
      sedanCount: allRows.filter(row => row.vehicleType === 'sedan').length,
      incompleteDocumentsCount: allRows.filter(row => row.hasIncompleteDocuments).length,
    };
  }, [rows, stats]);

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
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 12, flexShrink: 0 }}>
          <KpiChip icon={<School size={18} color="#fff" />} label="Школы с водителями" value={String(totals.schools)} color={KPI_COLORS.school} />
          <KpiChip icon={<UserCheck size={18} color="#fff" />} label="Активные" value={String(totals.activeCount)} color={KPI_COLORS.activeCount} />
          <KpiChip icon={<UserX size={18} color="#fff" />} label="Неактивные" value={String(totals.inactiveCount)} color={KPI_COLORS.inactiveCount} />
          <KpiChip icon={<Bus size={18} color="#fff" />} label="Микробусы" value={String(totals.microbusCount)} color={KPI_COLORS.microbusCount} />
          <KpiChip icon={<Car size={18} color="#fff" />} label="Минивэны" value={String(totals.minivanCount)} color={KPI_COLORS.minivanCount} />
          <KpiChip icon={<Car size={18} color="#fff" />} label="Седаны" value={String(totals.sedanCount)} color={KPI_COLORS.sedanCount} />
          <KpiChip icon={<FileWarning size={18} color="#fff" />} label="Документы не полные" value={String(totals.incompleteDocumentsCount)} color={KPI_COLORS.incompleteDocumentsCount} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 12 }}>
          <ColumnCard sortKey="school" label="Школы" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, index) => (
              <div
                key={row.key}
                onClick={() => row.isGroup ? toggleGroup(row.key) : onSelectSchool(row.key)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: row.isChild ? '0 16px 0 34px' : '0 16px', cursor: 'pointer', background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}
              >
                <SchoolAvatar logo={row.logo} label={row.label} color={row.color} size={row.isChild ? 22 : 26} radius={row.isChild ? 6 : 7} fontSize={row.isChild ? 10 : 11} />
                <span style={{ fontSize: row.isChild ? 13 : 14, fontWeight: row.isChild ? 550 : 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: row.isChild ? 'var(--text-2)' : undefined }}>{row.label}</span>
                {row.isGroup ? (
                  row.expanded ? <ChevronDown size={14} color="var(--text-2)" /> : <ChevronRight size={14} color="var(--text-2)" />
                ) : (
                  <ChevronRight size={14} color="var(--text-2)" />
                )}
              </div>
            ))}
          </ColumnCard>

          {([
            ['activeCount', 'Активные'],
            ['inactiveCount', 'Неактивные'],
            ['microbusCount', 'Микробусы'],
            ['minivanCount', 'Минивэны'],
            ['sedanCount', 'Седаны'],
            ['incompleteDocumentsCount', 'Документы'],
          ] as const).map(([key, label]) => (
            <ColumnCard key={key} sortKey={key} label={label} sortState={sortState} onSort={handleSort}>
              {displayRows.map((row, index) => {
                const value = row.data[key];
                return (
                  <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: Number(value) > 0 ? KPI_COLORS[key] : undefined }}>{value}</span>
                  </div>
                );
              })}
            </ColumnCard>
          ))}
        </div>
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
