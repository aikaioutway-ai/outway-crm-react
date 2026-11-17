import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, ListTodo, MessageCircle, Users, LayoutGrid, School, Wallet, Route, UserCog, Car, ChevronLeft, ChevronRight, LogOut, SlidersHorizontal, Columns3 } from 'lucide-react';
import { UserRole } from '../../types';
import B2BIcon from '../icons/B2BIcon';
import './Sidebar.css';
import { MESSAGES_ENABLED } from '../../services/messageService';

export type NavSection = 'families' | 'employees' | 'cashier' | 'logistics' | 'drivers' | 'b2b' | 'settings' | 'tasks' | 'messages' | 'schools2' | 'summary' | 'spending' | 'manager2' | 'logistics2' | 'cashier2';

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
  { key: 'logistics', label: 'Логистика', icon: <Route size={18} /> },
  { key: 'cashier',   label: 'Кассир',     icon: <Wallet size={18} /> },
  { key: 'tasks', label: 'Задачи', icon: <ListTodo size={18} /> },
  { key: 'messages', label: 'Сообщения', icon: <MessageCircle size={18} /> },
  { key: 'employees',  label: 'Сотрудники', icon: <UserCog size={18} /> },
  { key: 'b2b',        label: 'B2B',       icon: <B2BIcon size={19} /> },
  { key: 'manager2', label: 'Менеджер 2.0', icon: <LayoutGrid size={18} /> },
  { key: 'logistics2', label: 'Логистика 2.0', icon: <Route size={18} /> },
  { key: 'cashier2', label: 'Кассир 2.0', icon: <Wallet size={18} /> },
];

// Переключатель «2.0»: эти пункты меню открывают свои версии 2.0 вместо обычных разделов.
const V2_COUNTERPART: Partial<Record<NavSection, NavSection>> = { families: 'manager2', logistics: 'logistics2', cashier: 'cashier2' };
const V2_SECTIONS = new Set(Object.values(V2_COUNTERPART));
// Сотрудник, не являющийся владельцем, раскрывает меню только после стольких кликов подряд.
const EXPAND_CLICKS_FOR_STAFF = 5;
const EXPAND_CLICK_STREAK_MS = 1500;

const v2StorageKey = (userId?: string) => `ow-sidebar-v2:${userId ?? 'anon'}`;
function readV2Enabled(userId?: string): boolean {
  try { return localStorage.getItem(v2StorageKey(userId)) === '1'; } catch { return false; }
}
function writeV2Enabled(userId: string | undefined, value: boolean) {
  try { localStorage.setItem(v2StorageKey(userId), value ? '1' : '0'); } catch { /* удобство, без хранилища просто не запоминается */ }
}

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
  sections = sections.flatMap(section => section === 'families' ? ['families', 'manager2', 'schools2'] : section === 'logistics' ? ['logistics', 'logistics2'] : section === 'cashier' ? ['cashier', 'cashier2'] : [section]);
  // «Сообщения» — у всех сотрудников: уведомления и переписка «Все» / отдел (пока чат скрыт — ни у кого).
  const messages: NavSection[] = MESSAGES_ENABLED ? ['messages'] : [];
  return canAccessSummary(role, userId) ? [...sections, 'summary', 'tasks', ...messages] : [...sections, 'tasks', ...messages];
}

// Владелец компании (учётная запись администратора).
export const OWNER_EMPLOYEE_ID = 'emp-admin';

// «Сводка» доступна всем ролям, кроме кассира.
export function canAccessSummary(role: UserRole, _userId?: string): boolean {
  return role !== 'cashier';
}

// «Расходы» в кассире заменили раздел «Финансы» и открыты тем же ролям, что были у «Финансов».
export function canAccessSpending(role: UserRole | undefined, userId?: string): boolean {
  return userId === OWNER_EMPLOYEE_ID || role === 'admin' || role === 'gen_director' || role === 'cashier';
}

function sectionForVersion(section: NavSection, allowed: NavSection[], v2Enabled: boolean): NavSection {
  const counterpart = V2_COUNTERPART[section];
  return v2Enabled && counterpart && allowed.includes(counterpart) ? counterpart : section;
}

export function getInitialSection(role: UserRole, userId?: string): NavSection {
  const allowed = getAllowedSections(role, userId);
  return sectionForVersion(allowed[0], allowed, readV2Enabled(userId));
}

export function canAccessSection(role: UserRole, section: NavSection, userId?: string): boolean {
  return getAllowedSections(role, userId).includes(section);
}

export default function Sidebar({ active, onChange, badges = {}, userRole, userId, onLogout, collapseSignal = 0, onFiltersClick, onColumnsClick, filtersActive, columnsActive }: SidebarProps) {
  const [collapsedBySection, setCollapsedBySection] = useState<Partial<Record<NavSection, boolean>>>({});
  const sidebarSection = NAV.find(item => V2_COUNTERPART[item.key] === active)?.key ?? active;
  const collapsed = collapsedBySection[sidebarSection] ?? true;
  const setCollapsed = (next: boolean) => {
    setCollapsedBySection(prev => ({ ...prev, [sidebarSection]: next }));
  };

  useEffect(() => {
    if (collapseSignal > 0) {
      setCollapsedBySection(prev => ({ ...prev, [sidebarSection]: true }));
    }
  }, [sidebarSection, collapseSignal]);
  const isOwner = userId === OWNER_EMPLOYEE_ID;
  const expandClicks = useRef<{ count: number; at: number }>({ count: 0, at: 0 });
  const handleToggleClick = () => {
    if (!collapsed || isOwner) { setCollapsed(!collapsed); return; }
    const now = Date.now();
    const count = now - expandClicks.current.at <= EXPAND_CLICK_STREAK_MS ? expandClicks.current.count + 1 : 1;
    expandClicks.current = { count: count >= EXPAND_CLICKS_FOR_STAFF ? 0 : count, at: now };
    if (count >= EXPAND_CLICKS_FOR_STAFF) setCollapsed(false);
  };

  const allowed = getAllowedSections(userRole, userId);
  const v2Available = Object.values(V2_COUNTERPART).some(section => allowed.includes(section));
  const [v2Stored, setV2Stored] = useState(() => readV2Enabled(userId));
  useEffect(() => { setV2Stored(readV2Enabled(userId)); }, [userId]);
  const v2Enabled = v2Available && v2Stored;
  const toggleV2 = () => {
    const next = !v2Stored;
    setV2Stored(next);
    writeV2Enabled(userId, next);
    // Открытый сейчас раздел сразу переключается на свою версию.
    const pair = (Object.entries(V2_COUNTERPART) as [NavSection, NavSection][]).find(([base, v2]) => active === (next ? base : v2));
    if (pair) {
      const target = next ? pair[1] : pair[0];
      if (allowed.includes(target)) onChange(target);
    }
  };

  // Отдельные пункты «… 2.0» заменены переключателем.
  const navItems = NAV.filter(item => allowed.includes(item.key) && !V2_SECTIONS.has(item.key) && !(collapsed && item.expandedOnly));
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
          onClick={handleToggleClick}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="ow-sidebar-nav" aria-label="Разделы">
        {!collapsed && (
          <div className="ow-sidebar-caption-row">
            <div className="ow-sidebar-caption">Разделы</div>
            {v2Available && (
              <button type="button" role="switch" aria-checked={v2Enabled} className={`ow-v2-switch${v2Enabled ? ' is-on' : ''}`} onClick={toggleV2} title="Менеджер, Логистика и Кассир в версии 2.0">
                <span className="ow-v2-switch-label">2.0</span>
                <span className="ow-v2-switch-track"><span className="ow-v2-switch-thumb" /></span>
              </button>
            )}
          </div>
        )}
        {navItems.map(n => {
          const target = sectionForVersion(n.key, allowed, v2Enabled);
          const isActive = active === n.key || active === V2_COUNTERPART[n.key];
          const badge = n.key === 'tasks' || n.key === 'messages' ? badges[n.key] ?? 0 : 0;
          return (
            <button
              key={n.key}
              type="button"
              className={`ow-nav-item${isActive ? ' is-active' : ''}`}
              onClick={() => onChange(target)}
              title={n.label}
              aria-label={n.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="ow-nav-icon">{n.icon}</span>
              {!collapsed && <span className="ow-nav-label">{n.label}</span>}
              {badge > 0 && (
                <span className="ow-nav-badge is-alert" title={n.key === 'messages' ? 'Непрочитанные сообщения' : undefined}>{badge > 99 ? '99+' : badge}</span>
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
