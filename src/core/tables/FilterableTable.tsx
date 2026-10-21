import TableDownloadButton from './TableDownloadButton';
import { downloadTableExcel, readTableForExport } from './tableExport';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { filterRepeatedValues } from './repeatedValues';
import './DataTable.css';

type CellProps = { children?: React.ReactNode; colSpan?: number };

// Flatten arrays and fragments, retaining the original row elements and their handlers.
function nodes(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap(child =>
    React.isValidElement<CellProps>(child) && child.type === React.Fragment ? nodes(child.props.children) : [child]);
}
function textOf(node: React.ReactNode): string {
  return nodes(node).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (!React.isValidElement<CellProps>(child) || child.type === 'svg') return '';
    return textOf(child.props.children);
  }).join('');
}
function cells(row: React.ReactNode): React.ReactElement<CellProps>[] {
  return React.isValidElement<CellProps>(row) ? nodes(row.props.children).filter((cell): cell is React.ReactElement<CellProps> => React.isValidElement<CellProps>(cell) && (cell.type === 'td' || cell.type === 'th')) : [];
}

/** Column repeat filter for native tables; operates on all supplied rows before rendering. */
export default function FilterableTable({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [active, setActive] = useState<{ index: number; label: string } | null>(null);
  const [menu, setMenu] = useState<{ index: number; label: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', keydown);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', keydown); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  const content = nodes(children).map(section => {
    if (active && React.isValidElement<CellProps>(section) && section.type === 'tfoot') return null;
    if (!active || !React.isValidElement<CellProps>(section) || section.type !== 'tbody') return section;
    const rows = nodes(section.props.children);
    const dataRows = rows.filter(row => {
      const rowCells = cells(row);
      return rowCells.length > active.index && rowCells.every(cell => !cell.props.colSpan || cell.props.colSpan === 1);
    });
    const matches = filterRepeatedValues(dataRows, row => textOf(cells(row)[active.index]?.props.children));
    return React.cloneElement(section, {}, matches.length ? matches : <tr><td colSpan={Math.max(1, ...dataRows.map(row => cells(row).length))}>Повторяющихся значений нет</td></tr>);
  });
  return <>

    {active && <div className="dt-repeat-filter" role="status"><span>Повторяющиеся значения · {active.label}</span><button type="button" className="dt-btn" onClick={() => setActive(null)}>Сбросить</button></div>}
    <table {...props} className={`${props.className ?? ''} filterable-table`} style={{...props.style, position: 'relative'}} ref={tableRef} onContextMenu={event => {
      const header = (event.target as HTMLElement).closest('thead th');
      if (!header || header.closest('table') !== event.currentTarget) { props.onContextMenu?.(event); return; }
      const label = header.textContent?.trim() || '';
      if (!label || label === 'Действия') return;
      event.preventDefault();
      event.stopPropagation();
      setMenu({ index: (header as HTMLTableCellElement).cellIndex, label, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 260)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 140)) });
    }}>{
/* Export sits in the header area without an extra toolbar row. */}
    <caption className="native-table-export"><TableDownloadButton onDownload={async () => { if (!tableRef.current) return; const result = readTableForExport(tableRef.current); await downloadTableExcel(result.headers, result.rows); }}/></caption>
{content}</table>
    {menu && createPortal(<div className="dt-ctx-menu" role="menu" aria-label="Фильтр колонки" style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 10000 }} onClick={event => event.stopPropagation()}>
      <div className="dt-ctx-section">{menu.label}</div>
      <button type="button" role="menuitemcheckbox" aria-checked={active?.index === menu.index} className="dt-ctx-item" onClick={() => { setActive({ index: menu.index, label: menu.label }); setMenu(null); }}>Повторяющиеся значения</button>
      <button type="button" role="menuitem" className="dt-ctx-item" onClick={() => { setActive(null); setMenu(null); }}>Сбросить фильтр повторов</button>
    </div>, document.body)}
  </>;
}
