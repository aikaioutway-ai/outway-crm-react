import React, { useEffect, useState } from 'react';
import { Users, Wallet, Map, Car, DollarSign, Settings, Receipt, UserCog, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { UserRole } from '../../types';

export type NavSection = 'families' | 'employees' | 'cashier' | 'logistics' | 'drivers' | 'payroll' | 'expenses' | 'settings' | 'bank_statement';

interface SidebarProps {
  active: NavSection;
  onChange: (s: NavSection) => void;
  badges?: Partial<Record<NavSection, number>>;
  userRole: UserRole;
  onLogout?: () => void;
  collapseSignal?: number;
}

const NAV: { key: NavSection; label: string; icon: React.ReactNode }[] = [
  { key: 'families',  label: 'Менеджер',   icon: <Users size={18} /> },
  { key: 'cashier',   label: 'Кассир',     icon: <Wallet size={18} /> },
  { key: 'logistics', label: 'Логистика',  icon: <Map size={18} /> },
  { key: 'drivers',   label: 'Водители',   icon: <Car size={18} /> },
  { key: 'payroll',   label: 'Зарплата',   icon: <DollarSign size={18} /> },
  { key: 'expenses',  label: 'Расходы',    icon: <Receipt size={18} /> },
  { key: 'employees', label: 'Сотрудники', icon: <UserCog size={18} /> },
  { key: 'bank_statement', label: 'Выписка', icon: <Receipt size={18} /> },
  { key: 'settings',  label: 'Настройки',  icon: <Settings size={18} /> },
];

export function getAllowedSections(role: UserRole): NavSection[] {
  if (role === 'admin')        return ['families', 'employees', 'cashier', 'logistics', 'drivers', 'payroll', 'expenses', 'bank_statement', 'settings'];
  if (role === 'gen_director') return ['families', 'employees', 'cashier', 'logistics', 'drivers', 'payroll', 'expenses', 'bank_statement'];
  if (role === 'director')     return ['families', 'cashier', 'logistics', 'drivers', 'bank_statement'];
  if (role === 'manager')      return ['families'];
  if (role === 'logist')       return ['logistics', 'drivers'];
  if (role === 'cashier')      return ['cashier', 'payroll', 'expenses', 'bank_statement'];
  return ['families'];
}

export function canAccessSection(role: UserRole, section: NavSection): boolean {
  return getAllowedSections(role).includes(section);
}

export default function Sidebar({ active, onChange, badges = {}, userRole, onLogout, collapseSignal = 0 }: SidebarProps) {
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
  const w = collapsed ? 72 : 224;
  const navItems = NAV.filter(item => canAccessSection(userRole, item.key));

  return (
    <aside style={{
      width: w,
      minHeight: '100vh',
      background: '#FFFFFF',
      borderRight: 'none',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
      margin: 10,
      marginRight: 0,
      borderRadius: 22,
      boxShadow: 'none',
    }}>

      {/* Logo + Toggle в одной строке */}
      <div style={{
        padding: collapsed ? '16px 0' : '18px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
        minHeight: 56,
      }}>
        {!collapsed ? (
          <>
            <OutWayLogo />
            {/* 005 — кнопка сворачивания вверху */}
            <button
              onClick={() => setCollapsed(true)}
              title="Свернуть"
              style={{
                background: '#F5FAFB',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--text-2)',
                cursor: 'pointer',
                padding: '5px 7px',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s',
              }}
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={() => setCollapsed(false)}
            title="Развернуть"
            style={{
              background: '#F5FAFB',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--text-2)',
              cursor: 'pointer',
              padding: '5px 7px',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s',
            }}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 0 14px 12px' }}>
        {navItems.map(n => {
          const isActive = active === n.key;
          const badge = badges[n.key] ?? 0;
          return (
            <button
              key={n.key}
              onClick={() => onChange(n.key)}
              title={collapsed ? n.label : undefined}
              style={{
                width: isActive && collapsed ? 'calc(100% + 12px)' : '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                padding: collapsed ? '11px 0' : '11px 14px',
                borderRadius: isActive ? '18px 0 0 18px' : 16,
                border: '1px solid transparent',
                background: isActive ? 'var(--active-bg)' : 'transparent',
                color: isActive ? '#17222F' : 'var(--text-2)',
                fontWeight: isActive ? 800 : 600,
                fontSize: 13,
                marginBottom: 6,
                marginRight: isActive ? 0 : 12,
                position: 'relative',
                zIndex: isActive ? 2 : 1,
                cursor: 'pointer',
                transition: 'all 0.15s',
                borderLeft: '1px solid transparent',
                boxShadow: isActive ? 'inset 4px 0 0 #31A4A5' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span style={{ flexShrink: 0 }}>{n.icon}</span>
              {!collapsed && <span>{n.label}</span>}
              {badge > 0 && (
                <span style={{
                  marginLeft: collapsed ? 0 : 'auto',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 999,
                  background: '#31A4A5',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 800,
                  lineHeight: 1,
                }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{
        padding: collapsed ? '10px 8px' : '10px 12px',
        borderTop: '1px solid var(--border)',
      }}>
        <button
          onClick={onLogout}
          title={collapsed ? 'Выйти' : undefined}
          style={{
            width: '100%',
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            padding: collapsed ? 0 : '0 10px',
            borderRadius: 14,
            border: '1px solid transparent',
            background: 'transparent',
            color: 'var(--text-2)',
            fontSize: 13,
            fontWeight: 750,
            cursor: 'pointer',
          }}
        >
          <LogOut size={17} />
          {!collapsed && <span>Выйти</span>}
        </button>
        {!collapsed && (
          <div style={{
            padding: '8px 8px 0',
            fontSize: 11,
            color: 'var(--text-2)',
          }}>
            OutWay CRM · 2026
          </div>
        )}
      </div>
    </aside>
  );
}

export function OutWayLogo({ width = 92, height = 24 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 292 68" role="img" aria-label="OutWay" style={{ display: 'block', flexShrink: 0 }}>
      <text x="0" y="53" fontFamily="Arial Black, Arial, sans-serif" fontSize="50" fontWeight="900" fill="#17222F" letterSpacing="5">OUTW</text>
      <g transform="translate(180 8)">
        <path d="M16 0h22l17 52H0L16 0Z" fill="#31A4A5" />
        <path d="M22 0h4v52h-4V0Z" fill="#FFFFFF" opacity="0.95" />
        <path d="M30 0h4v52h-4V0Z" fill="#FFFFFF" opacity="0.95" />
        <path d="M26 11h4v9h-4v-9ZM26 28h4v10h-4V28Z" fill="#31A4A5" />
      </g>
      <text x="236" y="53" fontFamily="Arial Black, Arial, sans-serif" fontSize="50" fontWeight="900" fill="#17222F" letterSpacing="5">Y</text>
    </svg>
  );
}
