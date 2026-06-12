import React, {
  useState, useRef, useEffect, useCallback, useMemo
} from 'react';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'badge' | 'currency';

export interface ColumnDef<T = any> {
  key: string;
  label: string;
  type: ColumnType;
  width?: number;          // px
  minWidth?: number;
  visible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  category?: string;   // группировка в панели свойств
  render?: (value: any, row: T) => React.ReactNode;
  getValue?: (row: T) => any; // for sort/filter when render is custom
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
  rowKey: keyof T;                         // unique id field
  onRowClick?: (row: T) => void;
  onRowDelete?: (row: T) => void;
  onRowEdit?: (row: T) => void;
  storageKey?: string;                     // localStorage key for preferences
  loading?: boolean;
  emptyText?: string;
  groupColorKey?: string;  // field name whose value alternates row background color
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

// ─── DRAG & DROP for Properties ───────────────────────────────────────────────

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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, any>>({
  columns: initialColumns,
  data,
  rowKey,
  onRowClick,
  onRowDelete,
  onRowEdit,
  storageKey = 'dt_prefs',
  loading = false,
  emptyText = 'Нет данных',
  groupColorKey,
}: DataTableProps<T>) {

  // ── Persistent column order & visibility ──
  const [cols, setCols] = useState<ColumnDef<T>[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey + '_cols');
      if (saved) {
        const parsed: { key: string; visible: boolean; width?: number }[] = JSON.parse(saved);
        const map = Object.fromEntries(parsed.map((p, i) => [p.key, { ...p, order: i }]));
        const merged = initialColumns
          .map(c => ({ ...c, visible: map[c.key]?.visible ?? c.visible ?? true, width: map[c.key]?.width ?? c.width }))
          .sort((a, b) => (map[a.key]?.order ?? 999) - (map[b.key]?.order ?? 999));
        return merged;
      }
    } catch {}
    return initialColumns.map(c => ({ ...c, visible: c.visible ?? true }));
  });

  const saveCols = useCallback((next: ColumnDef<T>[]) => {
    setCols(next);
    localStorage.setItem(storageKey + '_cols', JSON.stringify(
      next.map(c => ({ key: c.key, visible: c.visible, width: c.width }))
    ));
  }, [storageKey]);

  // ── Sort (multi-level) ──
  const [sorts, setSorts] = useState<SortConfig[]>([]);

  // ── Filters ──
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // ── Properties panel ──
  const [showProps, setShowProps] = useState(false);
  const [propsSearch, setPropsSearch] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set<string>(['all']));

  // ── Column calculate ──
  const [calcModes, setCalcModes] = useState<Record<string, CalcMode>>({});

  // ── Column context menu ──
  const [colMenu, setColMenu] = useState<{ key: string; x: number; y: number } | null>(null);

  // ── Row context menu ──
  const [rowMenu, setRowMenu] = useState<{ row: T; x: number; y: number } | null>(null);

  // ── Calc popup ──
  const [calcPopup, setCalcPopup] = useState<{ key: string; x: number; y: number } | null>(null);

  // ── Selected rows (bulk) ──
  const [selected, setSelected] = useState<Set<any>>(new Set());

  // ── Column resize ──
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  // ── Visible cols ──
  const visibleCols = useMemo(() => cols.filter(c => c.visible !== false), [cols]);

  // ── Filtered + sorted data ──
  const processedData = useMemo(() => {
    let rows = [...data];

    // Apply filters
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

    // Apply sorts (multi-level, last sort wins first)
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

  // ── Close menus on outside click ──
  useEffect(() => {
    const handler = () => { setColMenu(null); setRowMenu(null); setCalcPopup(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // ── Column resize mouse events ──
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

  // ── Drag cols in properties ──
  const { onDragStart, onDragOver, onDragEnd } = useDragList(cols, saveCols);

  // ── Helpers ──
  const toggleSort = (key: string, dir: 'asc' | 'desc') => {
    setSorts(prev => {
      const exists = prev.find(s => s.key === key);
      if (exists && exists.dir === dir) return prev.filter(s => s.key !== key);
      if (exists) return prev.map(s => s.key === key ? { ...s, dir } : s);
      return [...prev, { key, dir }];
    });
    setColMenu(null);
  };

  const addFilterFromCol = (key: string) => {
    const id = String(Date.now());
    setFilters(prev => [...prev, { id, key, operator: 'contains', value: '', conjunction: 'AND' }]);
    setShowFilterPanel(true);
    setColMenu(null);
  };

  const toggleSelect = (id: any) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === processedData.length) setSelected(new Set());
    else setSelected(new Set(processedData.map(r => r[rowKey])));
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

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="dt-root" onClick={() => { setShowProps(false); }}>

      {/* ── TOOLBAR ── */}
      <div className="dt-toolbar" onClick={e => e.stopPropagation()}>
        <div className="dt-toolbar-left">
          {/* Filter button */}
          <button
            className={`dt-btn ${showFilterPanel ? 'dt-btn--active' : ''}`}
            onClick={() => setShowFilterPanel(v => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Фильтр
            {filters.length > 0 && <span className="dt-badge">{filters.length}</span>}
          </button>

          {/* Sort button */}
          <button
            className={`dt-btn ${sorts.length > 0 ? 'dt-btn--active' : ''}`}
            onClick={() => {
              if (sorts.length === 0 && cols.length > 0) {
                setSorts([{ key: cols[0].key, dir: 'asc' }]);
                setShowFilterPanel(true);
              } else {
                setShowFilterPanel(v => !v);
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 5l4-3 4 3M6 2v10M10 11l4 3-4 3M14 14V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Сортировка
            {sorts.length > 0 && <span className="dt-badge">{sorts.length}</span>}
          </button>

          {/* Properties button */}
          <button
            className={`dt-btn ${showProps ? 'dt-btn--active' : ''}`}
            onClick={e => { e.stopPropagation(); setShowProps(v => !v); }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            Свойства
          </button>
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
          <button className="dt-btn" onClick={exportCSV}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8M5 7l3 3 3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            CSV
          </button>
          <span className="dt-count">{processedData.length} строк</span>
        </div>
      </div>

      {/* ── FILTER / SORT PANEL ── */}
      {showFilterPanel && (
        <div className="dt-filter-panel" onClick={e => e.stopPropagation()}>
          {/* Sorts */}
          <div className="dt-filter-section">
            <div className="dt-filter-section-title">Сортировка</div>
            {sorts.map((s, i) => (
              <div key={s.key + i} className="dt-filter-row">
                <select className="dt-select" value={s.key} onChange={e => setSorts(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}>
                  {(() => {
                    const sortable = cols.filter(c => c.sortable !== false);
                    const cats = Array.from(new Set(sortable.map(c => c.category ?? 'Основные')));
                    return cats.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {sortable.filter(c => (c.category ?? 'Основные') === cat).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </optgroup>
                    ));
                  })()}
                </select>
                <select className="dt-select dt-select--sm" value={s.dir} onChange={e => setSorts(prev => prev.map((x, j) => j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x))}>
                  <option value="asc">А → Я</option>
                  <option value="desc">Я → А</option>
                </select>
                <button className="dt-icon-btn" onClick={() => setSorts(prev => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button className="dt-link-btn" onClick={() => setSorts(prev => [...prev, { key: cols[0]?.key ?? '', dir: 'asc' }])}>
              + Добавить сортировку
            </button>
          </div>

          {/* Filters */}
          <div className="dt-filter-section">
            <div className="dt-filter-section-title">Фильтры</div>
            {filters.map((f, i) => (
              <div key={f.id} className="dt-filter-row">
                {i > 0 && (
                  <select className="dt-select dt-select--xs" value={f.conjunction}
                    onChange={e => setFilters(prev => prev.map((x, j) => j === i ? { ...x, conjunction: e.target.value as 'AND' | 'OR' } : x))}>
                    <option value="AND">И</option>
                    <option value="OR">ИЛИ</option>
                  </select>
                )}
                {i === 0 && <span className="dt-conj-label">Где</span>}
                <select className="dt-select" value={f.key}
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
                <select className="dt-select" value={f.operator}
                  onChange={e => setFilters(prev => prev.map((x, j) => j === i ? { ...x, operator: e.target.value as FilterOperator } : x))}>
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!['empty', 'not_empty'].includes(f.operator) && (
                  <input className="dt-input" placeholder="Значение" value={f.value}
                    onChange={e => setFilters(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                )}
                <button className="dt-icon-btn" onClick={() => setFilters(prev => prev.filter(x => x.id !== f.id))}>✕</button>
              </div>
            ))}
            <div className="dt-filter-footer">
              <button className="dt-link-btn" onClick={() => {
                const id = String(Date.now());
                setFilters(prev => [...prev, { id, key: cols[0]?.key ?? '', operator: 'contains', value: '', conjunction: 'AND' }]);
              }}>+ Добавить фильтр</button>
              {filters.length > 0 && (
                <button className="dt-link-btn dt-link-btn--danger" onClick={() => setFilters([])}>Очистить всё</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PROPERTIES PANEL (Notion-style) ── */}
      {showProps && (() => {
        const TYPE_ICON: Record<string, string> = {
          text: '𝐓', number: '#', date: '📅', select: '≡', badge: '◉', currency: '₸',
        };
        const filtered = cols.filter(c =>
          !propsSearch || c.label.toLowerCase().includes(propsSearch.toLowerCase())
        );
        // группируем по category
        const catMap: Record<string, typeof cols> = {};
        filtered.forEach(c => {
          const cat = c.category ?? 'Основные';
          if (!catMap[cat]) catMap[cat] = [];
          catMap[cat].push(c);
        });
        const cats = Object.keys(catMap);
        return (
          <div className="dt-props-panel-v2" onClick={e => e.stopPropagation()}>
            {/* Search */}
            <div className="dt-props-search">
              <input
                autoFocus
                placeholder="Поиск свойств..."
                value={propsSearch}
                onChange={e => setPropsSearch(e.target.value)}
              />
            </div>
            {/* Body */}
            <div className="dt-props-body">
              {cats.map(cat => {
                const isOpen = openCats.has(cat) || !!propsSearch;
                const toggleCat = () => setOpenCats(prev => {
                  const next = new Set(prev);
                  next.has(cat) ? next.delete(cat) : next.add(cat);
                  return next;
                });
                return (
                  <div key={cat} className="dt-props-category">
                    <div className="dt-props-cat-header" onClick={toggleCat}>
                      <span>{cat}</span>
                      <span style={{ color: 'var(--dt-text-2)', fontSize: 11 }}>({catMap[cat].length})</span>
                      <span className={`dt-props-cat-arrow ${isOpen ? 'dt-props-cat-arrow--open' : ''}`}>▶</span>
                    </div>
                    {isOpen && (
                      <div className="dt-props-cat-items">
                        {catMap[cat].map(col => {
                          const globalIdx = cols.findIndex(c => c.key === col.key);
                          const isVisible = col.visible !== false;
                          return (
                            <div
                              key={col.key}
                              className={`dt-props-item-v2 ${!isVisible ? 'dt-props-item-v2--hidden' : ''}`}
                              draggable
                              onDragStart={() => onDragStart(globalIdx)}
                              onDragOver={e => onDragOver(e, globalIdx)}
                              onDragEnd={onDragEnd}
                              onClick={() => saveCols(cols.map((c, j) => j === globalIdx ? { ...c, visible: !c.visible } : c))}
                            >
                              <span className="dt-props-item-drag">⠿</span>
                              <span className="dt-props-item-icon">{TYPE_ICON[col.type] ?? '○'}</span>
                              <span className="dt-props-item-name">{col.label}</span>
                              <span className="dt-props-item-eye" title={isVisible ? 'Скрыть' : 'Показать'}>
                                {isVisible ? '👁' : '🙈'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Footer */}
            <div className="dt-props-footer">
              <button className="dt-link-btn" onClick={() => {
                saveCols(initialColumns.map(c => ({ ...c, visible: true })));
                setPropsSearch('');
              }}>Показать все</button>
            </div>
          </div>
        );
      })()}

      {/* ── TABLE WRAPPER ── */}
      <div className="dt-wrap">
        {loading ? (
          <div className="dt-skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="dt-skeleton-row">
                {Array.from({ length: Math.min(visibleCols.length + 2, 6) }).map((_, j) => (
                  <div key={j} className="dt-skeleton-cell" style={{ width: j === 0 ? 40 : j === 1 ? 120 : 160 }} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                {/* Checkbox col */}
                <th className="dt-th dt-th--check dt-sticky-col">
                  <input type="checkbox"
                    checked={selected.size === processedData.length && processedData.length > 0}
                    onChange={selectAll} />
                </th>
                {/* # col */}
                <th className="dt-th dt-th--num dt-sticky-col dt-sticky-col--2">#</th>

                {visibleCols.map(col => {
                  const sortEntry = sorts.find(s => s.key === col.key);
                  return (
                    <th
                      key={col.key}
                      className="dt-th"
                      style={{ width: col.width ?? col.minWidth ?? 140, minWidth: col.minWidth ?? 80 }}
                      onContextMenu={e => {
                        e.preventDefault();
                        setColMenu({ key: col.key, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <div className="dt-th-inner">
                        <span className="dt-th-label">{col.label}</span>
                        {sortEntry && (
                          <span className="dt-sort-indicator">{sortEntry.dir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                      {/* resize handle */}
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
                  <td colSpan={visibleCols.length + 2} className="dt-empty">
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
              ) : processedData.map((row, idx) => {
                const id = row[rowKey];
                const isSelected = selected.has(id);
                return (
                  <tr
                    key={String(id)}
                    className={`dt-tr ${isSelected ? 'dt-tr--selected' : ''}`}
                    data-group-even={groupColorKey ? (((row as any)[groupColorKey] ?? 0) % 2 === 0 ? 'true' : 'false') : undefined}
                    onClick={() => onRowClick?.(row)}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRowMenu({ row, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <td className="dt-td dt-td--check dt-sticky-col" onClick={e => { e.stopPropagation(); toggleSelect(id); }}>
                      <input type="checkbox" checked={isSelected} onChange={() => {}} />
                    </td>
                    <td className="dt-td dt-td--num dt-sticky-col dt-sticky-col--2">{idx + 1}</td>
                    {visibleCols.map(col => (
                      <td key={col.key} className="dt-td">
                        {col.render ? col.render(getCellValue(row, col), row) : (
                          <span className="dt-cell-text">{getCellValue(row, col) ?? '—'}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>

            {/* ── CALCULATE ROW ── */}
            <tfoot>
              <tr className="dt-tfoot-row">
                <td className="dt-tf dt-sticky-col" />
                <td className="dt-tf dt-sticky-col dt-sticky-col--2" />
                {visibleCols.map(col => {
                  const mode = calcModes[col.key] ?? 'none';
                  const result = mode !== 'none' ? calcColumnValues(processedData, col, mode) : '';
                  return (
                    <td key={col.key} className="dt-tf"
                      onClick={e => { e.stopPropagation(); setCalcPopup({ key: col.key, x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().top }); }}>
                      <div className="dt-calc-cell">
                        {mode === 'none'
                          ? <span className="dt-calc-hint">Вычислить</span>
                          : <><span className="dt-calc-label">{CALC_OPTIONS.find(o => o.value === mode)?.label}</span><span className="dt-calc-value">{result}</span></>
                        }
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── COLUMN CONTEXT MENU ── */}
      {colMenu && (
        <div className="dt-ctx-menu" style={{ left: colMenu.x, top: colMenu.y }} onClick={e => e.stopPropagation()}>
          <div className="dt-ctx-section">Сортировка</div>
          <button className="dt-ctx-item" onClick={() => toggleSort(colMenu.key, 'asc')}>
            <span>↑</span> А → Я {sorts.find(s => s.key === colMenu.key && s.dir === 'asc') && '✓'}
          </button>
          <button className="dt-ctx-item" onClick={() => toggleSort(colMenu.key, 'desc')}>
            <span>↓</span> Я → А {sorts.find(s => s.key === colMenu.key && s.dir === 'desc') && '✓'}
          </button>
          <div className="dt-ctx-divider" />
          <button className="dt-ctx-item" onClick={() => addFilterFromCol(colMenu.key)}>
            <span>⚙</span> Фильтр по колонке
          </button>
          <div className="dt-ctx-divider" />
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
          {onRowClick && (
            <button className="dt-ctx-item" onClick={() => { onRowClick(rowMenu.row); setRowMenu(null); }}>
              <span>↗</span> Открыть карточку
            </button>
          )}
          {onRowEdit && (
            <button className="dt-ctx-item" onClick={() => { onRowEdit(rowMenu.row); setRowMenu(null); }}>
              <span>✏</span> Редактировать
            </button>
          )}
          <button className="dt-ctx-item" onClick={() => {
            navigator.clipboard.writeText(String(rowMenu.row[rowKey]));
            setRowMenu(null);
          }}>
            <span>📋</span> Копировать ID
          </button>
          <div className="dt-ctx-divider" />
          {onRowDelete && (
            <button className="dt-ctx-item dt-ctx-item--danger" onClick={() => { onRowDelete(rowMenu.row); setRowMenu(null); }}>
              <span>🗑</span> Удалить
            </button>
          )}
        </div>
      )}

      {/* ── CALC POPUP ── */}
      {calcPopup && (
        <div className="dt-ctx-menu dt-calc-popup" style={{ left: calcPopup.x, top: calcPopup.y - 260 }} onClick={e => e.stopPropagation()}>
          <div className="dt-ctx-section">Вычисление</div>
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

export default DataTable;

