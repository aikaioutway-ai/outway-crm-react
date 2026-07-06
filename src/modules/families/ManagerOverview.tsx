import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Inbox, Landmark, Wallet } from 'lucide-react';
import { fetchV2FamiliesTable, FamilyListRow } from '../../services/crmV2Service';
import { SCHOOL_TABS } from './constants';
import { money } from '../../utils/pricing';

interface SchoolStat {
  key: string;
  label: string;
  color: string;
  newRequests: number;
  debtSum: number;
  debtorsCount: number;
  pendingSum: number;
  balance: number;
}

interface ManagerOverviewProps {
  onSelectSchool: (key: string) => void;
}

const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const CHART_COLORS = { requests: '#378ADD', pending: '#BA7517' };

const GRID_COLUMNS = '1.5fr 1.1fr 0.9fr 0.7fr 1.1fr 0.9fr';
const COLUMN_COUNT = 6;

function colStyle(index: number): React.CSSProperties {
  return {
    paddingRight: 16,
    borderRight: index < COLUMN_COUNT - 1 ? '1px solid var(--border)' : 'none',
  };
}

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
      newRequests: schoolRows.filter(r => r.status === 'new').length,
      debtSum: families.reduce((sum, f) => sum + Math.max(0, f.debtAmount), 0),
      debtorsCount: families.filter(f => f.debtAmount > 0).length,
      pendingSum: families.reduce((sum, f) => sum + f.pendingPayment, 0),
      balance: families.reduce((sum, f) => sum + f.balance, 0),
    };
  });
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = Math.round((value / max) * 100);
  return (
    <div style={{ flex: 1, position: 'relative', height: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${width}%`, background: color, borderRadius: 4 }} />
    </div>
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

export default function ManagerOverview({ onSelectSchool }: ManagerOverviewProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    fetchV2FamiliesTable()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const stats = useMemo(() => computeSchoolStats(rows ?? []), [rows]);
  const maxRequests = Math.max(1, ...stats.map(s => s.newRequests));
  const maxPendingSum = Math.max(1, ...stats.map(s => s.pendingSum));
  const totals = useMemo(() => stats.reduce((acc, s) => ({
    newRequests: acc.newRequests + s.newRequests,
    debtSum: acc.debtSum + s.debtSum,
    debtorsCount: acc.debtorsCount + s.debtorsCount,
    pendingSum: acc.pendingSum + s.pendingSum,
    balance: acc.balance + s.balance,
  }), { newRequests: 0, debtSum: 0, debtorsCount: 0, pendingSum: 0, balance: 0 }), [stats]);

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <KpiChip icon={<Inbox size={18} color="#fff" />} label="Новые заявки" value={String(totals.newRequests)} color={CHART_COLORS.requests} />
          <KpiChip icon={<Landmark size={18} color="#fff" />} label="Сумма долга" value={money(totals.debtSum)} color="var(--danger)" />
          <KpiChip icon={<AlertTriangle size={18} color="#fff" />} label="Должники" value={String(totals.debtorsCount)} color="var(--warning)" />
          <KpiChip icon={<Clock size={18} color="#fff" />} label="На проверке" value={money(totals.pendingSum)} color={CHART_COLORS.pending} />
          <KpiChip icon={<Wallet size={18} color="#fff" />} label="Баланс" value={totals.balance.toLocaleString('ru-RU')} color="var(--success)" />
        </div>

        <div style={{ flex: 1, minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, gap: 12, padding: '4px 20px 14px', flexShrink: 0 }}>
            <span style={{ ...colStyle(0), fontSize: 15, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase' }}>Школы</span>
            <span style={{ ...colStyle(1), fontSize: 15, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase' }}>Новые заявки</span>
            <span style={{ ...colStyle(2), fontSize: 15, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase' }}>Сумма долга</span>
            <span style={{ ...colStyle(3), fontSize: 15, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase' }}>Должники</span>
            <span style={{ ...colStyle(4), fontSize: 15, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase' }}>Сумма на проверке</span>
            <span style={{ ...colStyle(5), fontSize: 15, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase' }}>Баланс</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {stats.map((s, i) => (
              <div
                key={s.key}
                onClick={() => onSelectSchool(s.key)}
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: GRID_COLUMNS,
                  gap: 12,
                  padding: '0 20px',
                  cursor: 'pointer',
                  background: i % 2 === 1 ? 'var(--surface-2)' : undefined,
                }}
              >
                <div style={{ ...colStyle(0), display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: s.color, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.label.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  <ChevronRight size={14} color="var(--text-2)" />
                </div>

                <div style={{ ...colStyle(1), display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bar value={s.newRequests} max={maxRequests} color={CHART_COLORS.requests} />
                  <span style={{ minWidth: 24, flexShrink: 0, fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>{s.newRequests}</span>
                </div>

                <div style={{ ...colStyle(2), display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: s.debtSum > 0 ? 'var(--danger)' : undefined }}>{s.debtSum > 0 ? money(s.debtSum) : '0'}</span>
                </div>

                <div style={{ ...colStyle(3), display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: s.debtorsCount > 0 ? 'var(--danger)' : undefined }}>{s.debtorsCount}</span>
                </div>

                <div style={{ ...colStyle(4), display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bar value={s.pendingSum} max={maxPendingSum} color={CHART_COLORS.pending} />
                  <span style={{ minWidth: 56, flexShrink: 0, fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>{s.pendingSum.toLocaleString('ru-RU')}</span>
                </div>

                <div style={{ ...colStyle(5), display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: s.balance < 0 ? 'var(--danger)' : s.balance > 0 ? 'var(--success)' : undefined }}>{s.balance.toLocaleString('ru-RU')}</span>
                </div>
              </div>
            ))}
          </div>

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
