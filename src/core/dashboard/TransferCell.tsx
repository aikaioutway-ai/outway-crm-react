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
  const bandColor = !active
    ? 'transparent'
    : alert
      ? (value > 0 ? ALERT_COLOR : `${color}33`)
      : color;
  return (
    <button
      className="dock-hover-card dock-hover-card--compact"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        minHeight: 44,
        padding: 0,
        overflow: 'hidden',
        borderRadius: 12,
        background: selected
          ? color
          : active
            ? '#fff'
            : 'repeating-linear-gradient(-45deg, #F5FAFB 0, #F5FAFB 6px, #E7EFF2 6px, #E7EFF2 8px)',
        border: `1px solid ${selected || active ? color : '#E1E8EA'}`,
        boxShadow: selected ? `0 0 10px ${color}99` : 'none',
        cursor: 'pointer',
      }}
    >
      <span style={{
        flex: '0 0 17px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bandColor,
        borderBottom: selected ? '1px solid rgba(255,255,255,.55)' : 'none',
        color: '#fff',
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        {active && value > 0 ? value : ''}
      </span>
      <span style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 900,
        lineHeight: 1,
        color: selected ? '#fff' : active ? color : '#AEB8C2',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
    </button>
  );
}
