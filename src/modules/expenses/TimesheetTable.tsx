import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchV2DriverAdvancesForPeriod, fetchV2DriversTable, V2DriverTableRow } from '../../services/crmV2Service';
import { fetchEmployees } from '../../services/employeeService';
import { Employee } from '../../types';
import { SCHOOL_TABS } from '../families/constants';
import { PAYROLL_OFFICE_KEY, PayrollSchoolTab, TimesheetPayrollSummary } from './timesheetTypes';

interface DriverRow {
  driverId: string;
  fullName: string;
  transfers: string;   // "1, 3, 7"
  days: number;
  rate: number;
  accrued: number;    // days * rate
  advanceAmount: number;
  salaryAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

interface Props {
  schoolKey: string;
  globalDays: number;
  globalRate: number;
  vehicleType?: 'microbus' | 'minivan' | 'sedan';
  transferFilter?: string;
  periodMonth: number;
  periodYear: number;
  onSummaryChange?: (summary: TimesheetPayrollSummary) => void;
  payrollView?: PayrollSchoolTab;
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

type RowOverride = Partial<{ days: number; rate: number; salaryAmount: number }>;

function formatAmount(value: number): string {
  return value === 0 ? '—' : value.toLocaleString('ru-RU');
}

function driverMatchesTransfer(driver: V2DriverTableRow, transferNumber: string): boolean {
  return driver.transferNumbers
    .split(',')
    .map(item => item.replace(/[^\d]/g, ''))
    .filter(Boolean)
    .includes(transferNumber);
}

export default function TimesheetTable({ schoolKey, globalDays, globalRate, vehicleType, transferFilter = '', periodMonth, periodYear, onSummaryChange, payrollView = 'timesheet' }: Props) {
  const [allDrivers, setAllDrivers] = useState<V2DriverTableRow[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]       = useState(false);
  const [advanceByDriver, setAdvanceByDriver] = useState<Record<string, number>>({});
  // Переопределения на конкретного водителя: driverId → { days?, rate?, salaryAmount? }
  const [overrides, setOverrides]   = useState<Record<string, RowOverride>>({});
  const isOffice = schoolKey === PAYROLL_OFFICE_KEY;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchV2DriversTable().catch(() => []),
      fetchEmployees().catch(() => []),
    ]).then(([drivers, employees]) => {
      setAllDrivers(drivers);
      setAllEmployees(employees);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isOffice) {
      setAdvanceByDriver({});
      return;
    }
    let cancelled = false;
    fetchV2DriverAdvancesForPeriod(periodMonth, periodYear)
      .then(advances => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        advances.forEach(advance => {
          next[advance.driverId] = (next[advance.driverId] ?? 0) + advance.amount;
        });
        setAdvanceByDriver(next);
      })
      .catch(() => {
        if (!cancelled) setAdvanceByDriver({});
      });
    return () => { cancelled = true; };
  }, [isOffice, periodMonth, periodYear]);

  // Фильтрация водителей по школе
  const schoolTab = SCHOOL_TABS.find(t => t.key === schoolKey);
  const filteredDrivers = useMemo(() => {
    if (isOffice) return [];
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
    if (transferFilter === 'empty') {
      result = result.filter(d => d.transferCount === 0);
    } else if (transferFilter) {
      result = result.filter(d => driverMatchesTransfer(d, transferFilter));
    }
    return result;
  }, [allDrivers, isOffice, schoolTab, transferFilter, vehicleType]);

  const filteredEmployees = useMemo(() => (
    isOffice
      ? allEmployees.filter(employee => employee.status === 'active' && employee.role !== 'driver')
      : []
  ), [allEmployees, isOffice]);

  const rows: DriverRow[] = useMemo(() => {
    if (isOffice) {
      return filteredEmployees.map(employee => {
        const ov = overrides[employee.id] ?? {};
        const days = ov.days ?? globalDays;
        const rate = ov.rate ?? globalRate;
        const salaryAmount = ov.salaryAmount ?? 0;
        const accrued = days * rate;
        return {
          driverId: employee.id,
          fullName: employee.fullName,
          transfers: employee.position || 'Офис',
          days,
          rate,
          accrued,
          advanceAmount: 0,
          salaryAmount,
          paidAmount: salaryAmount,
          remainingAmount: accrued - salaryAmount,
        };
      });
    }
    return filteredDrivers.map(d => {
      const ov     = overrides[d.driverId] ?? {};
      const days   = ov.days   ?? globalDays;
      const rate   = ov.rate   ?? globalRate;
      const advanceAmount = advanceByDriver[d.driverId] ?? 0;
      const salaryAmount = ov.salaryAmount ?? 0;
      const accrued = days * rate;
      const paidAmount = advanceAmount + salaryAmount;
      return {
        driverId: d.driverId,
        fullName: d.fullName,
        transfers: d.transferNumbers || '—',
        days,
        rate,
        accrued,
        advanceAmount,
        salaryAmount,
        paidAmount,
        remainingAmount: accrued - paidAmount,
      };
    });
  }, [advanceByDriver, filteredDrivers, filteredEmployees, isOffice, overrides, globalDays, globalRate]);

  const setOv = useCallback((driverId: string, patch: RowOverride) => {
    setOverrides(prev => ({ ...prev, [driverId]: { ...prev[driverId], ...patch } }));
  }, []);

  const totalAccrued = rows.reduce((s, r) => s + r.accrued, 0);
  const totalAdvance = rows.reduce((s, r) => s + r.advanceAmount, 0);
  const totalSalary = rows.reduce((s, r) => s + r.salaryAmount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remainingAmount, 0);
  const totalAdvanceRemaining = totalAccrued - totalAdvance;

  const isTimesheetView = payrollView === 'timesheet';
  const isAdvanceView = payrollView === 'advance';
  const isSalaryView = payrollView === 'salary';
  const visibleColumnCount = isTimesheetView ? 7 : isAdvanceView ? 6 : 8;
  const footerLeadSpan = isTimesheetView ? 5 : 3;

  useEffect(() => {
    onSummaryChange?.({
      accruedAmount: totalAccrued,
      advanceAmount: totalAdvance,
      salaryAmount: totalSalary,
      paidAmount: totalPaid,
      remainingAmount: totalRemaining,
    });
  }, [onSummaryChange, totalAccrued, totalAdvance, totalSalary, totalPaid, totalRemaining]);

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
            <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>{isOffice ? 'Должность' : 'Трансфер'}</th>
            {isTimesheetView && <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>К-во дней</th>}
            {isTimesheetView && <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>Ставка</th>}
            <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Начислено</th>
            {(isAdvanceView || isSalaryView) && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Авансы</th>}
            {isSalaryView && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Зарплата</th>}
            {isSalaryView && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Оплачено</th>}
            <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Остаток</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={visibleColumnCount} style={{ ...CELL_STYLE, textAlign: 'center', color: '#9AABB0', padding: '32px 0' }}>
                {loading ? '' : !schoolKey ? 'Выберите школу' : isOffice ? 'Нет сотрудников' : 'Нет водителей'}
              </td>
            </tr>
          )}
          {rows.map((row, idx) => (
            <tr key={row.driverId} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFBFC' }}>
              <td style={{ ...CELL_STYLE, color: '#9AABB0', width: 36 }}>{idx + 1}</td>
              <td style={{ ...CELL_STYLE, fontWeight: 600 }}>{row.fullName}</td>
              <td style={{ ...CELL_STYLE, textAlign: 'center', color: '#5A9FE8' }}>{row.transfers}</td>
              {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                <SelectInput
                  value={row.days}
                  options={[0, ...Array.from({ length: 15 }, (_, i) => i + 1)]}
                  onChange={v => setOv(row.driverId, { days: v })}
                />
              </td>}
              {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                <SelectInput
                  value={row.rate}
                  options={Array.from({ length: 11 }, (_, i) => 3500 + i * 100)}
                  onChange={v => setOv(row.driverId, { rate: v })}
                />
              </td>}
              <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 600, color: '#0C7A74' }}>
                {row.accrued.toLocaleString('ru-RU')}
              </td>
              {(isAdvanceView || isSalaryView) && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: row.advanceAmount > 0 ? '#B45309' : '#9AABB0' }}>
                {formatAmount(row.advanceAmount)}
              </td>}
              {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
                <NumInput value={row.salaryAmount} min={0}
                  onChange={v => setOv(row.driverId, { salaryAmount: v })}
                  color="#1D6FA4" clearOnEdit />
              </td>}
              {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 800, color: row.paidAmount > 0 ? '#15803D' : '#9AABB0' }}>
                {formatAmount(row.paidAmount)}
              </td>}
              <td style={{
                ...CELL_STYLE,
                textAlign: 'right',
                fontWeight: 800,
                color: (isAdvanceView ? row.accrued - row.advanceAmount : row.remainingAmount) > 0 ? '#EF4444' : '#15803D',
              }}>
                {(isAdvanceView ? row.accrued - row.advanceAmount : row.remainingAmount).toLocaleString('ru-RU')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#F0FDFA', borderTop: '2px solid #A7F3D0' }}>
            <td colSpan={footerLeadSpan} style={{ ...CELL_STYLE, fontWeight: 700, color: '#0C7A74' }}>Итого</td>
            <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#0C7A74' }}>{totalAccrued.toLocaleString('ru-RU')}</td>
            {(isAdvanceView || isSalaryView) && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#B45309' }}>{formatAmount(totalAdvance)}</td>}
            {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#1D6FA4' }}>{formatAmount(totalSalary)}</td>}
            {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 800, color: '#15803D' }}>{formatAmount(totalPaid)}</td>}
            <td style={{
              ...CELL_STYLE,
              textAlign: 'right',
              fontWeight: 800,
              color: (isAdvanceView ? totalAdvanceRemaining : totalRemaining) > 0 ? '#EF4444' : '#15803D',
            }}>{(isAdvanceView ? totalAdvanceRemaining : totalRemaining).toLocaleString('ru-RU')}</td>
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
