import React from 'react';
import { SCHOOL_TABS, SCHOOL_TIER_2_KEYS, isSchoolAllowed } from './constants';

interface Props {
  onSelectSchool: (key: string) => void;
  allowedSchools?: string[];
}

export default function HiddenSchoolsList({ onSelectSchool, allowedSchools }: Props) {
  const schools = SCHOOL_TABS.filter(school => SCHOOL_TIER_2_KEYS.includes(school.key) && isSchoolAllowed(school.key, allowedSchools));
  if (schools.length === 0) return null;
  return (
    <details style={{ position: 'relative', flexShrink: 0, alignSelf: 'center' }}>
      <summary aria-label="Скрытые школы" title="Скрытые школы" style={{ listStyle: 'none', cursor: 'pointer', fontSize: 22, fontWeight: 600, color: 'var(--text-2)', width: 36, height: 36, textAlign: 'center', lineHeight: '30px', borderRadius: 8, border: '1px solid var(--border)' }}>⋯</summary>
      <div style={{ position: 'absolute', right: 0, top: 42, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, minWidth: 200, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 24px #0002' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Скрытые школы</div>
        {schools.map(school => (
          <button key={school.key} type="button" onClick={() => onSelectSchool(school.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
            {school.logo && <img src={school.logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
            {school.label}
          </button>
        ))}
      </div>
    </details>
  );
}
