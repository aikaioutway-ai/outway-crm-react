import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Inbox, Landmark, Receipt, Users, Wallet } from 'lucide-react';
import { fetchV2FamiliesTable, FamilyListRow } from '../../services/crmV2Service';
import { SCHOOL_TABS } from './constants';
import { money } from '../../utils/pricing';

interface SchoolStat {
  key: string;
  label: string;
  color: string;
  childrenCount: number;
  newRequests: number;
  charged: number;
  paid: number;
  debtSum: number;
  balance: number;
}

type SortKey = 'school' | 'childrenCount' | 'newRequests' | 'charged' | 'paid' | 'debtSum' | 'balance';

interface ManagerOverviewProps {
  onSelectSchool: (key: string) => void;
}

const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const KPI_COLORS = {
  childrenCount: '#7F77DD',
  newRequests: '#378ADD',
  charged: '#BA7517',
  paid: 'var(--success)',
  debtSum: 'var(--danger)',
  balance: 'var(--accent)',
};

const COLUMN_WEIGHTS: Record<SortKey, number> = {
  school: 1.6,
  childrenCount: 0.9,
  newRequests: 1.1,
  charged: 1,
  paid: 1,
  debtSum: 1,
  balance: 1,
};

function computeSchoolStats(rows: FamilyListRow[]): SchoolStat[] {
  const schools = SCHOOL_TABS.filter(t => t.key !== 'ALL');
  return schools.map((tab, index) => {
    const schoolRows = rows.filter(r => r.branchFilter === tab.key);
    const familyMap = new Map<string, FamilyListRow>();
    schoolRows.forEach(r => { if (!familyMap.has(r.familyId)) familyMap.set(r.familyId, r); });
    const families = Array.from(familyMap.values());

    return {
      key: tab.key,
      label: tab.label,
      color: SCHOOL_COLORS[index % SCHOOL_COLORS.length],
      childrenCount: schoolRows.length,
      newRequests: schoolRows.filter(r => r.status === 'new').length,
      charged: families.reduce((sum, f) => sum + f.totalCharged, 0),
      paid: families.reduce((sum, f) => sum + f.totalPaid, 0),
      debtSum: families.reduce((sum, f) => sum + Math.max(0, f.debtAmount), 0),
      balance: families.reduce((sum, f) => sum + f.balance, 0),
    };
  });
}

function sortValue(s: SchoolStat, key: SortKey): number | string {
  if (key === 'school') return s.label;
  return s[key];
}

function Ring({ value, max, color, size = 34 }: { value: number; max: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function KpiChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 16px' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-2)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    </div>
  );
}

function ColumnCard({ sortKey, label, weight, sortState, onSort, children }: {
  sortKey: SortKey;
  label: string;
  weight: number;
  sortState: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sortState.key === sortKey;
  return (
    <div style={{ flex: weight, minWidth: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button
        onClick={() => onSort(sortKey)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          padding: '12px 16px',
          fontSize: 13,
          fontWeight: 800,
          color: active ? 'var(--accent)' : 'var(--text)',
          textTransform: 'uppercase',
          textAlign: 'left',
        }}
      >
        {label}
        {active && (sortState.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </button>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

export default function ManagerOverview({ onSelectSchool }: ManagerOverviewProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'school', dir: 'asc' });

  useEffect(() => {
    fetchV2FamiliesTable()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const stats = useMemo(() => computeSchoolStats(rows ?? []), [rows]);
  const maxRequests = Math.max(1, ...stats.map(s => s.newRequests));
  const totals = useMemo(() => stats.reduce((acc, s) => ({
    childrenCount: acc.childrenCount + s.childrenCount,
    newRequests: acc.newRequests + s.newRequests,
    charged: acc.charged + s.charged,
    paid: acc.paid + s.paid,
    debtSum: acc.debtSum + s.debtSum,
    balance: acc.balance + s.balance,
  }), { childrenCount: 0, newRequests: 0, charged: 0, paid: 0, debtSum: 0, balance: 0 }), [stats]);

  const sortedStats = useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      const av = sortValue(a, sortState.key);
      const bv = sortValue(b, sortState.key);
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [stats, sortState]);

  const handleSort = (key: SortKey) => {
    setSortState(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school' ? 'asc' : 'desc' });
  };

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <KpiChip icon={<Users size={18} color="#fff" />} label="К-во всех детей" value={String(totals.childrenCount)} color={KPI_COLORS.childrenCount} />
          <KpiChip icon={<Inbox size={18} color="#fff" />} label="Новые заявки" value={String(totals.newRequests)} color={KPI_COLORS.newRequests} />
          <KpiChip icon={<Receipt size={18} color="#fff" />} label="Начислено" value={money(totals.charged)} color={KPI_COLORS.charged} />
          <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Оплачено" value={money(totals.paid)} color={KPI_COLORS.paid} />
          <KpiChip icon={<Landmark size={18} color="#fff" />} label="Сумма долга" value={money(totals.debtSum)} color={KPI_COLORS.debtSum} />
          <KpiChip icon={<Wallet size={18} color="#fff" />} label="Баланс" value={totals.balance.toLocaleString('ru-RU')} color={KPI_COLORS.balance} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>

          <ColumnCard sortKey="school" label="Школы" weight={COLUMN_WEIGHTS.school} sortState={sortState} onSort={handleSort}>
            {sortedStats.map((s, i) => (
              <div
                key={s.key}
                onClick={() => onSelectSchool(s.key)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: '0 16px', cursor: 'pointer', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 7, background: s.color, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.label.slice(0, 2).toUpperCase()}
                </span>
                <span style={{ fontSize: 14, fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                <ChevronRight size={14} color="var(--text-2)" />
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="newRequests" label="Новые заявки" weight={COLUMN_WEIGHTS.newRequests} sortState={sortState} onSort={handleSort}>
            {sortedStats.map((s, i) => (
              <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{s.newRequests}</span>
                <Ring value={s.newRequests} max={maxRequests} color={KPI_COLORS.newRequests} />
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="charged" label="Начислено" weight={COLUMN_WEIGHTS.charged} sortState={sortState} onSort={handleSort}>
            {sortedStats.map((s, i) => (
              <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{s.charged > 0 ? money(s.charged) : '0'}</span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="paid" label="Оплачено" weight={COLUMN_WEIGHTS.paid} sortState={sortState} onSort={handleSort}>
            {sortedStats.map((s, i) => (
              <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.paid > 0 ? 'var(--success)' : undefined }}>{s.paid > 0 ? money(s.paid) : '0'}</span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="debtSum" label="Сумма долга" weight={COLUMN_WEIGHTS.debtSum} sortState={sortState} onSort={handleSort}>
            {sortedStats.map((s, i) => (
              <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.debtSum > 0 ? 'var(--danger)' : undefined }}>{s.debtSum > 0 ? money(s.debtSum) : '0'}</span>
              </div>
            ))}
          </ColumnCard>

          <ColumnCard sortKey="balance" label="Баланс" weight={COLUMN_WEIGHTS.balance} sortState={sortState} onSort={handleSort}>
            {sortedStats.map((s, i) => (
              <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px', background: i % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.balance < 0 ? 'var(--danger)' : s.balance > 0 ? 'var(--success)' : undefined }}>{s.balance.toLocaleString('ru-RU')}</span>
              </div>
            ))}
          </ColumnCard>

        </div>
      </div>

      <div aria-hidden="true" style={{ width: sidebarCollapsed ? 78 : 280, flexShrink: 0, transition: 'width .18s ease' }} />

      <aside style={{
        width: sidebarCollapsed ? 58 : 260,
        height: 'calc(100vh - 20px)',
        background: '#fff',
        borderRadius: 22,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 80,
        transition: 'width .18s ease',
      }}>
        <div style={{
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          gap: 6,
          padding: sidebarCollapsed ? '0 8px' : '0 10px 0 12px',
          borderBottom: '1px solid var(--border)',
          color: '#626C8B',
          fontSize: 12,
          fontWeight: 850,
          textTransform: 'uppercase',
        }}>
          {!sidebarCollapsed && <span>Школы</span>}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? 'Показать школы' : 'Скрыть школы'}
            style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 10, background: '#F5FAFB', color: '#626C8B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            {sidebarCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
        <nav style={{ flex: 1, padding: sidebarCollapsed ? '7px 6px' : '7px 8px 7px 6px', overflow: 'auto' }}>
          {stats.map(s => (
            <button
              key={s.key}
              onClick={() => onSelectSchool(s.key)}
              title={s.label}
              style={{
                width: '100%',
                minHeight: 34,
                display: 'flex',
                alignItems: sidebarCollapsed ? 'center' : 'stretch',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                marginBottom: 5,
                border: '1px solid transparent',
                borderRadius: 14,
                background: 'transparent',
                color: '#626C8B',
                fontSize: sidebarCollapsed ? 9 : 10,
                fontWeight: 650,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                padding: sidebarCollapsed ? '8px 0' : '8px 12px',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
