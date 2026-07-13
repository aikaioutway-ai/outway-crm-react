import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { UserRole } from '../../types';
import FamiliesPage from '../families/FamiliesPage';
import { ALL_PERIODS, SCHOOL_TABS } from '../families/constants';
import type { SchoolDockItem } from '../families/SchoolDockSidebar';
import TimesheetTable from './TimesheetTable';
import { PAYROLL_OFFICE_KEY, PAYROLL_OFFICE_LABEL, PayrollSchoolTab, TimesheetPayrollHeaderRenderArgs, TimesheetPayrollSummary } from './timesheetTypes';

interface Props {
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
  adminFiltersOpen?: boolean;
  onAdminFiltersClose?: () => void;
  columnsOpen?: boolean;
  onColumnsOpenChange?: (v: boolean) => void;
  vehicleType?: 'microbus' | 'minivan' | 'sedan';
  onSchoolsSidebarWidthChange?: (width: number) => void;
  initialSchoolKey?: string;
  externalQuickTransfer?: string;
  onSchoolKeyChange?: (key: string) => void;
  onPayrollSummaryChange?: (summary: TimesheetPayrollSummary) => void;
  renderPayrollHeader?: (args: TimesheetPayrollHeaderRenderArgs) => React.ReactNode;
  payrollSchoolTab?: PayrollSchoolTab;
  extraSchoolDockItems?: SchoolDockItem[];
}

interface SchoolSettings {
  selectedDays: number[];
  rate: number;
}

const DEFAULT_RATE = 3700;

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getPeriodDays(month: number, year: number, half: 'advance' | 'settlement'): number[] {
  const total = daysInMonth(year, month);
  return half === 'advance'
    ? Array.from({ length: 15 }, (_, i) => i + 1)
    : Array.from({ length: total - 15 }, (_, i) => i + 16);
}

// ── Calendar Popup ────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function CalendarPopup({
  month, year, half, selected, onToggle, onClose,
}: {
  month: number; year: number; half: 'advance' | 'settlement';
  selected: number[]; onToggle: (day: number, mode: 'add' | 'remove') => void; onClose: () => void;
}) {
  const dragRef = useRef<{ active: boolean; mode: 'add' | 'remove' }>({ active: false, mode: 'add' });
  const allowedDays = new Set(getPeriodDays(month, year, half));
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const totalDays = daysInMonth(year, month);
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  useEffect(() => {
    const stop = () => { dragRef.current.active = false; };
    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  }, []);

  function handleMouseDown(day: number) {
    const mode = selected.includes(day) ? 'remove' : 'add';
    dragRef.current = { active: true, mode };
    onToggle(day, mode);
  }
  function handleMouseEnter(day: number) {
    if (!dragRef.current.active) return;
    onToggle(day, dragRef.current.mode);
  }

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 999, marginTop: 4,
      background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
      border: '1px solid #E2ECF0', padding: 12, width: 236,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#17222F' }}>
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <span style={{ fontSize: 11, color: '#0C7A74', fontWeight: 600 }}>
          {selected.length} дн.
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {DOW.map(d => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 9, fontWeight: 700,
            color: d === 'Сб' || d === 'Вс' ? '#EF4444' : '#9AABB0', padding: '2px 0',
          }}>{d}</div>
        ))}
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, userSelect: 'none' }}
        onDragStart={e => e.preventDefault()}
      >
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const inPeriod = allowedDays.has(day);
          const sel = selected.includes(day);
          const dow = (firstDow + day - 1) % 7;
          const isWeekend = dow === 5 || dow === 6;
          return (
            <div key={day}
              onMouseDown={inPeriod ? () => handleMouseDown(day) : undefined}
              onMouseEnter={inPeriod ? () => handleMouseEnter(day) : undefined}
              style={{
                height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, fontSize: 11, fontWeight: sel ? 700 : 400,
                background: sel ? '#0C7A74' : inPeriod ? '#F1F5F9' : 'transparent',
                color: sel ? '#fff' : !inPeriod ? '#CBD5E1' : isWeekend ? '#EF4444' : '#374151',
                cursor: inPeriod ? 'pointer' : 'default',
                transition: 'background 0.08s',
              }}
            >{day}</div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
        <button onClick={() => {
          Array.from(allowedDays).forEach(d => { if (!selected.includes(d)) onToggle(d, 'add'); });
        }} style={{ flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 7, background: '#F1F5F9', color: '#374151', cursor: 'pointer' }}>
          Все
        </button>
        <button onClick={() => {
          [...selected].forEach(d => onToggle(d, 'remove'));
        }} style={{ flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 7, background: '#FEE2E2', color: '#DC2626', cursor: 'pointer' }}>
          Сбросить
        </button>
        <button onClick={onClose} style={{ flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 7, background: '#0C7A74', color: '#fff', cursor: 'pointer' }}>
          ОК
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TimesheetPage({
  vehicleType,
  initialSchoolKey = '',
  externalQuickTransfer = '',
  onSchoolKeyChange,
  onPayrollSummaryChange,
  renderPayrollHeader,
  payrollSchoolTab = 'timesheet',
  extraSchoolDockItems,
  ...props
}: Props) {
  const now = new Date();
  const [half, setHalf]         = useState<'advance' | 'settlement'>('advance');
  const [calOpen, setCalOpen]   = useState(false);
  const [periodKey, setPeriodKey] = useState('');
  const [schoolKey, setSchoolKey] = useState(initialSchoolKey);
  // Настройки каждой школы: key → { selectedDays, rate }
  const [schoolSettings, setSchoolSettings] = useState<Record<string, SchoolSettings>>({});
  const calRef = useRef<HTMLDivElement>(null);

  const period = ALL_PERIODS.find(p => p.key === periodKey);
  const month  = period?.month ?? (now.getMonth() + 1);
  const year   = period?.year  ?? now.getFullYear();
  const endDay = daysInMonth(year, month);

  // Текущие настройки выбранной школы (или глобальные если школа не выбрана)
  const settingsKey = schoolKey || 'ALL';
  const currentSettings: SchoolSettings = schoolSettings[settingsKey] ?? { selectedDays: [], rate: DEFAULT_RATE };

  const selectedDays = currentSettings.selectedDays;
  const rate         = currentSettings.rate;

  useEffect(() => {
    setSchoolKey(initialSchoolKey);
  }, [initialSchoolKey]);

  function handleSchoolKeyChange(key: string) {
    setSchoolKey(key);
    onSchoolKeyChange?.(key);
  }

  function updateSettings(patch: Partial<SchoolSettings>) {
    setSchoolSettings(prev => ({
      ...prev,
      [settingsKey]: { ...(prev[settingsKey] ?? { selectedDays: [], rate: DEFAULT_RATE }), ...patch },
    }));
  }

  // Сброс дней при смене периода или половины
  useEffect(() => {
    setSchoolSettings(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], selectedDays: [] }; });
      return next;
    });
  }, [periodKey, half]);

  // Закрыть календарь по клику вне
  useEffect(() => {
    if (!calOpen) return;
    const handler = (e: MouseEvent) => {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [calOpen]);

  function toggleDay(day: number, mode: 'add' | 'remove') {
    updateSettings({
      selectedDays: mode === 'add'
        ? selectedDays.includes(day) ? selectedDays : [...selectedDays, day].sort((a, b) => a - b)
        : selectedDays.filter(d => d !== day),
    });
  }

  const total = selectedDays.length * rate;

  const schoolLabel = schoolKey === PAYROLL_OFFICE_KEY
    ? PAYROLL_OFFICE_LABEL
    : schoolKey
    ? (SCHOOL_TABS.find(t => t.key === schoolKey)?.label ?? schoolKey)
    : null;

  const leftPanel = (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>

      {schoolLabel && (
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0C7A74', textAlign: 'center', padding: '2px 0' }}>
          {schoolLabel}
        </div>
      )}

      <>
          {/* Аванс / Расчёт */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setHalf('advance')} style={{
              flex: 1, padding: '6px 4px', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
              background: half === 'advance' ? '#0C7A74' : '#F1F5F9',
              color: half === 'advance' ? '#fff' : '#374151', transition: 'background 0.15s',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>Аванс</div>
              <div style={{ fontSize: 9, opacity: 0.75 }}>1 — 15</div>
            </button>
            <button onClick={() => setHalf('settlement')} style={{
              flex: 1, padding: '6px 4px', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
              background: half === 'settlement' ? '#0C7A74' : '#F1F5F9',
              color: half === 'settlement' ? '#fff' : '#374151', transition: 'background 0.15s',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>Расчёт</div>
              <div style={{ fontSize: 9, opacity: 0.75 }}>16 — {endDay}</div>
            </button>
          </div>

          <div style={{ height: 1, background: '#EEF2F6' }} />

          {/* Дней + Ставка + Итог */}
          <div style={{ display: 'flex', gap: 5, padding: '0 4px', alignItems: 'flex-end' }}>
            {/* К-во дней */}
            <div style={{ flex: '0 0 auto', width: 64, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 9, color: '#9AABB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Дней</div>
              <div ref={calRef} style={{ position: 'relative' }}>
                <button onClick={() => setCalOpen(v => !v)} style={{
                  width: '100%', padding: '5px 6px', border: '1px solid #D5E2E8', borderRadius: 8,
                  background: calOpen ? '#F0FDFA' : '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 13, fontWeight: 700, color: '#17222F',
                }}>
                  <span>{selectedDays.length}</span>
                  <Calendar size={12} color={calOpen ? '#0C7A74' : '#9AABB0'} />
                </button>
                {calOpen && (
                  <CalendarPopup
                    month={month} year={year} half={half}
                    selected={selectedDays}
                    onToggle={toggleDay}
                    onClose={() => setCalOpen(false)}
                  />
                )}
              </div>
            </div>

            {/* Ставка */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 9, color: '#9AABB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Ставка</div>
              <input
                type="number" min={0} value={rate}
                onChange={e => updateSettings({ rate: Math.max(0, Number(e.target.value)) })}
                style={{
                  width: '100%', padding: '5px 4px', border: '1px solid #D5E2E8', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, color: '#17222F', outline: 'none',
                  boxSizing: 'border-box', textAlign: 'center',
                }}
              />
            </div>

            {/* Итог */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 9, color: '#9AABB0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Итог</div>
              <div style={{
                padding: '5px 4px', fontSize: 13, fontWeight: 700,
                color: '#0C7A74', textAlign: 'center',
              }}>
                {total.toLocaleString('ru-RU')}
              </div>
            </div>
          </div>
      </>
    </div>
  );

  const calculator = (
    <div style={{
      height: '100%',
      minHeight: 176,
      background: '#fff',
      border: '1px solid #EEF2F6',
      borderRadius: 16,
      padding: 12,
      boxSizing: 'border-box',
      display: 'flex',
    }}>
      {leftPanel}
    </div>
  );

  const table = (
    <TimesheetTable
      schoolKey={schoolKey}
      globalDays={selectedDays.length}
      globalRate={rate}
      vehicleType={vehicleType}
      transferFilter={externalQuickTransfer}
      periodMonth={month}
      periodYear={year}
      onSummaryChange={onPayrollSummaryChange}
      payrollView={payrollSchoolTab}
    />
  );

  return (
    <FamiliesPage
      {...props}
      mode="payments"
      hidePeriodAll
      hidePeriodDeposit
      hideTransferBars
      hideDashboard
      compactPeriodBar
      customTopContent={renderPayrollHeader?.({ calculator })}
      initialQuickFilter={schoolKey ? { activeTab: schoolKey } : undefined}
      externalQuickTransfer={externalQuickTransfer}
      onPeriodKeyChange={setPeriodKey}
      onSchoolKeyChange={handleSchoolKeyChange}
      customTableContent={table}
      extraSchoolDockItems={extraSchoolDockItems}
      onSchoolsSidebarWidthChange={props.onSchoolsSidebarWidthChange}
    />
  );
}
