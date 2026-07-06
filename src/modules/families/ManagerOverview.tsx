import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
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

const rowStyle: React.CSSProperties = { height: 36, display: 'flex', alignItems: 'center', padding: '0 10px', boxSizing: 'border-box', gap: 8 };
const altRowStyle: React.CSSProperties = { ...rowStyle, background: 'var(--surface-2)' };
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 22, padding: '12px 0' };
const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-2)', padding: '0 12px 10px', textTransform: 'uppercase' };

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

function BarChartCard({ title, stats, valueKey, color, formatValue }: {
  title: string;
  stats: SchoolStat[];
  valueKey: 'newRequests' | 'pendingCount' | 'pendingSum';
  color: string;
  formatValue: (n: number) => string;
}) {
  const max = Math.max(1, ...stats.map(s => s[valueKey]));
  return (
    <div style={cardStyle}>
      <div style={headStyle}>{title}</div>
      {stats.map((s, i) => {
        const value = s[valueKey];
        const width = Math.round((value / max) * 100);
        return (
          <div key={s.key} style={i % 2 === 1 ? altRowStyle : rowStyle}>
            <span style={{ width: 78, flexShrink: 0, fontSize: 12, color: 'var(--text-2)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <div style={{ flex: 1, position: 'relative', height: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${width}%`, background: color, borderRadius: 4 }} />
            </div>
            <span style={{ minWidth: 50, flexShrink: 0, fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}>{formatValue(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ManagerOverview({ onSelectSchool }: ManagerOverviewProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(null);

  useEffect(() => {
    fetchV2FamiliesTable()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const stats = useMemo(() => computeSchoolStats(rows ?? []), [rows]);

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 20px' }}>
        <div>
          <div style={headStyle}>Школы</div>
          {stats.map((s, i) => (
            <div
              key={s.key}
              onClick={() => onSelectSchool(s.key)}
              style={{ ...(i % 2 === 1 ? altRowStyle : rowStyle), cursor: 'pointer' }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 6, background: s.color, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {s.label.slice(0, 2).toUpperCase()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <ChevronRight size={14} color="var(--text-2)" />
            </div>
          ))}
        </div>

        <div>
          <div style={headStyle}>Должники</div>
          {stats.map((s, i) => (
            <div key={s.key} style={i % 2 === 1 ? altRowStyle : rowStyle}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: s.debtorsCount > 0 ? 'var(--danger)' : undefined }}>{s.debtorsCount}</span>
            </div>
          ))}
        </div>

        <div>
          <div style={headStyle}>Сумма долга</div>
          {stats.map((s, i) => (
            <div key={s.key} style={i % 2 === 1 ? altRowStyle : rowStyle}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: s.debtSum > 0 ? 'var(--danger)' : undefined }}>{s.debtSum > 0 ? money(s.debtSum) : '0'}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <BarChartCard title="Новые заявки" stats={stats} valueKey="newRequests" color={CHART_COLORS.requests} formatValue={n => String(n)} />
        <BarChartCard title="Чеков на проверке · к-во" stats={stats} valueKey="pendingCount" color={CHART_COLORS.pendingCount} formatValue={n => String(n)} />
        <BarChartCard title="Чеков на проверке · сумма" stats={stats} valueKey="pendingSum" color={CHART_COLORS.pendingSum} formatValue={n => n.toLocaleString('ru-RU')} />
      </div>

    </div>
  );
}
