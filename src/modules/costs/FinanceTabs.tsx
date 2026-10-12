import React from 'react';
import './FinanceTabs.css';
export type FinanceTab = 'expenses' | 'timesheet' | 'salary';
export default function FinanceTabs({ value, onChange, showExpenses, compact = false }: { value: FinanceTab; onChange: (value: FinanceTab) => void; showExpenses: boolean; compact?: boolean }) {
  return <div role="tablist" aria-label="Раздел финансов" style={{ display: 'flex', alignItems: 'center', gap: 2, height: 34, padding: 3, marginBottom: compact ? 8 : 0, flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxSizing: 'border-box' }}>
    {([['expenses', 'Расходы'], ['timesheet', 'Табель'], ['salary', 'Зарплата']] as const).filter(([key]) => showExpenses || key !== 'expenses').map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} style={{ height: 26, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: value === key ? 'var(--accent)' : 'transparent', color: value === key ? '#fff' : 'var(--text-2)', whiteSpace: 'nowrap' }}>{label}</button>)}
  </div>;
}
