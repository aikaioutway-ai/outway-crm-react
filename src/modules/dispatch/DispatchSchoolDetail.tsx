import { useEffect, useState } from 'react';
import { MapPin, Sunrise, Sunset } from 'lucide-react';
import { fetchRunStops, fetchSchoolRuns, RunStatus, SchoolTransferRunRow, TransferRun } from '../../services/transferRunService';

interface DispatchSchoolDetailProps {
  schoolKey: string;
  schoolLabel: string;
  onOpenMap: (runId: string, transferNumber: number) => void;
}

const POLL_MS = 20_000;

const STATUS_LABEL: Record<RunStatus, string> = {
  not_started: 'Ещё не вышел',
  active: 'В пути',
  finished: 'Завершён',
  cancelled: 'Отменён',
};

const STATUS_COLOR: Record<RunStatus, string> = {
  not_started: '#EF7168',
  active: 'var(--success)',
  finished: '#626C8B',
  cancelled: '#B45309',
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' });
}

function StopsProgressBadge({ runId }: { runId: string }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchRunStops(runId)
        .then(stops => {
          if (cancelled) return;
          const done = stops.filter(s => s.status === 'done' || s.status === 'skipped').length;
          setProgress({ done, total: stops.length });
        })
        .catch(() => { if (!cancelled) setProgress(null); });
    };
    load();
    const timer = window.setInterval(load, 20_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [runId]);

  if (!progress || progress.total === 0) return null;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: progress.done === progress.total ? 'var(--success)' : 'var(--text-2)' }}>
      Забрано {progress.done} из {progress.total}
    </span>
  );
}

function DirectionCell({ run, onOpenMap, transferNumber }: { run: TransferRun | null; onOpenMap: (runId: string, transferNumber: number) => void; transferNumber: number }) {
  const status = run?.status ?? 'not_started';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Выезд: {formatTime(run?.startedAt ?? null)}</span>
      {run && (run.status === 'active' || run.status === 'finished') && (
        <>
          <button
            onClick={() => onOpenMap(run.id, transferNumber)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#1D6FA4', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 'fit-content' }}
          >
            <MapPin size={13} /> Геоданные
          </button>
          <StopsProgressBadge runId={run.id} />
        </>
      )}
    </div>
  );
}

export default function DispatchSchoolDetail({ schoolKey, schoolLabel, onOpenMap }: DispatchSchoolDetailProps) {
  const [rows, setRows] = useState<SchoolTransferRunRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    const load = () => {
      fetchSchoolRuns(schoolKey).then(data => { if (!cancelled) setRows(data); }).catch(() => { if (!cancelled) setRows([]); });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [schoolKey]);

  if (rows === null) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', fontSize: 15, fontWeight: 700 }}>
        {schoolLabel}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>У этой школы нет активных трансферов</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase' }}>
              <th style={{ padding: '8px 16px' }}>Трансфер</th>
              <th style={{ padding: '8px 16px' }}>Водитель</th>
              <th style={{ padding: '8px 16px' }}><Sunrise size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Утро</th>
              <th style={{ padding: '8px 16px' }}><Sunset size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Вечер</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.transferId} style={{ background: index % 2 === 1 ? 'var(--surface-2)' : undefined }}>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>#{row.transferNumber}</td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{row.driverName || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <DirectionCell run={row.morning} onOpenMap={onOpenMap} transferNumber={row.transferNumber} />
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <DirectionCell run={row.evening} onOpenMap={onOpenMap} transferNumber={row.transferNumber} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
