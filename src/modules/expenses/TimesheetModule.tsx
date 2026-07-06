import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { UserRole } from '../../types';
import TimesheetPage from './TimesheetPage';

interface Props {
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
  adminFiltersOpen?: boolean;
  onAdminFiltersClose?: () => void;
  columnsOpen?: boolean;
  onColumnsOpenChange?: (v: boolean) => void;
  rightReserveWidth?: number;
  onSchoolsSidebarWidthChange?: (width: number) => void;
}

type TimesheetTab = 'microbus' | 'minivan' | 'office';

interface Approval {
  by: string;
  at: string; // ISO
}

interface Approvals {
  gen_director?: Approval;
  director?: Approval;
  senior_logist?: Approval;
}

const TABS: { key: TimesheetTab; label: string }[] = [
  { key: 'microbus', label: 'Микроавтобусы' },
  { key: 'minivan',  label: 'Минивэн' },
  { key: 'office',   label: 'Офис' },
];

const APPROVAL_BUTTONS: {
  key: keyof Approvals;
  label: string;
  allowedRole: UserRole;
}[] = [
  { key: 'gen_director',  label: 'Ген. директор',       allowedRole: 'gen_director' },
  { key: 'director',      label: 'Управляющий',          allowedRole: 'director' },
  { key: 'senior_logist', label: 'Нач. логистики',       allowedRole: 'senior_logist' },
];

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

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

export default function TimesheetModule(props: Props) {
  const [tab, setTab]           = useState<TimesheetTab>('microbus');
  const [approvals, setApprovals] = useState<Approvals>({});

  const { userRole = 'admin', userName = '' } = props;
  const rightReserveWidth = props.rightReserveWidth ?? 78;

  function approve(key: keyof Approvals) {
    setApprovals(prev => ({
      ...prev,
      [key]: { by: userName || userRole, at: new Date().toISOString() },
    }));
  }

  function revoke(key: keyof Approvals) {
    setApprovals(prev => { const next = { ...prev }; delete next[key]; return next; });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Таб бар + кнопки подтверждения ── */}
      <div style={{
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
          }}>Табель</span>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Кнопки подтверждения */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {APPROVAL_BUTTONS.map(btn => {
            const approval = approvals[btn.key];
            const canApprove = userRole === 'admin' || userRole === btn.allowedRole;
            const approved = !!approval;

            return (
              <button
                key={btn.key}
                onClick={() => canApprove ? (approved ? revoke(btn.key) : approve(btn.key)) : undefined}
                title={approved ? `Подтверждено: ${approval!.by} · ${fmtTime(approval!.at)}\nКликните для отмены` : canApprove ? 'Нажмите для подтверждения' : 'Нет доступа'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 8, border: 'none',
                  cursor: canApprove ? 'pointer' : 'default',
                  background: approved ? '#ECFDF5' : '#F1F5F9',
                  color: approved ? '#059669' : '#9AABB0',
                  fontSize: 11, fontWeight: 700,
                  transition: 'all 0.15s',
                  boxShadow: approved ? '0 0 0 1px #A7F3D0' : '0 0 0 1px #E2E8F0',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  background: approved ? '#059669' : (canApprove ? '#D1FAE5' : '#E2E8F0'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {approved && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
                <span>{btn.label}</span>
                {approved && (
                  <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 500 }}>
                    {fmtTime(approval!.at)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Контент ── */}
      {tab === 'microbus' ? (
        <TimesheetPage {...props} vehicleType="microbus" />
      ) : tab === 'minivan' ? (
        <TimesheetPage {...props} vehicleType="minivan" />
      ) : tab === 'office' ? (
        <TimesheetPage {...props} />
      ) : null}
    </div>
  );
}
