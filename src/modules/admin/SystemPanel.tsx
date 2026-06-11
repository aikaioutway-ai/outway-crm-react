// src/modules/admin/SystemPanel.tsx
// Панель системных операций — только для Админа/Директора
// Вызов Edge Functions: автоначисления и синхронизация из Google Таблицы

import React, { useState } from 'react';

const SUPABASE_URL = 'https://mmcxugtxnfsafgxbpbix.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0JXvCHTIc984oEoFBloemQ_kCgDF6Bb';

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
  { value: 9, label: 'Сентябрь 2026' },
  { value: 10, label: 'Октябрь 2026' },
  { value: 11, label: 'Ноябрь 2026' },
  { value: 12, label: 'Декабрь 2026' },
  { value: 1, label: 'Январь 2027' },
  { value: 2, label: 'Февраль 2027' },
  { value: 3, label: 'Март 2027' },
  { value: 4, label: 'Апрель 2027' },
];

export default function SystemPanel() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [loading, setLoading] = useState<null | 'charges' | 'sync'>(null);
  const [result, setResult]   = useState<Result | null>(null);

  async function callFunction(name: string, body?: object): Promise<Result> {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    return res.json();
  }

  async function handleCharges() {
    setLoading('charges');
    setResult(null);
    try {
      const r = await callFunction('monthly-charges', { month, year });
      setResult(r);
    } catch (e: any) {
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(null);
    }
  }

  async function handleSync() {
    setLoading('sync');
    setResult(null);
    try {
      const r = await callFunction('sync-google-sheets');
      setResult(r);
    } catch (e: any) {
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 640 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>
        Системные операции
      </h2>

      {/* ── Автоначисления ── */}
      <section style={cardStyle}>
        <div style={cardHeader}>
          <span style={iconBox}>💳</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
              Создать начисления за месяц
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Автоматически создаётся 1-го числа. Здесь — запуск вручную.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            style={selectStyle}
          >
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={handleCharges}
            disabled={loading !== null}
            style={loading === 'charges' ? { ...btnStyle, opacity: 0.6 } : btnStyle}
          >
            {loading === 'charges' ? 'Создаю...' : 'Создать начисления'}
          </button>
        </div>
      </section>

      {/* ── Синхронизация Google Таблицы ── */}
      <section style={{ ...cardStyle, marginTop: 16 }}>
        <div style={cardHeader}>
          <span style={iconBox}>📋</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
              Синхронизировать из Google Таблицы
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Автоматически каждые 30 минут. Здесь — запуск вручную.
              <br />Дубли пропускаются, новые семьи создаются сразу.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            onClick={handleSync}
            disabled={loading !== null}
            style={loading === 'sync' ? { ...btnStyle, opacity: 0.6 } : btnStyle}
          >
            {loading === 'sync' ? 'Синхронизирую...' : 'Запустить синхронизацию'}
          </button>
        </div>
      </section>

      {/* ── Результат ── */}
      {result && (
        <div style={{
          marginTop: 16,
          padding: '14px 16px',
          borderRadius: 8,
          background: result.ok ? '#E8F5E9' : '#FFEBEE',
          border: `1px solid ${result.ok ? '#C8E6C9' : '#FFCDD2'}`,
        }}>
          <div style={{
            fontWeight: 700,
            fontSize: 14,
            color: result.ok ? '#1B5E20' : '#B71C1C',
            marginBottom: 6,
          }}>
            {result.ok ? '✅ ' : '❌ '}{result.message ?? result.error}
          </div>

          {result.created !== undefined && (
            <div style={statRow}>
              <span style={statLabel}>Создано начислений:</span>
              <span style={statVal}>{result.created}</span>
            </div>
          )}
          {result.imported !== undefined && (
            <div style={statRow}>
              <span style={statLabel}>Импортировано семей:</span>
              <span style={statVal}>{result.imported}</span>
            </div>
          )}
          {result.skipped !== undefined && (
            <div style={statRow}>
              <span style={statLabel}>Пропущено (дубли):</span>
              <span style={statVal}>{result.skipped}</span>
            </div>
          )}

          {result.errors?.length && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#B71C1C', marginBottom: 4 }}>
                Ошибки:
              </div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: '#C62828' }}>• {e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Расписание ── */}
      <section style={{ ...cardStyle, marginTop: 16, background: '#F8F9FF' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
          📅 Расписание автоматических задач
        </div>
        <div style={scheduleRow}>
          <span style={scheduleTime}>1-го числа, 06:00</span>
          <span style={scheduleDesc}>Создание начислений за новый месяц</span>
        </div>
        <div style={scheduleRow}>
          <span style={scheduleTime}>Каждые 30 минут</span>
          <span style={scheduleDesc}>Синхронизация новых заявок из Google Таблицы</span>
        </div>
        <div style={scheduleRow}>
          <span style={scheduleTime}>6-го числа, 00:01</span>
          <span style={scheduleDesc}>Пометка просроченных платежей (пеня +100 сом/день)</span>
        </div>
      </section>
    </div>
  );
}

// ─── Стили ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '16px 18px',
};

const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
};

const iconBox: React.CSSProperties = {
  fontSize: 22,
  lineHeight: 1,
  marginTop: 2,
};

const btnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  padding: '9px 18px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text)',
  background: '#fff',
  cursor: 'pointer',
};

const statRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 13,
  marginBottom: 2,
};

const statLabel: React.CSSProperties = {
  color: '#2E7D32',
  fontWeight: 500,
};

const statVal: React.CSSProperties = {
  fontWeight: 700,
  color: '#1B5E20',
};

const scheduleRow: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  fontSize: 12,
  marginBottom: 5,
};

const scheduleTime: React.CSSProperties = {
  fontWeight: 700,
  color: 'var(--accent)',
  minWidth: 140,
};

const scheduleDesc: React.CSSProperties = {
  color: 'var(--text-2)',
};
