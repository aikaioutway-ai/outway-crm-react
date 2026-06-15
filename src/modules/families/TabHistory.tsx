import React from 'react';
import { Section } from './DrawerUI';

interface AuditEntry {
  id: string; userName: string; action: string;
  field: string; oldValue: string; newValue: string; createdAt: string;
}

export default function TabHistory({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
      <div style={{ color: 'var(--text-2)', fontSize: 12 }}>История изменений пуста</div>
    </div>
  );

  return (
    <Section title={`История (${audit.length})`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {audit.map(entry => (
          <div key={entry.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{entry.action}</span>
              <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{entry.createdAt?.slice(0, 16).replace('T', ' ')}</span>
            </div>
            {entry.field && (
              <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 2 }}>
                <span style={{ fontWeight: 600 }}>{entry.field}</span>
              </div>
            )}
            {(entry.oldValue || entry.newValue) && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10 }}>
                {entry.oldValue && <span style={{ background: '#FFEBEE', color: '#C62828', borderRadius: 4, padding: '2px 6px' }}>{entry.oldValue.length > 60 ? entry.oldValue.slice(0, 60) + '...' : entry.oldValue}</span>}
                {entry.oldValue && entry.newValue && <span style={{ color: 'var(--text-2)' }}>→</span>}
                {entry.newValue && <span style={{ background: '#E8F5E9', color: '#2E7D32', borderRadius: 4, padding: '2px 6px' }}>{entry.newValue.length > 60 ? entry.newValue.slice(0, 60) + '...' : entry.newValue}</span>}
              </div>
            )}
            <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 4, fontWeight: 500 }}>👤 {entry.userName}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
