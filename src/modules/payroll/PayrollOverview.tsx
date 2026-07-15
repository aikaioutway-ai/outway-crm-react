import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ReceiptText, School, WalletCards } from 'lucide-react';
import { useDriversTable } from '../../hooks/useCrmQueries';
import { KpiChip, SchoolAvatar } from '../families/ManagerOverview';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from '../families/SchoolDockSidebar';
import { buildGroupedRows, GroupedRow, toggleGroupKey } from '../families/schoolGrouping';
import { money } from '../../utils/pricing';
import { computePayrollStats, PAYROLL_COLORS, PayrollMoneySummary, PayrollSchoolStat } from './payrollStats';
import { PAYROLL_OFFICE_KEY } from '../expenses/timesheetTypes';

type SortKey = 'school' | 'accruedAmount' | 'advanceAmount' | 'salaryAmount' | 'paidAmount' | 'remainingAmount';

interface PayrollOverviewProps {
  onSelectSchool: (key: string) => void;
  onSidebarWidthChange?: (width: number) => void;
  summaryBySchool?: Record<string, PayrollMoneySummary>;
}

const COLUMN_WEIGHTS: Record<SortKey, number> = {
  school: 1.4,
  accruedAmount: 1,
  advanceAmount: 1,
  salaryAmount: 1,
  paidAmount: 1,
  remainingAmount: 1,
};

const GRID_TEMPLATE = ['school', 'accruedAmount', 'advanceAmount', 'salaryAmount', 'paidAmount', 'remainingAmount']
  .map(key => `minmax(0, ${COLUMN_WEIGHTS[key as SortKey]}fr)`)
  .join(' ');

function sortValue(stat: PayrollSchoolStat, key: SortKey): number | string {
  if (key === 'school') return stat.label;
  return stat[key];
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

export default function PayrollOverview({ onSelectSchool, onSidebarWidthChange, summaryBySchool = {} }: PayrollOverviewProps) {
  const { data: rows = null } = useDriversTable();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  const stats = useMemo(() => computePayrollStats(rows ?? [], summaryBySchool), [rows, summaryBySchool]);
  const totals = useMemo(() => stats.reduce((acc, stat) => ({
    schools: acc.schools + (stat.driverCount > 0 ? 1 : 0),
    accruedAmount: acc.accruedAmount + stat.accruedAmount,
    advanceAmount: acc.advanceAmount + stat.advanceAmount,
    salaryAmount: acc.salaryAmount + stat.salaryAmount,
    paidAmount: acc.paidAmount + stat.paidAmount,
    remainingAmount: acc.remainingAmount + stat.remainingAmount,
  }), { schools: 0, accruedAmount: 0, advanceAmount: 0, salaryAmount: 0, paidAmount: 0, remainingAmount: 0 }), [stats]);

  const sortedStats = useMemo(() => {
    const officeStats = stats.filter(stat => stat.key === PAYROLL_OFFICE_KEY);
    const schoolStats = stats.filter(stat => stat.key !== PAYROLL_OFFICE_KEY);
    const grouped = buildGroupedRows(
      schoolStats,
      expandedGroups,
      ['accruedAmount', 'advanceAmount', 'salaryAmount', 'paidAmount', 'remainingAmount', 'driverCount', 'microbusCount', 'minivanCount', 'transferCount', 'noTransferCount'],
      (a, b) => {
        const av = sortValue(a.data, sortState.key);
        const bv = sortValue(b.data, sortState.key);
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
        return sortState.dir === 'asc' ? cmp : -cmp;
      },
    );
    const officeRows: GroupedRow<PayrollSchoolStat>[] = officeStats.map(stat => ({
      key: stat.key, label: stat.label, color: stat.color, logo: stat.logo, isGroup: false, isChild: false, data: stat,
    }));
    return [...grouped, ...officeRows];
  }, [sortState, stats, expandedGroups]);

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
          <KpiChip icon={<School size={18} color="#fff" />} label="Школы" value={String(totals.schools)} color={PAYROLL_COLORS.school} />
          <KpiChip icon={<ReceiptText size={18} color="#fff" />} label="Начислено" value={money(totals.accruedAmount)} color={PAYROLL_COLORS.accruedAmount} />
          <KpiChip icon={<WalletCards size={18} color="#fff" />} label="Авансы" value={money(totals.advanceAmount)} color={PAYROLL_COLORS.advanceAmount} />
          <KpiChip icon={<Banknote size={18} color="#fff" />} label="Зарплата" value={money(totals.salaryAmount)} color={PAYROLL_COLORS.salaryAmount} />
          <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Оплачено" value={money(totals.paidAmount)} color={PAYROLL_COLORS.paidAmount} />
          <KpiChip icon={<ChevronRight size={18} color="#fff" />} label="Остаток" value={money(totals.remainingAmount)} color={PAYROLL_COLORS.remainingAmount} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 12 }}>
          <ColumnCard sortKey="school" label="Школы" sortState={sortState} onSort={handleSort}>
            {sortedStats.map((row, index) => (
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
            ['accruedAmount', 'Начислено'],
            ['advanceAmount', 'Авансы'],
            ['salaryAmount', 'Зарплата'],
            ['paidAmount', 'Оплачено'],
            ['remainingAmount', 'Остаток'],
          ] as const).map(([key, label]) => (
            <ColumnCard key={key} sortKey={key} label={label} sortState={sortState} onSort={handleSort}>
              {sortedStats.map((row, index) => (
                <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.data[key] > 0 ? PAYROLL_COLORS[key] : undefined }}>{money(row.data[key])}</span>
                </div>
              ))}
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
