import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchFinanceSnapshot } from '../../services/financeService';
import type { FinanceSnapshot } from '../../types';
import { money } from '../../utils/pricing';

type Tab = 'payments' | 'charges' | 'refunds';
type Summary = { familyId: string; snapshot: FinanceSnapshot };
const PAGE = 3;
const shortDate = (value?: string) => value?.slice(0, 10).split('-').reverse().join('.') || '—';

/**
 * Окно семьи при возврате и компенсациях: баланс, долг, начисления, платежи и прошлые возвраты.
 * walletChange — сколько спишется с баланса семьи при сохранении (для возврата родителю).
 */
export default function CompensationFamilyFinance({ familyId, walletChange, onOpenFamily, isNew = false }: { familyId: string; walletChange?: number; onOpenFamily?: () => void; isNew?: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>('payments');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    setPage(0);
    setSummary(null);
    fetchFinanceSnapshot(familyId).then(snapshot => {
      if (active) setSummary({ familyId, snapshot });
    }).catch(() => { if (active) setError('Не удалось загрузить баланс и историю платежей.'); });
    return () => { active = false; };
  }, [familyId]);
  if (error) return <p role="alert">{error}</p>;
  if (!summary || summary.familyId !== familyId) return <p role="status">Загрузка баланса и платежей…</p>;

  const { snapshot } = summary;
  const balance = snapshot.mainBalance ?? 0;
  const charges = [...(snapshot.charges ?? [])].sort((a, b) => b.year - a.year || b.periodMonth - a.periodMonth);
  const payments = [...(snapshot.payments ?? [])].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  const refunds = [...(snapshot.refunds ?? [])].sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
  const charged = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const debt = charges.reduce((sum, charge) => sum + charge.debtAmount, 0);
  const paid = payments.filter(payment => payment.status === 'Подтверждено').reduce((sum, payment) => sum + payment.amount, 0);
  const lists: Record<Tab, number> = { payments: payments.length, charges: charges.length, refunds: refunds.length };
  const pages = Math.max(1, Math.ceil(lists[tab] / PAGE));
  const slice = <T,>(items: T[]) => items.slice(page * PAGE, page * PAGE + PAGE);
  const switchTab = (next: Tab) => { setTab(next); setPage(0); };

  return <div className="compensation-family-finance">
    <div className="compensation-family-head">
      <h3>Финансы семьи</h3>
      {onOpenFamily && <button type="button" className="compensation-open-family" onClick={onOpenFamily}><ExternalLink size={14} aria-hidden="true" />Открыть карточку семьи</button>}
    </div>
    <dl className="compensation-family-stats">
      <div><dt>Баланс семьи:</dt><dd className={balance < 0 ? 'is-negative' : undefined}>{money(balance)} сом</dd></div>
      <div><dt>Долг</dt><dd className={debt > 0 ? 'is-negative' : undefined}>{money(debt)} сом</dd></div>
      <div><dt>Начислено</dt><dd>{money(charged)} сом</dd></div>
      <div><dt>Оплачено</dt><dd>{money(paid)} сом</dd></div>
    </dl>
    {walletChange !== undefined && <p className="compensation-wallet-change">{walletChange ? <>После сохранения с баланса семьи {walletChange > 0 ? 'спишется' : 'вернётся'} <strong>{money(Math.abs(walletChange))} сом</strong>. Баланс станет <strong>{money(balance - walletChange)} сом</strong>.</> : isNew ? 'Укажите сумму — после сохранения она спишется с баланса семьи.' : 'Сумма возврата уже списана с баланса семьи.'}</p>}
    <div className="compensation-family-tabs" role="tablist" aria-label="История семьи">
      {([['payments', 'Платежи'], ['charges', 'Начисления'], ['refunds', 'Возвраты']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => switchTab(key)}>{label} <span>{lists[key]}</span></button>)}
    </div>
    {tab === 'payments' && (payments.length ? <div className="spending-table-wrap"><table aria-label="История платежей семьи"><thead><tr><th>Дата</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{slice(payments).map(payment => <tr key={payment.id}><td>{shortDate(payment.paymentDate)}</td><td>{money(payment.amount)} сом</td><td>{payment.status}</td></tr>)}</tbody></table></div> : <p>Платежей пока нет</p>)}
    {tab === 'charges' && (charges.length ? <div className="spending-table-wrap"><table aria-label="Начисления семьи"><thead><tr><th>Период</th><th>Ребёнок</th><th>Начислено</th><th>Долг</th></tr></thead><tbody>{slice(charges).map(charge => <tr key={charge.id}><td>{String(charge.periodMonth).padStart(2, '0')}.{charge.year}</td><td>{charge.childName || '—'}</td><td>{money(charge.amount)} сом</td><td className={charge.debtAmount > 0 ? 'is-negative' : undefined}>{money(charge.debtAmount)} сом</td></tr>)}</tbody></table></div> : <p>Начислений пока нет</p>)}
    {tab === 'refunds' && (refunds.length ? <div className="spending-table-wrap"><table aria-label="Возвраты семьи"><thead><tr><th>Дата</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{slice(refunds).map(refund => <tr key={refund.id}><td>{shortDate(refund.requestedAt)}</td><td className="is-negative">−{money(refund.amount)} сом</td><td>{refund.status}</td></tr>)}</tbody></table></div> : <p>Возвратов пока нет</p>)}
    {lists[tab] > PAGE && <div className="spending-actions compensation-family-pager"><button type="button" aria-label={tab === 'payments' ? 'Предыдущие платежи' : 'Предыдущая страница'} disabled={page === 0} onClick={() => setPage(current => current - 1)}>←</button><span>{page + 1} / {pages}</span><button type="button" aria-label={tab === 'payments' ? 'Следующие платежи' : 'Следующая страница'} disabled={page + 1 >= pages} onClick={() => setPage(current => current + 1)}>→</button></div>}
  </div>;
}
