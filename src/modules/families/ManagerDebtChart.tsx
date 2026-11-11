import React from 'react';
import { useMonthlyChargeStats } from '../../hooks/useCrmQueries';
import type { FamilyListRow } from '../../services/crmV2Service';
import { money } from '../../utils/pricing';
import { ALL_PERIODS } from './constants';
import { managerFinancialStats } from './managerFinancialStats';
import type { SchoolStat } from './ManagerOverview';

interface Props {
  schools: SchoolStat[];
  rows: FamilyListRow[];
  periodKey: string;
  onSelectPeriod: (key: string) => void;
}

export default function ManagerDebtChart({ schools, rows, periodKey, onSelectPeriod }: Props) {
  const queries = useMonthlyChargeStats(ALL_PERIODS.map(period => period.key));
  const bars = [
    { key: 'ALL', label: 'Все', value: schools.reduce((sum, school) => sum + school.debtSum, 0), isError: false },
    ...ALL_PERIODS.map((period, index) => {
      const { data, isError } = queries[index];
      const value = data && managerFinancialStats(schools, rows, data, false)
        .reduce((sum, school) => sum + school.debtSum, 0);
      return { key: period.key, label: period.label, value, isError };
    }),
  ];
  const maximum = Math.max(1, ...bars.map(bar => bar.value ?? 0));

  return (
    <section className="manager-debt-chart" aria-label="Сумма долга по периодам">
      <h3>Сумма долга по периодам</h3>
      <div className="manager-debt-bars">
        {bars.map(period => {
          const { value, isError } = period;
          const formatted = value === undefined ? (isError ? 'Нет данных' : 'Загрузка…') : `${money(value)} сом`;
          const label = `${period.label} · ${formatted}`;
          return (
            <button type="button" key={period.key} aria-label={label} title={label}
              aria-pressed={periodKey === period.key} disabled={value === undefined}
              onClick={() => onSelectPeriod(period.key)}>
              <strong>{formatted}</strong>
              <span className="manager-debt-track" aria-hidden="true">
                <span style={{ height: `${100 * (value ?? 0) / maximum}%` }} />
              </span>
              <span>{period.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
