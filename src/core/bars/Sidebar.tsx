import React, { useEffect, useState } from 'react';
import { BarChart3, ListTodo, Users, School, Wallet, Route, UserCog, Car, ChevronLeft, ChevronRight, LogOut, SlidersHorizontal, Columns3 } from 'lucide-react';
import { UserRole } from '../../types';
import B2BIcon from '../icons/B2BIcon';
import './Sidebar.css';

export type NavSection = 'families' | 'employees' | 'cashier' | 'logistics' | 'drivers' | 'b2b' | 'settings' | 'tasks' | 'schools2' | 'summary' | 'spending';

interface SidebarProps {
  active: NavSection;
  onChange: (s: NavSection) => void;
  badges?: Partial<Record<NavSection, number>>;
  userRole: UserRole;
  userId?: string;
  onLogout?: () => void;
  collapseSignal?: number;
  onFiltersClick?: () => void;
  onColumnsClick?: () => void;
  filtersActive?: boolean;
  columnsActive?: boolean;
}

// expandedOnly — пункт виден только в раскрытом меню.
const NAV: { key: NavSection; label: string; icon: React.ReactNode; expandedOnly?: boolean }[] = [
  { key: 'summary',   label: 'Сводка',     icon: <BarChart3 size={18} /> },
  { key: 'families',  label: 'Менеджер',   icon: <Users size={18} /> },
  { key: 'schools2',  label: 'Школы 2.0',  icon: <School size={18} />, expandedOnly: true },
  { key: 'logistics', label: 'Логистика',  icon: <Route size={18} /> },
  { key: 'cashier',   label: 'Кассир',     icon: <Wallet size={18} /> },
  { key: 'tasks', label: 'Задачи', icon: <ListTodo size={18} /> },
  { key: 'employees',  label: 'Сотрудники', icon: <UserCog size={18} /> },
  { key: 'b2b',        label: 'B2B',       icon: <B2BIcon size={19} /> },
];

export function getAllowedSections(role: UserRole, userId?: string): NavSection[] {
  let sections: NavSection[];
  if (role === 'admin')             sections = ['families', 'employees', 'cashier', 'logistics', 'drivers', 'b2b'];
  else if (role === 'gen_director') sections = ['families', 'employees', 'cashier', 'logistics', 'drivers', 'b2b'];
  else if (role === 'director')     sections = ['families', 'employees', 'cashier', 'logistics', 'drivers'];
  else if (role === 'manager')      sections = ['families'];
  else if (role === 'logist')       sections = ['logistics', 'drivers'];
  else if (role === 'senior_logist') sections = ['logistics', 'drivers', 'employees', 'b2b'];
  else if (role === 'b2b_manager' || role === 'b2b_logist') sections = ['b2b'];
  else if (role === 'cashier')       sections = ['cashier', 'families', 'b2b'];
  else sections = ['families'];
  if (canAccessSpending(role, userId)) sections = [...sections, 'spending'];

  // «Школы 2.0» — тот же модуль «Менеджер» для школ без постоянного контракта, доступ как к «Менеджеру».
  sections = sections.flatMap(section => section === 'families' ? ['families', 'schools2'] : [section]);
  return canAccessSummary(role, userId) ? [...sections, 'summary', 'tasks'] : [...sections, 'tasks'];
}

// Владелец компании (учётная запись администратора).
export const OWNER_EMPLOYEE_ID = 'emp-admin';

// «Сводка» — итоги компании только для владельца и гендиректора.
export function canAccessSummary(role: UserRole, userId?: string): boolean {
  return userId === OWNER_EMPLOYEE_ID || role === 'gen_director';
}

// «Расходы» в кассире заменили раздел «Финансы» и открыты тем же ролям, что были у «Финансов».
export function canAccessSpending(role: UserRole | undefined, userId?: string): boolean {
  return userId === OWNER_EMPLOYEE_ID || role === 'admin' || role === 'gen_director' || role === 'cashier';
}

export function canAccessSection(role: UserRole, section: NavSection, userId?: string): boolean {
  return getAllowedSections(role, userId).includes(section);
}

export default function Sidebar({ active, onChange, badges = {}, userRole, userId, onLogout, collapseSignal = 0, onFiltersClick, onColumnsClick, filtersActive, columnsActive }: SidebarProps) {
  const [collapsedBySection, setCollapsedBySection] = useState<Partial<Record<NavSection, boolean>>>({});
  const collapsed = collapsedBySection[active] ?? true;
  const setCollapsed = (next: boolean) => {
    setCollapsedBySection(prev => ({ ...prev, [active]: next }));
  };

  useEffect(() => {
    if (collapseSignal > 0) {
      setCollapsedBySection(prev => ({ ...prev, [active]: true }));
    }
  }, [active, collapseSignal]);
  const navItems = NAV.filter(item => canAccessSection(userRole, item.key, userId) && !(collapsed && item.expandedOnly));
  const tools = [
    { label: 'Фильтры', icon: <SlidersHorizontal size={17} />, onClick: onFiltersClick, active: filtersActive },
    { label: 'Колонки', icon: <Columns3 size={17} />, onClick: onColumnsClick, active: columnsActive },
  ].filter(item => item.onClick);

  return (
    <aside className={`ow-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="ow-sidebar-head">
        {!collapsed && <OutWayLogo />}
        <button
          type="button"
          className="ow-sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="ow-sidebar-nav" aria-label="Разделы">
        {!collapsed && <div className="ow-sidebar-caption">Разделы</div>}
        {navItems.map(n => {
          const isActive = active === n.key;
          const badge = n.key === 'logistics' ? 0 : (badges[n.key] ?? 0);
          return (
            <button
              key={n.key}
              type="button"
              className={`ow-nav-item${isActive ? ' is-active' : ''}`}
              onClick={() => onChange(n.key)}
              title={n.label}
              aria-label={n.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="ow-nav-icon">{n.icon}</span>
              {!collapsed && <span className="ow-nav-label">{n.label}</span>}
              {badge > 0 && (
                <span className={`ow-nav-badge${n.key === 'tasks' ? ' is-alert' : ''}`}>{badge > 99 ? '99+' : badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {tools.length > 0 && (
        <div className="ow-sidebar-section">
          {tools.map(item => (
            <button
              key={item.label}
              type="button"
              className={`ow-nav-item${item.active ? ' is-toggled' : ''}`}
              onClick={item.onClick}
              title={item.label}
              aria-pressed={!!item.active}
            >
              <span className="ow-nav-icon">{item.icon}</span>
              {!collapsed && <span className="ow-nav-label">{item.label}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="ow-sidebar-section">
        <button type="button" className="ow-nav-item" onClick={onLogout} title="Выйти">
          <span className="ow-nav-icon"><LogOut size={17} /></span>
          {!collapsed && <span className="ow-nav-label">Выйти</span>}
        </button>
      </div>
    </aside>
  );
}

export function OutWayLogo({ width = 92, height = 24 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 292 68" role="img" aria-label="OutWay" style={{ display: 'block', flexShrink: 0 }}>
      <text x="0" y="53" fontFamily="Arial Black, Arial, sans-serif" fontSize="50" fontWeight="900" fill="#17222F" letterSpacing="5">OUTW</text>
      <g transform="translate(180 8)">
        <path d="M16 0h22l17 52H0L16 0Z" fill="#1A7F80" />
        <path d="M22 0h4v52h-4V0Z" fill="#FFFFFF" opacity="0.95" />
        <path d="M30 0h4v52h-4V0Z" fill="#FFFFFF" opacity="0.95" />
        <path d="M26 11h4v9h-4v-9ZM26 28h4v10h-4V28Z" fill="#1A7F80" />
      </g>
      <text x="236" y="53" fontFamily="Arial Black, Arial, sans-serif" fontSize="50" fontWeight="900" fill="#17222F" letterSpacing="5">Y</text>
    </svg>
  );
}
