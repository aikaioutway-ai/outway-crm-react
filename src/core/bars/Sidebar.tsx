import React, { useState } from 'react';
import { Users, CreditCard, Wallet, Map, Car, DollarSign, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { UserRole } from '../../types';

export type NavSection = 'families' | 'finance' | 'cashier' | 'logistics' | 'drivers' | 'payroll' | 'settings';

interface SidebarProps {
  active: NavSection;
  onChange: (s: NavSection) => void;
  badges?: Partial<Record<NavSection, number>>;
  userRole: UserRole;
}

const NAV: { key: NavSection; label: string; icon: React.ReactNode }[] = [
  { key: 'families',  label: 'Заявки',    icon: <Users size={18} /> },
  { key: 'finance',   label: 'Оплаты',    icon: <CreditCard size={18} /> },
  { key: 'cashier',   label: 'Кассир',    icon: <Wallet size={18} /> },
  { key: 'logistics', label: 'Логистика', icon: <Map size={18} /> },
  { key: 'drivers',   label: 'Водители',  icon: <Car size={18} /> },
  { key: 'payroll',   label: 'Зарплата',  icon: <DollarSign size={18} /> },
  { key: 'settings',  label: 'Настройки', icon: <Settings size={18} /> },
];

export function getAllowedSections(role: UserRole): NavSection[] {
  if (role === 'admin') return ['families', 'finance', 'cashier', 'logistics', 'drivers', 'payroll', 'settings'];
  if (role === 'director') return ['families', 'finance', 'cashier', 'logistics', 'drivers', 'settings'];
  if (role === 'manager') return ['families', 'finance'];
  if (role === 'logist') return ['logistics', 'drivers'];
  if (role === 'cashier') return ['cashier'];
  return ['families'];
}

export function canAccessSection(role: UserRole, section: NavSection): boolean {
  return getAllowedSections(role).includes(section);
}

export default function Sidebar({ active, onChange, badges = {}, userRole }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const w = collapsed ? 60 : 210;
  const navItems = NAV.filter(item => canAccessSection(userRole, item.key));

  return (
    <aside style={{
      width: w,
      minHeight: '100vh',
      background: 'var(--accent)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
    }}>

      {/* Logo + Toggle в одной строке */}
      <div style={{
        padding: collapsed ? '14px 0' : '14px 20px',
        borderBottom: '1px solid rgba(199,210,254,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
        minHeight: 56,
      }}>
        {!collapsed ? (
          <>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>OutWay</div>
              <div style={{ fontSize: 10, color: 'var(--accent-l)', marginTop: 1 }}>CRM · Школьный трансфер</div>
            </div>
            {/* 005 — кнопка сворачивания вверху */}
            <button
              onClick={() => setCollapsed(true)}
              title="Свернуть"
              style={{
                background: 'rgba(199,210,254,0.12)',
                border: 'none',
                borderRadius: 6,
                color: 'rgba(199,210,254,0.8)',
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
              background: 'rgba(199,210,254,0.12)',
              border: 'none',
              borderRadius: 6,
              color: 'rgba(199,210,254,0.8)',
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
      <nav style={{ flex: 1, padding: '12px 6px' }}>
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
                padding: collapsed ? '10px 0' : '9px 12px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: isActive ? 'rgba(199,210,254,0.18)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(199,210,254,0.75)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                marginBottom: 2,
                cursor: 'pointer',
                transition: 'all 0.15s',
                borderLeft: collapsed ? 'none' : (isActive ? '3px solid #C7D2FE' : '3px solid transparent'),
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
                  borderRadius: 9,
                  background: '#EF4444',
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
      {!collapsed && (
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(199,210,254,0.2)',
          fontSize: 11,
          color: 'rgba(199,210,254,0.5)',
        }}>
          OutWay · АйКай Груп · 2026
        </div>
      )}
    </aside>
  );
}
