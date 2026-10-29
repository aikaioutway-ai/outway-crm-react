import React, { useEffect, useState } from 'react';
import { fetchFinanceSnapshot } from '../../services/financeService';
import type { FamilyPayment } from '../../types';
import { money } from '../../utils/pricing';

type Summary = { familyId: string; balance: number; payments: FamilyPayment[] };
export default function CompensationFamilyFinance({ familyId }: { familyId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    setPage(0);
    setSummary(null);
    fetchFinanceSnapshot(familyId).then(snapshot => {
      if (active) setSummary({ familyId, balance: snapshot.mainBalance ?? 0, payments: [...snapshot.payments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')) });
    }).catch(() => { if (active) setError('Не удалось загрузить баланс и историю платежей.'); });
    return () => { active = false; };
  }, [familyId]);
  if (error) return <p role="alert">{error}</p>;
  if (!summary || summary.familyId !== familyId) return <p role="status">Загрузка баланса и платежей…</p>;
  return <div className="compensation-family-finance"><p>Баланс семьи: <strong>{money(summary.balance)} сом</strong></p><h3>История платежей</h3>{summary.payments.length ? <div className="spending-table-wrap"><table aria-label="История платежей семьи"><thead><tr><th>Дата</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{summary.payments.slice(page * 3, page * 3 + 3).map(payment => <tr key={payment.id}><td>{payment.paymentDate?.slice(0, 10).split('-').reverse().join('.') || '—'}</td><td>{money(payment.amount)} сом</td><td>{payment.status}</td></tr>)}</tbody></table>{summary.payments.length > 3 && <div className="spending-actions"><button type="button" aria-label="Предыдущие платежи" disabled={page === 0} onClick={() => setPage(current => current - 1)}>←</button><span>{page + 1} / {Math.ceil(summary.payments.length / 3)}</span><button type="button" aria-label="Следующие платежи" disabled={(page + 1) * 3 >= summary.payments.length} onClick={() => setPage(current => current + 1)}>→</button></div>}</div> : <p>Платежей пока нет</p>}</div>;
}
