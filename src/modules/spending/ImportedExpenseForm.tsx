import React, { useState } from 'react';
import type { SpendingEntry } from './SpendingModule';
import AllRecordsButton from '../../core/dashboard/AllRecordsButton';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../costs/expenseTypes';

export default function ImportedExpenseForm({ entry, disabled, onSave, onCancel, onAllRecords }: {
  entry: SpendingEntry; disabled: boolean; onSave: (row: SpendingEntry) => boolean; onCancel: () => void; onAllRecords: () => void;
}) {
  const [draft, setDraft] = useState(entry);
  const field = (key: keyof SpendingEntry, value: string | number) => setDraft(current => {
    const next = { ...current, [key]: value };
    if (key === 'unitPrice' || key === 'quantity') next.amount = Math.round((next.unitPrice ?? next.amount) * (next.quantity ?? 1) * 100) / 100;
    return next;
  });
  return <form className="payment-composer payment-composer-inline" aria-label="Копия расхода из Финансов" onSubmit={event => { event.preventDefault(); onSave(draft); }}>
    <header className="payment-composer-head"><div className="payment-composer-title"><h2>Расход из Финансов</h2></div><AllRecordsButton label="Все записи" onClick={onAllRecords} /></header>
    <div className="payment-composer-body">
      <div className="payment-composer-main"><section className="payment-section"><h3>{EXPENSE_CATEGORIES[entry.originalCategory as ExpenseCategory]?.label || entry.category} · {entry.originalSubcategory || entry.subcategory}</h3><p>Редактируется отдельная копия. Исходная запись в «Финансах» сохраняется.</p>
        <div className="spending-fields">
          <label>Наименование<input required value={draft.description} onChange={event => field('description', event.target.value)} /></label>
          <label>Получатель<input value={draft.recipient} onChange={event => field('recipient', event.target.value)} /></label>
          <label>Цена, сом<input required type="number" min="0" step="0.01" value={draft.unitPrice ?? draft.amount} onChange={event => field('unitPrice', Number(event.target.value))} /></label>
          <label>Количество<input required type="number" min="0.01" step="0.01" value={draft.quantity ?? 1} onChange={event => field('quantity', Number(event.target.value))} /></label>
        </div>
      </section></div>
      <aside className="payment-composer-details"><section className="payment-section payment-requisites"><h3>Реквизиты выплаты</h3>
        <label>Дата<input required type="date" value={draft.date} onChange={event => field('date', event.target.value)} /></label>
        <label>Способ оплаты<select value={draft.method} onChange={event => field('method', event.target.value)}><option>Безналичные</option><option>Наличные</option></select></label>
        <label>Платёжное поручение<input value={draft.paymentOrderNumber || ''} onChange={event => field('paymentOrderNumber', event.target.value)} /></label>
        <label>Комментарий<textarea value={draft.comment || ''} onChange={event => field('comment', event.target.value)} /></label>
      </section></aside>
    </div>
    <footer className="payment-composer-footer"><strong>{draft.amount.toLocaleString('ru-RU')} сом</strong><div className="spending-actions"><button type="button" onClick={onCancel}>Отмена</button><button type="submit" className="spending-primary" disabled={disabled}>Сохранить</button></div></footer>
  </form>;
}
