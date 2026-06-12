import React from 'react';

export function Section({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, paddingBottom: 7, borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, value, editMode, inputEl }: {
  label: string;
  value?: string | number | null;
  editMode?: boolean;
  inputEl?: React.ReactNode;
}) {
  if (!editMode && (value === undefined || value === null || value === '')) return null;
  return (
    <div style={{ display: 'flex', marginBottom: 10, gap: 8, alignItems: editMode ? 'center' : 'flex-start' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', minWidth: 160, flexShrink: 0 }}>{label}</span>
      {editMode && inputEl
        ? inputEl
        : <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value ?? '—'}</span>
      }
    </div>
  );
}

export function EInput({ value, onChange, type = 'text', placeholder }: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        flex: 1, padding: '5px 10px', border: '1px solid var(--border)',
        borderRadius: 6, fontSize: 13, fontWeight: 500, color: 'var(--text)',
        background: 'var(--bg)', outline: 'none',
      }}
    />
  );
}

export function ESelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, padding: '5px 10px', border: '1px solid var(--border)',
        borderRadius: 6, fontSize: 13, fontWeight: 500, color: 'var(--text)',
        background: 'var(--bg)', outline: 'none',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Tag({ label, color }: { label: string; color?: { bg: string; color: string } }) {
  return (
    <span style={{
      background: color?.bg ?? '#EEF2FF',
      color: color?.color ?? 'var(--accent)',
      borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

export function PriceCell({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

export function SummaryCard({ label, value, color, bg }: {
  label: string; value: string; color?: string; bg?: string;
}) {
  return (
    <div style={{
      flex: 1, background: bg ?? 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

export function Spinner() {
  return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-2)', fontSize: 13 }}>Загрузка...</div>;
}

export function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-2)', fontSize: 13 }}>{text}</div>;
}

export function SaveBtn({ onClick, saving, label = 'Сохранить изменения' }: {
  onClick: () => void;
  saving: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        width: '100%', padding: '12px', background: 'var(--accent)', color: '#fff',
        border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
        cursor: 'pointer', opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? 'Сохранение...' : label}
    </button>
  );
}
