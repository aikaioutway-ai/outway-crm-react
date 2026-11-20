import React from 'react';
import { User, DollarSign, UserPlus, Calculator, ReceiptText } from 'lucide-react';
import type { UserRole } from '../../types';

export function canAccessManagerAccruals(role: UserRole, userId?: string): boolean {
  return userId === 'emp-admin' || role === 'gen_director' || role === 'director';
}

// Те же роли, что пропускает серверная функция incoming-receipts-api (RECEIPT_ROLES).
const RECEIPT_ROLES: UserRole[] = ['admin', 'gen_director', 'director', 'manager', 'cashier'];
export function canAccessManagerReceipts(role: UserRole): boolean {
  return RECEIPT_ROLES.includes(role);
}

// Удалить файл из «Чеков» навсегда может только руководство (то же правило на сервере).
export function canDeleteIncomingReceipts(role: UserRole): boolean {
  return role === 'admin' || role === 'gen_director' || role === 'director';
}

export type ManagerMode = 'directory' | 'charges' | 'accruals' | 'requests' | 'receipts';
interface Props { cards?: boolean; summaries?: Partial<Record<ManagerMode, { label: string; value: string; tone?: 'positive' | 'alert' | 'warning' }[]>>; compact?: boolean; showRequests?: boolean; canViewAccruals?: boolean; showReceipts?: boolean; value: ManagerMode; onChange: (mode: ManagerMode) => void; }

export default function ManagerModeTabs({ value, onChange, cards, summaries, canViewAccruals = false, showRequests = false, showReceipts = false }: Props) {
  const newRequestsCount = summaries?.requests?.[0]?.value;
  const showRequestsBadge = !!newRequestsCount && newRequestsCount !== '0' && newRequestsCount !== '—';
  return (
    <div role="tablist" aria-label="Раздел менеджера" className={cards ? 'manager-mode-cards' : 'ow-seg'}>
      {([['directory', 'Справочник', User], ['charges', 'Оплаты', DollarSign], ['requests', 'Новые заявки', UserPlus], ['accruals', 'Начисления', Calculator], ['receipts', 'Чеки', ReceiptText]] as const).filter(([mode]) => (mode !== 'accruals' || canViewAccruals) && (mode !== 'requests' || showRequests) && (mode !== 'receipts' || showReceipts)).map(([mode, label, Icon]) => (
        <button key={mode} type="button" role="tab" className={cards ? 'manager-mode-card' : 'ow-seg-btn'} aria-label={cards && mode === 'requests' && showRequestsBadge ? `${label}: ${newRequestsCount}` : label} title={label} aria-selected={value === mode} onClick={() => onChange(mode)} style={cards ? undefined : { minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Icon size={18} aria-hidden="true" />{cards && <span className="manager-mode-title">{label}</span>}{cards && !!summaries?.[mode]?.length && <span className="manager-mode-metrics">{summaries[mode]?.map(metric => (
          <span className="manager-mode-metric" key={metric.label}>
            <span>{metric.label}</span><strong data-tone={metric.value === '—' ? undefined : metric.tone}>{metric.value}</strong>
          </span>
        ))}</span>}{cards && mode === 'requests' && showRequestsBadge && (
          <span className="manager-mode-count" aria-hidden="true">{newRequestsCount}</span>
        )}</button>
      ))}
    </div>
  );
}
