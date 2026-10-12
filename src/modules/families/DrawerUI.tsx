import React from 'react';

export function Section({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        minHeight: 33, marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.65 }}>
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

export function Spinner() {
  return <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-2)', fontSize: 12 }}>Загрузка...</div>;
}

export function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--text-2)', fontSize: 12 }}>{text}</div>;
}
