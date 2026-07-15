import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Clock3, QrCode, ReceiptText } from 'lucide-react';
import { PaymentTableRow } from '../../services/crmV2Service';
import { usePaymentsTable } from '../../hooks/useCrmQueries';
import { money } from '../../utils/pricing';
import { CASHIER_PERIODS, currentCashierPeriodKey, SCHOOL_TABS } from './constants';
import { KpiChip, SchoolAvatar } from './ManagerOverview';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from './SchoolDockSidebar';
import { buildGroupedRows, toggleGroupKey } from './schoolGrouping';

type SortKey = 'paymentsAmount' | 'pendingCount' | 'pendingAmount' | 'confirmedAmount' | 'qrAmount' | 'cashAmount';

interface CashierOverviewProps {
  periodKey: string;
  onPeriodKeyChange: (key: string) => void;
  onSelectSchool: (key: string) => void;
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

function PeriodBar({ periodKey, onPeriodKeyChange }: Pick<CashierOverviewProps, 'periodKey' | 'onPeriodKeyChange'>) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 8px',
      background: '#F5FAFB',
      border: '1px solid #D4E3E7',
      borderRadius: 10,
      overflowX: 'auto',
      flexShrink: 0,
      scrollbarWidth: 'none',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {CASHIER_PERIODS.map(period => {
        const active = periodKey === period.key;
        return (
          <button
            key={period.key}
            onClick={() => onPeriodKeyChange(period.key)}
            style={{ flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 800 : 600, background: active ? '#2DD4BF' : '#fff', color: active ? '#fff' : '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {period.label.split(' ')[0]}
          </button>
        );
      })}
    </div>
  );
}

export default function CashierOverview({ periodKey, onPeriodKeyChange, onSelectSchool, onSidebarWidthChange }: CashierOverviewProps) {
  const { data: rows = null } = usePaymentsTable();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'paymentsAmount', dir: 'desc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  useEffect(() => {
    if (CASHIER_PERIODS.some(period => period.key === periodKey)) return;
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
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PeriodBar periodKey={periodKey} onPeriodKeyChange={onPeriodKeyChange} />

        <div style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 12, flexShrink: 0 }}>
          <KpiChip icon={<ReceiptText size={18} color="#fff" />} label="Платежи" value={money(totals.paymentsAmount)} color={KPI_COLORS.paymentsAmount} />
          <KpiChip icon={<Clock3 size={18} color="#fff" />} label="К-во на проверке" value={String(totals.pendingCount)} color={KPI_COLORS.pendingCount} />
          <KpiChip icon={<ReceiptText size={18} color="#fff" />} label="Сумма на проверке" value={money(totals.pendingAmount)} color={KPI_COLORS.pendingAmount} />
          <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Подтверждено" value={money(totals.confirmedAmount)} color={KPI_COLORS.confirmedAmount} />
          <KpiChip icon={<QrCode size={18} color="#fff" />} label="QR" value={money(totals.qrAmount)} color={KPI_COLORS.qrAmount} />
          <KpiChip icon={<Banknote size={18} color="#fff" />} label="Наличные" value={money(totals.cashAmount)} color={KPI_COLORS.cashAmount} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 12 }}>
            <ColumnCard sortKey="paymentsAmount" label="Школы" sortState={sortState} onSort={handleSort}>
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
              ['pendingCount', 'К-во на проверке'],
              ['pendingAmount', 'Сумма на проверке'],
              ['confirmedAmount', 'Подтверждено'],
              ['qrAmount', 'QR'],
              ['cashAmount', 'Наличные'],
            ] as const).map(([key, label]) => (
              <ColumnCard key={key} sortKey={key} label={label} sortState={sortState} onSort={handleSort}>
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
