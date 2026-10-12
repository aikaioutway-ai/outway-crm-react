export type LogisticsTab = 'table' | 'map' | 'schools' | 'drivers';
export default function LogisticsTabs({ value, onChange, school = false }: { school?: boolean; value: LogisticsTab; onChange: (value: LogisticsTab) => void }) {
  return <div role="tablist" aria-label="Раздел логистики" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: 0, flexShrink: 0, boxSizing: 'border-box' }}>
    {([['table', 'Таблица'], ['map', 'Карта'], ['schools', 'Школы'], ['drivers', 'Водители']] as const).filter(([key]) => !school || key !== 'schools').map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} style={{ height: 34, padding: '0 14px', border: value === key ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 9, background: value === key ? 'var(--accent)' : '#fff', color: value === key ? '#fff' : 'var(--text-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>)}
  </div>;
}
