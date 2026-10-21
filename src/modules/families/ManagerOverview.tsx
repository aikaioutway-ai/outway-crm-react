import { managerFinancialStats } from './managerFinancialStats';
import { useQuery } from '@tanstack/react-query';
import SchoolDashboardTable from './SchoolDashboardTable';
import DirectorySchoolDashboard from './DirectorySchoolDashboard';
import ManagerModeTabs, { ManagerMode } from './ManagerModeTabs';
import HiddenSchoolsList from './HiddenSchoolsList';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { fetchChargesForPeriod, FamilyListRow, PeriodChargeStats, BranchStat } from '../../services/crmV2Service';
import { useFamiliesTable, useBranchStats } from '../../hooks/useCrmQueries';
import { ALL_PERIODS, currentPayrollPeriodKey, SCHOOL_TABS, SCHOOL_TIER_2_KEYS, getBranchFilter, isSchoolAllowed } from './constants';
import { SchoolTier } from './SchoolTierTabs';
import { money } from '../../utils/pricing';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from './schoolGrouping';
import ManagerPeriodBar from './ManagerPeriodBar';
import NewFamilyModal from './NewFamilyModal';
import { DashboardTopPanel, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { formatName, phoneMatchesQuery, phoneQueryDigits } from '../../utils/format';
import { isNewUnassignedRow } from './familiesRowHelpers';

export interface SchoolStat {
  key: string;
  label: string;
  color: string;
  logo?: string;
  childrenCount: number;
  newRequests: number;
  charged: number;
  paid: number;
  pendingCount: number;
  pendingSum: number;
  debtSum: number;
  balance: number;
  debtorsCount?: number;
  boarded?: number;
  uncharged?: number;
}

type SortKey = 'debtorsCount' | 'boarded' | 'uncharged' | 'school' | 'childrenCount' | 'newRequests' | 'charged' | 'paid' | 'debtSum' | 'balance';

interface ManagerOverviewProps {
  mode: ManagerMode;
  canViewAccruals?: boolean;
  onModeChange: (mode: ManagerMode) => void;
  onSelectSchool: (key: string) => void;
  onSidebarWidthChange?: (width: number) => void;
  onOpenFamily?: (schoolKey: string, familyId: string, searchQuery: string) => void;
  allowedSchools?: string[];
}

const EMPTY_PERIOD_STATS: PeriodChargeStats[] = [];

const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#2563EB', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

export const KPI_COLORS = {
  childrenCount: '#7F77DD',
  newRequests: '#378ADD',
  charged: '#2563EB',
  paid: 'var(--success)',
  pendingCount: '#B45309',
  pendingSum: '#B45309',
  debtSum: 'var(--danger)',
  balance: 'var(--accent)',
};

export function computeSchoolStats(rows: FamilyListRow[]): SchoolStat[] {
  const schools = SCHOOL_TABS.filter(t => t.key !== 'ALL');
  return schools.map((tab, index) => {
    const schoolRows = rows.filter(r => r.branchFilter === tab.key);
    const familyMap = new Map<string, FamilyListRow>();
    schoolRows.forEach(r => { if (!familyMap.has(r.familyId)) familyMap.set(r.familyId, r); });
    const families = Array.from(familyMap.values());

    return {
      key: tab.key,
      label: tab.label,
      color: SCHOOL_COLORS[index % SCHOOL_COLORS.length],
      logo: tab.logo,
      childrenCount: schoolRows.length,
      newRequests: schoolRows.filter(isNewUnassignedRow).length,
      charged: families.reduce((sum, f) => sum + f.totalCharged, 0),
      paid: families.reduce((sum, f) => sum + f.totalPaid, 0),
      pendingCount: families.reduce((sum, f) => sum + f.pendingPaymentCount, 0),
      pendingSum: families.reduce((sum, f) => sum + f.pendingPayment, 0),
      debtSum: families.reduce((sum, f) => sum + Math.max(0, f.debtAmount), 0),
      balance: families.reduce((sum, f) => sum + f.balance, 0),
    };
  });
}

/** То же самое, что computeSchoolStats, но источник — агрегаты по филиалам
 * из RPC get_branch_stats (BranchStat[], 20-40 строк), а не полная таблица
 * семей/детей. Считает идентично: складывает branch-агрегаты, попавшие в
 * одну вкладку школы через ту же группировку getBranchFilter. */
export function computeSchoolStatsFromBranches(branches: BranchStat[]): SchoolStat[] {
  const schools = SCHOOL_TABS.filter(t => t.key !== 'ALL');
  const byTab = new Map<string, BranchStat[]>();
  branches.forEach(b => {
    const tabKey = getBranchFilter(b.branchName, b.branchCode);
    if (!byTab.has(tabKey)) byTab.set(tabKey, []);
    byTab.get(tabKey)!.push(b);
  });

  return schools.map((tab, index) => {
    const items = byTab.get(tab.key) ?? [];
    return {
      key: tab.key,
      label: tab.label,
      color: SCHOOL_COLORS[index % SCHOOL_COLORS.length],
      logo: tab.logo,
      childrenCount: items.reduce((sum, b) => sum + b.childrenCount, 0),
      newRequests: items.reduce((sum, b) => sum + b.newRequests, 0),
      charged: items.reduce((sum, b) => sum + b.charged, 0),
      paid: items.reduce((sum, b) => sum + b.paid, 0),
      pendingCount: items.reduce((sum, b) => sum + b.pendingCount, 0),
      pendingSum: items.reduce((sum, b) => sum + b.pendingSum, 0),
      debtSum: items.reduce((sum, b) => sum + b.debtSum, 0),
      balance: items.reduce((sum, b) => sum + b.balance, 0),
    };
  });
}

export function ManagerSearch({ rows, onOpenFamily, collapsible = false, compact = false }: {
  rows: FamilyListRow[];
  onOpenFamily?: (schoolKey: string, familyId: string, searchQuery: string) => void;
  collapsible?: boolean;
  compact?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const digitsQuery = phoneQueryDigits(query) ?? '';

  const suggestions = useMemo(() => {
    if (normalizedQuery.length < 2 && digitsQuery.length < 3) return [];
    const seen = new Set<string>();
    const matches: FamilyListRow[] = [];
    for (const row of rows) {
      if (seen.has(row.familyId)) continue;
      const haystack = `${row.parentName} ${row.childName}`.toLowerCase();
      const matchesText = normalizedQuery.length >= 2 && haystack.includes(normalizedQuery);
      const matchesPhone = phoneMatchesQuery(query, row.phone, row.secondPhone);
      if (matchesText || matchesPhone) {
        seen.add(row.familyId);
        matches.push(row);
        if (matches.length >= 8) break;
      }
    }
    return matches;
  }, [rows, normalizedQuery, digitsQuery, query]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setFocused(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const select = (row: FamilyListRow) => {
    // Подсказки ищут по полному имени из базы, включая отчество. Таблица
    // отображает и индексирует имя через formatName (фамилия + имя), поэтому
    // после выбора передаём ту же нормализованную форму и не получаем пустой список.
    const searchQuery = row.childName
      ? formatName(row.childName)
      : row.parentName
        ? formatName(row.parentName)
        : row.phone;
    onOpenFamily?.(row.branchFilter, row.familyId, searchQuery);
    setQuery('');
    setFocused(false);
    if (collapsible) setExpanded(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); select(suggestions[activeIndex]); }
    else if (event.key === 'Escape') {
      setFocused(false);
      if (collapsible) {
        setQuery('');
        setExpanded(false);
      }
    }
  };

  const showDropdown = focused && query.trim().length > 0;

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label="Открыть общий поиск"
        title="Общий поиск"
        onClick={() => { setExpanded(true); setFocused(true); }}
        style={{ width: 34, height: 34, marginBottom: 8, border: 'none', borderRadius: 10, background: '#F5FAFB', color: 'var(--text-2)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 5px 16px rgba(43, 72, 89, .06)' }}
      >
        <Search size={17} />
      </button>
    );
  }

  const fieldHeight = compact ? 34 : 44;
  return (
    <div ref={containerRef} style={{ position: 'relative', width: compact ? 330 : 360, height: fieldHeight, marginBottom: compact ? 8 : 0, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--border)', borderRadius: compact ? 10 : 12, padding: '0 10px', height: fieldHeight, boxSizing: 'border-box', boxShadow: compact ? '0 5px 16px rgba(43, 72, 89, .06)' : undefined }}>
        <Search size={16} color="var(--text-2)" />
        <input
          autoFocus={collapsible}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск: ребёнок, родитель, телефон"
          style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, fontSize: 13 }}
        />
        {(query || collapsible) && (
          <button
            type="button"
            aria-label={collapsible ? 'Закрыть поиск' : 'Очистить поиск'}
            onClick={() => {
              setQuery('');
              if (collapsible) {
                setFocused(false);
                setExpanded(false);
              }
            }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showDropdown && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 30px rgba(23, 34, 47, 0.12)', zIndex: 90, maxHeight: 320, overflowY: 'auto' }}>
          {suggestions.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>Ничего не найдено</div>
          ) : suggestions.map((row, i) => {
            const tab = SCHOOL_TABS.find(t => t.key === row.branchFilter);
            return (
              <div
                key={row.familyId}
                onMouseDown={event => { event.preventDefault(); select(row); }}
                onMouseEnter={() => setActiveIndex(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: i === activeIndex ? 'var(--surface-2)' : undefined }}
              >
                <SchoolAvatar logo={tab?.logo} label={tab?.label ?? row.branchFilter} color="#626C8B" size={26} radius={7} fontSize={10} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.childName || row.parentName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.parentName} · {row.phone}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>{tab?.label ?? row.branchFilter}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ManagerOverview({ mode, canViewAccruals = false, onModeChange, onSelectSchool, onSidebarWidthChange, onOpenFamily, allowedSchools }: ManagerOverviewProps) {
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [periodKey, setPeriodKey] = useState(currentPayrollPeriodKey);
  const [schoolTier] = useState<SchoolTier>('1.0');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  // Стандартный вид («За всё время») — лёгкий RPC-агрегат по филиалам.
  const branchStatsQuery = useBranchStats();
  // Rows also supply the boarding alerts beside each school.
  const familiesQuery = useFamiliesTable();
  const rows: FamilyListRow[] | null = familiesQuery.data ?? null;
  const accessibleRows = useMemo(
    () => rows?.filter(row => isSchoolAllowed(row.branchFilter, allowedSchools)) ?? null,
    [allowedSchools, rows],
  );
  const loadError = branchStatsQuery.isError;

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  const periodQuery = useQuery({
    queryKey: ['manager-charge-stats', periodKey],
    enabled: mode !== 'directory',
    queryFn: () => {
      if (periodKey === 'ALL') return fetchChargesForPeriod(null, null, null, true);
      const period = ALL_PERIODS.find(p => p.key === periodKey);
      if (!period) throw new Error('Неизвестный период');
      const deposit = period.key === 'deposit';
      return fetchChargesForPeriod(deposit ? null : period.month, deposit ? null : period.year, deposit ? 'deposit' : null);
    },
  });
  const periodStats = periodQuery.data ?? EMPTY_PERIOD_STATS;

  const stats = useMemo(
    () => computeSchoolStatsFromBranches(branchStatsQuery.data ?? [])
      .filter(stat => isSchoolAllowed(stat.key, allowedSchools))
      .filter(stat => SCHOOL_TIER_2_KEYS.includes(stat.key) === (schoolTier === '2.0')),
    [allowedSchools, branchStatsQuery.data, schoolTier],
  );

  const displayStats = useMemo(() => managerFinancialStats(stats, accessibleRows ?? [], periodStats, periodKey === 'ALL'), [stats, accessibleRows, periodStats, periodKey]);

  const totals = useMemo(() => displayStats.reduce((acc, s) => ({
    debtorsCount: acc.debtorsCount + (s.debtorsCount ?? 0),
    boarded: acc.boarded + (s.boarded ?? 0),
    uncharged: acc.uncharged + (s.uncharged ?? 0),
    childrenCount: acc.childrenCount + s.childrenCount,
    newRequests: acc.newRequests + s.newRequests,
    charged: acc.charged + s.charged,
    paid: acc.paid + s.paid,
    debtSum: acc.debtSum + s.debtSum,
    balance: acc.balance + s.balance,
  }), { debtorsCount: 0, boarded: 0, uncharged: 0, childrenCount: 0, newRequests: 0, charged: 0, paid: 0, debtSum: 0, balance: 0 }), [displayStats]);

  const displayRows = useMemo(() => buildGroupedRows(
    displayStats,
    expandedGroups,
    ['debtorsCount', 'boarded', 'uncharged', 'childrenCount', 'newRequests', 'charged', 'paid', 'pendingCount', 'pendingSum', 'debtSum', 'balance'],
    (a, b) => {
      const av = sortState.key === 'school' ? a.label : a.data[sortState.key];
      const bv = sortState.key === 'school' ? b.label : b.data[sortState.key];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortState.dir === 'asc' ? cmp : -cmp;
    },
  ), [displayStats, expandedGroups, sortState]);

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  if (branchStatsQuery.isPending) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
      {loadError && (
        <div style={{ padding: '8px 14px', margin: '0 0 8px', background: '#FBEAE9', border: '1px solid #F0C4C0', borderRadius: 10, color: '#B3261E', fontSize: 12.5, fontWeight: 600 }}>
          Не удалось обновить данные — показаны последние загруженные. Проверьте соединение и обновите страницу.
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <DashboardTopPanel className="dashboard-control-row">
          <ManagerModeTabs canViewAccruals={canViewAccruals} value={mode} onChange={onModeChange} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            {mode !== 'directory' && <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} />}
          </div>
          <ManagerSearch rows={accessibleRows ?? []} onOpenFamily={onOpenFamily} />
          <HiddenSchoolsList onSelectSchool={onSelectSchool} allowedSchools={allowedSchools} />
          <button
            type="button"
            onClick={() => setShowNewFamily(true)}
            style={{
              height: 44,
              padding: '0 16px',
              border: 'none',
              borderRadius: 12,
              background: 'var(--accent)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              flexShrink: 0,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={17} strokeWidth={2.4} />
            Новый заказ
          </button>
        </DashboardTopPanel>

        {mode !== 'directory' && (periodQuery.isPending || familiesQuery.isPending) ? <div role="status" style={{ padding: 24 }}>Загрузка начислений…</div> : mode !== 'directory' && (periodQuery.isError || familiesQuery.isError) ? <div role="alert" style={{ padding: 24 }}>Не удалось загрузить начисления. <button onClick={() => { void periodQuery.refetch(); void familiesQuery.refetch(); }}>Повторить</button></div> : mode === 'directory' ? <DirectorySchoolDashboard rows={accessibleRows ?? []} allowedSchools={allowedSchools} onSelectSchool={onSelectSchool} /> : (
        <SchoolDashboardTable
          columns={[
            { key: 'school', label: 'Школа', total: displayStats.length, color: '#64748B' },
            ...(mode === 'accruals' ? [
              { key: 'boarded', label: 'Посажены', total: totals.boarded, color: KPI_COLORS.childrenCount },
            ] : [
              { key: 'debtorsCount', label: 'Должников', total: totals.debtorsCount, color: KPI_COLORS.newRequests },
            ]),
            { key: 'charged', label: 'Начислено', total: money(totals.charged), color: KPI_COLORS.charged },
            ...(mode === 'accruals' ? [
              { key: 'uncharged', label: 'Без начислений', total: totals.uncharged, color: '#B45309' },
            ] : [
            { key: 'paid', label: 'Оплачено', total: money(totals.paid), color: KPI_COLORS.paid },
            { key: 'debtSum', label: 'Сумма долга', total: money(totals.debtSum), color: KPI_COLORS.debtSum },
            { key: 'balance', label: 'Баланс', total: totals.balance.toLocaleString('ru-RU'), color: KPI_COLORS.balance },
            ]),
          ]}
          rows={displayRows.map(row => ({ ...row, values: { debtorsCount: row.data.debtorsCount ?? 0, boarded: row.data.boarded ?? 0, uncharged: row.data.uncharged ?? 0, newRequests: row.data.newRequests, charged: money(row.data.charged), paid: money(row.data.paid), debtSum: money(row.data.debtSum), balance: row.data.balance.toLocaleString('ru-RU') } }))}
          sortKey={sortState.key}
          ascending={sortState.dir === 'asc'}
          onSort={key => handleSort(key as SortKey)}
          onSelect={key => displayRows.find(row => row.key === key)?.isGroup ? toggleGroup(key) : onSelectSchool(key)}
        />
        )}
      </div>

      <div aria-hidden="true" style={{ width: sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH, flexShrink: 0, transition: 'width .18s ease' }} />

      <SchoolDockSidebar
        items={stats.map(s => ({ key: s.key, label: s.label, color: s.color, logo: s.logo }))}
        hidden={sidebarHidden}
        onHiddenChange={setSidebarHidden}
        onSelect={onSelectSchool}
      />
      {showNewFamily && <NewFamilyModal onClose={() => setShowNewFamily(false)} />}
      </div>
    </div>
  );
}
