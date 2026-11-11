import { EmployeeCardModal } from '../employees/EmployeesPage';
import { QK, queryClient } from '../../services/queryClient';
import { createPortal } from 'react-dom';
import type { Employee } from '../../types';
import { requestStage } from './requestWorkflow';
import NewRequestsDashboard, { countRequestsBySchool, REQUEST_DAY_PERIODS, requestMatchesDay } from './NewRequestsDashboard';
import { managerFinancialStats } from './managerFinancialStats';
import SchoolDashboardTable from './SchoolDashboardTable';
import DirectorySchoolDashboard, { computeDirectoryStats } from './DirectorySchoolDashboard';
import ManagerModeTabs, { ManagerMode } from './ManagerModeTabs';
import HiddenSchoolsList from './HiddenSchoolsList';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, BusFront, CalendarDays, List, Plus, Search, X } from 'lucide-react';
import { FamilyListRow, FamilySearchHit, PeriodChargeStats, BranchStat } from '../../services/crmV2Service';
import { schoolStaff } from './SchoolKpiChip';
import { useEmployees, useMonthlyChargeStats, useFamiliesTable, useBranchStats, useFamilySearch, usePeriodChargeStats, useSchoolDirectoryStats } from '../../hooks/useCrmQueries';
import { ALL_PERIODS, currentPayrollPeriodKey, SCHOOL_DIRECTORY, SCHOOL_TABS, getBranchFilter, isSchoolAllowed, schoolTabsForTier } from './constants';
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
  splitView?: boolean;
  detailSchoolKey?: string;
  employeeCardAccess?: { sessionToken?: string; roles: Employee['role'][] | null };
  onBackToOverview?: () => void;
  detailTransferFilter?: string;
  renderTransfers?: (period: string) => React.ReactNode;
  groupSummary?: React.ReactNode;
  renderSchool?: (period: string, day: string, directoryPeriod: string, onDebtTotals: (amount: number, count: number) => void) => React.ReactNode;
  mode: ManagerMode;
  canViewAccruals?: boolean;
  onModeChange: (mode: ManagerMode) => void;
  onSelectSchool: (key: string) => void;
  onSidebarWidthChange?: (width: number) => void;
  onOpenFamily?: (schoolKey: string, familyId: string, searchQuery: string, row: FamilySearchHit) => void;
  allowedSchools?: string[];
  schoolTier?: SchoolTier;
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
export function computeSchoolStatsFromBranches(branches: BranchStat[], tier: SchoolTier = '1.0'): SchoolStat[] {
  const schools = schoolTabsForTier(tier).filter(t => t.key !== 'ALL');
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

/** Без rows поиск идёт в базе (только найденные строки), с rows — по уже
 * загруженному списку экрана (Логистика). */
export function ManagerSearch({ rows, onOpenFamily, collapsible = false, compact = false, allowedSchools, schoolTier = '1.0' }: {
  rows?: FamilySearchHit[];
  onOpenFamily?: (schoolKey: string, familyId: string, searchQuery: string, row: FamilySearchHit) => void;
  collapsible?: boolean;
  compact?: boolean;
  allowedSchools?: string[];
  schoolTier?: SchoolTier;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const digitsQuery = phoneQueryDigits(query) ?? '';
  const isServerSearch = !rows;
  const [serverQuery, setServerQuery] = useState({ text: '', digits: '' });
  useEffect(() => {
    if (!isServerSearch) return;
    const timer = window.setTimeout(() => setServerQuery({ text: normalizedQuery, digits: digitsQuery }), 250);
    return () => window.clearTimeout(timer);
  }, [isServerSearch, normalizedQuery, digitsQuery]);
  const serverSearch = useFamilySearch(isServerSearch ? serverQuery.text : '', isServerSearch ? serverQuery.digits : '');
  const serverPending = isServerSearch && (serverSearch.isFetching || serverQuery.text !== normalizedQuery || serverQuery.digits !== digitsQuery);

  const suggestions = useMemo(() => {
    if (normalizedQuery.length < 2 && digitsQuery.length < 3) return [];
    if (!rows) {
      return (serverSearch.data ?? [])
        .filter(row => isSchoolAllowed(row.branchFilter, allowedSchools, schoolTier))
        .slice(0, 8);
    }
    const seen = new Set<string>();
    const matches: FamilySearchHit[] = [];
    for (const row of rows) {
      if (seen.has(row.rowId)) continue;
      const haystack = `${row.familyId} ${row.parentName} ${row.childName}`.toLowerCase();
      const matchesText = normalizedQuery.length >= 2 && haystack.includes(normalizedQuery);
      const matchesPhone = phoneMatchesQuery(query, row.phone, row.secondPhone);
      if (matchesText || matchesPhone) {
        seen.add(row.rowId);
        matches.push(row);
        if (matches.length >= 8) break;
      }
    }
    return matches;
  }, [rows, normalizedQuery, digitsQuery, query, serverSearch.data, allowedSchools, schoolTier]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setFocused(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const select = (row: FamilySearchHit) => {
    // Подсказки ищут по полному имени из базы, включая отчество. Таблица
    // отображает и индексирует имя через formatName (фамилия + имя), поэтому
    // после выбора передаём ту же нормализованную форму и не получаем пустой список.
    const searchQuery = row.childName
      ? formatName(row.childName)
      : row.parentName
        ? formatName(row.parentName)
        : row.phone;
    onOpenFamily?.(row.branchFilter, row.familyId, searchQuery, row);
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
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{serverPending ? 'Поиск…' : serverSearch.isError ? 'Не удалось выполнить поиск' : 'Ничего не найдено'}</div>
          ) : suggestions.map((row, i) => {
            const tab = SCHOOL_DIRECTORY.find(t => t.key === row.branchFilter);
            return (
              <div
                key={row.rowId}
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

export default function ManagerOverview({ mode, canViewAccruals = false, onModeChange, onSelectSchool, onSidebarWidthChange, onOpenFamily, allowedSchools, schoolTier = '1.0', splitView, detailSchoolKey, detailTransferFilter, onBackToOverview, employeeCardAccess, renderSchool, renderTransfers, groupSummary }: ManagerOverviewProps) {
  const detailSchool = detailSchoolKey && detailSchoolKey !== 'ALL'
    && isSchoolAllowed(detailSchoolKey, allowedSchools, schoolTier)
    ? SCHOOL_TABS.find(school => school.key === detailSchoolKey)
    : undefined;
  const { data: employees } = useEmployees({ enabled: !!detailSchool });
  const staff = detailSchool ? schoolStaff(employees ?? [], detailSchool.key) : null;
  const [staffCard, setStaffCard] = useState<Employee | null>(null);
  const selectedStaff = staffCard?.schoolKeys.includes(detailSchool?.key ?? '') ? staffCard : null;
  const canOpenFullCard = selectedStaff && employeeCardAccess
    && (!employeeCardAccess.roles || employeeCardAccess.roles.includes(selectedStaff.role));
  const staffNames = (people: Employee[]) => people.length ? people.map(person => (
    <button key={person.id} type="button" className="manager-staff-name" onClick={() => setStaffCard(person)}>
      {person.fullName}
    </button>
  )) : '—';

  const scopedSchools = useMemo(() => detailSchoolKey && detailSchoolKey !== 'ALL' ? [detailSchoolKey] : allowedSchools, [detailSchoolKey, allowedSchools]);
  const [tableDebt, setTableDebt] = useState<{ amount: number; count: number }>();
  const syncTableDebt = React.useCallback((amount: number, count: number) => {
    setTableDebt(current => current?.amount === amount && current.count === count ? current : { amount, count });
  }, []);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [requestDay, setRequestDay] = useState('ALL');
  const [periodKey, setPeriodKey] = useState(currentPayrollPeriodKey);
  const [directoryPeriod, setDirectoryPeriod] = useState('ALL');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  // Стандартный вид («За всё время») — лёгкий RPC-агрегат по филиалам.
  const branchStatsQuery = useBranchStats();
  // Справочник берёт цифры из базы; таблица семей с деньгами нужна только финансовым вкладкам.
  const directoryQuery = useSchoolDirectoryStats();
  const familiesQuery = useFamiliesTable({ enabled: splitView || mode !== 'directory' });
  const rows: FamilyListRow[] | null = familiesQuery.data ?? null;
  const accessibleRows = useMemo(
    () => rows?.filter(row => isSchoolAllowed(row.branchFilter, allowedSchools, schoolTier) && isSchoolAllowed(row.branchFilter, scopedSchools, schoolTier)) ?? null,
    [allowedSchools, scopedSchools, rows, schoolTier],
  );
  const loadError = branchStatsQuery.isError;

  useEffect(() => {
    if (renderSchool) return;
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden, renderSchool]);

  const periodQuery = usePeriodChargeStats(periodKey, { enabled: !!renderSchool || mode === 'charges' || mode === 'accruals' });
  const periodStats = periodQuery.data ?? EMPTY_PERIOD_STATS;

  const stats = useMemo(
    () => computeSchoolStatsFromBranches(branchStatsQuery.data ?? [], schoolTier)
      .filter(stat => isSchoolAllowed(stat.key, allowedSchools, schoolTier) && isSchoolAllowed(stat.key, scopedSchools, schoolTier)),
    [allowedSchools, scopedSchools, branchStatsQuery.data, schoolTier],
  );

  const requestDayCounts = useMemo(() => {
    const schoolKeys = new Set(stats.map(school => school.key));
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    const now = new Date();
    for (const row of accessibleRows ?? []) {
      if (!schoolKeys.has(row.branchFilter) || seen.has(row.rowId) || !isNewUnassignedRow(row) || requestStage(row) !== 'new') continue;
      seen.add(row.rowId);
      counts.ALL = (counts.ALL ?? 0) + 1;
      for (const period of REQUEST_DAY_PERIODS) {
        if (requestMatchesDay(row.childCreatedAt, period.key, now)) counts[period.key] = (counts[period.key] ?? 0) + 1;
      }
    }
    return counts;
  }, [accessibleRows, stats]);

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

  const monthlyQueries = useMonthlyChargeStats(splitView && (mode === 'charges' || mode === 'accruals')
    ? ALL_PERIODS.map(period => period.key) : []);
  const seasonTotals = stats.reduce((sum, school) => ({
    debt: sum.debt + school.debtSum,
    charged: sum.charged + school.charged,
  }), { debt: 0, charged: 0 });
  const directoryCounts: Record<string, number> = { ALL: 0 };
  const seenChildren = new Set<string>();
  const monthKeys = new Map(ALL_PERIODS.map(period => [`${period.year}-${String(period.month).padStart(2, '0')}`, period.key]));
  const directoryRows = (accessibleRows ?? []).filter(row => {
    if (!stats.some(school => school.key === row.branchFilter) || seenChildren.has(row.rowId)) return false;
    seenChildren.add(row.rowId);
    return true;
  });
  for (const row of directoryRows) {
    directoryCounts.ALL++;
    const key = monthKeys.get(row.childCreatedAt?.slice(0, 7) ?? '');
    if (key) directoryCounts[key] = (directoryCounts[key] ?? 0) + 1;
  }

  const financialValue = (value: number) => `${money(value)} сом`;
  const allCharges = usePeriodChargeStats('ALL', { enabled: !!splitView && canViewAccruals });
  const summaries = useMemo<React.ComponentProps<typeof ManagerModeTabs>['summaries']>(() => {
    if (!splitView) return undefined;
    const directory = computeDirectoryStats(directoryQuery.data ?? [], scopedSchools, schoolTier)
      .filter(school => isSchoolAllowed(school.key, allowedSchools, schoolTier));
    const summaryRows = (accessibleRows ?? []).filter(row => {
      if (!renderSchool || !detailTransferFilter || mode === 'requests') return true;
      if (detailTransferFilter === 'new') return isNewUnassignedRow(row);
      if (detailTransferFilter === 'rejected') return row.status === 'rejected';
      if (detailTransferFilter === 'bus') return row.status !== 'rejected' && Boolean(row.transferNumber);
      if (detailTransferFilter === 'empty') return !row.transferNumber;
      return row.transferNumber === detailTransferFilter;
    });
    const filteredDirectory = !!renderSchool && (!!detailTransferFilter || mode === 'directory' && directoryPeriod !== 'ALL');
    const directoryPeriodData = ALL_PERIODS.find(period => period.key === directoryPeriod);
    const directoryMonth = directoryPeriodData && `${directoryPeriodData.year}-${String(directoryPeriodData.month).padStart(2, '0')}`;
    const directoryRows = summaryRows.filter(row => !row.rowId.endsWith('_empty') &&
      (mode !== 'directory' || !directoryMonth || row.childCreatedAt?.startsWith(directoryMonth)));
    const requests = countRequestsBySchool(summaryRows, mode === 'requests' ? requestDay : 'ALL');
    const requestTotals = stats.reduce((sum, school) => {
      const count = requests.get(school.key);
      return { newRequests: sum.newRequests + (count?.newRequests ?? 0), inWork: sum.inWork + (count?.inWork ?? 0) };
    }, { newRequests: 0, inWork: 0 });
    const financial = accessibleRows
      ? managerFinancialStats(stats, summaryRows, renderSchool ? periodStats : allCharges.data ?? [], !renderSchool || periodKey === 'ALL')
      : null;
    const filteredFinancial = renderSchool && periodQuery.data && accessibleRows
      ? managerFinancialStats(stats, summaryRows, periodStats, false)
      : null;
    const usePeriodTotals = !!renderSchool && (periodKey !== 'ALL' || !!detailTransferFilter);
    const debt = mode === 'charges' && renderSchool && tableDebt ? tableDebt.amount
      : usePeriodTotals ? filteredFinancial?.reduce((sum, school) => sum + school.debtSum, 0) : seasonTotals.debt;
    const charged = usePeriodTotals
      ? filteredFinancial?.reduce((sum, school) => sum + school.charged, 0) : seasonTotals.charged;
    const count = (value: number | undefined) => value?.toLocaleString('ru-RU') ?? '—';
    return {
      directory: [
        { label: 'Заявки', value: count(filteredDirectory ? accessibleRows ? directoryRows.length : undefined : directoryQuery.data && directory.reduce((sum, school) => sum + school.applications, 0)) },
        { label: 'Посажены', tone: 'positive', value: count(filteredDirectory ? accessibleRows ? directoryRows.filter(row => row.status === 'boarded').length : undefined : directoryQuery.data && directory.reduce((sum, school) => sum + school.boarded, 0)) },
        { label: 'Отказы', tone: 'alert', value: count(filteredDirectory ? accessibleRows ? directoryRows.filter(row => row.status === 'rejected').length : undefined : directoryQuery.data && directory.reduce((sum, school) => sum + school.rejected, 0)) },
      ],
      charges: [
        { label: 'Долг', tone: 'alert', value: debt === undefined ? '—' : financialValue(debt) },
        { label: 'Должники', value: count(renderSchool && mode === 'charges' && tableDebt ? tableDebt.count : financial?.reduce((sum, school) => sum + (school.debtorsCount ?? 0), 0)) },
      ],
      requests: [
        { label: 'Новые', tone: 'alert', value: count(accessibleRows ? requestTotals.newRequests : undefined) },
        { label: 'В работе', value: count(accessibleRows ? requestTotals.inWork : undefined) },
      ],
      accruals: [
        { label: 'Начислено', value: charged === undefined ? '—' : financialValue(charged) },
        { label: 'Без начислений', tone: 'alert', value: count((renderSchool ? periodQuery.data : allCharges.data) ? financial?.reduce((sum, school) => sum + (school.uncharged ?? 0), 0) : undefined) },
      ],
    };
  }, [splitView, directoryQuery.data, allowedSchools, scopedSchools, schoolTier, accessibleRows, stats, allCharges.data, seasonTotals.debt, seasonTotals.charged, renderSchool, detailTransferFilter, mode, directoryPeriod, requestDay, periodKey, periodStats, periodQuery.data, tableDebt]);
  const selectedPeriod = mode === 'requests' ? requestDay : mode === 'directory' ? directoryPeriod : periodKey;
  const periods = mode === 'requests' ? REQUEST_DAY_PERIODS : ALL_PERIODS;
  const metrics = [{ key: 'ALL', label: 'Все периоды', month: 0, year: 0 }, ...periods]
    .filter(period => mode !== 'directory' || period.key !== 'deposit')
    .map(period => {
      let metric = '—';
      if (mode === 'requests' || mode === 'directory') {
        const counts = mode === 'requests' ? requestDayCounts : directoryCounts;
        if (accessibleRows) metric = (counts[period.key] ?? 0).toLocaleString('ru-RU');
      } else if (period.key === 'ALL') {
        metric = financialValue(mode === 'charges' ? seasonTotals.debt : seasonTotals.charged);
      } else {
        const query = monthlyQueries[ALL_PERIODS.indexOf(period)];
        if (query?.data && accessibleRows) {
          const field = mode === 'charges' ? 'debtSum' : 'charged';
          metric = financialValue(managerFinancialStats(stats, accessibleRows, query.data, false)
            .reduce((sum, school) => sum + school[field], 0));
        }
      }
      return { ...period, metric };
    });

  const sortByDebt = splitView && mode === 'charges';
  const [debtSortDirection, setDebtSortDirection] = useState<'asc' | 'desc'>('desc');
  const activeSortKey = sortByDebt ? 'debtSum' : sortState.key;
  const activeSortDirection = sortByDebt ? debtSortDirection : sortState.dir;

  const displayRows = useMemo(() => buildGroupedRows(
    displayStats,
    expandedGroups,
    ['debtorsCount', 'boarded', 'uncharged', 'childrenCount', 'newRequests', 'charged', 'paid', 'pendingCount', 'pendingSum', 'debtSum', 'balance'],
    (a, b) => {
      const av = activeSortKey === 'school' ? a.label : a.data[activeSortKey];
      const bv = activeSortKey === 'school' ? b.label : b.data[activeSortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return activeSortDirection === 'asc' ? cmp : -cmp;
    },
  ), [displayStats, expandedGroups, activeSortKey, activeSortDirection]);

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

        <DashboardTopPanel className={`dashboard-control-row manager-overview-toolbar${splitView ? ' manager-overview-toolbar--wide' : ''}${renderTransfers ? ' manager-overview-toolbar--transfers' : ''}`}>
          {!splitView && <ManagerModeTabs showRequests canViewAccruals={canViewAccruals} value={mode} onChange={onModeChange} />}
          {splitView ? (
            <div className={mode === 'requests' ? 'manager-period-tiles' : 'manager-period-tiles manager-period-tiles--months'} role="group" aria-label={mode === 'requests' ? 'Возраст заявки' : 'Период'}>
              {metrics.map(period => (
                <button key={period.key} type="button" aria-pressed={period.key === selectedPeriod}
                  title={mode === 'requests' ? (period.key === 'ALL' ? 'Все заявки' : `День ${period.label}`) : period.label}
                  onClick={() => (mode === 'requests' ? setRequestDay : mode === 'directory' ? setDirectoryPeriod : setPeriodKey)(period.key)}>
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>{period.key === 'ALL' ? 'Все' : mode === 'requests' ? `${period.label} дн.` : period.key === 'deposit' ? period.label : period.label.slice(0, 3)}</span>
                  <strong className={mode === 'requests' && (requestDayCounts[period.key] ?? 0) > 0 ? 'manager-period-count-alert' : undefined}>{period.metric}</strong>
                </button>
              ))}
            </div>
          ) : <div className="manager-overview-period">
            {mode === 'requests' ? <ManagerPeriodBar calendar={splitView} calendarLabel="Возраст заявки" periodKey={requestDay} onPeriodKeyChange={setRequestDay} periods={REQUEST_DAY_PERIODS} allLabel="Все" periodCounts={requestDayCounts} useLabels periodTitle={period => period.key === '11' ? 'Старше 10 дней' : `День ${period.label} с создания заявки`} /> : (mode !== 'directory' || splitView) && <ManagerPeriodBar calendar={splitView} periodKey={periodKey} onPeriodKeyChange={setPeriodKey} />}
          </div>}
          {renderTransfers && <div className="manager-toolbar-transfers">{renderTransfers(periodKey)}</div>}
          <div className="manager-overview-search"><ManagerSearch onOpenFamily={onOpenFamily} allowedSchools={allowedSchools} schoolTier={schoolTier} /></div>
          {(!renderSchool || mode === 'requests') && <div className="overview-icon-actions">
            {!renderTransfers && <HiddenSchoolsList onSelectSchool={onSelectSchool} allowedSchools={allowedSchools} />}
            <button type="button" className="overview-icon-button overview-icon-button--primary" title="Новый заказ" aria-label="Новый заказ" onClick={() => setShowNewFamily(true)}><Plus size={18} aria-hidden="true"/></button>
            <button type="button" className="overview-icon-button" title="Все записи" aria-label="Все записи" onClick={() => onSelectSchool('ALL')}><List size={18} aria-hidden="true"/></button>
          </div>}
        </DashboardTopPanel>

        <div className={splitView ? `manager-workspace manager-overview-body${renderSchool ? ' manager-overview-body--school' : ''}${groupSummary ? ' manager-overview-body--with-groups' : ''}` : undefined} style={splitView ? undefined : { display: 'contents' }}>
          {splitView && (
            <div className="manager-overview-sidebar">
              {detailSchool && (
                <button type="button" className="manager-school-brand" title="Все школы" aria-label={`${detailSchool.label}: все школы`} onClick={onBackToOverview}>
                  <SchoolAvatar logo={detailSchool.logo} label={detailSchool.label} color="var(--accent)" size={64} radius={14} fontSize={16} />
                </button>
              )}
              <ManagerModeTabs cards summaries={summaries} showRequests canViewAccruals={canViewAccruals} value={mode} onChange={onModeChange} />
              {selectedStaff && createPortal(canOpenFullCard ? (
                <EmployeeCardModal
                  key={selectedStaff.id}
                  employee={selectedStaff}
                  restrictedRole={employeeCardAccess.roles}
                  sessionToken={employeeCardAccess.sessionToken}
                  onClose={() => setStaffCard(null)}
                  onChanged={employee => {
                    setStaffCard(employee.schoolKeys.includes(detailSchool?.key ?? '') ? employee : null);
                    void queryClient.invalidateQueries({ queryKey: QK.employees });
                  }}
                  onDeleted={() => {
                    setStaffCard(null);
                    void queryClient.invalidateQueries({ queryKey: QK.employees });
                  }}
                />
              ) : (
                <dialog className="manager-staff-contact" aria-label="Карточка сотрудника"
                  ref={dialog => { if (dialog && !dialog.open) dialog.showModal(); }}
                  onClose={() => setStaffCard(null)}>
                  <form method="dialog">
                    <button type="submit" className="overview-icon-button" aria-label="Закрыть"><X size={16} /></button>
                  </form>
                  <h2>{selectedStaff.fullName}</h2>
                  <p>{selectedStaff.position || (selectedStaff.role === 'manager' ? 'Менеджер' : 'Логист')} · {detailSchool?.label}</p>
                </dialog>
              ), document.body)}
              {staff && (
                <dl className="manager-school-staff">
                  <div>
                    <dt><Briefcase size={14} aria-hidden="true" /> Менеджер</dt>
                    <dd>{staffNames(staff.managers)}</dd>
                  </div>
                  <div>
                    <dt><BusFront size={14} aria-hidden="true" /> Логист</dt>
                    <dd>{staffNames(staff.logists)}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}
          <div className={splitView ? 'manager-workspace-content' : undefined} style={splitView ? undefined : { display: 'contents' }}>
        {renderSchool ? renderSchool(periodKey, requestDay, directoryPeriod, syncTableDebt) : mode === 'requests' ? (familiesQuery.isPending ? <div role="status" style={{ padding: 24 }}>Загрузка заявок…</div> : familiesQuery.isError ? <div role="alert" style={{ padding: 24 }}>Не удалось загрузить заявки. <button onClick={() => void familiesQuery.refetch()}>Повторить</button></div> : <NewRequestsDashboard splitView={splitView} rows={accessibleRows ?? []} schools={stats} day={requestDay} onSelectSchool={onSelectSchool} />) : mode !== 'directory' && (periodQuery.isPending || familiesQuery.isPending) ? <div role="status" style={{ padding: 24 }}>Загрузка начислений…</div> : mode !== 'directory' && (periodQuery.isError || familiesQuery.isError) ? <div role="alert" style={{ padding: 24 }}>Не удалось загрузить начисления. <button onClick={() => { void periodQuery.refetch(); void familiesQuery.refetch(); }}>Повторить</button></div> : mode === 'directory' ? (directoryQuery.isPending ? <div role="status" style={{ padding: 24 }}>Загрузка…</div> : directoryQuery.isError ? <div role="alert" style={{ padding: 24 }}>Не удалось загрузить справочник. <button onClick={() => void directoryQuery.refetch()}>Повторить</button></div> : <DirectorySchoolDashboard periodRows={splitView && directoryPeriod !== 'ALL' && accessibleRows ? directoryRows.filter(row => monthKeys.get(row.childCreatedAt?.slice(0, 7) ?? '') === directoryPeriod) : undefined} splitView={splitView} branches={directoryQuery.data ?? []} allowedSchools={allowedSchools} schoolTier={schoolTier} onSelectSchool={onSelectSchool} />) : (
        <SchoolDashboardTable splitView={splitView} commentScope={mode === "accruals" ? "families/ManagerOverview:accruals" : "families/ManagerOverview:overview"} commentContext={`${mode}:${periodKey}`}
          columns={[
            { key: 'school', label: 'Школа', total: displayStats.length, color: '#64748B' },
            ...(mode === 'accruals' ? [
              { key: 'boarded', label: 'Посажены', total: totals.boarded, color: KPI_COLORS.childrenCount },
            ] : splitView ? [] : [
              { key: 'debtorsCount', label: 'Должников', total: totals.debtorsCount, color: KPI_COLORS.newRequests },
            ]),
            { key: 'charged', label: 'Начислено', total: money(totals.charged), color: KPI_COLORS.charged },
            ...(mode === 'accruals' ? [
              { key: 'uncharged', label: 'Без начислений', total: totals.uncharged, color: '#B45309' },
            ] : [
            { key: 'paid', label: 'Оплачено', total: money(totals.paid), color: KPI_COLORS.paid },
            { key: 'debtSum', label: 'Сумма долга', total: money(totals.debtSum), color: KPI_COLORS.debtSum },
            ...(splitView ? [
              { key: 'debtorsCount', label: 'Должников', total: totals.debtorsCount, color: KPI_COLORS.newRequests },
            ] : []),
            { key: 'balance', label: 'Баланс', total: totals.balance.toLocaleString('ru-RU'), color: KPI_COLORS.balance },
            ]),
          ].filter(column => !splitView || (mode === 'accruals'
            ? column.key === 'charged' || column.key === 'uncharged'
            : column.key === 'debtorsCount' || column.key === 'debtSum'))}
          rows={displayRows.map(row => ({ ...row, values: { debtorsCount: row.data.debtorsCount ?? 0, boarded: row.data.boarded ?? 0, uncharged: row.data.uncharged ?? 0, newRequests: row.data.newRequests, charged: money(row.data.charged), paid: money(row.data.paid), debtSum: money(row.data.debtSum), balance: row.data.balance.toLocaleString('ru-RU') } }))}
          sortKey={activeSortKey}
          ascending={activeSortDirection === 'asc'}
          onSort={sortByDebt ? () => setDebtSortDirection(direction => direction === 'desc' ? 'asc' : 'desc') : key => handleSort(key as SortKey)}
          onSelect={key => displayRows.find(row => row.key === key)?.isGroup ? toggleGroup(key) : onSelectSchool(key)}
        />
        )}
          </div>
          {groupSummary && <div className="manager-overview-group-summary">{groupSummary}</div>}
        </div>
      </div>

      {!renderSchool && <>
      <div aria-hidden="true" style={{ width: sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH, flexShrink: 0, transition: 'width .18s ease' }} />

      <SchoolDockSidebar
        items={stats.map(s => ({ key: s.key, label: s.label, color: s.color, logo: s.logo }))}
        hidden={sidebarHidden}
        onHiddenChange={setSidebarHidden}
        onSelect={onSelectSchool}
      />
      </>}
      {showNewFamily && <NewFamilyModal schoolTier={schoolTier} onClose={() => setShowNewFamily(false)} />}
      </div>
    </div>
  );
}
