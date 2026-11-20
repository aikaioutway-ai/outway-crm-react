import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWhatsappGroups } from '../../hooks/useCrmQueries';
import { QK } from '../../services/queryClient';
import { linkTransferGroup, ReceiptTransferSummary } from '../../services/incomingReceiptService';
import '../families/paymentDecisionModal.css';

/** Привязка группы WhatsApp к трансферу: группа выбирается по названию из групп, где есть бот. */
export default function GroupPickerModal({ sessionToken, transfer, onClose }: {
  sessionToken?: string;
  transfer: ReceiptTransferSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const groups = useWhatsappGroups(sessionToken, true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (groups.data ?? []).filter(group => !text || (group.name ?? '').toLowerCase().includes(text));
  }, [groups.data, query]);

  async function link(chatId: string | null) {
    setBusy(true);
    setError('');
    try {
      await linkTransferGroup(sessionToken, transfer.transferId, chatId);
      await queryClient.invalidateQueries({ queryKey: QK.incomingReceiptsAll });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось привязать группу');
      setBusy(false);
    }
  }

  return createPortal(<div className="ow-overlay payment-decision-overlay"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="ow-modal payment-decision" role="dialog" aria-modal="true" aria-label="Группа WhatsApp трансфера">
      <header className="ow-modal-head">
        <div><h3>Группа WhatsApp</h3><span>Трансфер {transfer.transferNumber ?? '—'}</span></div>
        <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={18} /></button>
      </header>
      <div className="payment-decision-body">
        <label className="payment-decision-field">Название группы
          <input value={query} disabled={busy} placeholder="Поиск по названию" onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="receipts-family-results" aria-live="polite">
          {groups.isLoading && <p>Загружаем группы…</p>}
          {groups.isError && <p>Список групп не загрузился. Закройте окно и попробуйте ещё раз.</p>}
          {!groups.isLoading && !groups.isError && !visible.length && <p>Групп нет. Добавьте бота в группу трансфера и отправьте в неё любое сообщение — группа появится здесь.</p>}
          {visible.map(group => {
            const current = group.chatId === transfer.chatId;
            const taken = Boolean(group.transferId && !current);
            return <button type="button" key={group.chatId} disabled={busy || taken || current} aria-pressed={current} onClick={() => void link(group.chatId)}>
              <strong>{current && <Check size={13} aria-hidden="true" />} {group.name ?? 'Без названия'}</strong>
              <span>{current ? 'Привязана к этому трансферу' : taken ? `Уже привязана к трансферу ${group.transferNumber}` : 'Свободна'}</span>
            </button>;
          })}
        </div>
        {error && <p role="alert" className="payment-decision-error">{error}</p>}
      </div>
      <footer className="payment-decision-footer">
        {transfer.chatId && <button type="button" className="ow-btn ow-btn--ghost receipts-dismiss" disabled={busy} onClick={() => void link(null)}>Отвязать группу</button>}
        <button type="button" className="ow-btn ow-btn--ghost" disabled={busy} onClick={onClose}>Закрыть</button>
      </footer>
    </div>
  </div>, document.body);
}
