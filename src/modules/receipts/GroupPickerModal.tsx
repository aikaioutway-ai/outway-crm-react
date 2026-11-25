import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWhatsappGroups } from '../../hooks/useCrmQueries';
import { QK } from '../../services/queryClient';
import { fetchWhatsappGroups, linkTransferGroup, ReceiptTransferSummary, WhatsappGroup } from '../../services/incomingReceiptService';
import '../families/paymentDecisionModal.css';
import './ReceiptsModule.css';

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
  const [notice, setNotice] = useState('');
  const [chatId, setChatId] = useState(transfer.chatId);
  const [groupName, setGroupName] = useState(transfer.groupName);
  const [progress, setProgress] = useState('');
  const isInvite = /chat\.whatsapp\.com/i.test(query);
  const [linkGroups, setLinkGroups] = useState<WhatsappGroup[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (!isInvite) { setLinkGroups([]); setLookupError(''); setLookingUp(false); return; }
    let active = true;
    setLinkGroups([]); setLookupError(''); setLookingUp(true);
    const timer = setTimeout(async () => {
      try {
        const found = await fetchWhatsappGroups(sessionToken, query.trim());
        if (active) setLinkGroups(found);
      } catch (err) {
        if (active) setLookupError(err instanceof Error ? err.message : 'Не удалось проверить ссылку');
      } finally { if (active) setLookingUp(false); }
    }, 700);
    return () => { active = false; clearTimeout(timer); };
  }, [query, isInvite, sessionToken]);

  const visible = useMemo(() => {
    if (isInvite) return linkGroups.filter(group => !group.transferId && group.chatId !== chatId);
    if (groups.isError || groups.isFetching) return [];
    const text = query.trim().toLowerCase();
    return (groups.data ?? []).filter(group => !group.transferId && group.chatId !== chatId && (!text || (group.name ?? '').toLowerCase().includes(text)));
  }, [groups.data, groups.isError, groups.isFetching, query, isInvite, linkGroups, chatId]);

  async function link(chatId: string | null) {
    setBusy(true);
    setError('');
    try {
      await linkTransferGroup(sessionToken, transfer.transferId, chatId);
      await queryClient.invalidateQueries({ queryKey: QK.incomingReceiptsAll });
      setChatId(chatId);
      setGroupName(chatId ? [...(groups.data ?? []), ...linkGroups].find(group => group.chatId === chatId)?.name ?? null : null);
      setNotice(chatId ? 'Группа привязана.' : 'Группа отвязана.');
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось привязать группу');
      setBusy(false);
    }
  }

  async function refreshGroups() {
    setBusy(true); setError(''); setNotice(''); setProgress('Обновляем группы…');
    try {
      const refreshed = await fetchWhatsappGroups(sessionToken, undefined, true);
      queryClient.setQueryData(QK.whatsappGroups(sessionToken), refreshed);
      const count = refreshed.length;
      setNotice(`Получено групп: ${count}. Если нужной нет, проверьте, что номер бота добавлен в неё: новые группы появляются в Green API в течение 5 минут, CRM подхватывает их автоматически.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось обновить группы'); }
    finally { setBusy(false); setProgress(''); }
  }

  return createPortal(<div className="ow-overlay payment-decision-overlay"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="ow-modal payment-decision" role="dialog" aria-modal="true" aria-label="Группа WhatsApp трансфера">
      <header className="ow-modal-head">
        <div><h3>Группа WhatsApp</h3><span>Трансфер {transfer.transferNumber ?? '—'}</span></div>
        <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={18} /></button>
      </header>
      <div className="payment-decision-body">
        <div className="receipts-current-group">
          <span>Подключённая группа</span>
          <strong><Link2 size={14} aria-hidden="true" /> {chatId ? (groups.data?.find(group => group.chatId === chatId)?.name ?? groupName ?? 'Без названия') : 'Группа не подключена'}</strong>
        </div>
        <button type="button" className="ow-btn ow-btn--ghost" disabled={busy || groups.isFetching} onClick={() => void refreshGroups()}>Обновить группы</button>
        <label className="payment-decision-field">Название группы или ссылка приглашения
          <input value={query} disabled={busy} placeholder="Название или https://chat.whatsapp.com/…" onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="receipts-family-results" aria-live="polite">
          {!isInvite && groups.isLoading && <p>Проверяем группы и участие бота…</p>}
          {isInvite && lookingUp && <p>Проверяем группу по ссылке…</p>}
          {isInvite && lookupError && <p role="alert">{lookupError}</p>}
          {!isInvite && !error && groups.isError && <p role="alert">{groups.error instanceof Error ? groups.error.message : 'Список групп не загрузился. Закройте окно и попробуйте ещё раз.'}</p>}
          {!isInvite && !groups.isLoading && !groups.isError && !visible.length && <p>Свободных групп нет. Добавьте номер бота в группу и нажмите «Обновить группы».</p>}
          {visible.map(group => (
            <button type="button" key={group.chatId} disabled={busy} onClick={() => void link(group.chatId)}>
              <strong>{group.name ?? 'Без названия'}</strong>
              <span>Свободна</span>
            </button>
          ))}
        </div>
        <div role="status" aria-live="polite">{progress || notice}</div>
        {error && <p role="alert" className="payment-decision-error">{error}</p>}
      </div>
      <footer className="payment-decision-footer">
        {chatId && <button type="button" className="ow-btn ow-btn--ghost receipts-dismiss" disabled={busy} onClick={() => void link(null)}>Отвязать группу</button>}
        <button type="button" className="ow-btn ow-btn--ghost" disabled={busy} onClick={onClose}>Закрыть</button>
      </footer>
    </div>
  </div>, document.body);
}
