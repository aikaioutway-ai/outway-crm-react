import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, ChevronDown, ChevronRight, Clock3, ReceiptText, School, ShieldCheck, WalletCards } from 'lucide-react';
import { useDriverAdvancesForPeriod, useDriversTable, useEmployees, usePayrollApprovalsForPeriod, usePayrollEntriesForPeriod } from '../../hooks/useCrmQueries';
import { DashboardGrid, DashboardSearch, DashboardTopPanel, OverviewColumn as ColumnCard, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH } from '../families/SchoolDockSidebar';
import { buildGroupedRows, GroupedRow, toggleGroupKey } from '../families/schoolGrouping';
import { ALL_PERIODS, currentPayrollPeriodKey } from '../families/constants';
import { money } from '../../utils/pricing';
import { buildPayrollApprovalSummaryBySchool, buildPayrollSummaryBySchool, computePayrollStats, PAYROLL_COLORS, PayrollSchoolStat } from './payrollStats';
import { PAYROLL_OFFICE_KEY, PayrollSchoolTab } from '../expenses/timesheetTypes';
import ManagerPeriodBar from '../families/ManagerPeriodBar';

type SortKey = 'school' | 'accruedAmount' | 'pendingAmount' | 'approvedAmount' | 'advanceAmount' | 'salaryAmount' | 'paidAmount' | 'remainingAmount';
type PayrollOverviewStat = PayrollSchoolStat & { pendingAmount: number; approvedAmount: number };

const PAYROLL_PERIODS = ALL_PERIODS.filter(period => period.key !== 'deposit');

interface PayrollOverviewProps {
  view: PayrollSchoolTab;
  sessionToken?: string;
  periodKey: string;
  onPeriodKeyChange: (key: string) => void;
  onSelectSchool: (key: string) => void;
  onSidebarWidthChange?: (width: number) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
}

const COLUMN_WEIGHTS: Record<SortKey, number> = {
  school: 1.4,
  accruedAmount: 1,
  pendingAmount: 1,
  approvedAmount: 1,
  advanceAmount: 1,
  salaryAmount: 1,
  paidAmount: 1,
  remainingAmount: 1,
};

function sortValue(stat: PayrollOverviewStat, key: SortKey): number | string {
  if (key === 'school') return stat.label;
  return stat[key];
}

export default function PayrollOverview({ view, sessionToken, periodKey, onPeriodKeyChange, onSelectSchool, onSidebarWidthChange, search = '', onSearchChange }: PayrollOverviewProps) {
  const { data: rows = null } = useDriversTable();
  const { data: employees = null } = useEmployees();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));

  useEffect(() => {
    onSidebarWidthChange?.(sidebarHidden ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH);
  }, [onSidebarWidthChange, sidebarHidden]);

  useEffect(() => {
    if (PAYROLL_PERIODS.some(period => period.key === periodKey)) return;
    onPeriodKeyChange(currentPayrollPeriodKey());
  }, [onPeriodKeyChange, periodKey]);

  const period = PAYROLL_PERIODS.find(item => item.key === periodKey);
  const periodMonth = period?.month ?? new Date().getMonth() + 1;
  const periodYear = period?.year ?? new Date().getFullYear();

  const { data: entries = null } = usePayrollEntriesForPeriod(periodMonth, periodYear);
  const { data: advances = null } = useDriverAdvancesForPeriod(periodMonth, periodYear);
  const { data: approvals = [] } = usePayrollApprovalsForPeriod(periodMonth, periodYear, sessionToken);

  const summaryBySchool = useMemo(
    () => buildPayrollSummaryBySchool(entries ?? [], advances ?? [], rows ?? [], employees ?? []),
    [entries, advances, rows, employees],
  );

  const approvalBySchool = useMemo(() => new Map(approvals.map(approval => [approval.schoolKey, approval.status])), [approvals]);
  const entryApprovalBySchool = useMemo(
    () => buildPayrollApprovalSummaryBySchool(entries ?? [], rows ?? [], employees ?? []),
    [employees, entries, rows],
  );
  const stats = useMemo<PayrollOverviewStat[]>(() => computePayrollStats(rows ?? [], summaryBySchool).map(stat => {
    const approvalStatus = approvalBySchool.get(stat.key);
    const approved = approvalStatus === 'approved';
    const staged = {
      ...stat,
      pendingAmount: entryApprovalBySchool[stat.key]?.pendingAmount ?? 0,
      approvedAmount: entryApprovalBySchool[stat.key]?.approvedAmount ?? 0,
    };
    if (view !== 'salary' || approved) return staged;
    return {
      ...staged,
      accruedAmount: 0,
      advanceAmount: 0,
      salaryAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
    };
  }), [approvalBySchool, entryApprovalBySchool, rows, summaryBySchool, view]);
  const totals = useMemo(() => stats.reduce((acc, stat) => ({
    schools: acc.schools + (stat.driverCount > 0 ? 1 : 0),
    accruedAmount: acc.accruedAmount + stat.accruedAmount,
    pendingAmount: acc.pendingAmount + stat.pendingAmount,
    approvedAmount: acc.approvedAmount + stat.approvedAmount,
    advanceAmount: acc.advanceAmount + stat.advanceAmount,
    salaryAmount: acc.salaryAmount + stat.salaryAmount,
    paidAmount: acc.paidAmount + stat.paidAmount,
    remainingAmount: acc.remainingAmount + stat.remainingAmount,
  }), { schools: 0, accruedAmount: 0, pendingAmount: 0, approvedAmount: 0, advanceAmount: 0, salaryAmount: 0, paidAmount: 0, remainingAmount: 0 }), [stats]);

  const columnKeys: SortKey[] = view === 'timesheet'
    ? ['school', 'accruedAmount', 'pendingAmount', 'approvedAmount']
    : ['school', 'accruedAmount', 'advanceAmount', 'salaryAmount', 'paidAmount', 'remainingAmount'];
  const gridTemplate = columnKeys.map(key => `minmax(0, ${COLUMN_WEIGHTS[key]}fr)`).join(' ');

  const sortedStats = useMemo(() => {
    const officeStats = stats.filter(stat => stat.key === PAYROLL_OFFICE_KEY);
    const schoolStats = stats.filter(stat => stat.key !== PAYROLL_OFFICE_KEY);
    const grouped = buildGroupedRows(
      schoolStats,
      expandedGroups,
      ['accruedAmount', 'pendingAmount', 'approvedAmount', 'advanceAmount', 'salaryAmount', 'paidAmount', 'remainingAmount', 'driverCount', 'microbusCount', 'minivanCount', 'transferCount', 'noTransferCount'],
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
    const query = search.trim().toLowerCase();
    return [...grouped, ...officeRows].filter(row => !query || row.label.toLowerCase().includes(query));
  }, [sortState, stats, expandedGroups, search]);

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DashboardTopPanel>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
              <ManagerPeriodBar periodKey={periodKey} onPeriodKeyChange={onPeriodKeyChange} periods={PAYROLL_PERIODS} showAll={false} />
            </div>
            <DashboardSearch value={search} onChange={onSearchChange ?? (() => {})} placeholder="Поиск школы..." />
          </div>
        </DashboardTopPanel>

        <DashboardGrid template={gridTemplate}>
          <ColumnCard
            first
            sortKey="school"
            label="Школа"
            icon={<School size={17} color="#fff" />}
            value={String(totals.schools)}
            color={PAYROLL_COLORS.school}
            sortState={sortState}
            onSort={handleSort}
          >
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

          {(view === 'timesheet' ? [
            ['accruedAmount', 'Начислено', <ReceiptText size={17} color="#fff" />, money(totals.accruedAmount), PAYROLL_COLORS.accruedAmount],
            ['pendingAmount', 'На согласовании', <Clock3 size={17} color="#fff" />, money(totals.pendingAmount), '#B45309'],
            ['approvedAmount', 'Утверждено', <ShieldCheck size={17} color="#fff" />, money(totals.approvedAmount), '#15803D'],
          ] as const : [
            ['accruedAmount', 'Начислено', <ReceiptText size={17} color="#fff" />, money(totals.accruedAmount), PAYROLL_COLORS.accruedAmount],
            ['advanceAmount', 'Авансы', <WalletCards size={17} color="#fff" />, money(totals.advanceAmount), PAYROLL_COLORS.advanceAmount],
            ['salaryAmount', 'Зарплата', <Banknote size={17} color="#fff" />, money(totals.salaryAmount), PAYROLL_COLORS.salaryAmount],
            ['paidAmount', 'Оплачено', <CheckCircle2 size={17} color="#fff" />, money(totals.paidAmount), PAYROLL_COLORS.paidAmount],
            ['remainingAmount', 'Остаток', <ChevronRight size={17} color="#fff" />, money(totals.remainingAmount), PAYROLL_COLORS.remainingAmount],
          ] as const).map(([key, label, icon, value, color]) => (
            <ColumnCard
              key={key}
              sortKey={key}
              label={label}
              icon={icon}
              value={value}
              color={color}
              sortState={sortState}
              onSort={handleSort}
            >
              {sortedStats.map((row, index) => (
                <div key={row.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.data[key] > 0 ? color : undefined }}>{money(row.data[key])}</span>
                </div>
              ))}
            </ColumnCard>
          ))}
        </DashboardGrid>
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
