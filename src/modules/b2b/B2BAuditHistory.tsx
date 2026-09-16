import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { B2BAuditRecord, fetchB2BAudit } from '../../services/b2bDataService';

const ACTION_LABELS: Record<string, string> = {
  create: 'Создание', update: 'Редактирование', status_change: 'Изменение статуса',
  payment_create: 'Добавлена оплата', payment_update: 'Изменена оплата', payment_status: 'Статус оплаты',
  payout_create: 'Добавлена выплата водителю', payout_update: 'Изменена выплата водителю',
  expense_create: 'Добавлен расход', expense_update: 'Изменён расход', assignment_update: 'Изменён водитель',
};

function preview(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key}: ${String(item ?? '—')}`).join(' · ');
  return String(value);
}

export default function B2BAuditHistory({ entityId, refreshKey = 0 }: { entityId: string; refreshKey?: number }) {
  const [entries, setEntries] = useState<B2BAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchB2BAudit(entityId).then(rows => { if (active) setEntries(rows); }).catch(() => {
      if (active) setEntries([]);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityId, refreshKey]);

  if (loading) return <div className="b2b-audit-empty">Загрузка истории…</div>;
  if (!entries.length) return <div className="b2b-audit-empty"><Clock3 size={28} /><strong>История изменений пуста</strong><span>Новые действия появятся здесь автоматически.</span></div>;

  return <div className="b2b-audit-list">{entries.map(entry => {
    const oldValue = preview(entry.oldValue);
    const newValue = preview(entry.newValue);
    return <article key={entry.id}>
      <span className="b2b-audit-icon"><Clock3 size={15} /></span>
      <div><header><strong>{ACTION_LABELS[entry.action] ?? entry.action}</strong><time>{entry.createdAt.slice(0, 16).replace('T', ' ')}</time></header>
        <small>{entry.entityType}{entry.comment ? ` · ${entry.comment}` : ''}</small>
        {(oldValue || newValue) && <p>{oldValue && <del>{oldValue}</del>}{oldValue && newValue && <b>→</b>}{newValue && <ins>{newValue}</ins>}</p>}
        <footer>{entry.actorName}</footer>
      </div>
    </article>;
  })}</div>;
}
