import React, { useState } from 'react';
import { UserRole } from '../../types';
import type { SchoolDockItem } from '../families/SchoolDockSidebar';
import TimesheetPage from './TimesheetPage';
import { PayrollSchoolTab, TimesheetPayrollHeaderRenderArgs, TimesheetPayrollSummary } from './timesheetTypes';

export interface TimesheetModuleProps {
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
  adminFiltersOpen?: boolean;
  onAdminFiltersClose?: () => void;
  columnsOpen?: boolean;
  onColumnsOpenChange?: (v: boolean) => void;
  rightReserveWidth?: number;
  onSchoolsSidebarWidthChange?: (width: number) => void;
  moduleLabel?: string;
  tabs?: TimesheetTabConfig[];
  initialTab?: TimesheetTab;
  initialSchoolKey?: string;
  externalQuickTransfer?: string;
  onSchoolKeyChange?: (key: string) => void;
  onPayrollSummaryChange?: (summary: TimesheetPayrollSummary) => void;
  renderPayrollHeader?: (args: TimesheetPayrollHeaderRenderArgs) => React.ReactNode;
  payrollSchoolTab?: PayrollSchoolTab;
  extraSchoolDockItems?: SchoolDockItem[];
  hideHeaderControls?: boolean;
}

type TimesheetTab = 'microbus' | 'minivan' | 'office';

export interface TimesheetTabConfig {
  key: TimesheetTab;
  label: string;
}

const TABS: TimesheetTabConfig[] = [
  { key: 'microbus', label: 'Микроавтобусы' },
  { key: 'minivan',  label: 'Минивэн' },
  { key: 'office',   label: 'Офис' },
];

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 500,
    background: active ? '#fff' : 'transparent',
    color: active ? '#0C7A74' : '#7A8EA0',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.15s',
  };
}

export default function TimesheetModule(props: TimesheetModuleProps) {
  const tabs = props.tabs?.length ? props.tabs : TABS;
  const [tab, setTab] = useState<TimesheetTab>(props.initialTab ?? tabs[0].key);

  const rightReserveWidth = props.rightReserveWidth ?? 78;
  const moduleLabel = props.moduleLabel ?? 'Табель';
  const activeTab = tabs.some(item => item.key === tab) ? tab : tabs[0].key;
  const activeVehicleType = props.hideHeaderControls
    ? undefined
    : activeTab === 'microbus' ? 'microbus' : activeTab === 'minivan' ? 'minivan' : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Таб бар + кнопки подтверждения ── */}
      {!props.hideHeaderControls && <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px 0', paddingRight: rightReserveWidth, flexShrink: 0, gap: 8,
        transition: 'padding-right .18s ease',
      }}>
        {/* Табы */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--bg-2, #E8F4F3)', borderRadius: 12,
          padding: '4px 8px', flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#9AABB0',
            textTransform: 'uppercase', letterSpacing: 1,
            padding: '0 6px 0 2px', whiteSpace: 'nowrap',
          }}>{moduleLabel}</span>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(activeTab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>}

      {/* ── Контент ── */}
      <TimesheetPage {...props} vehicleType={activeVehicleType} />
    </div>
  );
}
