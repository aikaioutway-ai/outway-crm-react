export type LogisticsTab = 'table' | 'map' | 'drivers';
export default function LogisticsTabs({ value, onChange }: { school?: boolean; value: LogisticsTab; onChange: (value: LogisticsTab) => void }) {
  return <div role="tablist" aria-label="Раздел логистики" className="ow-seg">
    {([['table', 'Таблица'], ['map', 'Карта'], ['drivers', 'Водители']] as const).map(([key, label]) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-selected={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}
