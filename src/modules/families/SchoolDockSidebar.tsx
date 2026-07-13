import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SCHOOL_GROUPS } from './constants';
import { toggleGroupKey } from './schoolGrouping';

export type SchoolDockItem = {
  key: string;
  label: string;
  color: string;
  logo?: string;
  disabled?: boolean;
  active?: boolean;
};

type DockRow = SchoolDockItem & { isGroup?: boolean; isChild?: boolean; expanded?: boolean };

const GROUPED_CHILD_KEYS = new Set(SCHOOL_GROUPS.flatMap(g => g.children));

function buildDockRows(items: SchoolDockItem[], expandedGroups: Set<string>): DockRow[] {
  const itemByKey = new Map(items.map(i => [i.key, i]));
  const handledGroups = new Set<string>();
  const rows: DockRow[] = [];

  items.forEach(item => {
    if (!GROUPED_CHILD_KEYS.has(item.key)) {
      rows.push(item);
      return;
    }
    const group = SCHOOL_GROUPS.find(g => g.children.includes(item.key));
    if (!group || handledGroups.has(group.key)) return;
    handledGroups.add(group.key);
    const children = group.children.map(k => itemByKey.get(k)).filter((i): i is SchoolDockItem => !!i);
    if (!children.length) return;
    const expanded = expandedGroups.has(group.key);
    rows.push({
      key: group.key,
      label: group.label,
      color: children[0].color,
      logo: group.logo,
      active: children.some(c => c.active),
      isGroup: true,
      expanded,
    });
    if (expanded) children.forEach(c => rows.push({ ...c, isChild: true }));
  });

  return rows;
}

interface SchoolDockSidebarProps {
  items: SchoolDockItem[];
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  onSelect: (key: string) => void;
  ariaLabel?: string;
}

export const SCHOOL_DOCK_WIDTH = 78;
export const SCHOOL_DOCK_HIDDEN_WIDTH = 22;

function DockSchoolAvatar({ logo, label, color, size = 28, isGroup, expanded }: { logo?: string; label: string; color: string; size?: number; isGroup?: boolean; expanded?: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      {logo ? (
        <img src={logo} alt={label} style={{ width: size, height: size, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <span style={{ width: size, height: size, borderRadius: 9, background: color, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {label.slice(0, 2).toUpperCase()}
        </span>
      )}
      {isGroup && (
        <span style={{
          position: 'absolute', right: -3, bottom: -3, width: 12, height: 12, borderRadius: '50%',
          background: expanded ? 'var(--primary, #2DD4BF)' : '#fff', border: '1.5px solid var(--primary, #2DD4BF)',
          color: expanded ? '#fff' : 'var(--primary, #2DD4BF)', fontSize: 8, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>
          {expanded ? '−' : '+'}
        </span>
      )}
    </span>
  );
}

export default function SchoolDockSidebar({ items, hidden, onHiddenChange, onSelect, ariaLabel = 'Школы' }: SchoolDockSidebarProps) {
  const visible = !hidden;
  const panelWidth = visible ? 58 : 0;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups(prev => toggleGroupKey(prev, key));
  const rows = useMemo(() => buildDockRows(items, expandedGroups), [items, expandedGroups]);

  return (
    <>
      <aside
        style={{
          width: panelWidth,
          height: 'calc(100vh - 20px)',
          background: '#fff',
          borderRadius: visible ? 22 : '22px 0 0 22px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 10,
          right: visible ? 10 : -62,
          zIndex: 80,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'right .18s ease, width .18s ease, opacity .12s ease',
          boxShadow: visible && hidden ? '0 12px 30px rgba(23, 34, 47, 0.12)' : 'none',
        }}
        onClick={event => event.stopPropagation()}
        aria-label={ariaLabel}
      >
        <div style={{
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 8px',
          borderBottom: '1px solid var(--border)',
        }}>
          <button
            onClick={() => {
              onHiddenChange(true);
            }}
            title="Скрыть школы"
            style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 10, background: '#F5FAFB', color: '#626C8B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <nav style={{ flex: 1, padding: '7px 6px 7px 0', overflow: 'auto' }}>
          {rows.map(row => (
            <button
              key={row.key}
              onClick={() => {
                if (row.disabled) return;
                if (row.isGroup) { toggleGroup(row.key); return; }
                onSelect(row.key);
              }}
              title={row.isChild ? row.label : row.label}
              style={{
                width: row.active ? 'calc(100% + 6px)' : 'calc(100% - 6px)',
                marginLeft: row.active ? 0 : 6,
                minHeight: row.isChild ? 32 : 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 5,
                border: '1px solid transparent',
                borderRadius: row.active ? '0 14px 14px 0' : 14,
                background: row.active ? 'var(--active-bg)' : 'transparent',
                color: row.active ? '#17222F' : row.disabled ? '#C0C0C8' : '#626C8B',
                cursor: row.disabled ? 'default' : 'pointer',
                opacity: row.disabled ? 0.45 : row.isChild ? 0.85 : 1,
                boxShadow: row.active ? 'inset -4px 0 0 #31A4A5' : 'none',
                overflow: 'hidden',
                padding: '6px 0',
              }}
            >
              <DockSchoolAvatar logo={row.logo} label={row.label} color={row.color} size={row.isChild ? 22 : 28} isGroup={row.isGroup} expanded={row.expanded} />
            </button>
          ))}
        </nav>
      </aside>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onHiddenChange(false);
        }}
        title="Показать школы"
        style={{
          width: 18,
          height: 86,
          position: 'fixed',
          top: '50%',
          right: 0,
          transform: 'translateY(-50%)',
          zIndex: 79,
          border: '1px solid var(--border)',
          borderRight: 'none',
          borderRadius: '14px 0 0 14px',
          background: '#fff',
          color: '#626C8B',
          display: hidden ? 'inline-flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(23, 34, 47, 0.10)',
        }}
        aria-label="Показать школы"
      >
        <ChevronLeft size={14} />
      </button>
    </>
  );
}
