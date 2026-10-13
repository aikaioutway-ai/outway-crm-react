import React from 'react';
import { ChevronRight } from 'lucide-react';
import { FamilyListRow } from '../services/crmV2Service';
import { SchoolAvatar } from '../core/dashboard/DashboardUI';
import { formatName, formatPhone } from '../utils/format';
import { money } from '../utils/pricing';
import { SchoolTab, schoolLabel } from './data';
import { Empty, StatusBadge, TransferBadge, useIncremental } from './ui';

export function SchoolCard({ school, stats, onClick }: {
  school: SchoolTab;
  stats: { label: string; value: React.ReactNode; color?: string }[];
  onClick: () => void;
}) {
  return (
    <button type="button" className="m-card" onClick={onClick}>
      <div className="m-card-row">
        <SchoolAvatar logo={school.logo} label={school.label} color="#626C8B" size={40} radius={12} fontSize={13} />
        <div className="m-card-main">
          <div className="m-card-title">{school.label}</div>
          <div className="m-stats">
            {stats.map(stat => (
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

export function ChildCard({ row, onClick, showSchool = false, showAddress = false, showDebt = false }: {
  row: FamilyListRow;
  onClick: () => void;
  showSchool?: boolean;
  showAddress?: boolean;
  showDebt?: boolean;
}) {
  const sub = [formatName(row.parentName), formatPhone(row.phone)].filter(Boolean).join(' · ');
  return (
    <button type="button" className="m-card" onClick={onClick}>
      <div className="m-card-row" style={{ alignItems: 'flex-start' }}>
        <div className="m-card-main">
          <div className="m-card-title">{formatName(row.childName) || formatName(row.parentName) || 'Без имени'}</div>
          {sub && <div className="m-card-sub">{sub}</div>}
          {showAddress && row.streetAddress && <div className="m-card-sub">{row.streetAddress}</div>}
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="m-card-meta">
        {showSchool && <span className="m-badge">{schoolLabel(row.branchFilter)}</span>}
        <TransferBadge number={row.transferNumber} />
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

/** Дети одной семьи — одной карточкой, в исходном порядке списка. */
export function groupFamilies(rows: FamilyListRow[]): FamilyListRow[][] {
  const families = new Map<string, FamilyListRow[]>();
  rows.forEach(row => {
    const family = families.get(row.familyId);
    if (family) family.push(row);
    else families.set(row.familyId, [row]);
  });
  return Array.from(families.values());
}

export function FamilyCard({ children, onClick }: { children: FamilyListRow[]; onClick: () => void }) {
  return (
    <button type="button" className="m-card" onClick={onClick}>
      <div className="m-card-row">
        <div className="m-card-main">
          {children.map(child => {
            // В базе встречаются дети с именем «.» — по ним семью не узнать, подписываем родителем.
            const name = /[\p{L}]/u.test(child.childName) ? formatName(child.childName) : '';
            return (
              <div key={child.rowId} className="m-card-title">
                {name || <>Без имени <span className="m-card-sub" style={{ display: 'inline' }}>· {formatName(child.parentName) || 'родитель не указан'}</span></>}
              </div>
            );
          })}
        </div>
        <ChevronRight className="m-card-chevron" size={20} />
      </div>
    </button>
  );
}

export function FamilyList({ families, onOpen, emptyText }: {
  families: FamilyListRow[][];
  onOpen: (familyId: string) => void;
  emptyText: string;
}) {
  const [visible, sentinelRef] = useIncremental(families);
  if (!families.length) return <Empty>{emptyText}</Empty>;
  return (
    <div className="m-list">
      {visible.map(family => (
        <FamilyCard key={family[0].familyId} onClick={() => onOpen(family[0].familyId)}>{family}</FamilyCard>
      ))}
      <div ref={sentinelRef} className="m-more" />
    </div>
  );
}
