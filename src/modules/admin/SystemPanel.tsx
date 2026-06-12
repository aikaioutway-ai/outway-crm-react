import React, { useState } from 'react';
import { supabase } from '../../services/supabase';

interface Result {
  ok: boolean;
  message?: string;
  created?: number;
  imported?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
}

const MONTHS = [
  { value: 9,  label: 'Сентябрь 2026' }, { value: 10, label: 'Октябрь 2026' },
  { value: 11, label: 'Ноябрь 2026' },   { value: 12, label: 'Декабрь 2026' },
  { value: 1,  label: 'Январь 2027' },   { value: 2,  label: 'Февраль 2027' },
  { value: 3,  label: 'Март 2027' },     { value: 4,  label: 'Апрель 2027' },
];

async function callEdgeFunction(name: string, body?: object): Promise<Result> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) return { ok: false, error: error.message };
  return data;
}

export default function SystemPanel() {
  const now = new Date();
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState<null | 'charges' | 'sync'>(null);
  const [result, setResult]   = useState<Result | null>(null);

  async function run(type: 'charges' | 'sync') {
    setLoading(type);
    setResult(null);
    try {
      const r = type === 'charges'
        ? await callEdgeFunction('monthly-charges', { month, year: month >= 9 ? 2026 : 2027 })
        : await callEdgeFunction('sync-google-sheets');
      setResult(r);
    } catch (e: any) {
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 640 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>Системные операции</h2>

      <Card icon="💳" title="Создать начисления за месяц" desc="Автоматически создаётся 1-го числа. Здесь — запуск вручную.">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <Btn onClick={() => run('charges')} loading={loading === 'charges'} label="Создать начисления" />
        </div>
      </Card>

      <Card icon="📋" title="Синхронизировать из Google Таблицы" desc="Автоматически каждые 30 минут. Дубли пропускаются, новые семьи создаются сразу.">
        <div style={{ marginTop: 14 }}>
          <Btn onClick={() => run('sync')} loading={loading === 'sync'} label="Запустить синхронизацию" />
        </div>
      </Card>

      {result && (
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 8, background: result.ok ? '#E8F5E9' : '#FFEBEE', border: `1px solid ${result.ok ? '#C8E6C9' : '#FFCDD2'}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: result.ok ? '#1B5E20' : '#B71C1C', marginBottom: 6 }}>
            {result.ok ? '✅ ' : '❌ '}{result.message ?? result.error}
          </div>
          {result.created  !== undefined && <Stat label="Создано начислений:" value={result.created} />}
          {result.imported !== undefined && <Stat label="Импортировано семей:" value={result.imported} />}
          {result.skipped  !== undefined && <Stat label="Пропущено (дубли):"  value={result.skipped} />}
          {!!result.errors?.length && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#B71C1C', marginBottom: 4 }}>Ошибки:</div>
              {result.errors.map((e, i) => <div key={i} style={{ fontSize: 11, color: '#C62828' }}>• {e}</div>)}
            </div>
          )}
        </div>
      )}

      <Card icon="📅" title="Расписание автоматических задач" desc="">
        <Schedule time="1-го числа, 06:00"    desc="Создание начислений за новый месяц" />
        <Schedule time="Каждые 30 минут"       desc="Синхронизация новых заявок из Google Таблицы" />
        <Schedule time="6-го числа, 00:01"    desc="Пометка просроченных платежей (+100 сом/день)" />
      </Card>
    </div>
  );
}

// ─── Мелкие компоненты ───────────────────────────────────────────────────────

function Card({ icon, title, desc, children }: { icon: string; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 22, lineHeight: 1, marginTop: 2 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{title}</div>
          {desc && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Btn({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: loading ? 0.6 : 1 }}>
      {loading ? 'Загрузка...' : label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
      <span style={{ color: '#2E7D32', fontWeight: 500 }}>{label}</span>
      <span style={{ fontWeight: 700, color: '#1B5E20' }}>{value}</span>
    </div>
  );
}

function Schedule({ time, desc }: { time: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 5 }}>
      <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 140 }}>{time}</span>
      <span style={{ color: 'var(--text-2)' }}>{desc}</span>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px',
  fontSize: 13, color: 'var(--text)', background: '#fff', cursor: 'pointer',
};
