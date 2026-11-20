import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useFamilySearch } from '../../hooks/useCrmQueries';
import { IncomingReceiptRow, updateIncomingReceipt } from '../../services/incomingReceiptService';
import { phoneQueryDigits } from '../../utils/format';
import { isSchoolAllowed } from '../families/constants';
import '../families/paymentDecisionModal.css';

export default function ReceiptReviewModal({ receipt, sessionToken, allowedSchools, onSaved, onClose }: {
  receipt: IncomingReceiptRow;
  sessionToken?: string;
  allowedSchools?: string[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(receipt.amount ? String(receipt.amount) : '');
  const [date, setDate] = useState(receipt.receiptDate ?? '');
  const [query, setQuery] = useState(receipt.familyId ? '' : receipt.senderPhone?.slice(-9) ?? '');
  const [debounced, setDebounced] = useState(query);
  const [family, setFamily] = useState(receipt.familyId ? { id: receipt.familyId, name: receipt.parentName ?? receipt.familyId } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const digits = phoneQueryDigits(debounced) ?? '';
  const search = useFamilySearch(digits ? '' : debounced.trim().toLowerCase(), digits);
  const families = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; phone: string; children: string[] }>();
    (search.data ?? [])
      .filter(hit => isSchoolAllowed(hit.branchFilter, allowedSchools, '1.0') || isSchoolAllowed(hit.branchFilter, allowedSchools, '2.0'))
      .forEach(hit => {
        const item = grouped.get(hit.familyId) ?? { id: hit.familyId, name: hit.parentName || hit.familyId, phone: hit.phone, children: [] };
        item.children.push(hit.transferNumber ? `${hit.childName}, трансфер ${hit.transferNumber}` : hit.childName);
        grouped.set(hit.familyId, item);
      });
    return Array.from(grouped.values()).slice(0, 8);
  }, [search.data, allowedSchools]);

  const amountValue = Number(amount);
  const canSave = Boolean(family && date && Number.isFinite(amountValue) && amountValue > 0);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || busy) return;
    setBusy(true);
    setError('');
    try {
      await updateIncomingReceipt(sessionToken, receipt.id, { familyId: family!.id, amount: amountValue, receiptDate: date });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить чек');
      setBusy(false);
    }
  }

  return createPortal(<div className="ow-overlay payment-decision-overlay"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="ow-modal payment-decision" role="dialog" aria-modal="true" aria-label="Разбор чека" onSubmit={save}>
      <header className="ow-modal-head">
        <div><h3>Разбор чека</h3><span>{receipt.chatName ?? 'Группа WhatsApp'}</span></div>
        <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={18} /></button>
      </header>
      <div className="payment-decision-body">
        <div className="receipts-review-grid">
          <label className="payment-decision-field">Сумма
            <input type="number" min="0.01" step="any" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} />
          </label>
          <label className="payment-decision-field">Дата чека
            <input type="date" value={date} disabled={busy} onChange={event => setDate(event.target.value)} />
          </label>
        </div>
        <label className="payment-decision-field">Семья
          <input value={query} disabled={busy} placeholder="Родитель, ребёнок или телефон" onChange={event => setQuery(event.target.value)} />
        </label>
        {family && <div className="receipts-selected-family"><Check size={14} aria-hidden="true" />{family.name}</div>}
        <div className="receipts-family-results" aria-live="polite">
          {search.isError && <p>Поиск не выполнился. Измените запрос или попробуйте ещё раз.</p>}
          {!search.isError && search.isFetching && !families.length && <p>Ищем…</p>}
          {!search.isError && !search.isFetching && debounced.trim().length >= 2 && !families.length && <p>Семья не найдена. Попробуйте имя родителя или ребёнка.</p>}
          {families.map(item => <button type="button" key={item.id} disabled={busy} aria-pressed={family?.id === item.id} onClick={() => setFamily({ id: item.id, name: item.name })}>
            <strong>{item.name}</strong>
            <span>{item.children.join('; ')}</span>
          </button>)}
        </div>
        {error && <p role="alert" className="payment-decision-error">{error}</p>}
      </div>
      <footer className="payment-decision-footer">
        <button type="button" className="ow-btn ow-btn--ghost" disabled={busy} onClick={onClose}>Закрыть</button>
        <button type="submit" className="ow-btn receipts-primary" disabled={!canSave || busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
      </footer>
    </form>
  </div>, document.body);
}
