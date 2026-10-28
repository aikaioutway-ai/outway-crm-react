import AllRecordsButton from '../../core/dashboard/AllRecordsButton';
import LogisticsTabs from './LogisticsTabs';
import { ManagerSearch } from './ManagerOverview';
import SchoolDashboardTable from './SchoolDashboardTable';
import HiddenSchoolsList from './HiddenSchoolsList';
import { useEffect, useMemo, useState } from 'react';
import { FamilyListRow } from '../../services/crmV2Service';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { SCHOOL_GROUPS, SCHOOL_TABS, SCHOOL_TIER_2_KEYS, isSchoolAllowed } from './constants';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from './schoolGrouping';
import { SchoolTier } from './SchoolTierTabs';
import { isNewUnassignedRow, transferIdentityKey } from './familiesRowHelpers';
import { isInTestTransfer, useTestTransfers } from './testTransfers';

type SortKey = 'school' | 'newRequests' | 'microbusAverage' | 'transferCount' | 'microbusCount' | 'lightVehicleCount';

interface LogisticsOverviewProps {
  onSelectSchool: (key: string) => void;
  onOpenFamily: (schoolKey: string, familyId: string, search: string, row: FamilyListRow) => void;
  onDrivers: () => void;
  view: 'table' | 'map';
  onViewChange: (view: 'table' | 'map') => void;
  allowedSchools?: string[];
  onSidebarWidthChange?: (width: number) => void;
}

interface LogisticsSchoolStat {
  key: string;
  label: string;
  color: string;
  logo?: string;
  newRequests: number;
  microbusAverage: number;
  transferCount: number;
  microbusCount: number;
  lightVehicleCount: number;
}

export const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#2563EB', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const KPI_COLORS: Record<SortKey, string> = {
  school: 'var(--text-2)',
  newRequests: '#378ADD',
  microbusAverage: '#2563EB',
  transferCount: '#2DD4BF',
  microbusCount: '#1D6FA4',
  lightVehicleCount: '#15803D',
};

const COLUMN_WEIGHTS: Record<SortKey, number> = {
  school: 1.6,
  newRequests: 1,
  microbusAverage: 1,
  transferCount: 1,
  microbusCount: 1,
  lightVehicleCount: 1,
};

const GRID_TEMPLATE = ['school', 'newRequests', 'microbusAverage', 'transferCount', 'microbusCount', 'lightVehicleCount']
  .map(key => `minmax(0, ${COLUMN_WEIGHTS[key as SortKey]}fr)`)
  .join(' ');

// Тестовые трансферы — черновики логиста: в статистику трансферов не входят.
function workRows(rows: FamilyListRow[]): FamilyListRow[] {
  return rows.filter(row => row.status !== 'rejected' && !isInTestTransfer(row));
}

function transferStats(rows: FamilyListRow[]) {
  const transferMap = new Map<string, { vehicleType: string; count: number }>();
  workRows(rows).forEach(row => {
    const key = transferIdentityKey(row);
    if (!key) return;
    const prev = transferMap.get(key);
    transferMap.set(key, {
      vehicleType: prev?.vehicleType ?? row.vehicleType,
      count: (prev?.count ?? 0) + 1,
    });
  });

  const transfers = Array.from(transferMap.values());
  const microbusTransfers = transfers.filter(item => item.vehicleType === 'microbus');
  const microbusStudents = microbusTransfers.reduce((sum, item) => sum + item.count, 0);
  const lightVehicleCount = transfers.filter(item => item.vehicleType === 'minivan' || item.vehicleType === 'sedan').length;
  return {
    transferCount: transfers.length,
    microbusAverage: microbusTransfers.length ? microbusStudents / microbusTransfers.length : 0,
    microbusCount: microbusTransfers.length,
    lightVehicleCount,
  };
}

function computeLogisticsStats(rows: FamilyListRow[], tier: SchoolTier, allowedSchools?: string[]): LogisticsSchoolStat[] {
  return SCHOOL_TABS.filter(tab => tab.key !== 'ALL' && isSchoolAllowed(tab.key, allowedSchools) && SCHOOL_TIER_2_KEYS.includes(tab.key) === (tier === '2.0')).map((tab, index) => {
    const schoolRows = rows.filter(row => row.branchFilter === tab.key);
    const transfers = transferStats(schoolRows);
    return {
      key: tab.key,
      label: tab.label,
      color: SCHOOL_COLORS[index % SCHOOL_COLORS.length],
      logo: tab.logo,
      newRequests: schoolRows.filter(row => isNewUnassignedRow(row) || isInTestTransfer(row)).length,
      microbusAverage: transfers.microbusAverage,
      transferCount: transfers.transferCount,
      microbusCount: transfers.microbusCount,
      lightVehicleCount: transfers.lightVehicleCount,
    };
  });
}

export default function LogisticsOverview({ onSelectSchool, onOpenFamily, onSidebarWidthChange, allowedSchools, view, onViewChange, onDrivers }: LogisticsOverviewProps) {
  const { data: allRows = null } = useFamiliesTable();
  const rows = useMemo(
    () => allRows?.filter(row => isSchoolAllowed(row.branchFilter, allowedSchools)) ?? null,
    [allRows, allowedSchools],
  );
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [schoolTier] = useState<SchoolTier>('1.0');
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  const testMarks = useTestTransfers();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- testMarks: пересчёт при смене тестовых отметок
  const stats = useMemo(() => computeLogisticsStats(rows ?? [], schoolTier, allowedSchools), [rows, schoolTier, allowedSchools, testMarks]);
  const totals = useMemo(() => {
    const tierRows = (rows ?? []).filter(row => SCHOOL_TIER_2_KEYS.includes(row.branchFilter) === (schoolTier === '2.0'));
    const transferSummary = transferStats(tierRows);
    return {
      schools: stats.length,
      newRequests: stats.reduce((sum, stat) => sum + stat.newRequests, 0),
      microbusAverage: transferSummary.microbusAverage,
      transferCount: transferSummary.transferCount,
      microbusCount: transferSummary.microbusCount,
      lightVehicleCount: transferSummary.lightVehicleCount,
    };
  }, [rows, stats, schoolTier]);

  const displayRows = useMemo(() => {
    // microbusAverage — среднее, не сумма: считаем отдельно взвешенным средним по числу микробусов
    const rows = buildGroupedRows(
      stats,
      expandedGroups,
      ['newRequests', 'transferCount', 'microbusCount', 'lightVehicleCount'],
      (a, b) => {
        const av = sortState.key === 'school' ? a.label : a.data[sortState.key];
        const bv = sortState.key === 'school' ? b.label : b.data[sortState.key];
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
        return sortState.dir === 'asc' ? cmp : -cmp;
      },
    );

    const statByKey = new Map(stats.map(s => [s.key, s]));
    return rows.map(row => {
      if (!row.isGroup) return row;
      const group = SCHOOL_GROUPS.find(g => g.key === row.key);
      const children = (group?.children ?? []).map(k => statByKey.get(k)).filter((s): s is LogisticsSchoolStat => !!s);
      const totalStudents = children.reduce((sum, c) => sum + c.microbusAverage * c.microbusCount, 0);
      const totalBuses = children.reduce((sum, c) => sum + c.microbusCount, 0);
      return { ...row, data: { ...row.data, microbusAverage: totalBuses ? totalStudents / totalBuses : 0 } };
    });
  }, [stats, expandedGroups, sortState]);

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DashboardTopPanel className="dashboard-control-row overview-control-row">
          <LogisticsTabs value={view} onChange={key => key === 'drivers' ? onDrivers() : onViewChange(key)} />
          <div style={{ flex: 1 }} />
          <ManagerSearch rows={rows.filter(row => isSchoolAllowed(row.branchFilter, allowedSchools))} onOpenFamily={onOpenFamily} />
          <div className="overview-icon-actions"><HiddenSchoolsList onSelectSchool={onSelectSchool} allowedSchools={allowedSchools} /><AllRecordsButton onClick={() => onSelectSchool('ALL')}/></div>
        </DashboardTopPanel>
        <SchoolDashboardTable commentScope="families/LogisticsOverview:overview"
          columns={[
            { key: 'school', label: 'Школа', total: totals.schools, color: KPI_COLORS.school },
            { key: 'newRequests', label: 'Новые заявки', total: totals.newRequests, color: KPI_COLORS.newRequests },
            { key: 'microbusAverage', label: 'Средний по МКР', total: totals.microbusAverage.toFixed(1), color: KPI_COLORS.microbusAverage },
            { key: 'transferCount', label: 'К-во трансферов', total: totals.transferCount, color: KPI_COLORS.transferCount },
            { key: 'microbusCount', label: 'Микробусы', total: totals.microbusCount, color: KPI_COLORS.microbusCount },
            { key: 'lightVehicleCount', label: 'Легковые', total: totals.lightVehicleCount, color: KPI_COLORS.lightVehicleCount }
          ]}
          rows={displayRows.map(row => ({ ...row, values: { ...row.data, microbusAverage: row.data.microbusAverage.toFixed(1) } }))}
          sortKey={sortState.key}
          ascending={sortState.dir === 'asc'}
          onSort={key => handleSort(key as SortKey)}
          onSelect={key => displayRows.find(row => row.key === key)?.isGroup ? toggleGroup(key) : onSelectSchool(key)}
        />
      </div>

      <div aria-hidden="true" style={{ width: sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH, flexShrink: 0, transition: 'width .18s ease' }} />

      <SchoolDockSidebar
        items={stats.map(s => ({ key: s.key, label: s.label, color: s.color, logo: s.logo }))}
        hidden={sidebarHidden}
        onHiddenChange={setSidebarHidden}
        onSelect={onSelectSchool}
      />
    </div>
  );
}
