import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Trash2, X } from 'lucide-react';
import './paymentDecisionModal.css';

// Решение по платежу «На проверке» — одно окно для сверки, вкладки «На проверке» и карточки семьи:
// дата поступления, подтвердить / отклонить / удалить и комментарий. Закрыть без действия можно
// кнопкой «Закрыть», крестиком, клавишей Esc или кликом мимо окна.
export type PaymentDecision = 'confirm' | 'reject' | 'delete';

export default function PaymentDecisionModal({ title, subtitle, managerComment, defaultDate, defaultComment = '', canDelete = false, note, onDecide, onClose }: {
  title: string;
  subtitle?: string;
  // Комментарий менеджера, который внёс платёж, — только для чтения.
  managerComment?: string;
  // Комментарий кассира — его кассир пишет и правит в этом окне.
  defaultComment?: string;
  defaultDate: string;
  canDelete?: boolean;
  note?: React.ReactNode;
  // Возвращает текст ошибки или ничего, если всё прошло успешно.
  onDecide: (decision: PaymentDecision, values: { date: string; comment: string }) => Promise<string | void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [comment, setComment] = useState(defaultComment);
  const [busy, setBusy] = useState<PaymentDecision | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function decide(decision: PaymentDecision) {
    if (busy) return;
    if (decision === 'delete' && !window.confirm('Удалить платёж и чек из рабочего списка? Данные останутся в истории семьи.')) return;
    setBusy(decision);
    setError('');
    try {
      const message = await onDecide(decision, { date, comment: comment.trim() });
      if (message) setError(message);
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить решение.');
    } finally {
      setBusy(null);
    }
  }

  return createPortal(<div className="ow-overlay payment-decision-overlay"
    onMouseDown={event => { event.stopPropagation(); if (event.target === event.currentTarget && !busy) onClose(); }}
    onClick={event => event.stopPropagation()}>
    <section className="ow-modal payment-decision" role="dialog" aria-modal="true" aria-label="Решение по платежу">
      <header className="ow-modal-head">
        <div><h3>{title}</h3>{subtitle && <span>{subtitle}</span>}</div>
        <button type="button" aria-label="Закрыть" disabled={!!busy} onClick={onClose}><X size={18} /></button>
      </header>
      <div className="payment-decision-body">
        {note && <div className="payment-decision-note">{note}</div>}
        {managerComment?.trim() && <div className="payment-decision-manager-comment">
          <span>Комментарий менеджера</span>{managerComment}
        </div>}
        <label className="payment-decision-field">Дата поступления
          <input type="date" value={date} disabled={!!busy} onChange={event => setDate(event.target.value)} autoFocus />
        </label>
        <div className="payment-decision-actions">
          <button type="button" className="payment-decision-confirm" disabled={!!busy || !date} onClick={() => void decide('confirm')}>
            <Check size={15} aria-hidden="true" /> {busy === 'confirm' ? 'Подтверждаем…' : 'Подтвердить'}
          </button>
          <button type="button" className="payment-decision-reject" disabled={!!busy} onClick={() => void decide('reject')}>
            <X size={15} aria-hidden="true" /> {busy === 'reject' ? 'Отклоняем…' : 'Отклонить'}
          </button>
          {canDelete && <button type="button" className="payment-decision-delete" disabled={!!busy} onClick={() => void decide('delete')}>
            <Trash2 size={15} aria-hidden="true" /> {busy === 'delete' ? 'Удаляем…' : 'Удалить'}
          </button>}
        </div>
        <label className="payment-decision-field">Комментарий кассира
          <textarea rows={3} value={comment} disabled={!!busy} placeholder="Например: сумма в выписке другая"
            onChange={event => setComment(event.target.value)} />
        </label>
        {error && <p role="alert" className="payment-decision-error">{error}</p>}
      </div>
      <footer className="payment-decision-footer">
        <button type="button" className="ow-btn ow-btn--ghost" disabled={!!busy} onClick={onClose}>Закрыть</button>
      </footer>
    </section>
  </div>, document.body);
}
