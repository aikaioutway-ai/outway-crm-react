import React, { useState } from 'react';
import { Users, Wallet, Map, Car, DollarSign, Settings, Receipt, UserCog, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { UserRole } from '../../types';

export type NavSection = 'families' | 'employees' | 'cashier' | 'logistics' | 'drivers' | 'payroll' | 'expenses' | 'settings';

interface SidebarProps {
  active: NavSection;
  onChange: (s: NavSection) => void;
  badges?: Partial<Record<NavSection, number>>;
  userRole: UserRole;
  onLogout?: () => void;
}

const NAV: { key: NavSection; label: string; icon: React.ReactNode }[] = [
  { key: 'families',  label: 'Менеджер',   icon: <Users size={18} /> },
  { key: 'cashier',   label: 'Кассир',     icon: <Wallet size={18} /> },
  { key: 'logistics', label: 'Логистика',  icon: <Map size={18} /> },
  { key: 'drivers',   label: 'Водители',   icon: <Car size={18} /> },
  { key: 'payroll',   label: 'Зарплата',   icon: <DollarSign size={18} /> },
  { key: 'expenses',  label: 'Расходы',    icon: <Receipt size={18} /> },
  { key: 'employees', label: 'Сотрудники', icon: <UserCog size={18} /> },
  { key: 'settings',  label: 'Настройки',  icon: <Settings size={18} /> },
];

export function getAllowedSections(role: UserRole): NavSection[] {
  if (role === 'admin') return ['families', 'employees', 'cashier', 'logistics', 'drivers', 'payroll', 'expenses', 'settings'];
  if (role === 'director') return ['families', 'employees', 'cashier', 'logistics', 'drivers', 'settings'];
  if (role === 'manager') return ['families'];
  if (role === 'logist') return ['logistics', 'drivers'];
  if (role === 'cashier') return ['cashier'];
  return ['families'];
}

export function canAccessSection(role: UserRole, section: NavSection): boolean {
  return getAllowedSections(role).includes(section);
}

export default function Sidebar({ active, onChange, badges = {}, userRole, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const w = collapsed ? 60 : 210;
  const navItems = NAV.filter(item => canAccessSection(userRole, item.key));

  return (
    <aside style={{
      width: w,
      minHeight: '100vh',
      background: '#FFFFFF',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
    }}>

      {/* Logo + Toggle в одной строке */}
      <div style={{
        padding: collapsed ? '14px 0' : '16px 12px',
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
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
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
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
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
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {navItems.map(n => {
          const isActive = active === n.key;
          const badge = badges[n.key] ?? 0;
          return (
            <button
              key={n.key}
              onClick={() => onChange(n.key)}
              title={collapsed ? n.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                padding: collapsed ? '10px 0' : '10px 12px',
                borderRadius: 12,
                border: `1px solid ${isActive ? '#DDE7EB' : 'transparent'}`,
                background: isActive ? '#F0F5F7' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-2)',
                fontWeight: isActive ? 800 : 600,
                fontSize: 13,
                marginBottom: 4,
                cursor: 'pointer',
                transition: 'all 0.15s',
                borderLeft: collapsed ? '1px solid transparent' : `3px solid ${isActive ? '#080B0B' : 'transparent'}`,
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
                  background: '#080B0B',
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
            borderRadius: 10,
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
            OutWay · 2026
          </div>
        )}
      </div>
    </aside>
  );
}

export function OutWayLogo({ width = 92, height = 24 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 292 68" role="img" aria-label="OutWay" style={{ display: 'block', flexShrink: 0 }}>
      <text x="0" y="53" fontFamily="Arial Black, Arial, sans-serif" fontSize="50" fontWeight="900" fill="#050505" letterSpacing="5">OUTW</text>
      <g transform="translate(180 8)">
        <path d="M16 0h22l17 52H0L16 0Z" fill="#FF5A2E" />
        <path d="M22 0h4v52h-4V0Z" fill="#FFFFFF" opacity="0.95" />
        <path d="M30 0h4v52h-4V0Z" fill="#FFFFFF" opacity="0.95" />
        <path d="M26 11h4v9h-4v-9ZM26 28h4v10h-4V28Z" fill="#FF5A2E" />
      </g>
      <text x="236" y="53" fontFamily="Arial Black, Arial, sans-serif" fontSize="50" fontWeight="900" fill="#050505" letterSpacing="5">Y</text>
    </svg>
  );
}
