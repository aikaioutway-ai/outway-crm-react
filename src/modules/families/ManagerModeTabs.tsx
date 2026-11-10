import React from 'react';
import { User, DollarSign, UserPlus, Calculator } from 'lucide-react';
import type { UserRole } from '../../types';

export function canAccessManagerAccruals(role: UserRole, userId?: string): boolean {
  return userId === 'emp-admin' || role === 'gen_director' || role === 'director';
}

export type ManagerMode = 'directory' | 'charges' | 'accruals' | 'requests';
interface Props { compact?: boolean; showRequests?: boolean; canViewAccruals?: boolean; value: ManagerMode; onChange: (mode: ManagerMode) => void; }

export default function ManagerModeTabs({ value, onChange, canViewAccruals = false, showRequests = false }: Props) {
  return (
    <div role="tablist" aria-label="Раздел менеджера" className="ow-seg">
      {([['directory', 'Справочник', User], ['charges', 'Оплаты', DollarSign], ['requests', 'Новые заявки', UserPlus], ['accruals', 'Начисления', Calculator]] as const).filter(([mode]) => (mode !== 'accruals' || canViewAccruals) && (mode !== 'requests' || showRequests)).map(([mode, label, Icon]) => (
        <button key={mode} type="button" role="tab" className="ow-seg-btn" aria-label={label} title={label} aria-selected={value === mode} onClick={() => onChange(mode)} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Icon size={18} aria-hidden="true" /></button>
      ))}
    </div>
  );
}
