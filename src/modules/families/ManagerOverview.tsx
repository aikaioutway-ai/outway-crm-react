import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Inbox, Landmark, Plus, Receipt, Search, Users, Wallet, X } from 'lucide-react';
import { fetchChargesForPeriod, FamilyListRow, PeriodChargeStats, BranchStat } from '../../services/crmV2Service';
import { useFamiliesTable, useBranchStats } from '../../hooks/useCrmQueries';
import { ALL_PERIODS, SCHOOL_TABS, getBranchFilter, isSchoolAllowed } from './constants';
import { money } from '../../utils/pricing';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from './schoolGrouping';
import ManagerPeriodBar from './ManagerPeriodBar';
import NewFamilyModal from './NewFamilyModal';
import { DashboardGrid, DashboardTopPanel, OverviewColumn as ColumnCard, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { formatName } from '../../utils/format';

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
}

type SortKey = 'school' | 'childrenCount' | 'newRequests' | 'charged' | 'paid' | 'debtSum' | 'balance';

interface ManagerOverviewProps {
  onSelectSchool: (key: string) => void;
  onSidebarWidthChange?: (width: number) => void;
  onOpenFamily?: (schoolKey: string, familyId: string, searchQuery: string) => void;
  allowedSchools?: string[];
}

const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

export const KPI_COLORS = {
  childrenCount: '#7F77DD',
  newRequests: '#378ADD',
  charged: '#BA7517',
  paid: 'var(--success)',
  pendingCount: '#B45309',
  pendingSum: '#B45309',
  debtSum: 'var(--danger)',
  balance: 'var(--accent)',
};

const COLUMN_WEIGHTS: Record<SortKey, number> = {
  school: 1.6,
  childrenCount: 0.9,
  newRequests: 1.1,
  charged: 1,
  paid: 1,
  debtSum: 1,
  balance: 1,
};

const KPI_GRID_TEMPLATE = ['school', 'newRequests', 'charged', 'paid', 'debtSum', 'balance']
  .map(key => `minmax(0, ${COLUMN_WEIGHTS[key as SortKey]}fr)`)
  .join(' ');

const ROW_HEIGHT = 56;

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
      newRequests: schoolRows.filter(r => r.status === 'new').length,
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
  const digitsQuery = query.replace(/\D/g, '');

  const suggestions = useMemo(() => {
    if (normalizedQuery.length < 2 && digitsQuery.length < 3) return [];
    const seen = new Set<string>();
    const matches: FamilyListRow[] = [];
    for (const row of rows) {
      if (seen.has(row.familyId)) continue;
      const haystack = `${row.parentName} ${row.childName}`.toLowerCase();
      const phoneDigits = `${row.phone} ${row.secondPhone}`.replace(/\D/g, '');
      const matchesText = normalizedQuery.length >= 2 && haystack.includes(normalizedQuery);
      const matchesPhone = digitsQuery.length >= 3 && phoneDigits.includes(digitsQuery);
      if (matchesText || matchesPhone) {
        seen.add(row.familyId);
        matches.push(row);
        if (matches.length >= 8) break;
      }
    }
    return matches;
  }, [rows, normalizedQuery, digitsQuery]);

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
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.childName || row.parentName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.parentName} · {row.phone}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>{tab?.label ?? row.branchFilter}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ManagerOverview({ onSelectSchool, onSidebarWidthChange, onOpenFamily, allowedSchools }: ManagerOverviewProps) {
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [periodKey, setPeriodKey] = useState('ALL');
  const [periodStats, setPeriodStats] = useState<PeriodChargeStats[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  // Каждая колонка KPI — отдельный скролл-контейнер (своя высота заголовка не
  // влияет на body), поэтому синхронизируем scrollTop между ними вручную —
  // иначе при скролле одной колонки школы «съезжают» относительно остальных.
  const columnScrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isSyncingScroll = useRef(false);
  const registerColumnScroll = (index: number) => (el: HTMLDivElement | null) => {
    columnScrollRefs.current[index] = el;
  };
  const handleColumnScroll = (index: number) => (event: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const top = event.currentTarget.scrollTop;
    columnScrollRefs.current.forEach((el, i) => {
      if (el && i !== index) el.scrollTop = top;
    });
    isSyncingScroll.current = false;
  };

  // Стандартный вид («За всё время») — лёгкий RPC-агрегат по филиалам.
  const branchStatsQuery = useBranchStats();
  // Полная таблица семей нужна только для разбивки по конкретному периоду
  // (charged/paid по месяцу привязаны к семье, а не к филиалу) — грузим её
  // лениво, только когда period выбран, а не всегда при заходе на экран.
  const familiesQuery = useFamiliesTable(true, { enabled: periodKey !== 'ALL' });
  const rows: FamilyListRow[] | null = familiesQuery.data ?? null;
  const accessibleRows = useMemo(
    () => rows?.filter(row => isSchoolAllowed(row.branchFilter, allowedSchools)) ?? null,
    [allowedSchools, rows],
  );
  const loadError = branchStatsQuery.isError;

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  useEffect(() => {
    if (periodKey === 'ALL') { setPeriodStats([]); return; }
    const period = ALL_PERIODS.find(p => p.key === periodKey);
    if (!period) return;
    let cancelled = false;
    const isDeposit = period.key === 'deposit';
    fetchChargesForPeriod(
      isDeposit ? null : period.month,
      isDeposit ? null : period.year,
      isDeposit ? 'deposit' : null,
    ).then(result => { if (!cancelled) setPeriodStats(result); }).catch(console.error);
    return () => { cancelled = true; };
  }, [periodKey]);

  const stats = useMemo(
    () => computeSchoolStatsFromBranches(branchStatsQuery.data ?? []).filter(stat => isSchoolAllowed(stat.key, allowedSchools)),
    [allowedSchools, branchStatsQuery.data],
  );

  const displayStats = useMemo(() => {
    if (periodKey === 'ALL' || periodStats.length === 0) return stats;
    const familyToSchool = new Map<string, string>();
    (accessibleRows ?? []).forEach(r => { if (!familyToSchool.has(r.familyId)) familyToSchool.set(r.familyId, r.branchFilter); });
    const perSchool = new Map<string, { charged: number; paid: number; debt: number }>();
    periodStats.forEach(s => {
      const school = familyToSchool.get(s.familyId);
      if (!school) return;
      const acc = perSchool.get(school) ?? { charged: 0, paid: 0, debt: 0 };
      acc.charged += s.charged;
      acc.paid += s.paid;
      acc.debt += s.debt;
      perSchool.set(school, acc);
    });
    return stats.map(s => {
      const period = perSchool.get(s.key);
      return { ...s, charged: period?.charged ?? 0, paid: period?.paid ?? 0, debtSum: period?.debt ?? 0 };
    });
  }, [stats, periodStats, periodKey, accessibleRows]);

  const totals = useMemo(() => displayStats.reduce((acc, s) => ({
    childrenCount: acc.childrenCount + s.childrenCount,
    newRequests: acc.newRequests + s.newRequests,
    charged: acc.charged + s.charged,
    paid: acc.paid + s.paid,
    debtSum: acc.debtSum + s.debtSum,
    balance: acc.balance + s.balance,
  }), { childrenCount: 0, newRequests: 0, charged: 0, paid: 0, debtSum: 0, balance: 0 }), [displayStats]);

  const displayRows = useMemo(() => buildGroupedRows(
    displayStats,
    expandedGroups,
    ['childrenCount', 'newRequests', 'charged', 'paid', 'pendingCount', 'pendingSum', 'debtSum', 'balance'],
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
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
      {loadError && (
        <div style={{ padding: '8px 14px', margin: '0 0 8px', background: '#FBEAE9', border: '1px solid #F0C4C0', borderRadius: 10, color: '#B3261E', fontSize: 12.5, fontWeight: 700 }}>
          Не удалось обновить данные — показаны последние загруженные. Проверьте соединение и обновите страницу.
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <DashboardTopPanel className="dashboard-control-row">
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} />
          </div>
          <ManagerSearch rows={accessibleRows ?? []} onOpenFamily={onOpenFamily} />
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
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={17} strokeWidth={2.4} />
            Новый заказ
          </button>
        </DashboardTopPanel>

        <DashboardGrid template={KPI_GRID_TEMPLATE}>
            <ColumnCard
              first
              sortKey="school"
              label="Дети"
              icon={<Users size={17} color="#fff" />}
              value={String(totals.childrenCount)}
              color={KPI_COLORS.childrenCount}
              sortState={sortState}
              onSort={handleSort}
            >
              <div ref={registerColumnScroll(0)} onScroll={handleColumnScroll(0)} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {displayRows.map((row, i) => (
                  <div
                    key={row.key}
                    onClick={() => row.isGroup ? toggleGroup(row.key) : onSelectSchool(row.key)}
                    style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: row.isChild ? '0 16px 0 34px' : '0 16px', cursor: 'pointer', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}
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
              </div>
            </ColumnCard>

            <ColumnCard
              sortKey="newRequests"
              label="Новые заявки"
              icon={<Inbox size={17} color="#fff" />}
              value={String(totals.newRequests)}
              color={KPI_COLORS.newRequests}
              sortState={sortState}
              onSort={handleSort}
            >
            <div ref={registerColumnScroll(1)} onScroll={handleColumnScroll(1)} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {displayRows.map((row, i) => (
                <div key={row.key} style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{row.data.newRequests}</span>
                </div>
              ))}
            </div>
            </ColumnCard>

            <ColumnCard
              sortKey="charged"
              label="Начислено"
              icon={<Receipt size={17} color="#fff" />}
              value={money(totals.charged)}
              color={KPI_COLORS.charged}
              sortState={sortState}
              onSort={handleSort}
            >
            <div ref={registerColumnScroll(2)} onScroll={handleColumnScroll(2)} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {displayRows.map((row, i) => (
                <div key={row.key} style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{row.data.charged > 0 ? money(row.data.charged) : '0'}</span>
                </div>
              ))}
            </div>
            </ColumnCard>

            <ColumnCard
              sortKey="paid"
              label="Оплачено"
              icon={<CheckCircle2 size={17} color="#fff" />}
              value={money(totals.paid)}
              color={KPI_COLORS.paid}
              sortState={sortState}
              onSort={handleSort}
            >
            <div ref={registerColumnScroll(3)} onScroll={handleColumnScroll(3)} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {displayRows.map((row, i) => (
                <div key={row.key} style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.data.paid > 0 ? 'var(--success)' : undefined }}>{row.data.paid > 0 ? money(row.data.paid) : '0'}</span>
                </div>
              ))}
            </div>
            </ColumnCard>

            <ColumnCard
              sortKey="debtSum"
              label="Сумма долга"
              icon={<Landmark size={17} color="#fff" />}
              value={money(totals.debtSum)}
              color={KPI_COLORS.debtSum}
              sortState={sortState}
              onSort={handleSort}
            >
            <div ref={registerColumnScroll(4)} onScroll={handleColumnScroll(4)} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {displayRows.map((row, i) => (
                <div key={row.key} style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.data.debtSum > 0 ? 'var(--danger)' : undefined }}>{row.data.debtSum > 0 ? money(row.data.debtSum) : '0'}</span>
                </div>
              ))}
            </div>
            </ColumnCard>

            <ColumnCard
              sortKey="balance"
              label="Баланс"
              icon={<Wallet size={17} color="#fff" />}
              value={totals.balance.toLocaleString('ru-RU')}
              color={KPI_COLORS.balance}
              sortState={sortState}
              onSort={handleSort}
            >
            <div ref={registerColumnScroll(5)} onScroll={handleColumnScroll(5)} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {displayRows.map((row, i) => (
                <div key={row.key} style={{ height: ROW_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.data.balance < 0 ? 'var(--danger)' : row.data.balance > 0 ? 'var(--success)' : undefined }}>{row.data.balance.toLocaleString('ru-RU')}</span>
                </div>
              ))}
            </div>
            </ColumnCard>
        </DashboardGrid>
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
