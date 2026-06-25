import React, {
  useState, useRef, useEffect, useCallback, useMemo
} from 'react';
import ReactDOM from 'react-dom';
import NotionSelect from '../selects/NotionSelect';
import { supabase } from '../../services/supabase';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'badge' | 'currency';

export interface ColumnDef<T = any> {
  key: string;
  label: string;
  type: ColumnType;
  width?: number;
  minWidth?: number;
  visible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  category?: string;
  render?: (value: any, row: T) => React.ReactNode;
  getValue?: (row: T) => any;
  editable?: boolean;
  editOptions?: { value: string; label: string }[];
  showInProperties?: boolean;
}

export interface SortConfig {
  key: string;
  dir: 'asc' | 'desc';
}

export type FilterOperator =
  | 'eq' | 'neq' | 'contains' | 'not_contains'
  | 'empty' | 'not_empty' | 'gt' | 'lt' | 'gte' | 'lte';

export interface FilterRule {
  id: string;
  key: string;
  operator: FilterOperator;
  value: string;
  conjunction: 'AND' | 'OR';
}

export type CalcMode = 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max' | 'empty' | 'not_empty';

export interface DataTableProps<T = any> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: keyof T;
  onRowClick?: (row: T) => void;
  onRowOpen?: (row: T) => void;
  onRowDelete?: (row: T) => void;
  onRowEdit?: (row: T) => void;
  onRowPayment?: (row: T) => void;
  onCellSave?: (row: T, key: string, value: any) => Promise<boolean> | boolean;
  storageKey?: string;
  loading?: boolean;
  emptyText?: string;
  groupColorKey?: string;
  calcBar?: React.ReactNode; // внешний вычислитель (для вставки наверху)
  toolbarExtra?: React.ReactNode;
  toolbarRightExtra?: React.ReactNode;
  hideToolbar?: boolean;
  canManageProperties?: boolean;
  showProperties?: boolean;
  onShowPropertiesChange?: (show: boolean) => void;
  expandedRowKey?: React.Key | null;
  getExpandedRowKey?: (row: T) => React.Key;
  onExpandedRowKeyChange?: (key: React.Key | null, row?: T) => void;
  renderExpandedRow?: (row: T) => React.ReactNode;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getCellValue<T>(row: T, col: ColumnDef<T>): any {
  if (col.getValue) return col.getValue(row);
  return (row as any)[col.key];
}

function applyFilter<T>(row: T, rule: FilterRule, col: ColumnDef<T> | undefined): boolean {
  if (!col) return true;
  const raw = getCellValue(row, col);
  const val = raw == null ? '' : String(raw).toLowerCase();
  const target = rule.value.toLowerCase();
  switch (rule.operator) {
    case 'eq':          return val === target;
    case 'neq':         return val !== target;
    case 'contains':    return val.includes(target);
    case 'not_contains':return !val.includes(target);
    case 'empty':       return val === '' || raw == null;
    case 'not_empty':   return val !== '' && raw != null;
    case 'gt':          return parseFloat(val) > parseFloat(target);
    case 'lt':          return parseFloat(val) < parseFloat(target);
    case 'gte':         return parseFloat(val) >= parseFloat(target);
    case 'lte':         return parseFloat(val) <= parseFloat(target);
    default:            return true;
  }
}

function calcColumnValues<T>(rows: T[], col: ColumnDef<T>, mode: CalcMode): string {
  const nums = rows.map(r => parseFloat(getCellValue(r, col))).filter(n => !isNaN(n));
  const allVals = rows.map(r => getCellValue(r, col));
  switch (mode) {
    case 'count':     return String(allVals.filter(v => v != null && v !== '').length);
    case 'sum':       return nums.reduce((a, b) => a + b, 0).toLocaleString('ru-RU');
    case 'avg':       return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';
    case 'min':       return nums.length ? Math.min(...nums).toLocaleString('ru-RU') : '—';
    case 'max':       return nums.length ? Math.max(...nums).toLocaleString('ru-RU') : '—';
    case 'empty':     return String(allVals.filter(v => v == null || v === '').length);
    case 'not_empty': return String(allVals.filter(v => v != null && v !== '').length);
    default:          return '';
  }
}

function isTransferColumn<T>(col: ColumnDef<T>): boolean {
  const key = col.key.toLowerCase();
  const label = col.label.toLowerCase();
  return key.includes('transfer') || label.includes('трансфер');
}

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'eq',          label: '= равно' },
  { value: 'neq',         label: '≠ не равно' },
  { value: 'contains',    label: '∋ содержит' },
  { value: 'not_contains',label: '∌ не содержит' },
  { value: 'empty',       label: '○ пусто' },
  { value: 'not_empty',   label: '● не пусто' },
  { value: 'gt',          label: '> больше' },
  { value: 'lt',          label: '< меньше' },
  { value: 'gte',         label: '≥ больше или равно' },
  { value: 'lte',         label: '≤ меньше или равно' },
];

const CALC_OPTIONS: { value: CalcMode; label: string }[] = [
  { value: 'none',      label: 'Нет' },
  { value: 'count',     label: 'Количество' },
  { value: 'sum',       label: 'Сумма' },
  { value: 'avg',       label: 'Среднее' },
  { value: 'min',       label: 'Мин' },
  { value: 'max',       label: 'Макс' },
  { value: 'empty',     label: 'Пустых' },
  { value: 'not_empty', label: 'Заполненных' },
];

const PAGE_SIZE = 20;

function useDragList<T>(list: T[], onChange: (next: T[]) => void) {
  const dragIdx = useRef<number | null>(null);
  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDragOver  = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    const next = [...list];
    const [item] = next.splice(dragIdx.current, 1);
    next.splice(i, 0, item);
    dragIdx.current = i;
    onChange(next);
  };
  const onDragEnd   = () => { dragIdx.current = null; };
  return { onDragStart, onDragOver, onDragEnd };
}

function buildColumns<T>(initialColumns: ColumnDef<T>[], saved: { key: string; visible: boolean; width?: number }[] | null): ColumnDef<T>[] {
  if (saved) {
    const map = Object.fromEntries(saved.map((p, i) => [p.key, { ...p, order: i }]));
    return initialColumns
      .map(c => ({
        ...c,
        visible: map[c.key]?.visible ?? c.visible ?? true,
        width: map[c.key]?.width ?? c.width,
      }))
      .sort((a, b) => (map[a.key]?.order ?? 999) - (map[b.key]?.order ?? 999));
  }
  return initialColumns.map(c => ({ ...c, visible: c.visible ?? true }));
}

async function loadColumnSettings(storageKey: string): Promise<{ key: string; visible: boolean; width?: number }[] | null> {
  try {
    const { data } = await supabase
      .from('column_settings')
      .select('settings')
      .eq('storage_key', storageKey)
      .maybeSingle();
    return data?.settings ?? null;
  } catch {
    return null;
  }
}

async function saveColumnSettings(storageKey: string, settings: { key: string; visible: boolean; width?: number }[]): Promise<void> {
  const { error } = await supabase
    .from('column_settings')
    .upsert({ storage_key: storageKey, settings, updated_at: new Date().toISOString() }, { onConflict: 'storage_key' });
  if (error) console.error('[DataTable] saveColumnSettings failed:', error);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, any>>({
  columns: initialColumns,
  data,
  rowKey,
  onRowClick,
  onRowOpen,
  onRowDelete,
  onRowEdit,
  onRowPayment,
  onCellSave,
  storageKey = 'dt_prefs',
  loading = false,
  emptyText = 'Нет данных',
  groupColorKey,
  toolbarExtra,
  toolbarRightExtra,
  hideToolbar = false,
  canManageProperties = true,
  showProperties: showPropertiesExternal,
  onShowPropertiesChange,
  expandedRowKey,
  getExpandedRowKey,
  onExpandedRowKeyChange,
  renderExpandedRow,
}: DataTableProps<T>) {

  // ── Persistent column order & visibility ──
  const [cols, setCols] = useState<ColumnDef<T>[]>(() => buildColumns(initialColumns, null));

  // Загружаем настройки колонок из Supabase при монтировании
  const prevColKeysRef = useRef<string>('');
  useEffect(() => {
    loadColumnSettings(storageKey).then(saved => {
      setCols(buildColumns(initialColumns, saved));
      prevColKeysRef.current = initialColumns.map(c => c.key).join(',');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Пересчитываем если изменился набор ключей колонок в коде
  useEffect(() => {
    const currentKeys = initialColumns.map(c => c.key).join(',');
    if (currentKeys === prevColKeysRef.current) return;
    prevColKeysRef.current = currentKeys;
    loadColumnSettings(storageKey).then(saved => {
      setCols(buildColumns(initialColumns, saved));
    });
  }, [initialColumns, storageKey]);

  const saveCols = useCallback((next: ColumnDef<T>[]) => {
    setCols(next);
    saveColumnSettings(storageKey, next.map(c => ({ key: c.key, visible: c.visible ?? true, width: c.width })));
  }, [storageKey]);

  const [sorts, setSorts] = useState<SortConfig[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [showPropsInternal, setShowPropsInternal] = useState(false);
  const showProps = showPropertiesExternal !== undefined ? showPropertiesExternal : showPropsInternal;
  const setShowProps = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(showProps) : v;
    setShowPropsInternal(next);
    onShowPropertiesChange?.(next);
  };
  const [propsSearch, setPropsSearch] = useState('');
  // openCats removed — props panel uses Shown/Hidden sections now
  const [calcModes, setCalcModes] = useState<Record<string, CalcMode>>({});
  const [colMenu, setColMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ row: T; x: number; y: number } | null>(null);
  const [calcPopup, setCalcPopup] = useState<{ key: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Set<any>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: any; key: string } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [savingCell, setSavingCell] = useState(false);
  const [page, setPage] = useState(1);

  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);



  const visibleCols = useMemo(() => cols.filter(c => c.visible !== false), [cols]);

  const processedData = useMemo(() => {
    let rows = [...data];
    if (filters.length > 0) {
      rows = rows.filter(row => {
        let result = true;
        filters.forEach((rule, i) => {
          const col = cols.find(c => c.key === rule.key);
          const match = applyFilter(row, rule, col);
          if (i === 0) { result = match; }
          else if (rule.conjunction === 'AND') { result = result && match; }
          else { result = result || match; }
        });
        return result;
      });
    }
    if (sorts.length > 0) {
      rows.sort((a, b) => {
        for (const s of sorts) {
          const col = cols.find(c => c.key === s.key);
          if (!col) continue;
          const av = getCellValue(a, col);
          const bv = getCellValue(b, col);
          const an = parseFloat(av); const bn = parseFloat(bv);
          let cmp = 0;
          if (!isNaN(an) && !isNaN(bn)) { cmp = an - bn; }
          else { cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'ru'); }
          if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }
    return rows;
  }, [data, filters, sorts, cols]);

  const totalPages = Math.max(1, Math.ceil(processedData.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * PAGE_SIZE;
  const pageRows = processedData.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filters, sorts, storageKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const handler = () => { setColMenu(null); setRowMenu(null); setCalcPopup(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newW = Math.max(60, resizeRef.current.startW + delta);
      saveCols(cols.map(c => c.key === resizeRef.current!.key ? { ...c, width: newW } : c));
    };
    const onUp = () => { resizeRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [cols, saveCols]);

  const { onDragStart, onDragOver, onDragEnd } = useDragList(cols, saveCols);

  const startCellEdit = (row: T, col: ColumnDef<T>) => {
    if (!col.editable || !onCellSave) return;
    setEditingCell({ rowId: row[rowKey], key: col.key });
    setDraftValue(String(getCellValue(row, col) ?? ''));
  };

  const commitCellEdit = async (row: T, col: ColumnDef<T>, nextValue = draftValue) => {
    if (!editingCell || !onCellSave) return;
    setSavingCell(true);
    const ok = await Promise.resolve(onCellSave(row, col.key, nextValue));
    setSavingCell(false);
    if (ok) setEditingCell(null);
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setDraftValue('');
  };

  const exportCSV = () => {
    const rows = selected.size > 0
      ? processedData.filter(r => selected.has(r[rowKey]))
      : processedData;
    const header = visibleCols.map(c => c.label).join(',');
    const body = rows.map(r => visibleCols.map(c => {
      const v = getCellValue(r, c);
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v ?? '';
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'export.csv'; a.click();
  };

  const setColumnSort = (key: string, dir: SortConfig['dir']) => {
    setSorts(prev => [{ key, dir }, ...prev.filter(sort => sort.key !== key)]);
    setColMenu(null);
    setCalcPopup(null);
  };

  const clearColumnSort = (key: string) => {
    setSorts(prev => prev.filter(sort => sort.key !== key));
    setColMenu(null);
    setCalcPopup(null);
  };

  const toggleColumnSort = (key: string) => {
    setSorts(prev => {
      const current = prev.find(sort => sort.key === key);
      const rest = prev.filter(sort => sort.key !== key);
      if (!current) return [{ key, dir: 'asc' }, ...rest];
      if (current.dir === 'asc') return [{ key, dir: 'desc' }, ...rest];
      return rest;
    });
    setColMenu(null);
    setCalcPopup(null);
  };

  const openCalcPopup = (key: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setCalcPopup({ key, x: rect.left, y: rect.bottom + 4 });
    setColMenu(null);
  };

  // ─── COMPACT CALC BAR (для вставки наверху снаружи) ───────────────────────
  // Этот ref передаётся через calcBarRef — внешний компонент может его использовать

  // ─── PROPERTIES PANEL (built before return so portal can be rendered separately) ───
  const TYPE_ICON: Record<string, string> = {
    text: 'Aa', number: '#', date: '▦', select: '≡', badge: '◉', currency: '₸',
  };
  const EyeOpenIcon = () => (
    <svg className="dt-eye-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/>
      <circle cx="10" cy="10" r="2.5"/>
    </svg>
  );
  const EyeOffIcon = () => (
    <svg className="dt-eye-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3l14 14M8.5 8.6A2.5 2.5 0 0012.4 12M6.2 6.3C3.9 7.7 2 10 2 10s3.5 6 8 6c1.6 0 3-.5 4.2-1.3M10 4c4.5 0 8 6 8 6s-.9 1.5-2.3 3"/>
    </svg>
  );
  const q = propsSearch.trim().toLowerCase();
  const propertyCols = cols.filter(c => c.showInProperties !== false);
  const filteredPropertyCols = propertyCols.filter(c => {
    const category = c.category ?? 'Основные';
    return !q || c.label.toLowerCase().includes(q) || category.toLowerCase().includes(q);
  });
  const groupColumns = (items: ColumnDef<T>[]) => items.reduce<{ category: string; items: ColumnDef<T>[] }[]>((acc, col) => {
    const category = col.category ?? 'Основные';
    const group = acc.find(item => item.category === category);
    if (group) group.items.push(col);
    else acc.push({ category, items: [col] });
    return acc;
  }, []);
  const visiblePropertyCols = filteredPropertyCols.filter(c => c.visible !== false);
  const hiddenPropertyCols = filteredPropertyCols.filter(c => c.visible === false);
  const visiblePropGroups = groupColumns(visiblePropertyCols);
  const hiddenPropGroups = groupColumns(hiddenPropertyCols);

  const PropsPanel = () => {
    const ColItem = ({ col, isVisible }: { col: ColumnDef<T>; isVisible: boolean }) => {
      const globalIdx = cols.findIndex(c => c.key === col.key);
      return (
        <div
          className={`dt-props-item-v2 ${!isVisible ? 'dt-props-item-v2--hidden' : ''}`}
          draggable={isVisible}
          onDragStart={() => onDragStart(globalIdx)}
          onDragOver={e => onDragOver(e, globalIdx)}
          onDragEnd={onDragEnd}
          onClick={() => saveCols(cols.map((c, j) => j === globalIdx ? { ...c, visible: !c.visible } : c))}
          title={isVisible ? 'Скрыть колонку' : 'Показать колонку'}
        >
          <span className="dt-props-item-drag">⠿</span>
          <span className="dt-props-item-icon" style={{ fontSize: 11, fontWeight: 700, color: 'var(--dt-text-2)', width: 18 }}>
            {TYPE_ICON[col.type] ?? '○'}
          </span>
          <span className="dt-props-item-name">{col.label}</span>
          {isVisible ? <EyeOpenIcon /> : <EyeOffIcon />}
        </div>
      );
    };
    const renderGroups = (groups: { category: string; items: ColumnDef<T>[] }[], isVisible: boolean) => (
      <>
        {groups.length === 0 && <div className="dt-props-empty">{q ? 'Ничего не найдено' : 'Пусто'}</div>}
        {groups.map(group => (
          <div key={group.category} className="dt-props-category-group">
            <div
              className="dt-props-section-title dt-props-section-title--clickable"
              onClick={() => setCollapsedCats(prev => {
                const key = `${isVisible ? 'visible' : 'hidden'}:${group.category}`;
                const next = new Set(prev);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}
            >
              <span>{group.category}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dt-props-section-count">{group.items.length}</span>
                <span className="dt-props-cat-arrow">{collapsedCats.has(`${isVisible ? 'visible' : 'hidden'}:${group.category}`) ? '▶' : '▼'}</span>
              </div>
            </div>
            {!collapsedCats.has(`${isVisible ? 'visible' : 'hidden'}:${group.category}`)
              && group.items.map(col => <ColItem key={col.key} col={col} isVisible={isVisible} />)}
          </div>
        ))}
      </>
    );

    return (
      <div className="dt-props-panel-v2" style={{ zIndex: 1, position: 'relative', top: 'auto', left: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="dt-props-header-v2">
          <div>
            <div className="dt-props-title-v2">Колонки таблицы</div>
            <div className="dt-props-subtitle-v2">Перетащи видимые колонки для смены порядка</div>
          </div>
        </div>
        <div className="dt-props-search">
          <input autoFocus placeholder="Поиск свойств..." value={propsSearch} onChange={e => setPropsSearch(e.target.value)} />
        </div>
        <div className="dt-props-split">
          <section className="dt-props-column">
            <div className="dt-props-column-head">
              <span>Показываются</span>
              <strong>{visiblePropertyCols.length}/{propertyCols.length}</strong>
            </div>
            <div className="dt-props-column-body">
              {renderGroups(visiblePropGroups, true)}
            </div>
            <div className="dt-props-column-footer">
              <button className="dt-props-section-action" onClick={() => saveCols(cols.map(c => c.showInProperties !== false ? { ...c, visible: false } : c))}>Скрыть все</button>
            </div>
          </section>
          <section className="dt-props-column">
            <div className="dt-props-column-head">
              <span>Скрытые</span>
              <strong>{hiddenPropertyCols.length}/{propertyCols.length}</strong>
            </div>
            <div className="dt-props-column-body">
              {renderGroups(hiddenPropGroups, false)}
            </div>
            <div className="dt-props-column-footer">
              <button className="dt-props-section-action" onClick={() => saveCols(cols.map(c => c.showInProperties !== false ? { ...c, visible: true } : c))}>Показать все</button>
            </div>
          </section>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="dt-root">

      {/* ── OVERLAY для закрытия панелей кликом (003) ── */}
      {(showFilterPanel || showSortPanel || (showProps && showPropertiesExternal === undefined) || rowMenu !== null || colMenu !== null || calcPopup !== null) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => {
            setShowFilterPanel(false); setShowSortPanel(false);
            setShowProps(false); setRowMenu(null);
            setColMenu(null); setCalcPopup(null);
          }}
        />
      )}

      {/* ── TOOLBAR ── */}
      {!hideToolbar && <div className="dt-toolbar" onClick={e => e.stopPropagation()}>
        <div className="dt-toolbar-left">
          {toolbarExtra}

          {canManageProperties && (
            <button
              className={`dt-btn ${showProps ? 'dt-btn--active' : ''}`}
              onClick={e => { e.stopPropagation(); setShowProps(v => !v); setShowFilterPanel(false); setShowSortPanel(false); }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Колонки
            </button>
          )}
        </div>

        <div className="dt-toolbar-right">
          {selected.size > 0 && (
            <span className="dt-selected-info">Выбрано: {selected.size}</span>
          )}
          {(selected.size > 0 && onRowDelete) && (
            <button className="dt-btn dt-btn--danger" onClick={() => {
              processedData.filter(r => selected.has(r[rowKey])).forEach(r => onRowDelete(r));
              setSelected(new Set());
            }}>
              Удалить выбранные
            </button>
          )}
          <div className="dt-pagination">
            <button className="dt-page-btn" disabled={pageSafe <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
            <span className="dt-page-text">{pageSafe} / {totalPages}</span>
            <button className="dt-page-btn" disabled={pageSafe >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
          </div>
          <button className="dt-btn dt-btn--icon" onClick={exportCSV} title="Выгрузить таблицу">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8M5 7l3 3 3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {toolbarRightExtra}
        </div>
      </div>}

      {/* ── COMPACT FILTER PANEL ── */}
      {showFilterPanel && (
        <div className="dt-compact-panel" style={{ position: "relative", zIndex: 100 }} onClick={e => e.stopPropagation()}>
          <div className="dt-compact-panel-header">
            <span className="dt-compact-panel-title">Фильтры</span>
            <button className="dt-compact-panel-close" onClick={() => setShowFilterPanel(false)}>✕</button>
          </div>
          <div className="dt-compact-panel-body">
            {filters.length === 0 && (
              <div className="dt-compact-empty">Фильтры не добавлены</div>
            )}
            {filters.map((f, i) => (
              <div key={f.id} className="dt-compact-row">
                {i > 0 && (
                  <select className="dt-select dt-select--xs" value={f.conjunction}
                    onChange={e => setFilters(prev => prev.map((x, j) => j === i ? { ...x, conjunction: e.target.value as 'AND' | 'OR' } : x))}>
                    <option value="AND">И</option>
                    <option value="OR">ИЛИ</option>
                  </select>
                )}
                {i === 0 && <span className="dt-conj-label">Где</span>}
                <select className="dt-select dt-select--md" value={f.key}
                  onChange={e => setFilters(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}>
                  {(() => {
                    const filterable = cols.filter(c => c.filterable !== false);
                    const cats = Array.from(new Set(filterable.map(c => c.category ?? 'Основные')));
                    return cats.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {filterable.filter(c => (c.category ?? 'Основные') === cat).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </optgroup>
                    ));
                  })()}
                </select>
                <select className="dt-select dt-select--md" value={f.operator}
                  onChange={e => setFilters(prev => prev.map((x, j) => j === i ? { ...x, operator: e.target.value as FilterOperator } : x))}>
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!['empty', 'not_empty'].includes(f.operator) && (
                  <input className="dt-input dt-input--sm" placeholder="Значение" value={f.value}
                    onChange={e => setFilters(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                )}
                <button className="dt-icon-btn" onClick={() => setFilters(prev => prev.filter(x => x.id !== f.id))}>✕</button>
              </div>
            ))}
          </div>
          <div className="dt-compact-panel-footer">
            <button className="dt-link-btn" onClick={() => {
              const id = String(Date.now());
              setFilters(prev => [...prev, { id, key: cols[0]?.key ?? '', operator: 'contains', value: '', conjunction: 'AND' }]);
            }}>+ Добавить</button>
            {filters.length > 0 && (
              <button className="dt-link-btn dt-link-btn--danger" onClick={() => setFilters([])}>Очистить</button>
            )}
          </div>
        </div>
      )}

      {/* ── COMPACT SORT PANEL ── */}
      {showSortPanel && (
        <div className="dt-compact-panel" style={{ position: "relative", zIndex: 100 }} onClick={e => e.stopPropagation()}>
          <div className="dt-compact-panel-header">
            <span className="dt-compact-panel-title">Сортировка</span>
            <button className="dt-compact-panel-close" onClick={() => setShowSortPanel(false)}>✕</button>
          </div>
          <div className="dt-compact-panel-body">
            {sorts.length === 0 && (
              <div className="dt-compact-empty">Сортировка не задана</div>
            )}
            {sorts.map((s, i) => (
              <div key={s.key + i} className="dt-compact-row">
                <span className="dt-sort-num">{i + 1}</span>
                <select className="dt-select dt-select--md" value={s.key}
                  onChange={e => setSorts(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}>
                  {(() => {
                    const sortable = cols;
                    const cats = Array.from(new Set(sortable.map(c => c.category ?? 'Основные')));
                    return cats.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {sortable.filter(c => (c.category ?? 'Основные') === cat).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </optgroup>
                    ));
                  })()}
                </select>
                <div className="dt-sort-dir-group">
                  <button
                    className={`dt-sort-dir-btn ${s.dir === 'asc' ? 'dt-sort-dir-btn--active' : ''}`}
                    onClick={() => setSorts(prev => prev.map((x, j) => j === i ? { ...x, dir: 'asc' } : x))}
                  >А→Я</button>
                  <button
                    className={`dt-sort-dir-btn ${s.dir === 'desc' ? 'dt-sort-dir-btn--active' : ''}`}
                    onClick={() => setSorts(prev => prev.map((x, j) => j === i ? { ...x, dir: 'desc' } : x))}
                  >Я→А</button>
                </div>
                <button className="dt-icon-btn" onClick={() => setSorts(prev => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          <div className="dt-compact-panel-footer">
            <button className="dt-link-btn" onClick={() => setSorts(prev => [...prev, { key: cols[0]?.key ?? '', dir: 'asc' }])}>
              + Добавить
            </button>
            {sorts.length > 0 && (
              <button className="dt-link-btn dt-link-btn--danger" onClick={() => setSorts([])}>Очистить</button>
            )}
          </div>
        </div>
      )}

      {/* ── PROPERTIES PANEL PORTAL (external control) ── */}
      {showPropertiesExternal ? ReactDOM.createPortal(
        <div
          onClick={() => setShowProps(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(23,34,47,0.18)', backdropFilter: 'blur(2px)' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', boxShadow: '0 16px 48px rgba(30,56,75,0.18)' }}>
            <PropsPanel />
          </div>
        </div>,
        document.body
      ) : null}

      {/* ── TABLE WRAPPER ── */}
      <div className="dt-wrap" ref={wrapRef}>
        {loading ? (
          <div className="dt-skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="dt-skeleton-row">
                {Array.from({ length: Math.min(visibleCols.length + 1, 6) }).map((_, j) => (
                  <div key={j} className="dt-skeleton-cell" style={{ width: j === 0 ? 40 : j === 1 ? 120 : 160 }} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                <th className="dt-th dt-th--num dt-sticky-col">#</th>

                {visibleCols.map(col => {
                  const sortEntry = sorts.find(s => s.key === col.key);
                  return (
                    <th
                      key={col.key}
                      className="dt-th"
                      style={{ width: col.width ?? col.minWidth ?? 140, minWidth: col.minWidth ?? 80 }}
                      onContextMenu={e => {
                        e.preventDefault();
                        if (isTransferColumn(col)) return;
                        openCalcPopup(col.key, e.currentTarget);
                      }}
                    >
                      <div className="dt-th-inner"
                        onClick={e => {
                          e.stopPropagation();
                          toggleColumnSort(col.key);
                        }}
                        title="ЛКМ: сортировка. ПКМ: вычисление"
                        style={{ cursor: 'pointer', userSelect: 'none', width: '100%' }}
                      >
                        <span className="dt-th-label">{col.label}</span>
                        {sortEntry && <span className="dt-sort-indicator">{sortEntry.dir === 'asc' ? '↑' : '↓'}</span>}
                        {calcModes[col.key] && calcModes[col.key] !== 'none' && (() => {
                          const result = calcColumnValues(processedData, col, calcModes[col.key] as any);
                          return (
                            <span style={{
                              marginLeft: 5, fontSize: 10, fontWeight: 700,
                              color: 'var(--dt-accent)', background: 'var(--dt-accent-l)',
                              borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
                            }}>
                              {result}
                            </span>
                          );
                        })()}
                      </div>
                      <div
                        className="dt-resize-handle"
                        onMouseDown={e => {
                          e.preventDefault();
                          resizeRef.current = { key: col.key, startX: e.clientX, startW: col.width ?? 140 };
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {processedData.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length + 1} className="dt-empty">
                    <div className="dt-empty-inner">
                      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                        <circle cx="20" cy="20" r="18" stroke="#C7D2FE" strokeWidth="2"/>
                        <path d="M14 20h12M20 14v12" stroke="#C7D2FE" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <p>{filters.length > 0 ? 'Нет результатов по фильтру' : emptyText}</p>
                      {filters.length > 0 && <button className="dt-link-btn" onClick={() => setFilters([])}>Сбросить фильтры</button>}
                    </div>
                  </td>
                </tr>
              ) : pageRows.map((row, idx) => {
                const id = row[rowKey];
                const expandKey = getExpandedRowKey ? getExpandedRowKey(row) : id;
                const isExpanded = expandedRowKey != null && String(expandedRowKey) === String(expandKey);
                const isSelected = selected.has(id);
                return (
                  <React.Fragment key={String(id)}>
                  <tr
                    className={`dt-tr ${isSelected ? 'dt-tr--selected' : ''}`}
                    data-group-even={(pageStart + idx) % 2 === 0 ? 'true' : 'false'}
                    onClick={() => onRowClick?.(row)}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRowMenu({ row, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <td className="dt-td dt-td--num dt-sticky-col">
                      <span className="dt-row-number">{pageStart + idx + 1}</span>
                      {(onRowOpen || onRowClick) && (
                        <button
                          className="dt-row-open-btn"
                          title="Открыть карточку"
                          onClick={event => {
                            event.stopPropagation();
                            (onRowOpen ?? onRowClick)?.(row);
                          }}
                        >
                          <span className="dt-row-open-icon" />
                        </button>
                      )}
                    </td>
                    {visibleCols.map(col => (
                      <td
                        key={col.key}
                        className={`dt-td ${col.editable ? 'dt-td--editable' : ''} ${editingCell?.rowId === id && editingCell.key === col.key ? 'dt-td--editing' : ''}`}
                        onClick={e => {
                          if (col.editable) {
                            e.stopPropagation();
                            startCellEdit(row, col);
                          }
                        }}
                      >
                        {editingCell?.rowId === id && editingCell.key === col.key ? (
                          col.editOptions ? (
                            <NotionSelect
                              autoFocus
                              value={draftValue}
                              options={col.editOptions}
                              disabled={savingCell}
                              variant="cell"
                              onChange={nextValue => {
                                setDraftValue(nextValue);
                                commitCellEdit(row, col, nextValue);
                              }}
                              onEscape={cancelCellEdit}
                            />
                          ) : (
                            <input
                              autoFocus
                              className="dt-cell-input"
                              value={draftValue}
                              disabled={savingCell}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setDraftValue(e.target.value)}
                              onBlur={() => commitCellEdit(row, col)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitCellEdit(row, col);
                                if (e.key === 'Escape') cancelCellEdit();
                              }}
                            />
                          )
                        ) : col.render ? col.render(getCellValue(row, col), row) : (
                          <span className="dt-cell-text">{getCellValue(row, col) ?? '—'}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && renderExpandedRow && (
                    <tr className="dt-expanded-row">
                      <td colSpan={visibleCols.length + 1} className="dt-expanded-cell">
                        {renderExpandedRow(row)}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}

            </tbody>
          </table>
        )}
      </div>


      {/* ── COLUMN CONTEXT MENU ── */}
      {colMenu && (
        <div className="dt-ctx-menu" style={{ left: colMenu.x, top: colMenu.y }} onClick={e => e.stopPropagation()}>
          <div className="dt-ctx-section">{cols.find(c => c.key === colMenu.key)?.label ?? 'Колонка'}</div>
          <>
            <button className="dt-ctx-item" onClick={() => setColumnSort(colMenu.key, 'asc')}>
              <span>↑</span> Сортировать по возрастанию
            </button>
            <button className="dt-ctx-item" onClick={() => setColumnSort(colMenu.key, 'desc')}>
              <span>↓</span> Сортировать по убыванию
            </button>
            {sorts.some(sort => sort.key === colMenu.key) && (
              <button className="dt-ctx-item" onClick={() => clearColumnSort(colMenu.key)}>
                <span>×</span> Убрать сортировку
              </button>
            )}
            <hr className="dt-ctx-divider" />
          </>
          <button className="dt-ctx-item" onClick={() => {
            saveCols(cols.map(c => c.key === colMenu.key ? { ...c, visible: false } : c));
            setColMenu(null);
          }}>
            <span>○</span> Скрыть колонку
          </button>
        </div>
      )}

      {/* ── ROW CONTEXT MENU ── */}
      {rowMenu && (
        <div className="dt-ctx-menu" style={{ left: rowMenu.x, top: rowMenu.y }} onClick={e => e.stopPropagation()}>
          {renderExpandedRow && onExpandedRowKeyChange && (
            <button className="dt-ctx-item" onClick={() => {
              const row = rowMenu.row;
              const expandKey = getExpandedRowKey ? getExpandedRowKey(row) : row[rowKey];
              const isExp = expandedRowKey != null && String(expandedRowKey) === String(expandKey);
              onExpandedRowKeyChange(isExp ? null : expandKey, isExp ? undefined : row);
              setRowMenu(null);
            }}>
              <span>↗</span> Открыть карточку
            </button>
          )}
          {onRowDelete && (
            <button className="dt-ctx-item dt-ctx-item--danger" onClick={() => { onRowDelete(rowMenu.row); setRowMenu(null); }}>
              <span>🗑</span> Удалить
            </button>
          )}
        </div>
      )}

      {/* ── CALC POPUP ── */}
      {calcPopup && (
        <div className="dt-ctx-menu dt-calc-popup" style={{ left: calcPopup.x, top: calcPopup.y, zIndex: 1000 }} onClick={e => e.stopPropagation()}>
          <div className="dt-ctx-section">{visibleCols.find(c => c.key === calcPopup.key)?.label ?? "Вычисление"}</div>
          {CALC_OPTIONS.map(o => (
            <button key={o.value} className={`dt-ctx-item ${(calcModes[calcPopup.key] ?? 'none') === o.value ? 'dt-ctx-item--active' : ''}`}
              onClick={() => { setCalcModes(prev => ({ ...prev, [calcPopup.key]: o.value })); setCalcPopup(null); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// @keyframes dtExpandIn добавлены в DataTable.css
export default DataTable;
