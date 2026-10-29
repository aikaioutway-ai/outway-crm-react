import { useEffect, useState } from 'react';
import { getCrmActor } from '../../services/crmActor';
import type { SpendingEntry } from './SpendingModule';

export function useClientExpenses(familyId: string) {
  const [state, setState] = useState<{ rows: SpendingEntry[]; error: string }>({ rows: [], error: '' });
  useEffect(() => {
    const read = () => {
      try {
        const actor = getCrmActor();
        const raw: unknown = actor ? JSON.parse(localStorage.getItem(`outway-spending-v1:${actor}`) || '[]') : [];
        if (!Array.isArray(raw)) throw new Error('Invalid expenses');
        const rows = raw.filter((row): row is SpendingEntry => row && row.familyId === familyId && row.category !== 'Личное' && typeof row.id === 'string' && typeof row.subcategory === 'string' && typeof row.date === 'string' && Number.isFinite(row.amount) && row.amount > 0);
        setState({ rows, error: '' });
      } catch { setState({ rows: [], error: 'Не удалось загрузить расходы на клиента из этого браузера.' }); }
    };
    read();
    window.addEventListener('storage', read);
    window.addEventListener('outway-spending-updated', read);
    return () => { window.removeEventListener('storage', read); window.removeEventListener('outway-spending-updated', read); };
  }, [familyId]);
  return state;
}
