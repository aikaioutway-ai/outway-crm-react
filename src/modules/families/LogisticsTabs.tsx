import React from 'react';
import { BookUser, Car, Inbox, MapIcon } from 'lucide-react';
export type LogisticsTab = 'requests' | 'table' | 'map' | 'drivers';
export default function LogisticsTabs({ value, onChange }: { school?: boolean; value: LogisticsTab; onChange: (value: LogisticsTab) => void }) {
  return <div role="tablist" aria-label="Раздел логистики" className="ow-seg">
    {([['table', 'Справочник', BookUser], ['requests', 'Новые заявки', Inbox], ['map', 'Карта', MapIcon], ['drivers', 'Водители', Car]] as const).map(([key, label, Icon]) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-label={label} title={label} aria-selected={value === key} onClick={() => onChange(key)} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Icon size={18} aria-hidden="true" /></button>)}
  </div>;
}
