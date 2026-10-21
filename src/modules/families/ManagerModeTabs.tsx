import React from 'react';
import type { UserRole } from '../../types';

export function canAccessManagerAccruals(role: UserRole, userId?: string): boolean {
  return userId === 'emp-admin' || role === 'gen_director' || role === 'director';
}

export type ManagerMode = 'directory' | 'charges' | 'accruals';
interface Props { compact?: boolean; canViewAccruals?: boolean; value: ManagerMode; onChange: (mode: ManagerMode) => void; }

export default function ManagerModeTabs({ value, onChange, canViewAccruals = false }: Props) {
  return (
    <div role="tablist" aria-label="Раздел менеджера" className="ow-seg">
      {([['directory', 'Справочник'], ['charges', 'Оплаты'], ['accruals', 'Начисления']] as const).filter(([mode]) => mode !== 'accruals' || canViewAccruals).map(([mode, label]) => (
        <button key={mode} type="button" role="tab" className="ow-seg-btn" aria-selected={value === mode} onClick={() => onChange(mode)}>{label}</button>
      ))}
    </div>
  );
}
