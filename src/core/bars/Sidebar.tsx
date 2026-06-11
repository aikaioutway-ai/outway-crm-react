import React from 'react';
import { Users, CreditCard, Map, Car, DollarSign, Settings } from 'lucide-react';

export type NavSection = 'families' | 'finance' | 'logistics' | 'drivers' | 'payroll' | 'settings';

interface SidebarProps {
  active: NavSection;
  onChange: (s: NavSection) => void;
}

const NAV: { key: NavSection; label: string; icon: React.ReactNode }[] = [
  { key: 'families',  label: 'Заявки',     icon: <Users size={18} /> },
  { key: 'finance',   label: 'Оплаты',     icon: <CreditCard size={18} /> },
  { key: 'logistics', label: 'Логистика',  icon: <Map size={18} /> },
  { key: 'drivers',   label: 'Водители',   icon: <Car size={18} /> },
  { key: 'payroll',   label: 'Зарплата',   icon: <DollarSign size={18} /> },
  { key: 'settings',  label: 'Настройки',  icon: <Settings size={18} /> },
];

export default function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside style={{
      width: 210, minHeight: '100vh',
      background: 'var(--accent)',
      display: 'flex', flexDirection: 'column',
      padding: '0',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 20px 18px',
        borderBottom: '1px solid rgba(199,210,254,0.2)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>OutWay</div>
        <div style={{ fontSize: 11, color: 'var(--accent-l)', marginTop: 2 }}>CRM · Школьный трансфер</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV.map(n => {
          const isActive = active === n.key;
          return (
            <button
              key={n.key}
              onClick={() => onChange(n.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 'var(--radius)', border: 'none',
                background: isActive ? 'rgba(199,210,254,0.18)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(199,210,254,0.75)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14, marginBottom: 2, cursor: 'pointer',
                transition: 'all 0.15s',
                borderLeft: isActive ? '3px solid #C7D2FE' : '3px solid transparent',
              }}
            >
              {n.icon}
              {n.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{
        padding: '14px 20px',
        borderTop: '1px solid rgba(199,210,254,0.2)',
        fontSize: 11, color: 'rgba(199,210,254,0.5)',
      }}>
        OutWay · АйКай Груп · 2026
      </div>
    </aside>
  );
}
