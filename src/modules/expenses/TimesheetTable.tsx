import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchV2DriversTable, V2DriverTableRow } from '../../services/crmV2Service';
import { SCHOOL_TABS } from '../families/constants';

interface DriverRow {
  driverId: string;
  fullName: string;
  transfers: string;   // "1, 3, 7"
  days: number;
  rate: number;
  accrued: number;    // days * rate
  fine: number;
  bonus: number;
  total: number;      // accrued - fine + bonus
}

interface Props {
  schoolKey: string;
  globalDays: number;
  globalRate: number;
  vehicleType?: 'microbus' | 'minivan' | 'sedan';
}

const COL_STYLE: React.CSSProperties = {
  padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap',
};
const HEAD_STYLE: React.CSSProperties = {
  ...COL_STYLE,
  fontSize: 11, fontWeight: 700, color: '#7A859D',
  textTransform: 'uppercase', letterSpacing: 0.4,
  background: '#F8FAFC', borderBottom: '1px solid #EEF2F6',
  userSelect: 'none',
};
const CELL_STYLE: React.CSSProperties = {
  ...COL_STYLE, color: '#17222F', borderBottom: '1px solid #F1F5F9',
};

export default function TimesheetTable({ schoolKey, globalDays, globalRate, vehicleType }: Props) {
  const [allDrivers, setAllDrivers] = useState<V2DriverTableRow[]>([]);
  const [loading, setLoading]       = useState(false);
  // Переопределения на конкретного водителя: driverId → { days?, rate?, fine?, bonus? }
  const [overrides, setOverrides]   = useState<Record<string, Partial<{ days: number; rate: number; fine: number; bonus: number }>>>({});

  useEffect(() => {
    setLoading(true);
    fetchV2DriversTable().then(rows => { setAllDrivers(rows); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Фильтрация водителей по школе
  const schoolTab = SCHOOL_TABS.find(t => t.key === schoolKey);
  const filteredDrivers = useMemo(() => {
    let result = allDrivers;
    if (schoolTab && schoolTab.key !== 'ALL') {
      result = result.filter(d =>
        d.branchCodes.some(c => schoolTab.codes.includes(c)) ||
        (schoolTab.branches.length > 0 && d.branchNames.some(n => schoolTab.branches.includes(n)))
      );
    }
    if (vehicleType) {
      result = result.filter(d => d.vehicleType === vehicleType);
    }
    return result;
  }, [allDrivers, schoolTab, vehicleType]);

  const rows: DriverRow[] = useMemo(() =>
    filteredDrivers.map(d => {
      const ov     = overrides[d.driverId] ?? {};
      const days   = ov.days   ?? globalDays;
      const rate   = ov.rate   ?? globalRate;
      const fine   = ov.fine   ?? 0;
      const bonus  = ov.bonus  ?? 0;
      const accrued = days * rate;
      return {
        driverId: d.driverId,
        fullName: d.fullName,
        transfers: d.transferNumbers || '—',
        days, rate, accrued, fine, bonus,
        total: accrued - fine + bonus,
      };
    }),
  [filteredDrivers, overrides, globalDays, globalRate]);

  const setOv = useCallback((driverId: string, patch: Partial<{ days: number; rate: number; fine: number; bonus: number }>) => {
    setOverrides(prev => ({ ...prev, [driverId]: { ...prev[driverId], ...patch } }));
  }, []);

  const totalAccrued = rows.reduce((s, r) => s + r.accrued, 0);
  const totalFine    = rows.reduce((s, r) => s + r.fine, 0);
  const totalBonus   = rows.reduce((s, r) => s + r.bonus, 0);
  const totalTotal   = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div style={{ alignSelf: 'flex-start', width: '100%', overflow: 'auto', borderRadius: 12, background: '#fff', border: '1px solid #EEF2F6', position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', zIndex: 1, fontSize: 13, color: '#9AABB0' }}>
          Загрузка...
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr>
            <th style={{ ...HEAD_STYLE, textAlign: 'left' }}>#</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'left' }}>Водитель</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>Трансфер</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>К-во дней</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>Ставка</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Начислено</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Штраф</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Премия</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Итого</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} style={{ ...CELL_STYLE, textAlign: 'center', color: '#9AABB0', padding: '32px 0' }}>
                {loading ? '' : !schoolKey ? 'Выберите школу' : 'Нет водителей'}
              </td>
            </tr>
          )}
          {rows.map((row, idx) => (
            <tr key={row.driverId} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFBFC' }}>
              <td style={{ ...CELL_STYLE, color: '#9AABB0', width: 36 }}>{idx + 1}</td>
              <td style={{ ...CELL_STYLE, fontWeight: 600 }}>{row.fullName}</td>
              <td style={{ ...CELL_STYLE, textAlign: 'center', color: '#5A9FE8' }}>{row.transfers}</td>
              <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                <SelectInput
                  value={row.days}
                  options={[0, ...Array.from({ length: 15 }, (_, i) => i + 1)]}
                  onChange={v => setOv(row.driverId, { days: v })}
                />
              </td>
              <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                <SelectInput
                  value={row.rate}
                  options={Array.from({ length: 11 }, (_, i) => 3500 + i * 100)}
                  onChange={v => setOv(row.driverId, { rate: v })}
                />
              </td>
              <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 600, color: '#0C7A74' }}>
                {row.accrued.toLocaleString('ru-RU')}
              </td>
              <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
                <NumInput value={row.fine} min={0}
                  onChange={v => setOv(row.driverId, { fine: v })}
                  color="#EF4444" clearOnEdit />
              </td>
              <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
                <NumInput value={row.bonus} min={0}
                  onChange={v => setOv(row.driverId, { bonus: v })}
                  color="#10B981" clearOnEdit />
              </td>
              <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#17222F' }}>
                {row.total.toLocaleString('ru-RU')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#F0FDFA', borderTop: '2px solid #A7F3D0' }}>
            <td colSpan={5} style={{ ...CELL_STYLE, fontWeight: 700, color: '#0C7A74' }}>Итого</td>
            <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#0C7A74' }}>{totalAccrued.toLocaleString('ru-RU')}</td>
            <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#EF4444' }}>{totalFine.toLocaleString('ru-RU')}</td>
            <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{totalBonus.toLocaleString('ru-RU')}</td>
            <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#17222F' }}>{totalTotal.toLocaleString('ru-RU')}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Селект для дней (1–15) и ставки (3500–4500)
function SelectInput({ value, options, onChange }: {
  value: number; options: number[]; onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        padding: '2px 4px', border: '1px solid #D5E2E8', borderRadius: 6,
        fontSize: 12, fontWeight: 600, color: '#17222F', background: '#F1F5F9',
        cursor: 'pointer', outline: 'none', textAlign: 'center',
      }}
    >
      {options.map(o => <option key={o} value={o}>{o.toLocaleString('ru-RU')}</option>)}
    </select>
  );
}

// Инпут для штрафа/премии — при редактировании поле пустое
function NumInput({ value, min = 0, onChange, color, clearOnEdit = false }: {
  value: number; min?: number;
  onChange: (v: number) => void; color?: string; clearOnEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw]         = useState('');

  if (!editing) return (
    <span
      onClick={() => { setEditing(true); setRaw(clearOnEdit ? '' : String(value)); }}
      style={{
        cursor: 'text', display: 'inline-block', minWidth: 40, padding: '2px 6px',
        borderRadius: 6, background: value === 0 ? '#F1F5F9' : 'transparent',
        fontSize: 12, fontWeight: 600,
        color: value === 0 ? '#9AABB0' : (color ?? '#17222F'), textAlign: 'center',
      }}
    >{value === 0 ? '—' : value.toLocaleString('ru-RU')}</span>
  );

  return (
    <input
      autoFocus
      type="number" value={raw}
      placeholder="0"
      onChange={e => setRaw(e.target.value)}
      onBlur={() => {
        const v = Math.max(min, Number(raw) || 0);
        onChange(isNaN(v) ? 0 : v);
        setEditing(false);
      }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
      style={{
        width: 64, padding: '2px 4px', border: '1px solid #0C7A74', borderRadius: 6,
        fontSize: 12, fontWeight: 600, textAlign: 'center', outline: 'none',
        color: color ?? '#17222F',
      }}
    />
  );
}
