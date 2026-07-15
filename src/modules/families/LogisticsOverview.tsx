import React, { useEffect, useMemo, useState } from 'react';
import { Bus, Car, ChevronDown, ChevronRight, ChevronUp, Inbox, School } from 'lucide-react';
import { FamilyListRow } from '../../services/crmV2Service';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { SCHOOL_GROUPS, SCHOOL_TABS } from './constants';
import { KpiChip, SchoolAvatar } from './ManagerOverview';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from './schoolGrouping';

type SortKey = 'school' | 'newRequests' | 'microbusAverage' | 'transferCount' | 'microbusCount' | 'lightVehicleCount';

interface LogisticsOverviewProps {
  onSelectSchool: (key: string) => void;
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
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const KPI_COLORS: Record<SortKey, string> = {
  school: '#626C8B',
  newRequests: '#378ADD',
  microbusAverage: '#BA7517',
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

function workRows(rows: FamilyListRow[]): FamilyListRow[] {
  return rows.filter(row => row.status !== 'rejected');
}

function transferStats(rows: FamilyListRow[]) {
  const transferMap = new Map<string, { vehicleType: string; count: number }>();
  workRows(rows).forEach(row => {
    if (!row.transferNumber) return;
    const branchKey = row.branchId ?? row.branchFilter ?? row.branchShort ?? row.branchName ?? 'school';
    const key = `${branchKey}:${row.transferNumber}`;
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

function computeLogisticsStats(rows: FamilyListRow[]): LogisticsSchoolStat[] {
  return SCHOOL_TABS.filter(tab => tab.key !== 'ALL').map((tab, index) => {
    const schoolRows = rows.filter(row => row.branchFilter === tab.key);
    const transfers = transferStats(schoolRows);
    return {
      key: tab.key,
      label: tab.label,
      color: SCHOOL_COLORS[index % SCHOOL_COLORS.length],
      logo: tab.logo,
      newRequests: schoolRows.filter(row => row.status === 'new').length,
      microbusAverage: transfers.microbusAverage,
      transferCount: transfers.transferCount,
      microbusCount: transfers.microbusCount,
      lightVehicleCount: transfers.lightVehicleCount,
    };
  });
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

export default function LogisticsOverview({ onSelectSchool, onSidebarWidthChange }: LogisticsOverviewProps) {
  const { data: rows = null } = useFamiliesTable(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  const stats = useMemo(() => computeLogisticsStats(rows ?? []), [rows]);
  const totals = useMemo(() => {
    const transferSummary = transferStats(rows ?? []);
    return {
      schools: stats.length,
      newRequests: stats.reduce((sum, stat) => sum + stat.newRequests, 0),
      microbusAverage: transferSummary.microbusAverage,
      transferCount: transferSummary.transferCount,
      microbusCount: transferSummary.microbusCount,
      lightVehicleCount: transferSummary.lightVehicleCount,
    };
  }, [rows, stats]);

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
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 12, flexShrink: 0 }}>
          <KpiChip icon={<School size={18} color="#fff" />} label="Школы" value={String(totals.schools)} color={KPI_COLORS.school} />
          <KpiChip icon={<Inbox size={18} color="#fff" />} label="Новые заявки" value={String(totals.newRequests)} color={KPI_COLORS.newRequests} />
          <KpiChip icon={<Bus size={18} color="#fff" />} label="Средний по МКР" value={totals.microbusAverage.toFixed(1)} color={KPI_COLORS.microbusAverage} />
          <KpiChip icon={<Bus size={18} color="#fff" />} label="К-во трансферов" value={String(totals.transferCount)} color={KPI_COLORS.transferCount} />
          <KpiChip icon={<Bus size={18} color="#fff" />} label="Микробусы" value={String(totals.microbusCount)} color={KPI_COLORS.microbusCount} />
          <KpiChip icon={<Car size={18} color="#fff" />} label="Легковые" value={String(totals.lightVehicleCount)} color={KPI_COLORS.lightVehicleCount} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 12 }}>
          <ColumnCard sortKey="school" label="Школы" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div
                key={row.key}
                onClick={() => row.isGroup ? toggleGroup(row.key) : onSelectSchool(row.key)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: row.isChild ? '0 16px 0 34px' : '0 16px', cursor: 'pointer', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}
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

          <ColumnCard sortKey="newRequests" label="Новые заявки" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.newRequests > 0 ? KPI_COLORS.newRequests : undefined }}>{row.data.newRequests}</span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="microbusAverage" label="Средний по МКР" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.microbusAverage > 0 ? KPI_COLORS.microbusAverage : undefined }}>{row.data.microbusAverage.toFixed(1)}</span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="transferCount" label="К-во трансферов" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.transferCount > 0 ? KPI_COLORS.transferCount : undefined }}>{row.data.transferCount}</span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="microbusCount" label="Микробусы" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.microbusCount > 0 ? KPI_COLORS.microbusCount : undefined }}>{row.data.microbusCount}</span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="lightVehicleCount" label="Легковые" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.lightVehicleCount > 0 ? KPI_COLORS.lightVehicleCount : undefined }}>{row.data.lightVehicleCount}</span>
              </div>
            ))}
          </ColumnCard>
        </div>
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
