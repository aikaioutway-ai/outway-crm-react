import { microbusAverageTone } from './familiesRowHelpers';
import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import { SCHOOL_TABS } from './constants';
import React, { useEffect, useState } from 'react';
import { filterRepeatedValues } from '../../core/tables/repeatedValues';
import '../../core/tables/DataTable.css';
import './managerMetricGrid.css';
import { ArrowDown, ArrowUp, ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, ChevronRight, ListChecks, ClipboardList, UserCheck, UserPlus, Clock, Hourglass, AlertCircle, Users, Wallet, Calculator, UserX, Scale, FileX, CircleHelp, BusFront, CarFront, Route, ScanQrCode, Banknote } from 'lucide-react';
import { SchoolAvatar } from '../../core/dashboard/DashboardUI';

interface Metric { key: string; label: string; total: string | number; }
interface Column extends Metric { color: string; }
interface Row { key: string; label: string; logo?: string; icon?: React.ReactNode; values: Record<string, string | number>; isChild?: boolean; isGroup?: boolean; expanded?: boolean; disabled?: boolean; }
interface Props { footer?: React.ReactNode; splitView?: boolean; compactTotals?: boolean; commentScope?: string; commentContext?: string; columns: Column[]; rows: Row[]; sortKey: string; ascending: boolean; onSort: (key: string) => void; onSelect: (key: string) => void; showAvatars?: boolean; showValueLabels?: boolean; rowGap?: number; className?: string; }

export default function SchoolDashboardTable({ columns, rows, sortKey, ascending, onSort, onSelect, showAvatars = true, showValueLabels = false, className = '', commentScope, commentContext = '', splitView, footer, compactTotals }: Props) {
  const [repeatedKey, setRepeatedKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (splitView) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true); };
  }, [splitView]);
  if (splitView) return <ManagerMetricGrid compactTotals={compactTotals} footer={footer} columns={columns} rows={rows} sortKey={sortKey} ascending={ascending} onSort={onSort} onSelect={onSelect} />;
  const filteredRows = repeatedKey ? filterRepeatedValues(rows, row => columns[0]?.key === repeatedKey ? row.label : row.values[repeatedKey]) : rows;
  return (
    <div className="ow-school-table-wrap">

      {repeatedKey && <div className="dt-repeat-filter" role="status"><span>Повторяющиеся значения · {columns.find(column => column.key === repeatedKey)?.label} · {filteredRows.length} строк</span><button type="button" className="dt-btn" onClick={() => setRepeatedKey(null)}>Сбросить</button></div>}
      {menu && <div role="menu" aria-label="Фильтр колонки" className="dt-ctx-menu" style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 1000 }} onClick={event => event.stopPropagation()}>
        <div className="dt-ctx-section">{columns.find(column => column.key === menu.key)?.label}</div>
        <button type="button" role="menuitemcheckbox" aria-checked={repeatedKey === menu.key} className="dt-ctx-item" onClick={() => { setRepeatedKey(menu.key); setMenu(null); }}>Повторяющиеся значения</button>
        <button type="button" role="menuitem" className="dt-ctx-item" onClick={() => { setRepeatedKey(null); setMenu(null); }}>Сбросить фильтр повторов</button>
      </div>}
      <table data-comment-table={commentScope} data-comment-context={commentContext} className={`school-dashboard-table ow-school-table ${className}`}>
        <thead><tr>{columns.map((column, index) => {
          const sorted = sortKey === column.key;
          return <th key={column.key} onContextMenu={event => { event.preventDefault(); setMenu({ key: column.key, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 260)), y: Math.min(event.clientY, window.innerHeight - 140) }); }} title="ЛКМ: сортировка. ПКМ: фильтр" scope="col" aria-sort={sorted ? (ascending ? 'ascending' : 'descending') : 'none'} className={sorted ? 'is-sorted' : undefined} style={{ width: index === 0 ? '22%' : undefined, ['--col-color' as string]: column.color } as React.CSSProperties}>
            <button type="button" onClick={() => onSort(column.key)}>
              <span className="ow-school-table-total" title={String(column.total)}>{column.total}</span>
              <span className="ow-school-table-label">
                {index > 0 && <span className="ow-school-table-dot" aria-hidden="true" />}
                {column.label}
                {sorted && (ascending ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
              </span>
            </button>
          </th>;
        })}</tr></thead>
        <tbody>{filteredRows.map(row => <tr data-comment-row={row.key} key={row.key} className={row.isChild ? 'is-child' : undefined} onContextMenu={event=>{const school=SCHOOL_TABS.find(item=>item.key===row.key && item.key!=='ALL');showTaskContextMenu(event,school?{type:'school',id:school.key,label:school.label,schoolKey:school.key}:{type:'general',id:'',label:'Общая задача'});}}>{columns.map((column, index) => <td data-comment-column={column.key} key={column.key} onClick={index === 0 && !row.disabled ? () => onSelect(row.key) : undefined} className={index === 0 ? 'is-name' : undefined}>
          {index === 0
            ? <button type="button" disabled={row.disabled} onClick={event => { event.stopPropagation(); onSelect(row.key); }} aria-expanded={row.isGroup ? !!row.expanded : undefined}>
                {row.icon}{showAvatars && <SchoolAvatar logo={row.logo} label={row.label} color="var(--accent)" />}
                <span className="ow-school-table-name">{row.label}</span>
                {row.isGroup
                  ? (row.expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />)
                  : <ChevronRight className="ow-school-table-go" size={15} aria-hidden="true" />}
              </button>
            : showValueLabels ? <div className="school-table-metric"><span className="school-table-metric-label">{column.label}</span><span>{row.values[column.key]}</span></div> : row.values[column.key]}
        </td>)}</tr>)}{!filteredRows.length && <tr><td colSpan={columns.length}>Повторяющихся значений нет</td></tr>}</tbody>
      </table>
    </div>
  );
}

function ManagerMetricGrid({ compactTotals, footer, columns, rows, sortKey, ascending, onSort, onSelect }: Pick<Props, 'compactTotals' | 'footer' | 'columns' | 'rows' | 'sortKey' | 'ascending' | 'onSort' | 'onSelect'>) {
  const metric = columns.find(column => column.key === 'debtSum') ?? columns[0];
  if (!metric) return null;
  const sortLabel = `Сортировать по показателю «${metric.label}» ${sortKey === metric.key && !ascending ? 'по возрастанию' : 'по убыванию'}`;

  return (
    <section className="manager-metric-layout" aria-label="Показатели по школам">
      <div className="manager-metric-panel">
        <header className={compactTotals ? 'manager-metric-compact-totals' : undefined}>
          <h2>{columns.map(item => <MetricValue key={item.key} metric={item} value={item.total} showLabel />)}</h2>
          <button type="button" className="overview-icon-button"
            aria-label={sortLabel} title={sortLabel} onClick={() => onSort(metric.key)}>
            {sortKey === metric.key && ascending ? <ArrowUpNarrowWide size={18} aria-hidden="true" /> : <ArrowDownWideNarrow size={18} aria-hidden="true" />}
          </button>
        </header>
        {rows.length ? (
          <div className="manager-school-grid">
            {rows.map(row => (
              <button type="button" key={row.key} disabled={row.disabled} onClick={() => onSelect(row.key)}
                aria-expanded={row.isGroup ? !!row.expanded : undefined} className={row.isChild ? 'is-child' : undefined}>
                <span className="manager-school-identity">
                  {row.icon ?? <SchoolAvatar logo={row.logo} label={row.label} color="var(--accent)" size={40} fontSize={14} />}
                  <span>{row.label}</span>
                  {row.isGroup && (row.expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />)}
                </span>
                <span className="manager-school-metrics">
                  {columns.map(item => <MetricValue key={item.key} metric={item} value={row.values[item.key] ?? '—'} />)}
                </span>
              </button>
            ))}
          </div>
        ) : <p className="manager-metric-empty">Нет школ для отображения</p>}
        {footer}
      </div>
    </section>
  );
}


const METRIC_ICONS: Record<string, typeof ClipboardList> = {
  applications: ClipboardList, boarded: UserCheck, newRequests: UserPlus,
  inWork: ListChecks, waiting: Hourglass, overdue: Clock, debtorsCount: Users,
  debtSum: AlertCircle, charged: Calculator, paid: Wallet, balance: Scale,
  activeCount: UserCheck, expiredCount: FileX, temporaryCount: Clock,
  uncharged: FileX, rejected: UserX,
  pendingCount: Clock, pendingAmount: Clock, confirmedCount: UserCheck, confirmedAmount: Wallet,
  refundsCount: ListChecks, refundsAmount: Wallet, refundsPendingAmount: Clock, refundsConfirmedAmount: UserCheck,
  qrAmount: ScanQrCode, cashAmount: Banknote,
  microbusAverage: Users, transferCount: Route, microbusCount: BusFront, lightVehicleCount: CarFront,
};

const ADVERSE_METRICS = new Set(['debtSum', 'uncharged', 'expiredCount', 'rejected']);

function MetricValue({ metric, value, showLabel = false }: { metric: Metric; value?: string | number; showLabel?: boolean }) {
  const Icon = METRIC_ICONS[metric.key] ?? CircleHelp;
  const numericValue = typeof value === 'string' ? Number(value.replace(/\s/g, '').replace(',', '.')) : value ?? 0;
  const isAverage = metric.key === 'microbusAverage';
  const averageTone = isAverage && value !== undefined ? microbusAverageTone(value) : undefined;
  const isAdverse = numericValue < 0 || (numericValue > 0 && (ADVERSE_METRICS.has(metric.key) || (showLabel && metric.key === 'newRequests')));
  return (
    <span className={`manager-metric-value${isAdverse ? ' is-adverse' : ''}${isAverage ? ' logistics-average' : ''}`} title={metric.label}>
      <Icon size={showLabel ? 17 : 22} role={showLabel ? undefined : "img"} aria-label={showLabel ? undefined : metric.label} aria-hidden={showLabel || undefined} />
      {showLabel && <span>{metric.label}</span>}
      {value !== undefined && <strong data-tone={averageTone} className={metric.key === 'newRequests' && numericValue > 0 ? 'manager-period-count-alert' : undefined}>{typeof value === 'number' ? value.toLocaleString('ru-RU') : value}</strong>}
    </span>
  );
}
