import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Inbox, Landmark, Receipt, Search, Users, Wallet, X } from 'lucide-react';
import { fetchChargesForPeriod, fetchV2FamiliesTable, FamilyListRow, PeriodChargeStats } from '../../services/crmV2Service';
import { ALL_PERIODS, SCHOOL_TABS } from './constants';
import { money } from '../../utils/pricing';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from './schoolGrouping';

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
  onOpenFamily?: (schoolKey: string, familyId: string) => void;
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

function Ring({ value, max, color, size = 34 }: { value: number; max: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

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

export function SchoolAvatar({ logo, label, color, size = 26, radius = 7, fontSize = 11 }: { logo?: string; label: string; color: string; size?: number; radius?: number; fontSize?: number }) {
  if (logo) {
    return <img src={logo} alt={label} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: radius, background: color, color: '#fff', fontSize, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function KpiChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 14px', overflow: 'hidden' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
        <div title={label} style={{ fontSize: 10, lineHeight: '13px', fontWeight: 650, color: 'var(--text-2)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      </div>
    </div>
  );
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

function ManagerPeriodBar({ periodKey, onPeriodKeyChange }: { periodKey: string; onPeriodKeyChange: (key: string) => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 0',
      overflowX: 'auto',
      flex: 1,
      width: '100%',
      minWidth: 0,
      scrollbarWidth: 'none',
      boxSizing: 'border-box',
    }}>
      <button
        onClick={() => onPeriodKeyChange('ALL')}
        style={{ flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: periodKey === 'ALL' ? 800 : 600, background: periodKey === 'ALL' ? '#2DD4BF' : '#fff', color: periodKey === 'ALL' ? '#fff' : '#374151', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        Все
      </button>
      {ALL_PERIODS.map(period => {
        const active = periodKey === period.key;
        return (
          <button
            key={period.key}
            onClick={() => onPeriodKeyChange(period.key)}
            style={{ flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 800 : 600, background: active ? '#2DD4BF' : '#fff', color: active ? '#fff' : '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {period.key === 'deposit' ? 'Депозит' : period.label.split(' ')[0]}
          </button>
        );
      })}
    </div>
  );
}

function ManagerSearch({ rows, onOpenFamily }: { rows: FamilyListRow[]; onOpenFamily?: (schoolKey: string, familyId: string) => void }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
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
    onOpenFamily?.(row.branchFilter, row.familyId);
    setQuery('');
    setFocused(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); select(suggestions[activeIndex]); }
    else if (event.key === 'Escape') { setFocused(false); }
  };

  const showDropdown = focused && query.trim().length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 320, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px', height: '100%', boxSizing: 'border-box' }}>
        <Search size={16} color="var(--text-2)" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск: ребёнок, родитель, телефон"
          style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, fontSize: 13 }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', flexShrink: 0 }}>
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

export default function ManagerOverview({ onSelectSchool, onSidebarWidthChange, onOpenFamily }: ManagerOverviewProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [periodKey, setPeriodKey] = useState('ALL');
  const [periodStats, setPeriodStats] = useState<PeriodChargeStats[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    let cancelled = false;
    fetchV2FamiliesTable()
      .then(next => { if (!cancelled) { setRows(next); setLoadError(false); } })
      .catch(() => { if (!cancelled) { setRows(prev => prev ?? []); setLoadError(true); } });
    return () => { cancelled = true; };
  }, []);

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

  const stats = useMemo(() => computeSchoolStats(rows ?? []), [rows]);

  const displayStats = useMemo(() => {
    if (periodKey === 'ALL' || periodStats.length === 0) return stats;
    const familyToSchool = new Map<string, string>();
    (rows ?? []).forEach(r => { if (!familyToSchool.has(r.familyId)) familyToSchool.set(r.familyId, r.branchFilter); });
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
  }, [stats, periodStats, periodKey, rows]);

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

  const maxRequests = Math.max(1, ...displayRows.filter(r => !r.isChild).map(r => r.data.newRequests));

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  if (rows === null) {
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
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={setPeriodKey} />
          </div>
          <ManagerSearch rows={rows ?? []} onOpenFamily={onOpenFamily} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: KPI_GRID_TEMPLATE, gap: 12, flexShrink: 0 }}>
          <KpiChip icon={<Users size={18} color="#fff" />} label="К-во всех детей" value={String(totals.childrenCount)} color={KPI_COLORS.childrenCount} />
          <KpiChip icon={<Inbox size={18} color="#fff" />} label="Новые заявки" value={String(totals.newRequests)} color={KPI_COLORS.newRequests} />
          <KpiChip icon={<Receipt size={18} color="#fff" />} label="Начислено" value={money(totals.charged)} color={KPI_COLORS.charged} />
          <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Оплачено" value={money(totals.paid)} color={KPI_COLORS.paid} />
          <KpiChip icon={<Landmark size={18} color="#fff" />} label="Сумма долга" value={money(totals.debtSum)} color={KPI_COLORS.debtSum} />
          <KpiChip icon={<Wallet size={18} color="#fff" />} label="Баланс" value={totals.balance.toLocaleString('ru-RU')} color={KPI_COLORS.balance} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: KPI_GRID_TEMPLATE, gap: 12 }}>
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
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{row.data.newRequests}</span>
                <Ring value={row.data.newRequests} max={maxRequests} color={KPI_COLORS.newRequests} />
              </div>
            ))}
            </ColumnCard>

            <ColumnCard sortKey="charged" label="Начислено" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{row.data.charged > 0 ? money(row.data.charged) : '0'}</span>
              </div>
            ))}
            </ColumnCard>

            <ColumnCard sortKey="paid" label="Оплачено" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.paid > 0 ? 'var(--success)' : undefined }}>{row.data.paid > 0 ? money(row.data.paid) : '0'}</span>
              </div>
            ))}
            </ColumnCard>

            <ColumnCard sortKey="debtSum" label="Сумма долга" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.debtSum > 0 ? 'var(--danger)' : undefined }}>{row.data.debtSum > 0 ? money(row.data.debtSum) : '0'}</span>
              </div>
            ))}
            </ColumnCard>

            <ColumnCard sortKey="balance" label="Баланс" sortState={sortState} onSort={handleSort}>
            {displayRows.map((row, i) => (
              <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.data.balance < 0 ? 'var(--danger)' : row.data.balance > 0 ? 'var(--success)' : undefined }}>{row.data.balance.toLocaleString('ru-RU')}</span>
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
    </div>
  );
}
