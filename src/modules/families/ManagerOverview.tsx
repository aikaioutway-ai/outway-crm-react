import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchV2FamiliesTable, FamilyListRow } from '../../services/crmV2Service';
import { SCHOOL_TABS } from './constants';
import { money } from '../../utils/pricing';

interface SchoolStat {
  key: string;
  label: string;
  color: string;
  debtorsCount: number;
  debtSum: number;
  newRequests: number;
  pendingCount: number;
  pendingSum: number;
}

interface ManagerOverviewProps {
  onSelectSchool: (key: string) => void;
}

const SCHOOL_COLORS = [
  '#378ADD', '#639922', '#7F77DD', '#3C3489', '#A32D2D', '#185FA5', '#0F6E56', '#085041',
  '#993556', '#712B13', '#854F0B', '#BA7517', '#993C1D', '#27500A', '#D4537E', '#26215C',
];

const CHART_COLORS = { requests: '#378ADD', pendingCount: '#BA7517', pendingSum: '#0F6E56' };

const GRID_COLUMNS = '1.4fr 0.7fr 1fr 1.1fr 1.1fr 1.1fr';

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
      debtorsCount: families.filter(f => f.debtAmount > 0).length,
      debtSum: families.reduce((sum, f) => sum + Math.max(0, f.debtAmount), 0),
      newRequests: schoolRows.filter(r => r.status === 'new').length,
      pendingCount: families.reduce((sum, f) => sum + f.pendingPaymentCount, 0),
      pendingSum: families.reduce((sum, f) => sum + f.pendingPayment, 0),
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
  const maxPendingCount = Math.max(1, ...stats.map(s => s.pendingCount));
  const maxPendingSum = Math.max(1, ...stats.map(s => s.pendingSum));

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex' }}>
        <div style={{ flex: 1, minHeight: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, gap: 12, padding: '0 20px 10px', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Школы</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Должники</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Сумма долга</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Новые заявки</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Чеков · к-во</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Чеков · сумма</span>
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
                  alignItems: 'center',
                  padding: '0 20px',
                  cursor: 'pointer',
                  background: i % 2 === 1 ? 'var(--surface-2)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: s.color, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.label.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  <ChevronRight size={14} color="var(--text-2)" />
                </div>

                <span style={{ fontSize: 14, fontWeight: 700, color: s.debtorsCount > 0 ? 'var(--danger)' : undefined }}>{s.debtorsCount}</span>

                <span style={{ fontSize: 14, fontWeight: 700, color: s.debtSum > 0 ? 'var(--danger)' : undefined }}>{s.debtSum > 0 ? money(s.debtSum) : '0'}</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bar value={s.newRequests} max={maxRequests} color={CHART_COLORS.requests} />
                  <span style={{ minWidth: 24, flexShrink: 0, fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>{s.newRequests}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bar value={s.pendingCount} max={maxPendingCount} color={CHART_COLORS.pendingCount} />
                  <span style={{ minWidth: 24, flexShrink: 0, fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>{s.pendingCount}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bar value={s.pendingSum} max={maxPendingSum} color={CHART_COLORS.pendingSum} />
                  <span style={{ minWidth: 56, flexShrink: 0, fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>{s.pendingSum.toLocaleString('ru-RU')}</span>
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
