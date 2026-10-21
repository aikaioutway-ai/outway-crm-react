import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import { SCHOOL_TABS } from './constants';
import React from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { SchoolAvatar } from '../../core/dashboard/DashboardUI';

interface Column { key: string; label: string; total: string | number; color: string; }
interface Row { key: string; label: string; logo?: string; icon?: React.ReactNode; values: Record<string, string | number>; isChild?: boolean; isGroup?: boolean; expanded?: boolean; disabled?: boolean; }
interface Props { columns: Column[]; rows: Row[]; sortKey: string; ascending: boolean; onSort: (key: string) => void; onSelect: (key: string) => void; showAvatars?: boolean; rowGap?: number; className?: string; }

export default function SchoolDashboardTable({ columns, rows, sortKey, ascending, onSort, onSelect, showAvatars = true, className = '' }: Props) {
  return (
    <div className="ow-school-table-wrap">
      <table className={`school-dashboard-table ow-school-table ${className}`}>
        <thead><tr>{columns.map((column, index) => {
          const sorted = sortKey === column.key;
          return <th key={column.key} scope="col" aria-sort={sorted ? (ascending ? 'ascending' : 'descending') : 'none'} className={sorted ? 'is-sorted' : undefined} style={{ width: index === 0 ? '22%' : undefined, ['--col-color' as string]: column.color } as React.CSSProperties}>
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
        <tbody>{rows.map(row => <tr key={row.key} className={row.isChild ? 'is-child' : undefined} onContextMenu={event=>{const school=SCHOOL_TABS.find(item=>item.key===row.key && item.key!=='ALL');showTaskContextMenu(event,school?{type:'school',id:school.key,label:school.label,schoolKey:school.key}:{type:'general',id:'',label:'Общая задача'});}}>{columns.map((column, index) => <td key={column.key} onClick={index === 0 && !row.disabled ? () => onSelect(row.key) : undefined} className={index === 0 ? 'is-name' : undefined}>
          {index === 0
            ? <button type="button" disabled={row.disabled} onClick={event => { event.stopPropagation(); onSelect(row.key); }} aria-expanded={row.isGroup ? !!row.expanded : undefined}>
                {row.icon}{showAvatars && <SchoolAvatar logo={row.logo} label={row.label} color="var(--accent)" />}
                <span className="ow-school-table-name">{row.label}</span>
                {row.isGroup
                  ? (row.expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />)
                  : <ChevronRight className="ow-school-table-go" size={15} aria-hidden="true" />}
              </button>
            : row.values[column.key]}
        </td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
