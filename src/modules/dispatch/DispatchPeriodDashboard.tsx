import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, ListChecks, Sunrise, Sunset } from 'lucide-react';
import { DashboardTopPanel, KpiChip } from '../../core/dashboard/DashboardUI';
import { fetchRunsHistory, RunDirection, RunsHistorySummary, RunStatus, todayBishkek } from '../../services/transferRunService';

const STATUS_LABEL: Record<RunStatus, string> = {
  not_started: 'Не начат',
  active: 'В пути',
  finished: 'Завершён',
  cancelled: 'Отменён',
};

const DIRECTION_LABEL: Record<RunDirection, string> = { morning: 'Утро', evening: 'Вечер' };

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' });
}

function monthBounds(monthValue: string): { from: string; to: string; daysInMonth: number } {
  const [year, month] = monthValue.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(daysInMonth)}`,
    daysInMonth,
  };
}

export default function DispatchPeriodDashboard() {
  const today = todayBishkek();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string>('');
  const [summary, setSummary] = useState<RunsHistorySummary | null>(null);

  const { from, to } = useMemo(() => {
    const bounds = monthBounds(month);
    if (day) {
      const dayDate = `${month}-${day.padStart(2, '0')}`;
      return { from: dayDate, to: dayDate };
    }
    return { from: bounds.from, to: bounds.to };
  }, [month, day]);

  const daysInMonth = useMemo(() => monthBounds(month).daysInMonth, [month]);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    fetchRunsHistory({ from, to }).then(data => { if (!cancelled) setSummary(data); }).catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [from, to]);

  return (
    <div style={{ flex: 1, minHeight: 0, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DashboardTopPanel className="dashboard-control-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            Месяц
            <input
              type="month"
              value={month}
              onChange={event => { setMonth(event.target.value); setDay(''); }}
              style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-light, #ddd)' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            День
            <select
              value={day}
              onChange={event => setDay(event.target.value)}
              style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-light, #ddd)' }}
            >
              <option value="">Весь месяц</option>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        {summary && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <KpiChip icon={<ListChecks size={17} color="#fff" />} label="Всего рейсов" value={String(summary.totalRuns)} color="#626C8B" />
            <KpiChip icon={<CalendarCheck size={17} color="#fff" />} label="Завершено" value={String(summary.finishedRuns)} color="var(--success)" />
            <KpiChip icon={<CalendarClock size={17} color="#fff" />} label="В пути" value={String(summary.activeRuns)} color="#1D6FA4" />
            <KpiChip icon={<Sunrise size={17} color="#fff" />} label="Утренних" value={String(summary.morningRuns)} color="#BA7517" />
            <KpiChip icon={<Sunset size={17} color="#fff" />} label="Вечерних" value={String(summary.eveningRuns)} color="#993556" />
          </div>
        )}
      </DashboardTopPanel>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#fff', borderRadius: 14 }}>
        {summary === null ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>
        ) : summary.rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>За выбранный период рейсов не найдено</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 16px' }}>Дата</th>
                <th style={{ padding: '8px 16px' }}>Школа</th>
                <th style={{ padding: '8px 16px' }}>Трансфер</th>
                <th style={{ padding: '8px 16px' }}>Направление</th>
                <th style={{ padding: '8px 16px' }}>Водитель</th>
                <th style={{ padding: '8px 16px' }}>Выезд</th>
                <th style={{ padding: '8px 16px' }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row, index) => (
                <tr key={row.id} style={{ background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{row.runDate}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{row.schoolLabel}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>#{row.transferNumber}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{DIRECTION_LABEL[row.direction]}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{row.driverName || '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{formatTime(row.startedAt)}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>{STATUS_LABEL[row.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
