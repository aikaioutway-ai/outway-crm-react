import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CheckCircle2, ChevronDown, ChevronRight, Clock3, QrCode, ReceiptText, Search, X } from 'lucide-react';
import { PaymentTableRow } from '../../services/crmV2Service';
import { usePaymentsTable } from '../../hooks/useCrmQueries';
import { money } from '../../utils/pricing';
import { CASHIER_PERIODS, currentCashierPeriodKey, getBranchFilter, isSchoolAllowed, SCHOOL_TABS } from './constants';
import { DashboardGrid, DashboardTopPanel, OverviewColumn as ColumnCard, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from './schoolGrouping';
import ManagerPeriodBar from './ManagerPeriodBar';

type SortKey = 'paymentsAmount' | 'pendingCount' | 'pendingAmount' | 'confirmedAmount' | 'qrAmount' | 'cashAmount';

interface CashierOverviewProps {
  periodKey: string;
  onPeriodKeyChange: (key: string) => void;
  onSelectSchool: (key: string) => void;
  onOpenPaymentFamily?: (schoolKey: string, familyId: string, searchQuery: string, periodKey: string) => void;
  allowedSchools?: string[];
  onSidebarWidthChange?: (width: number) => void;
}

interface CashierSchoolStat {
  key: string;
  label: string;
  color: string;
  logo?: string;
  paymentsAmount: number;
  pendingCount: number;
  pendingAmount: number;
  confirmedAmount: number;
  qrAmount: number;
  cashAmount: number;
}

const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const KPI_COLORS: Record<SortKey, string> = {
  paymentsAmount: '#626C8B',
  pendingCount: '#B45309',
  pendingAmount: '#BA7517',
  confirmedAmount: 'var(--success)',
  qrAmount: '#1D6FA4',
  cashAmount: '#15803D',
};

const COLUMN_WEIGHTS: Record<SortKey, number> = {
  paymentsAmount: 1.6,
  pendingCount: 1,
  pendingAmount: 1.15,
  confirmedAmount: 1.2,
  qrAmount: 1,
  cashAmount: 1,
};

const GRID_TEMPLATE = ['paymentsAmount', 'pendingCount', 'pendingAmount', 'confirmedAmount', 'qrAmount', 'cashAmount']
  .map(key => `minmax(0, ${COLUMN_WEIGHTS[key as SortKey]}fr)`)
  .join(' ');

function paymentDate(row: PaymentTableRow): Date | null {
  const raw = row.actualPaymentDate || row.paymentDate || row.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesPeriod(row: PaymentTableRow, periodKey: string): boolean {
  if (periodKey === 'ALL') {
    return CASHIER_PERIODS.some(period => matchesPeriod(row, period.key));
  }
  const period = CASHIER_PERIODS.find(item => item.key === periodKey);
  const date = paymentDate(row);
  if (!period || !date) return false;
  return date.getMonth() + 1 === period.month && date.getFullYear() === period.year;
}

function isPending(row: PaymentTableRow): boolean {
  const status = String(row.status ?? '').toLowerCase();
  return status === 'pending' || status.includes('провер');
}

function isConfirmed(row: PaymentTableRow): boolean {
  const status = String(row.status ?? '').toLowerCase();
  return status === 'paid' || status === 'confirmed' || status.includes('оплач') || status.includes('подтверж');
}

function isQr(row: PaymentTableRow): boolean {
  const method = String(row.paymentMethod ?? '').toLowerCase();
  return method === 'transfer' || method === 'card' || method.includes('qr') || method.includes('безнал');
}

function isCash(row: PaymentTableRow): boolean {
  const method = String(row.paymentMethod ?? 'cash').toLowerCase();
  return method === 'cash' || method.includes('нал');
}

function rowMatchesSchool(row: PaymentTableRow, tab: typeof SCHOOL_TABS[number]): boolean {
  const branch = row.branchShort.toLowerCase();
  return branch === tab.key.toLowerCase() || branch === tab.label.toLowerCase();
}

function paymentPeriodKey(row: PaymentTableRow): string {
  const date = paymentDate(row);
  if (!date) return currentCashierPeriodKey();
  return CASHIER_PERIODS.find(period => period.month === date.getMonth() + 1 && period.year === date.getFullYear())?.key
    ?? currentCashierPeriodKey();
}

function CashierPaymentSearch({ rows, onOpenPaymentFamily }: {
  rows: PaymentTableRow[];
  onOpenPaymentFamily?: (schoolKey: string, familyId: string, searchQuery: string, periodKey: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const digitsQuery = query.replace(/\D/g, '');

  const latestPayments = useMemo(() => {
    const byFamily = new Map<string, PaymentTableRow>();
    rows.forEach(row => {
      const current = byFamily.get(row.familyId);
      const rowTime = paymentDate(row)?.getTime() ?? 0;
      const currentTime = current ? paymentDate(current)?.getTime() ?? 0 : -1;
      if (!current || rowTime > currentTime) byFamily.set(row.familyId, row);
    });
    return Array.from(byFamily.values()).sort((a, b) => (paymentDate(b)?.getTime() ?? 0) - (paymentDate(a)?.getTime() ?? 0));
  }, [rows]);

  const suggestions = useMemo(() => {
    if (normalizedQuery.length < 2 && digitsQuery.length < 3) return [];
    return latestPayments.filter(row => {
      const haystack = `${row.childrenNames} ${row.parentName}`.toLowerCase();
      const phoneDigits = row.phone.replace(/\D/g, '');
      return (normalizedQuery.length >= 2 && haystack.includes(normalizedQuery))
        || (digitsQuery.length >= 3 && phoneDigits.includes(digitsQuery));
    }).slice(0, 8);
  }, [digitsQuery, latestPayments, normalizedQuery]);

  useEffect(() => { setActiveIndex(0); }, [query]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const select = (row: PaymentTableRow) => {
    const schoolKey = getBranchFilter(row.branchShort, row.branchShort) || row.branchShort;
    onOpenPaymentFamily?.(schoolKey, row.familyId, row.childrenNames || row.parentName || row.phone, paymentPeriodKey(row));
    setQuery('');
    setFocused(false);
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, suggestions.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); select(suggestions[activeIndex]); }
    else if (event.key === 'Escape') setFocused(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 360, height: 44, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '0 12px', height: 44 }}>
        <Search size={16} color="var(--text-2)" />
        <input value={query} onChange={event => setQuery(event.target.value)} onFocus={() => setFocused(true)} onKeyDown={handleKeyDown} placeholder="Поиск по платежам" style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, fontSize: 13 }} />
        {query && <button onClick={() => setQuery('')} aria-label="Очистить поиск" style={{ border: 'none', background: 'transparent', color: 'var(--text-2)', display: 'flex' }}><X size={14} /></button>}
      </div>
      {focused && query.trim() && <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 30px rgba(23,34,47,.12)', zIndex: 90, maxHeight: 320, overflowY: 'auto' }}>
        {suggestions.length === 0 ? <div style={{ padding: '14px 16px', color: 'var(--text-2)', fontSize: 13 }}>Платежи не найдены</div> : suggestions.map((row, index) => (
          <button key={row.familyId} onMouseDown={event => event.preventDefault()} onClick={() => select(row)} style={{ width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: index === activeIndex ? 'var(--surface-2)' : '#fff', textAlign: 'left', display: 'grid', gap: 2 }}>
            <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 800 }}>{row.childrenNames || row.parentName}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{row.parentName} · {row.phone} · {row.branchShort}</span>
            <span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 750 }}>Последний платёж: {paymentDate(row)?.toLocaleDateString('ru-RU') ?? '—'}</span>
          </button>
        ))}
      </div>}
    </div>
  );
}

export default function CashierOverview({ periodKey, onPeriodKeyChange, onSelectSchool, onOpenPaymentFamily, allowedSchools, onSidebarWidthChange }: CashierOverviewProps) {
  const { data: rows = null } = usePaymentsTable();
  const searchablePayments = useMemo(
    () => (rows ?? []).filter(row => isSchoolAllowed(getBranchFilter(row.branchShort, row.branchShort), allowedSchools)),
    [allowedSchools, rows],
  );
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'paymentsAmount', dir: 'desc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  useEffect(() => {
    if (periodKey === 'ALL' || CASHIER_PERIODS.some(period => period.key === periodKey)) return;
    onPeriodKeyChange(currentCashierPeriodKey());
  }, [onPeriodKeyChange, periodKey]);

  const periodRows = useMemo(() => (rows ?? []).filter(row => matchesPeriod(row, periodKey)), [periodKey, rows]);

  const stats = useMemo(() => SCHOOL_TABS.filter(tab => tab.key !== 'ALL').map((tab, index): CashierSchoolStat => {
    const schoolRows = periodRows.filter(row => rowMatchesSchool(row, tab));
    const pendingRows = schoolRows.filter(isPending);
    const confirmedRows = schoolRows.filter(isConfirmed);
    const paymentRows = schoolRows.filter(row => isPending(row) || isConfirmed(row));
    const activeRows = schoolRows.filter(row => !String(row.status ?? '').toLowerCase().includes('отклон') && String(row.status ?? '').toLowerCase() !== 'rejected');
    return {
      key: tab.key,
      label: tab.label,
      color: SCHOOL_COLORS[index % SCHOOL_COLORS.length],
      logo: tab.logo,
      paymentsAmount: paymentRows.reduce((sum, row) => sum + row.amount, 0),
      pendingCount: pendingRows.length,
      pendingAmount: pendingRows.reduce((sum, row) => sum + row.amount, 0),
      confirmedAmount: confirmedRows.reduce((sum, row) => sum + row.amount, 0),
      qrAmount: activeRows.filter(isQr).reduce((sum, row) => sum + row.amount, 0),
      cashAmount: activeRows.filter(isCash).reduce((sum, row) => sum + row.amount, 0),
    };
  }), [periodRows]);

  const totals = useMemo(() => stats.reduce((acc, s) => ({
    pendingCount: acc.pendingCount + s.pendingCount,
    paymentsAmount: acc.paymentsAmount + s.paymentsAmount,
    pendingAmount: acc.pendingAmount + s.pendingAmount,
    confirmedAmount: acc.confirmedAmount + s.confirmedAmount,
    qrAmount: acc.qrAmount + s.qrAmount,
    cashAmount: acc.cashAmount + s.cashAmount,
  }), { paymentsAmount: 0, pendingCount: 0, pendingAmount: 0, confirmedAmount: 0, qrAmount: 0, cashAmount: 0 }), [stats]);

  const displayRows = useMemo(() => buildGroupedRows(
    stats,
    expandedGroups,
    ['paymentsAmount', 'pendingCount', 'pendingAmount', 'confirmedAmount', 'qrAmount', 'cashAmount'],
    (a, b) => {
      const cmp = a.data[sortState.key] - b.data[sortState.key];
      return sortState.dir === 'asc' ? cmp : -cmp;
    },
  ), [stats, expandedGroups, sortState]);

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DashboardTopPanel className="dashboard-control-row">
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <ManagerPeriodBar
              periodKey={periodKey}
              onPeriodKeyChange={onPeriodKeyChange}
              periods={CASHIER_PERIODS}
            />
          </div>
          <CashierPaymentSearch rows={searchablePayments} onOpenPaymentFamily={onOpenPaymentFamily} />
        </DashboardTopPanel>

        <DashboardGrid template={GRID_TEMPLATE}>
            <ColumnCard
              first
              sortKey="paymentsAmount"
              label="Платежи"
              icon={<ReceiptText size={17} color="#fff" />}
              value={money(totals.paymentsAmount)}
              color={KPI_COLORS.paymentsAmount}
              sortState={sortState}
              onSort={handleSort}
            >
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

            {([
              ['pendingCount', 'К-во на проверке', <Clock3 size={17} color="#fff" />, String(totals.pendingCount)],
              ['pendingAmount', 'Сумма на проверке', <ReceiptText size={17} color="#fff" />, money(totals.pendingAmount)],
              ['confirmedAmount', 'Подтверждено', <CheckCircle2 size={17} color="#fff" />, money(totals.confirmedAmount)],
              ['qrAmount', 'QR', <QrCode size={17} color="#fff" />, money(totals.qrAmount)],
              ['cashAmount', 'Наличные', <Banknote size={17} color="#fff" />, money(totals.cashAmount)],
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
                {displayRows.map((row, i) => {
                  const value = row.data[key];
                  const isMoney = key !== 'pendingCount';
                  return (
                    <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: Number(value) > 0 ? KPI_COLORS[key] : undefined }}>{isMoney ? (Number(value) > 0 ? money(Number(value)) : '0') : String(value)}</span>
                    </div>
                  );
                })}
              </ColumnCard>
            ))}
        </DashboardGrid>
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
