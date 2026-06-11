import React from 'react';
import { FamilyStatus, PaymentStatus } from '../../types';

type AnyStatus = FamilyStatus | PaymentStatus;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  // Family
  'active':    { bg: '#E8F5E9', color: '#2E7D32' },
  'new':       { bg: '#E3F2FD', color: '#1565C0' },
  'inactive':  { bg: '#EEEEEE', color: '#616161' },
  'rejected':  { bg: '#FFEBEE', color: '#C62828' },
  // Payment
  'Оплачено':           { bg: '#E8F5E9', color: '#2E7D32' },
  'Не оплачено':        { bg: '#EEEEEE', color: '#616161' },
  'На проверке':        { bg: '#FFF8E1', color: '#F57C00' },
  'На проверке (чек)':  { bg: '#FFF3E0', color: '#E65100' },
  'Частично оплачено':  { bg: '#E3F2FD', color: '#1565C0' },
  'Просрочено':         { bg: '#FFEBEE', color: '#C62828' },
};

const STATUS_LABELS: Record<string, string> = {
  active:   'Активный',
  new:      'Новый',
  inactive: 'Неактивный',
  rejected: 'Отказ',
};

interface StatusBadgeProps {
  status: AnyStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const style = STATUS_COLORS[status] ?? { bg: '#EEEEEE', color: '#616161' };
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span style={{
      display: 'inline-block',
      background: style.bg,
      color: style.color,
      borderRadius: 20,
      padding: size === 'sm' ? '2px 8px' : '3px 10px',
      fontSize: size === 'sm' ? 11 : 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
