import React from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import './DashboardUI.css';

export function DashboardTopPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`dashboard-top-panel ${className}`.trim()}>{children}</section>;
}

export function DashboardGrid({ children, template }: { children: React.ReactNode; template: string }) {
  return <div className="dashboard-overview-grid" style={{ gridTemplateColumns: template }}>{children}</div>;
}

export function DashboardSearch({ value, onChange, placeholder = 'Поиск: имя, телефон, ребёнок, адрес', width = 340 }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <label className="dashboard-search" style={{ width }}>
      <Search size={16} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Очистить поиск">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function SchoolAvatar({ logo, label, color, size = 26, radius = 7, fontSize = 11 }: {
  logo?: string;
  label: string;
  color: string;
  size?: number;
  radius?: number;
  fontSize?: number;
}) {
  if (logo) {
    return <img src={logo} alt={label} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: radius, background: color, color: '#fff', fontSize, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function KpiChip({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="dashboard-kpi dock-hover-card">
      <div className="dashboard-kpi-icon" style={{ background: color }}>{icon}</div>
      <div className="dashboard-kpi-copy">
        <div className="dashboard-kpi-value">{value}</div>
        <div className="dashboard-kpi-label" title={label}>{label}</div>
      </div>
    </div>
  );
}

export function OverviewColumn<T extends string>({ sortKey, label, icon, value, color, sortState, onSort, children, first = false }: {
  sortKey: T;
  label: string;
  icon: React.ReactNode;
  value: string;
  color: string;
  sortState: { key: T; dir: 'asc' | 'desc' };
  onSort: (key: T) => void;
  children: React.ReactNode;
  first?: boolean;
}) {
  const active = sortState.key === sortKey;
  return (
    <div className={`dashboard-column${first ? ' first' : ''}`}>
      <button
        className={`dashboard-column-head${active ? ' active' : ''}`}
        onClick={() => onSort(sortKey)}
        style={{ borderBottomColor: active ? color : undefined }}
      >
        <div className="dashboard-column-icon" style={{ background: color }}>{icon}</div>
        <div className="dashboard-column-copy">
          <div className="dashboard-column-value">
            {value}
            {active && (sortState.dir === 'asc' ? <ChevronUp size={13} color={color} /> : <ChevronDown size={13} color={color} />)}
          </div>
          <div className="dashboard-column-label" title={label}>{label}</div>
        </div>
      </button>
      <div className="dashboard-column-body">{children}</div>
    </div>
  );
}
