import React from 'react';

export const VEHICLE_COLOR: Record<string, string> = {
  microbus: '#2DD4BF',
  minivan: '#8B5CF6',
  sedan: '#F97316',
};

const DEFAULT_COLOR = '#2DD4BF';
const ALERT_COLOR = '#DC2626';

export function transferCellColor(cell: { color?: string; vehicleType?: string | null }): string {
  return cell.color || (cell.vehicleType && VEHICLE_COLOR[cell.vehicleType]) || DEFAULT_COLOR;
}

interface TransferCellProps {
  label: string;
  value?: number;
  alert?: boolean;
  color?: string;
  active: boolean;
  selected: boolean;
  title?: string;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

// Служебные ячейки ряда подписываем словами, а не символами.
const SPECIAL_LABEL: Record<string, string> = { '—': 'Без №', '×': 'Отказ', '≡': 'Все' };

export default function TransferCell({
  label,
  value = 0,
  alert = false,
  color = DEFAULT_COLOR,
  active,
  selected,
  title,
  onClick,
  onContextMenu,
}: TransferCellProps) {
  const special = SPECIAL_LABEL[label];
  const accent = alert && value > 0 ? ALERT_COLOR : color;
  const className = [
    'ow-transfer-cell',
    special ? 'is-special' : '',
    active ? 'is-active' : 'is-empty',
    selected ? 'is-selected' : '',
    alert && value > 0 ? 'is-alert' : '',
  ].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title ?? (special ? `${special}: ${value}` : `Трансфер №${label}`)}
      aria-pressed={selected}
      style={{ ['--cell-color' as string]: accent } as React.CSSProperties}
    >
      <span className="ow-transfer-cell-count">{active && value > 0 ? value : ''}</span>
      <span className="ow-transfer-cell-label">{special ?? label}</span>
    </button>
  );
}
