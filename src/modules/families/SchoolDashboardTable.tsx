import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import { SCHOOL_TABS } from './constants';
import React, { useEffect, useState } from 'react';
import { filterRepeatedValues } from '../../core/tables/repeatedValues';
import '../../core/tables/DataTable.css';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { SchoolAvatar } from '../../core/dashboard/DashboardUI';

interface Column { key: string; label: string; total: string | number; color: string; }
interface Row { key: string; label: string; logo?: string; icon?: React.ReactNode; values: Record<string, string | number>; isChild?: boolean; isGroup?: boolean; expanded?: boolean; disabled?: boolean; }
interface Props { commentScope?: string; commentContext?: string; columns: Column[]; rows: Row[]; sortKey: string; ascending: boolean; onSort: (key: string) => void; onSelect: (key: string) => void; showAvatars?: boolean; rowGap?: number; className?: string; }

export default function SchoolDashboardTable({ columns, rows, sortKey, ascending, onSort, onSelect, showAvatars = true, className = '', commentScope, commentContext = '' }: Props) {
  const [repeatedKey, setRepeatedKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true); };
  }, []);
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
            : row.values[column.key]}
        </td>)}</tr>)}{!filteredRows.length && <tr><td colSpan={columns.length}>Повторяющихся значений нет</td></tr>}</tbody>
      </table>
    </div>
  );
}
