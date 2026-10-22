import TableDownloadButton from './TableDownloadButton';
import { downloadTableExcel } from './tableExport';
import { filterRepeatedValues } from './repeatedValues';
import { openTaskComposer, TaskTarget } from '../../modules/tasks/taskTypes';
import React, {
  useState, useRef, useEffect, useCallback, useMemo
} from 'react';
import ReactDOM from 'react-dom';
import { ArrowDown, ArrowUp, Ban, ExternalLink, EyeOff, Plus, Trash2, X } from 'lucide-react';
import NotionSelect from '../selects/NotionSelect';
import { supabase } from '../../services/supabase';
import './DataTable.css';

// Пустые значения в ячейках («-», «–», «—», пустая строка) показываем одинаково:
// один бледный прочерк, чтобы таблица не рябила разными символами.
const EMPTY_MARKS = new Set(['', '-', '–', '—']);
function isEmptyMark(value: unknown): boolean {
  return (typeof value === 'string' && EMPTY_MARKS.has(value.trim())) || value === null || value === undefined;
}
export function normalizeEmptyCell(node: React.ReactNode): React.ReactNode {
  if (node === null || node === undefined || node === false) return node;
  const empty = <span className="dt-empty-value" aria-label="нет данных">—</span>;
  if (typeof node === 'string') return isEmptyMark(node) ? empty : node;
  if (React.isValidElement(node) && (node.type === 'span' || node.type === 'div')) {
    const children = (node.props as { children?: React.ReactNode }).children;
    if (typeof children === 'string' && EMPTY_MARKS.has(children.trim())) return empty;
  }
  return node;
}

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
  aggregateByKey?: string;
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



export interface DataTableProps<T = any> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: keyof T;
  onRowClick?: (row: T) => void;
  onRowOpen?: (row: T) => void;
  getTaskTarget?: (row: T) => TaskTarget;
  onRowReject?: (row: T) => void;
  canRowReject?: (row: T) => boolean;
  onRowDelete?: (row: T) => void;
  canRowDelete?: (row: T) => boolean;
  onRowEdit?: (row: T) => void;
  onRowPayment?: (row: T) => void;
  onCellSave?: (row: T, key: string, value: any) => Promise<boolean> | boolean;
  canEditCell?: (row: T, key: string) => boolean;
  storageKey?: string;
  commentTableKey?: string;
  commentContext?: string;
  loading?: boolean;
  emptyText?: string;
  groupColorKey?: string;
  groupByKey?: keyof T;
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
  onExport?: (rows: T[]) => void;
  /** Режим выбора строк галочками (вместо номера строки). */
  selectable?: boolean;
  /** false — галочки только для своих массовых действий, без кнопки «Удалить выбранные». */
  bulkDelete?: boolean;
  selectedKeys?: Set<any>;
  onSelectedKeysChange?: (keys: Set<any>) => void;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getCellValue<T>(row: T, col: ColumnDef<T>): any {
  if (col.getValue) return col.getValue(row);
  return (row as any)[col.key];
}

function compareRows<T>(a: T, b: T, sorts: SortConfig[], columns: ColumnDef<T>[]): number {
  for (const sort of sorts) {
    const column = columns.find(item => item.key === sort.key);
    if (!column) continue;
    const left = getCellValue(a, column);
    const right = getCellValue(b, column);
    const leftNumber = parseFloat(left);
    const rightNumber = parseFloat(right);
    const comparison = !isNaN(leftNumber) && !isNaN(rightNumber)
      ? leftNumber - rightNumber
      : String(left ?? '').localeCompare(String(right ?? ''), 'ru', { numeric: true });
    if (comparison !== 0) return sort.dir === 'asc' ? comparison : -comparison;
  }
  return 0;
}

function sortRowsInGroups<T extends Record<string, any>>(
  rows: T[],
  sorts: SortConfig[],
  columns: ColumnDef<T>[],
  groupByKey?: keyof T,
): T[] {
  if (!sorts.length) return rows;
  if (!groupByKey) return [...rows].sort((left, right) => compareRows(left, right, sorts, columns));

  const groups = new Map<unknown, { rows: T[]; firstIndex: number }>();
  rows.forEach((row, index) => {
    const rawKey = row[groupByKey];
    const key = rawKey == null || rawKey === '' ? Symbol(index) : rawKey;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { rows: [row], firstIndex: index });
  });

  return Array.from(groups.values())
    .sort((left, right) => {
      const leftFirst = left.rows.find(row => row.isFirstChild === true) ?? left.rows[0];
      const rightFirst = right.rows.find(row => row.isFirstChild === true) ?? right.rows[0];
      return compareRows(leftFirst, rightFirst, sorts, columns) || left.firstIndex - right.firstIndex;
    })
    .flatMap(group => [...group.rows].sort((left, right) => {
      const leftIndex = Number(left.familyIndex);
      const rightIndex = Number(right.familyIndex);
      return Number.isFinite(leftIndex) && Number.isFinite(rightIndex) ? leftIndex - rightIndex : 0;
    }));
}

function paginateRowsInGroups<T extends Record<string, any>>(
  rows: T[],
  pageSize: number,
  groupByKey?: keyof T,
): T[][] {
  if (!groupByKey) {
    return Array.from({ length: Math.max(1, Math.ceil(rows.length / pageSize)) }, (_, index) =>
      rows.slice(index * pageSize, (index + 1) * pageSize));
  }

  const pages: T[][] = [];
  let page: T[] = [];
  let index = 0;
  while (index < rows.length) {
    const first = rows[index];
    const rawKey = first[groupByKey];
    const group = [first];
    index += 1;
    if (rawKey != null && rawKey !== '') {
      while (index < rows.length && rows[index][groupByKey] === rawKey) {
        group.push(rows[index]);
        index += 1;
      }
    }
    if (page.length && page.length + group.length > pageSize) {
      pages.push(page);
      page = [];
    }
    page.push(...group);
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
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

const PAGE_SIZE = 20;

function useDragList<T>(list: T[], onReorder: (next: T[]) => void, onDrop: (next: T[]) => void) {
  const dragIdx = useRef<number | null>(null);
  const pendingRef = useRef<T[] | null>(null);
  const onDragStart = (i: number) => { dragIdx.current = i; pendingRef.current = null; };
  const onDragOver  = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    const base = pendingRef.current ?? list;
    const next = [...base];
    const [item] = next.splice(dragIdx.current, 1);
    next.splice(i, 0, item);
    dragIdx.current = i;
    pendingRef.current = next;
    onReorder(next);
  };
  const onDragEnd = () => {
    dragIdx.current = null;
    if (pendingRef.current) onDrop(pendingRef.current);
    pendingRef.current = null;
  };
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

/** Обновляет render/editable/editOptions и т.п. из свежего initialColumns,
 * сохраняя уже применённые пользователем order/visible/width — без похода
 * в Supabase. Нужен, потому что columnConfigSignature не видит изменений
 * в замыканиях render (например, cashierColumns пересобирается при вводе
 * даты), и без этого мерджа ячейки годами рендерились бы старыми функциями. */
function mergeFreshColumns<T>(initialColumns: ColumnDef<T>[], prevCols: ColumnDef<T>[]): ColumnDef<T>[] {
  const layout = new Map(prevCols.map((c, i) => [c.key, { visible: c.visible, width: c.width, order: i }]));
  return initialColumns
    .map(c => {
      const meta = layout.get(c.key);
      return { ...c, visible: meta?.visible ?? c.visible ?? true, width: meta?.width ?? c.width };
    })
    .sort((a, b) => (layout.get(a.key)?.order ?? 999) - (layout.get(b.key)?.order ?? 999));
}

function columnConfigSignature<T>(columns: ColumnDef<T>[]): string {
  return columns.map(column => [
    column.key,
    column.type,
    column.editable ? 'editable' : 'readonly',
    column.editOptions?.map(option => `${option.value}:${option.label}`).join('|') ?? '',
  ].join(':')).join(',');
}

type SavedColumns = { key: string; visible: boolean; width?: number }[];

// Кэш настроек колонок: в памяти (между страницами) и в localStorage
// (между перезагрузками). Позволяет с первого рендера показать сохранённую
// раскладку, а не колонки по умолчанию. Supabase обновляет кэш в фоне.
const LS_PREFIX = 'dt_cols:';
const settingsCache = new Map<string, SavedColumns | null>();

function readCachedSettings(storageKey: string): { found: boolean; saved: SavedColumns | null } {
  if (settingsCache.has(storageKey)) return { found: true, saved: settingsCache.get(storageKey) ?? null };
  try {
    const raw = localStorage.getItem(LS_PREFIX + storageKey);
    if (raw !== null) {
      const saved = JSON.parse(raw) as SavedColumns | null;
      settingsCache.set(storageKey, saved);
      return { found: true, saved };
    }
  } catch { /* localStorage недоступен или битый JSON */ }
  return { found: false, saved: null };
}

function writeCachedSettings(storageKey: string, saved: SavedColumns | null): void {
  settingsCache.set(storageKey, saved);
  try { localStorage.setItem(LS_PREFIX + storageKey, JSON.stringify(saved)); } catch { /* ignore */ }
}

async function loadColumnSettings(storageKey: string): Promise<{ ok: boolean; saved: SavedColumns | null }> {
  try {
    const { data, error } = await supabase
      .from('column_settings')
      .select('settings')
      .eq('storage_key', storageKey)
      .maybeSingle();
    if (error) return { ok: false, saved: null };
    return { ok: true, saved: data?.settings ?? null };
  } catch {
    return { ok: false, saved: null };
  }
}

async function saveColumnSettings(storageKey: string, settings: SavedColumns): Promise<void> {
  writeCachedSettings(storageKey, settings);
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
  onRowReject,
  getTaskTarget,
  canRowReject,
  onRowDelete,
  canRowDelete,
  onRowEdit: _onRowEdit,
  onRowPayment: _onRowPayment,
  onCellSave,
  canEditCell,
  storageKey = 'dt_prefs',
  commentTableKey,
  commentContext = '',
  loading = false,
  emptyText = 'Нет данных',
  groupColorKey: _groupColorKey,
  groupByKey,
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
  onExport,
  selectable = false,
  bulkDelete = true,
  selectedKeys,
  onSelectedKeysChange,
}: DataTableProps<T>) {

  // ── Persistent column order & visibility ──
  // Раскладка берётся из кэша сразу; если кэша нет — таблица показывает
  // скелетон, пока не придут настройки из Supabase (settingsReady).
  const [layoutKey, setLayoutKey] = useState(storageKey);
  const [cols, setCols] = useState<ColumnDef<T>[]>(() => buildColumns(initialColumns, readCachedSettings(storageKey).saved));
  const [readyKey, setReadyKey] = useState<string | null>(() => (readCachedSettings(storageKey).found ? storageKey : null));
  const settingsReady = readyKey === storageKey;

  // Смена storageKey (тот же DataTable на другой странице): сразу, ещё в
  // рендере, переключаемся на раскладку новой таблицы, чтобы не мелькнули
  // колонки предыдущей.
  if (layoutKey !== storageKey) {
    const cached = readCachedSettings(storageKey);
    setLayoutKey(storageKey);
    setCols(buildColumns(initialColumns, cached.saved));
    setReadyKey(cached.found ? storageKey : null);
  }

  const initialColumnsRef = useRef(initialColumns);
  initialColumnsRef.current = initialColumns;
  const prevSignatureRef = useRef(columnConfigSignature(initialColumns));
  // Растёт при каждом сохранении пользователем: ответ Supabase, пришедший
  // после локальной правки, не должен её затирать.
  const editVersionRef = useRef(0);

  // Обновляем настройки из Supabase в фоне (один запрос на storageKey).
  useEffect(() => {
    let cancelled = false;
    const versionAtStart = editVersionRef.current;
    loadColumnSettings(storageKey).then(({ ok, saved }) => {
      if (cancelled) return;
      if (ok) writeCachedSettings(storageKey, saved);
      if (editVersionRef.current === versionAtStart) {
        setCols(buildColumns(initialColumnsRef.current, ok ? saved : readCachedSettings(storageKey).saved));
      }
      setReadyKey(storageKey);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  // Изменился набор колонок в коде — пересобираем по кэшу настроек;
  // иначе просто подмешиваем свежие render-функции в текущий layout.
  useEffect(() => {
    const signature = columnConfigSignature(initialColumns);
    if (signature !== prevSignatureRef.current) {
      prevSignatureRef.current = signature;
      setCols(buildColumns(initialColumns, readCachedSettings(storageKey).saved));
      return;
    }
    setCols(prevCols => mergeFreshColumns(initialColumns, prevCols));
  }, [initialColumns, storageKey]);

  const persistCols = useCallback((next: ColumnDef<T>[]) => {
    editVersionRef.current += 1;
    saveColumnSettings(storageKey, next.map(c => ({ key: c.key, visible: c.visible ?? true, width: c.width })));
  }, [storageKey]);

  const saveCols = useCallback((next: ColumnDef<T>[]) => {
    setCols(next);
    persistCols(next);
  }, [persistCols]);

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
  const [repeatedKey, setRepeatedKey] = useState<string | null>(null);
  const [colMenu, setColMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ row: T; x: number; y: number } | null>(null);
  const [columnFilterPopup, setColumnFilterPopup] = useState<{ key: string; x: number; y: number } | null>(null);
  const [internalSelected, setInternalSelected] = useState<Set<any>>(new Set());
  const selected = selectedKeys ?? internalSelected;
  const setSelected = (next: Set<any>) => {
    if (onSelectedKeysChange) onSelectedKeysChange(next);
    else setInternalSelected(next);
  };
  const toggleSelected = (id: any) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const [editingCell, setEditingCell] = useState<{ rowId: any; key: string } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [savingCell, setSavingCell] = useState(false);
  const [page, setPage] = useState(1);

  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const colsRef   = useRef<ColumnDef<T>[]>(cols);
  useEffect(() => { colsRef.current = cols; }, [cols]);



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
    const repeatedColumn = cols.find(col => col.key === repeatedKey);
    if (repeatedColumn) rows = filterRepeatedValues(rows, row => getCellValue(row, repeatedColumn));
    return sortRowsInGroups(rows, sorts, cols, groupByKey);
  }, [data, filters, sorts, cols, groupByKey, repeatedKey]);

  const pagedRows = useMemo(
    () => paginateRowsInGroups(processedData, PAGE_SIZE, groupByKey),
    [processedData, groupByKey],
  );
  const totalPages = pagedRows.length;
  const pageSafe = Math.min(page, totalPages);
  const pageStart = pagedRows.slice(0, pageSafe - 1).reduce((count, rows) => count + rows.length, 0);
  const pageRows = pagedRows[pageSafe - 1] ?? [];

  useEffect(() => {
    setPage(1);
  }, [filters, sorts, storageKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const handler = () => { setColMenu(null); setRowMenu(null); setColumnFilterPopup(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newW = Math.max(60, resizeRef.current.startW + delta);
      const key = resizeRef.current.key;
      setCols(prev => prev.map(c => c.key === key ? { ...c, width: newW } : c));
    };
    const onUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        persistCols(colsRef.current);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [persistCols]);

  const { onDragStart, onDragOver, onDragEnd } = useDragList(cols, setCols, persistCols);

  const startCellEdit = (row: T, col: ColumnDef<T>) => {
    if (!col.editable || !onCellSave || canEditCell?.(row, col.key) === false) return;
    setEditingCell({ rowId: row[rowKey], key: col.key });
    // Ноль в числовой ячейке не оставляем в поле, чтобы сумму можно было сразу вводить.
    const value = getCellValue(row, col);
    const isNumeric = col.type === 'currency' || col.type === 'number';
    setDraftValue(isNumeric && Number(value) === 0 && !col.editOptions ? '' : String(value ?? ''));
  };

  const commitCellEdit = async (row: T, col: ColumnDef<T>, nextValue = draftValue) => {
    if (!editingCell || !onCellSave) return;
    const previousEditingCell = editingCell;
    if (col.editOptions) setEditingCell(null);
    setSavingCell(true);
    const ok = await Promise.resolve(onCellSave(row, col.key, nextValue));
    setSavingCell(false);
    if (ok) setEditingCell(null);
    if (!ok && col.editOptions) setEditingCell(previousEditingCell);
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setDraftValue('');
  };

  const exportExcel = async () => {
    const rows = selected.size > 0 ? processedData.filter(row => selected.has(row[rowKey])) : processedData;
    if (onExport) { await onExport(rows); return; }
    const columns = visibleCols.filter(column => !['actions', 'receiptUrl', 'pendingPaymentReceiptUrl'].includes(column.key));
    await downloadTableExcel(columns.map(column => column.label), rows.map(row => columns.map(column => {
      const value = getCellValue(row, column);
      return column.editOptions?.find(option => option.value === value)?.label ?? value;
    })));
  };

  const setColumnSort = (key: string, dir: SortConfig['dir']) => {
    setSorts(prev => [{ key, dir }, ...prev.filter(sort => sort.key !== key)]);
    setColMenu(null);
    setColumnFilterPopup(null);
  };

  const clearColumnSort = (key: string) => {
    setSorts(prev => prev.filter(sort => sort.key !== key));
    setColMenu(null);
    setColumnFilterPopup(null);
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
    setColumnFilterPopup(null);
  };

  const openColumnFilterPopup = (key: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setColumnFilterPopup({ key, x: rect.left, y: rect.bottom + 4 });
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
          <span className="dt-props-item-icon" style={{ fontSize: 11, fontWeight: 600, color: 'var(--dt-text-2)', width: 18 }}>
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
      {(showFilterPanel || showSortPanel || (showProps && showPropertiesExternal === undefined) || rowMenu !== null || colMenu !== null || columnFilterPopup !== null) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => {
            setShowFilterPanel(false); setShowSortPanel(false);
            setShowProps(false); setRowMenu(null);
            setColMenu(null); setColumnFilterPopup(null);
          }}
        />
      )}

      {repeatedKey && <div className="dt-repeat-filter" role="status">
        <span>Повторяющиеся значения · {cols.find(col => col.key === repeatedKey)?.label} · {processedData.length} строк</span>
        <button type="button" className="dt-btn" onClick={() => { setRepeatedKey(null); setPage(1); }}>Сбросить</button>
      </div>}
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
          {(selected.size > 0 && onRowDelete && bulkDelete) && (
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
          <TableDownloadButton onDownload={exportExcel}/>
          {toolbarRightExtra}
        </div>
      </div>}


      {/* ── COMPACT FILTER PANEL ── */}
      {showFilterPanel && (
        <div className="dt-compact-panel" style={{ position: "relative", zIndex: 100 }} onClick={e => e.stopPropagation()}>
          <div className="dt-compact-panel-header">
            <span className="dt-compact-panel-title">Фильтры</span>
            <button className="dt-compact-panel-close" onClick={() => setShowFilterPanel(false)} aria-label="Закрыть фильтры" title="Закрыть"><X size={14} aria-hidden="true" /></button>
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
                <button className="dt-icon-btn" onClick={() => setFilters(prev => prev.filter(x => x.id !== f.id))} aria-label="Удалить фильтр" title="Удалить фильтр"><X size={13} aria-hidden="true" /></button>
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
            <button className="dt-compact-panel-close" onClick={() => setShowSortPanel(false)} aria-label="Закрыть сортировку" title="Закрыть"><X size={14} aria-hidden="true" /></button>
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
                <button className="dt-icon-btn" onClick={() => setSorts(prev => prev.filter((_, j) => j !== i))} aria-label="Удалить сортировку" title="Удалить сортировку"><X size={13} aria-hidden="true" /></button>
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
        <div className="ow-overlay"
          onClick={() => setShowProps(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(23,34,47,0.18)', backdropFilter: 'blur(2px)' }}
        >
          <div className="ow-modal" role="dialog" aria-modal="true" aria-label="Колонки" onClick={e => e.stopPropagation()} style={{ position: 'relative', overflow: 'hidden' }}>
            <PropsPanel />
          </div>
        </div>,
        document.body
      ) : null}

      {/* ── TABLE WRAPPER ── */}
      <div className="dt-wrap" ref={wrapRef}>
        {loading || !settingsReady ? (
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
          <table data-comment-table={commentTableKey || storageKey.replace(/_v\d+$/, '')} data-comment-context={commentContext} className="dt-table" style={{position:'relative'}}>
            {hideToolbar && <caption className="native-table-export"><TableDownloadButton onDownload={exportExcel}/></caption>}
            <thead>
              <tr>
                <th className="dt-th dt-th--num dt-sticky-col">
                  {selectable ? (
                    <input
                      type="checkbox"
                      title="Выбрать всех на странице"
                      checked={pageRows.length > 0 && pageRows.every(row => selected.has(row[rowKey]))}
                      onChange={event => {
                        const next = new Set(selected);
                        pageRows.forEach(row => {
                          if (event.currentTarget.checked) next.add(row[rowKey]);
                          else next.delete(row[rowKey]);
                        });
                        setSelected(next);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  ) : '#'}
                </th>

                {visibleCols.map(col => {
                  const sortEntry = sorts.find(s => s.key === col.key);
                  return (
                    <th
                      key={col.key}
                      className="dt-th"
                      style={{ width: col.width ?? col.minWidth ?? 140, minWidth: col.minWidth ?? 80 }}
                      onContextMenu={e => {
                        e.preventDefault();
                        openColumnFilterPopup(col.key, e.currentTarget);
                      }}
                    >
                      <div className="dt-th-inner"
                        onClick={e => {
                          e.stopPropagation();
                          toggleColumnSort(col.key);
                        }}
                        title="ЛКМ: сортировка. ПКМ: фильтр"
                        style={{ cursor: 'pointer', userSelect: 'none', width: '100%' }}
                      >
                        <span className="dt-th-label">{col.label}</span>
                        {sortEntry && <span className="dt-sort-indicator">{sortEntry.dir === 'asc' ? '↑' : '↓'}</span>}

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
                  <tr data-comment-row={String(id)}
                    className={`dt-tr ${isSelected ? 'dt-tr--selected' : ''}`}
                    data-group-even={(pageStart + idx) % 2 === 0 ? 'true' : 'false'}
                    onClick={() => onRowClick?.(row)}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRowMenu({ row, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <td
                      className="dt-td dt-td--num dt-sticky-col"
                      onClick={selectable ? event => { event.stopPropagation(); toggleSelected(id); } : undefined}
                      style={selectable ? { cursor: 'pointer' } : undefined}
                    >
                      {selectable ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={event => event.stopPropagation()}
                          onChange={() => toggleSelected(id)}
                          style={{ cursor: 'pointer' }}
                        />
                      ) : (
                        <span className="dt-row-number">{pageStart + idx + 1}</span>
                      )}
                      {!selectable && (onRowOpen || onRowClick) && (
                        <button
                          className="dt-row-open-btn"
                          title="Открыть карточку"
                          onClick={event => {
                            event.stopPropagation();
                            (onRowOpen ?? onRowClick)?.(row);
                          }}
                        >
                          <svg className="dt-row-open-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path d="M7 3H3v4M3.5 3.5 8 8M11 15h4v-4m-.5 3.5L10 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </td>
                    {visibleCols.map(col => (
                      <td
                        key={col.key}
                        data-comment-column={col.key}
                        className={`dt-td ${col.editable && canEditCell?.(row, col.key) !== false ? 'dt-td--editable' : ''} ${editingCell?.rowId === id && editingCell.key === col.key ? 'dt-td--editing' : ''}`}
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
                              onClose={() => setEditingCell(null)}
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
                        ) : normalizeEmptyCell(col.render ? col.render(getCellValue(row, col), row) : (
                          <span className="dt-cell-text">{getCellValue(row, col) ?? '—'}</span>
                        ))}
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
              <ArrowUp size={14} aria-hidden="true" /> Сортировать по возрастанию
            </button>
            <button className="dt-ctx-item" onClick={() => setColumnSort(colMenu.key, 'desc')}>
              <ArrowDown size={14} aria-hidden="true" /> Сортировать по убыванию
            </button>
            {sorts.some(sort => sort.key === colMenu.key) && (
              <button className="dt-ctx-item" onClick={() => clearColumnSort(colMenu.key)}>
                <X size={14} aria-hidden="true" /> Убрать сортировку
              </button>
            )}
            <hr className="dt-ctx-divider" />
          </>
          <button className="dt-ctx-item" onClick={() => {
            saveCols(cols.map(c => c.key === colMenu.key ? { ...c, visible: false } : c));
            setColMenu(null);
          }}>
            <EyeOff size={14} aria-hidden="true" /> Скрыть колонку
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
              <ExternalLink size={14} aria-hidden="true" /> Открыть карточку
            </button>
          )}
          <button className="dt-ctx-item" onClick={()=>{openTaskComposer(getTaskTarget?.(rowMenu.row) ?? {type:'general',id:'',label:'Общая задача'});setRowMenu(null);}}><Plus size={14} aria-hidden="true" /> Поставить задачу</button>
          {onRowReject && (canRowReject?.(rowMenu.row) ?? true) && (
            <button className="dt-ctx-item dt-ctx-item--reject" onClick={() => { onRowReject(rowMenu.row); setRowMenu(null); }}>
              <Ban size={14} aria-hidden="true" /> Отказ
            </button>
          )}
          {onRowDelete && (canRowDelete?.(rowMenu.row) ?? true) && (
            <button className="dt-ctx-item dt-ctx-item--danger" onClick={() => { onRowDelete(rowMenu.row); setRowMenu(null); }}>
              <Trash2 size={14} aria-hidden="true" /> Удалить
            </button>
          )}
        </div>
      )}

      {columnFilterPopup && (
        <div role="menu" aria-label="Фильтр колонки" className="dt-ctx-menu dt-calc-popup" style={{ left: Math.max(8, Math.min(columnFilterPopup.x, window.innerWidth - 260)), top: Math.min(columnFilterPopup.y, window.innerHeight - 140), zIndex: 1000 }} onClick={e => e.stopPropagation()}>
          <div className="dt-ctx-section">{visibleCols.find(c => c.key === columnFilterPopup.key)?.label}</div>
          <button type="button" role="menuitemcheckbox" aria-checked={repeatedKey === columnFilterPopup.key} className={`dt-ctx-item ${repeatedKey === columnFilterPopup.key ? 'dt-ctx-item--active' : ''}`}
            onClick={() => { setRepeatedKey(columnFilterPopup.key); setPage(1); setColumnFilterPopup(null); }}>
            Повторяющиеся значения
          </button>
          <button type="button" role="menuitem" className="dt-ctx-item" onClick={() => { setRepeatedKey(null); setPage(1); setColumnFilterPopup(null); }}>Сбросить фильтр повторов</button>
        </div>
      )}
    </div>
  );
}

// @keyframes dtExpandIn добавлены в DataTable.css
export default DataTable;
