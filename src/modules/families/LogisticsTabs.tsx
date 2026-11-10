import React from 'react';
import { User, UserPlus, MapIcon } from 'lucide-react';
import DriverIcon from '../../core/icons/DriverIcon';
export type LogisticsTab = 'requests' | 'table' | 'map' | 'drivers';
export default function LogisticsTabs({ value, onChange }: { school?: boolean; value: LogisticsTab; onChange: (value: LogisticsTab) => void }) {
  return <div role="tablist" aria-label="Раздел логистики" className="ow-seg">
    {([['table', 'Справочник', User], ['requests', 'Новые заявки', UserPlus], ['map', 'Карта', MapIcon], ['drivers', 'Водители', DriverIcon]] as const).map(([key, label, Icon]) => <button key={key} type="button" role="tab" className="ow-seg-btn" aria-label={label} title={label} aria-selected={value === key} onClick={() => onChange(key)} style={{ minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}><Icon size={18} aria-hidden="true" /></button>)}
  </div>;
}
