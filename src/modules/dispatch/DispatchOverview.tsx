import { useEffect, useMemo, useState } from 'react';
import { School, Sunrise, Sunset } from 'lucide-react';
import { DashboardGrid, DashboardTopPanel, OverviewColumn as ColumnCard, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { fetchTodayRunsBoard, SchoolRunsBoardRow } from '../../services/transferRunService';
import { isSchoolAllowed } from '../families/constants';

type SortKey = 'school' | 'morningOnLine' | 'morningNotStarted' | 'eveningOnLine' | 'eveningNotStarted';

interface DispatchOverviewProps {
  onSelectSchool: (key: string) => void;
  allowedSchools?: string[];
}

const KPI_COLORS: Record<SortKey, string> = {
  school: '#626C8B',
  morningOnLine: 'var(--success)',
  morningNotStarted: '#EF7168',
  eveningOnLine: '#1D6FA4',
  eveningNotStarted: '#BA7517',
};

const GRID_TEMPLATE = 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)';
const ROW_HEIGHT = 56;
const POLL_MS = 30_000;

export default function DispatchOverview({ onSelectSchool, allowedSchools }: DispatchOverviewProps) {
  const [rows, setRows] = useState<SchoolRunsBoardRow[] | null>(null);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchTodayRunsBoard().then(data => { if (!cancelled) setRows(data); }).catch(() => { if (!cancelled) setRows([]); });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const displayRows = useMemo(() => {
    const filtered = (rows ?? []).filter(row => isSchoolAllowed(row.schoolKey, allowedSchools));
    return [...filtered].sort((a, b) => {
      const av = sortState.key === 'school' ? a.label : a[sortState.key];
      const bv = sortState.key === 'school' ? b.label : b[sortState.key];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, allowedSchools, sortState]);

  const totals = useMemo(() => displayRows.reduce((acc, row) => ({
    schools: acc.schools + 1,
    morningOnLine: acc.morningOnLine + row.morningOnLine,
    morningNotStarted: acc.morningNotStarted + row.morningNotStarted,
    eveningOnLine: acc.eveningOnLine + row.eveningOnLine,
    eveningNotStarted: acc.eveningNotStarted + row.eveningNotStarted,
  }), { schools: 0, morningOnLine: 0, morningNotStarted: 0, eveningOnLine: 0, eveningNotStarted: 0 }), [displayRows]);

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DashboardTopPanel className="dashboard-control-row">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          Кто уже на линии сегодня — обновляется каждые 30 секунд
        </div>
      </DashboardTopPanel>
      <DashboardGrid template={GRID_TEMPLATE}>
        <ColumnCard
          first
          sortKey="school"
          label="Школы"
          icon={<School size={17} color="#fff" />}
          value={String(totals.schools)}
          color={KPI_COLORS.school}
          sortState={sortState}
          onSort={handleSort}
        >
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {displayRows.map((row, index) => (
              <div
                key={row.schoolKey}
                onClick={() => onSelectSchool(row.schoolKey)}
                style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: '0 16px', cursor: 'pointer', background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}
              >
                <SchoolAvatar logo={row.logo} label={row.label} color="#378ADD" />
                <span style={{ fontSize: 14, fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              </div>
            ))}
          </div>
        </ColumnCard>

        {([
          ['morningOnLine', 'Утро — на линии', <Sunrise size={17} color="#fff" />, String(totals.morningOnLine)],
          ['morningNotStarted', 'Утро — ещё не вышли', <Sunrise size={17} color="#fff" />, String(totals.morningNotStarted)],
          ['eveningOnLine', 'Вечер — на линии', <Sunset size={17} color="#fff" />, String(totals.eveningOnLine)],
          ['eveningNotStarted', 'Вечер — ещё не вышли', <Sunset size={17} color="#fff" />, String(totals.eveningNotStarted)],
        ] as const).map(([key, label, icon, value]) => (
          <ColumnCard
            key={key}
            sortKey={key}
            label={label}
            icon={icon}
            value={value}
            color={KPI_COLORS[key]}
            sortState={sortState}
            onSort={handleSort}
          >
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {displayRows.map((row, index) => (
                <div key={row.schoolKey} style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row[key] > 0 ? KPI_COLORS[key] : undefined }}>{row[key]}</span>
                </div>
              ))}
            </div>
          </ColumnCard>
        ))}
      </DashboardGrid>
    </div>
  );
}
