import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import { SCHOOL_TABS } from './constants';
import React from 'react';
import { SchoolAvatar } from '../../core/dashboard/DashboardUI';

interface Column { key: string; label: string; total: string | number; color: string; }
interface Row { key: string; label: string; logo?: string; icon?: React.ReactNode; values: Record<string, string | number>; isChild?: boolean; isGroup?: boolean; expanded?: boolean; disabled?: boolean; }
interface Props { columns: Column[]; rows: Row[]; sortKey: string; ascending: boolean; onSort: (key: string) => void; onSelect: (key: string) => void; showAvatars?: boolean; rowGap?: number; className?: string; }

export default function SchoolDashboardTable({ columns, rows, sortKey, ascending, onSort, onSelect, showAvatars = true, rowGap = 0, className = '' }: Props) {
  return (
    <div style={{ flex: '0 1 auto', minHeight: 0, overflow: 'auto', background: 'var(--white)', borderRadius: 14 }}>
      <table className={`school-dashboard-table ${className}`} style={{ width: '100%', borderCollapse: rowGap ? 'separate' : 'collapse', borderSpacing: `0 ${rowGap}px`, tableLayout: 'fixed' }}>
        <thead><tr>{columns.map((column, index) => <th key={column.key} scope="col" aria-sort={sortKey === column.key ? (ascending ? 'ascending' : 'descending') : 'none'} style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--white)', borderBottom: `3px solid ${column.color}`, textAlign: 'left', padding: 'var(--dashboard-head-padding, 14px 16px)', width: index === 0 ? '22%' : undefined }}>
          <button type="button" onClick={() => onSort(column.key)} style={{ border: 'none', background: 'transparent', color: column.color, textAlign: 'left', cursor: 'pointer', padding: 0 }}>
            <div title={String(column.total)} style={{ fontSize: 'var(--dashboard-total-size, 15.5px)', fontWeight: 800 }}>{column.total}</div>
            <div style={{ fontSize: 'var(--dashboard-label-size, 11px)', fontWeight: 700, color: 'var(--text-2)' }}>{column.label}{sortKey === column.key ? (ascending ? ' ↑' : ' ↓') : ''}</div>
          </button>
        </th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={row.key} onContextMenu={event=>{const school=SCHOOL_TABS.find(item=>item.key===row.key && item.key!=='ALL');showTaskContextMenu(event,school?{type:'school',id:school.key,label:school.label,schoolKey:school.key}:{type:'general',id:'',label:'Общая задача'});}} style={{ height: 'var(--dashboard-row-height, 56px)', background: rowIndex % 2 ? 'var(--surface-2)' : undefined }}>{columns.map((column, index) => <td key={column.key} onClick={index === 0 && !row.disabled ? () => onSelect(row.key) : undefined} style={{ cursor: index === 0 && !row.disabled ? 'pointer' : undefined, padding: index === 0 && row.isChild ? '0 16px 0 34px' : '0 16px', borderRight: index < columns.length - 1 ? '1px solid var(--border)' : undefined, fontSize: 'var(--dashboard-row-size, 14px)', fontWeight: 700, color: index === 0 ? 'var(--text)' : column.color }}>
          {index === 0 ? <button type="button" disabled={row.disabled} onClick={event => { event.stopPropagation(); onSelect(row.key); }} aria-expanded={row.isGroup ? !!row.expanded : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent', color: 'var(--text)', cursor: row.disabled ? 'default' : 'pointer', fontWeight: 700, padding: 0 }}>{row.icon}{showAvatars && <SchoolAvatar logo={row.logo} label={row.label} color="var(--accent)" />}{row.label}<span aria-hidden="true">{row.expanded ? '⌄' : '›'}</span></button> : row.values[column.key]}
        </td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
