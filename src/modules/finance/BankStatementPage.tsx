import React, { useEffect, useState } from 'react';
import { Upload, RefreshCw, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import {
  BankStatementEntry,
  fetchBankStatements,
  parseBankCsv,
  parseBankXlsx,
  uploadBankStatement,
} from '../../services/bankStatementService';

interface Props {
  userName?: string;
}

const STATUS_LABEL: Record<string, string> = {
  matched:   'Совпало',
  conflict:  'Расхождение',
  unmatched: 'Не найдено',
  manual:    'Вручную',
};

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  matched:   { bg: '#D1FAE5', color: '#065F46' },
  conflict:  { bg: '#FEE2E2', color: '#991B1B' },
  unmatched: { bg: '#F3F4F6', color: '#374151' },
  manual:    { bg: '#EDE9FE', color: '#5B21B6' },
};

export default function BankStatementPage({ userName = 'Кассир' }: Props) {
  const [entries, setEntries] = useState<BankStatementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchBankStatements({ limit: 500 });
      setEntries(data);
    } catch (e: any) {
      setMsg(e?.message ?? 'Не удалось загрузить выписки');
    }
    setLoading(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setMsg('');
    try {
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      let rows;
      if (isXlsx) {
        const buffer = await file.arrayBuffer();
        rows = parseBankXlsx(buffer);
      } else {
        const text = await file.text();
        rows = parseBankCsv(text);
      }
      if (!rows.length) {
        setMsg('Не удалось распознать строки в файле. Проверьте формат.');
        setUploading(false);
        return;
      }
      const result = await uploadBankStatement(rows, userName);
      setMsg(
        `Новых строк: ${result.inserted} (дублей пропущено: ${result.skipped}). ` +
        `Совпало: ${result.matched}. ` +
        `Расхождений: ${result.conflicts}. ` +
        `Не найдено: ${result.inserted - result.matched - result.conflicts}. ` +
        (result.retriggered > 0 ? `Ретросверка нашла старых: ${result.retriggered}.` : '')
      );
      await load();
    } catch (err: any) {
      setMsg(err?.message ?? 'Ошибка при загрузке выписки');
    }
    setUploading(false);
  }

  const filtered = filterStatus === 'all'
    ? entries
    : entries.filter(e => e.match_status === filterStatus);

  const counts = {
    matched:   entries.filter(e => e.match_status === 'matched').length,
    conflict:  entries.filter(e => e.match_status === 'conflict').length,
    unmatched: entries.filter(e => e.match_status === 'unmatched').length,
    manual:    entries.filter(e => e.match_status === 'manual').length,
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Банковская выписка</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
            Загрузите CSV-выписку из банка — CRM автоматически сверит коды и суммы
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={load}
            style={btnStyle}
            disabled={loading}
          >
            <RefreshCw size={14} />
            Обновить
          </button>
          <label style={{ ...btnStyle, cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>
            {uploading ? 'Загружаем...' : <><Upload size={14} /> Загрузить выписку</>}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {msg && (
        <div style={{
          background: msg.includes('Ошибка') || msg.includes('Не удалось') ? '#FEE2E2' : '#D1FAE5',
          color: msg.includes('Ошибка') || msg.includes('Не удалось') ? '#991B1B' : '#065F46',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600,
        }}>
          {msg}
        </div>
      )}

      {/* Счётчики статусов */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'matched', 'conflict', 'unmatched', 'manual'] as const).map(s => {
          const count = s === 'all' ? entries.length : counts[s as keyof typeof counts];
          const style = s !== 'all' ? STATUS_COLOR[s] : { bg: '#F3F4F6', color: '#374151' };
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: filterStatus === s ? (s === 'all' ? '#312E81' : style.bg) : '#F9FAFB',
                color: filterStatus === s ? (s === 'all' ? '#fff' : style.color) : '#6B7280',
                outline: filterStatus === s ? `2px solid ${s === 'all' ? '#312E81' : style.color}` : 'none',
              }}
            >
              {s === 'all' ? 'Все' : STATUS_LABEL[s]} ({count})
            </button>
          );
        })}
      </div>

      {/* Подсказка по формату */}
      <div style={{ background: '#F8F9FF', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--text-2)' }}>
        <b>Поддерживаемые форматы:</b>&nbsp;
        <b>.xlsx</b> — выписка ДемирБанка (колонки: Дата операции, Оборот Кт, Назначение платежа — код MBIZ_S_ извлекается автоматически).&nbsp;
        <b>.csv / .tsv</b> — произвольный CSV с колонками: код транзакции, сумма, дата.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)' }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)', fontSize: 13 }}>
          {filterStatus === 'all' ? 'Выписок пока нет. Загрузите CSV-файл.' : 'Нет записей с этим статусом.'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F9FF', borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Код транзакции</th>
                <th style={{ ...th, textAlign: 'right' }}>Сумма</th>
                <th style={th}>Дата в выписке</th>
                <th style={th}>Статус сверки</th>
                <th style={th}>Загружено</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const sc = STATUS_COLOR[entry.match_status] ?? STATUS_COLOR.unmatched;
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#374151' }}>
                      {entry.receipt_code}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                      {Number(entry.amount).toLocaleString('ru-RU')} сом
                    </td>
                    <td style={td}>{entry.statement_date}</td>
                    <td style={td}>
                      <span style={{ ...sc, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {entry.match_status === 'matched' && <CheckCircle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {entry.match_status === 'conflict' && <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {entry.match_status === 'unmatched' && <HelpCircle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {STATUS_LABEL[entry.match_status] ?? entry.match_status}
                      </span>
                    </td>
                    <td style={{ ...td, color: 'var(--text-2)', fontSize: 11 }}>
                      {new Date(entry.uploaded_at).toLocaleDateString('ru-RU')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 8,
  background: '#fff', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5,
};

const td: React.CSSProperties = {
  padding: '10px 12px', color: 'var(--text)',
};
