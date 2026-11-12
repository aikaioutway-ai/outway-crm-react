import { microbusAverageTone } from './familiesRowHelpers';
import React from 'react';
import { User, UserPlus, MapIcon } from 'lucide-react';
import DriverIcon from '../../core/icons/DriverIcon';
export type LogisticsTab = 'requests' | 'table' | 'map' | 'drivers';
type Metric = { label: string; value: string | number; alert?: boolean; average?: boolean };
type Summaries = Partial<Record<LogisticsTab, Metric[]>>;

const tabs = [
  ['table', 'Справочник', User],
  ['requests', 'Новые заявки', UserPlus],
  ['map', 'Карта', MapIcon],
  ['drivers', 'Водители', DriverIcon],
] as const;

export default function LogisticsTabs({ value, onChange, cards = false, showMap = !cards, summaries }: {
  school?: boolean;
  cards?: boolean;
  showMap?: boolean;
  summaries?: Summaries;
  value: LogisticsTab;
  onChange: (value: LogisticsTab) => void;
}) {
  return <div role="tablist" aria-label="Раздел логистики" className={cards ? 'manager-mode-cards' : 'ow-seg'}>
    {(cards && showMap ? [tabs[2], tabs[0], tabs[1], tabs[3]] : tabs.filter(([key]) => showMap || key !== 'map')).map(([key, label, Icon]) => {
      const metrics = summaries?.[key] ?? [];
      const newCount = key === 'requests' ? Number(metrics[0]?.value ?? 0) : 0;
      return <button key={key} type="button" role="tab" className={cards ? 'manager-mode-card' : 'ow-seg-btn'}
        aria-label={label} title={label} aria-selected={value === key} onClick={() => onChange(key)}
        style={cards ? undefined : { minWidth: 44, minHeight: 36, display: 'grid', placeItems: 'center' }}>
        <Icon size={18} aria-hidden="true" />
        {cards && <span className="manager-mode-title">{label}</span>}
        {cards && newCount > 0 && <span className="manager-mode-count" aria-hidden="true">{newCount}</span>}
        {cards && metrics.length > 0 && <span className="manager-mode-metrics">
          {metrics.map(metric => <span className={metric.average ? 'manager-mode-metric logistics-average' : 'manager-mode-metric'} key={metric.label}>
            <span>{metric.label}</span>
            <strong data-tone={metric.average ? microbusAverageTone(metric.value) ?? 'neutral' : metric.alert ? 'alert' : undefined}>{metric.value.toLocaleString('ru-RU')}</strong>
          </span>)}
        </span>}
      </button>;
    })}
  </div>;
}
