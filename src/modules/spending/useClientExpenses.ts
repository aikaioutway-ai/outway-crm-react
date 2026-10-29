import { useEffect, useState } from 'react';
import { fetchSpendingEntries } from '../../services/spendingService';
import { getCrmActor } from '../../services/crmActor';
import type { SpendingEntry } from './SpendingModule';

export function useClientExpenses(familyId: string) {
  const [state, setState] = useState<{ rows: SpendingEntry[]; error: string }>({ rows: [], error: '' });
  useEffect(() => {
    let revision = 0;
    let active = true;
    const read = async () => {
      const current = ++revision;
      try {
        const session = JSON.parse(localStorage.getItem('outway_auth_user') || 'null');
        if (session?.sessionToken) {
          const rows = await fetchSpendingEntries(session.sessionToken, familyId);
          if (active && current === revision) setState({ rows: rows.filter(row => row.category !== 'Личное'), error: '' });
          return;
        }
        const actor = getCrmActor();
        const raw: unknown = actor ? JSON.parse(localStorage.getItem(`outway-spending-v1:${actor}`) || '[]') : [];
        if (!Array.isArray(raw)) throw new Error('Invalid expenses');
        const rows = raw.filter((row): row is SpendingEntry => row && row.familyId === familyId && row.category !== 'Личное' && typeof row.id === 'string' && typeof row.subcategory === 'string' && typeof row.date === 'string' && Number.isFinite(row.amount) && row.amount > 0);
        setState({ rows, error: '' });
      } catch { if (active && current === revision) setState({ rows: [], error: 'Не удалось загрузить расходы на клиента из CRM.' }); }
    };
    read();
    window.addEventListener('storage', read);
    window.addEventListener('outway-spending-updated', read);
    return () => { active = false; window.removeEventListener('storage', read); window.removeEventListener('outway-spending-updated', read); };
  }, [familyId]);
  return state;
}
