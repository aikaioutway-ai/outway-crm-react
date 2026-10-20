import React from 'react';
import type { UserRole } from '../../types';

export function canAccessManagerAccruals(role: UserRole, userId?: string): boolean {
  return userId === 'emp-admin' || role === 'gen_director' || role === 'director';
}

export type ManagerMode = 'directory' | 'charges' | 'accruals';
interface Props { compact?: boolean; canViewAccruals?: boolean; value: ManagerMode; onChange: (mode: ManagerMode) => void; }

export default function ManagerModeTabs({ value, onChange, compact = false, canViewAccruals = false }: Props) {
  return (
    <div role="tablist" aria-label="Раздел менеджера" style={{ display: 'flex', alignItems: 'center', gap: 2, height: 34, padding: 3, marginBottom: compact ? 8 : 0, flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxSizing: 'border-box' }}>
      {([['directory', 'Справочник'], ['charges', 'Оплаты'], ['accruals', 'Начисления']] as const).filter(([mode]) => mode !== 'accruals' || canViewAccruals).map(([mode, label]) => (
        <button key={mode} type="button" role="tab" aria-selected={value === mode} onClick={() => onChange(mode)} style={{ height: 26, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: value === mode ? 'var(--accent)' : 'transparent', color: value === mode ? '#fff' : 'var(--text-2)', whiteSpace: 'nowrap' }}>{label}</button>
      ))}
    </div>
  );
}
