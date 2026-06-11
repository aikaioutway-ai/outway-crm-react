import React, { useState } from 'react';
import { Users, CreditCard, Map, Car, DollarSign, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

export type NavSection = 'families' | 'finance' | 'logistics' | 'drivers' | 'payroll' | 'settings';

interface SidebarProps {
  active: NavSection;
  onChange: (s: NavSection) => void;
}

const NAV: { key: NavSection; label: string; icon: React.ReactNode }[] = [
  { key: 'families',  label: 'Заявки',    icon: <Users size={18} /> },
  { key: 'finance',   label: 'Оплаты',    icon: <CreditCard size={18} /> },
  { key: 'logistics', label: 'Логистика', icon: <Map size={18} /> },
  { key: 'drivers',   label: 'Водители',  icon: <Car size={18} /> },
  { key: 'payroll',   label: 'Зарплата',  icon: <DollarSign size={18} /> },
  { key: 'settings',  label: 'Настройки', icon: <Settings size={18} /> },
];

export default function Sidebar({ active, onChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const w = collapsed ? 60 : 210;

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

      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 0 18px' : '20px 20px 18px',
        borderBottom: '1px solid rgba(199,210,254,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
      }}>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>OutWay</div>
            <div style={{ fontSize: 11, color: 'var(--accent-l)', marginTop: 2 }}>CRM · Школьный трансфер</div>
          </div>
        )}
        {collapsed && (
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>OW</div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 6px' }}>
        {NAV.map(n => {
          const isActive = active === n.key;
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
            </button>
          );
        })}
      </nav>

      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          margin: '8px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px',
          borderRadius: 'var(--radius)',
          border: 'none',
          background: 'rgba(199,210,254,0.12)',
          color: 'rgba(199,210,254,0.8)',
          cursor: 'pointer',
          fontSize: 12,
          transition: 'all 0.15s',
        }}
      >
        {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Свернуть</span></>}
      </button>

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
