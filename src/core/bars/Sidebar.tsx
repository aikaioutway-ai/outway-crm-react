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
      width: 200, minHeight: '100vh', background: '#fff',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', padding: '16px 0'
    }}>
      {/* Logo */}
      <div style={{ padding: '0 16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>OutWay</div>
        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>CRM</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV.map(n => (
          <button
            key={n.key}
            onClick={() => onChange(n.key)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 'var(--radius)', border: 'none',
              background: active === n.key ? 'var(--accent)' : 'transparent',
              color: active === n.key ? '#fff' : 'var(--text)',
              fontWeight: active === n.key ? 600 : 400,
              fontSize: 14, marginBottom: 2, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>

      {/* Version */}
      <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-2)' }}>
        v1.0 · 2026
      </div>
    </aside>
  );
}
