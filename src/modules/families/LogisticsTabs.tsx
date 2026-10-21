export type LogisticsTab = 'table' | 'map' | 'schools' | 'drivers';
export default function LogisticsTabs({ value, onChange, school = false }: { school?: boolean; value: LogisticsTab; onChange: (value: LogisticsTab) => void }) {
  return <div role="tablist" aria-label="Раздел логистики" className="ow-seg">
    {([['table', 'Таблица'], ['map', 'Карта'], ['schools', 'Школы'], ['drivers', 'Водители']] as const).filter(([key]) => !school || key !== 'schools').map(([key, label]) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-selected={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}
