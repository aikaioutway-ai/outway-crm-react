import React from 'react';
import { ChevronRight } from 'lucide-react';
import { FamilyListRow } from '../services/crmV2Service';
import { SchoolAvatar } from '../core/dashboard/DashboardUI';
import { formatName, formatPhone } from '../utils/format';
import { money } from '../utils/pricing';
import { SchoolTab, schoolLabel } from './data';
import { Empty, StatusBadge, TransferBadge, useIncremental } from './ui';

export interface SchoolStat {
  label: string;
  value: React.ReactNode;
  color?: string;
  /** Со значком подпись не выводится — меньше текста в карточке. */
  icon?: React.ReactNode;
}

export function SchoolCard({ school, stats, onClick }: {
  school: SchoolTab;
  stats: SchoolStat[];
  onClick: () => void;
}) {
  return (
    <button type="button" className="m-card" onClick={onClick}>
      <div className="m-card-row">
        <SchoolAvatar logo={school.logo} label={school.label} color="#626C8B" size={40} radius={12} fontSize={13} />
        <div className="m-card-main">
          <div className="m-card-title">{school.label}</div>
          <div className="m-stats">
            {stats.map(stat => stat.icon ? (
              <div key={stat.label} className="m-stat m-stat--icon" title={stat.label} aria-label={`${stat.label}: ${stat.value}`} style={stat.color ? { color: stat.color } : undefined}>
                {stat.icon}<b>{stat.value}</b>
              </div>
            ) : (
              <div key={stat.label} className="m-stat">
                <b style={stat.color ? { color: stat.color } : undefined}>{stat.value}</b>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
        <ChevronRight className="m-card-chevron" size={20} />
      </div>
    </button>
  );
}

/** Карточка ребёнка в общем поиске: ФИО, ниже адрес и телефон — родителей не показываем. */
export function ChildCard({ row, onClick, showSchool = false, showDebt = false }: {
  row: FamilyListRow;
  onClick: () => void;
  showSchool?: boolean;
  showAddress?: boolean;
  showDebt?: boolean;
}) {
  const name = /[\p{L}]/u.test(row.childName) ? formatName(row.childName) : 'Без имени';
  return (
    <button type="button" className="m-card" onClick={onClick}>
      <div className="m-card-row" style={{ alignItems: 'flex-start' }}>
        <div className="m-card-main">
          <div className="m-card-title">{name}</div>
          <div className="m-card-sub">{row.streetAddress || 'адрес не указан'}</div>
          {row.phone && <div className="m-card-sub">{formatPhone(row.phone)}</div>}
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="m-card-meta">
        {showSchool && <span className="m-badge">{schoolLabel(row.branchFilter)}</span>}
        <TransferBadge number={row.transferNumber} vehicleType={row.vehicleType} />
        {row.stopNumber && <span className="m-badge">Ост. {row.stopNumber}</span>}
        {showDebt && row.childDebtAmount > 0 && (
          <span className="m-badge" style={{ background: '#FBEAE9', color: '#B3261E' }}>Долг семьи {money(row.childDebtAmount)}</span>
        )}
      </div>
    </button>
  );
}

export function ChildList({ rows, onOpen, emptyText, ...cardProps }: {
  rows: FamilyListRow[];
  onOpen: (row: FamilyListRow) => void;
  emptyText: string;
  showSchool?: boolean;
  showAddress?: boolean;
  showDebt?: boolean;
}) {
  const [visible, sentinelRef] = useIncremental(rows);
  if (!rows.length) return <Empty>{emptyText}</Empty>;
  return (
    <div className="m-list">
      {visible.map(row => <ChildCard key={row.rowId} row={row} onClick={() => onOpen(row)} {...cardProps} />)}
      <div ref={sentinelRef} className="m-more" />
    </div>
  );
}
