import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWhatsappGroups } from '../../hooks/useCrmQueries';
import { QK } from '../../services/queryClient';
import { fetchWhatsappGroups, fetchReceiptHistoryStatus, linkTransferGroup, ReceiptHistoryJob, ReceiptTransferSummary, retryReceiptHistory, WhatsappGroup } from '../../services/incomingReceiptService';
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
  const [progress, setProgress] = useState('');
  const [historyJob, setHistoryJob] = useState<ReceiptHistoryJob | null>(null);
  const [historyError, setHistoryError] = useState('');
  const isInvite = /chat\.whatsapp\.com/i.test(query);
  const [linkGroups, setLinkGroups] = useState<WhatsappGroup[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    if (!chatId) { setHistoryJob(null); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const job = await fetchReceiptHistoryStatus(sessionToken, transfer.transferId, chatId);
        if (!active) return;
        setHistoryJob(job); setHistoryError('');
        if (job?.status === 'queued' || job?.status === 'running') timer = setTimeout(poll, 5000);
        else await queryClient.invalidateQueries({ queryKey: QK.incomingReceiptsAll });
      } catch {
        if (active) setHistoryError('Не удалось проверить автозагрузку. Откройте окно повторно.');
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [chatId, sessionToken, transfer.transferId, queryClient, historyRevision]);

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
    if (isInvite) return linkGroups;
    if (groups.isError || groups.isFetching) return [];
    const text = query.trim().toLowerCase();
    return (groups.data ?? []).filter(group => !text || (group.name ?? '').toLowerCase().includes(text));
  }, [groups.data, groups.isError, groups.isFetching, query, isInvite, linkGroups]);

  async function link(chatId: string | null) {
    setBusy(true);
    setError('');
    try {
      await linkTransferGroup(sessionToken, transfer.transferId, chatId);
      await queryClient.invalidateQueries({ queryKey: QK.incomingReceiptsAll });
      setChatId(chatId);
      setNotice(chatId ? 'Группа привязана. Чеки за последние 7 дней поставлены в очередь автозагрузки. Окно можно закрыть.' : 'Группа отвязана.');
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось привязать группу');
      setBusy(false);
    }
  }

  async function retryHistory() {
    if (!chatId) return;
    setBusy(true); setError('');
    try {
      await retryReceiptHistory(sessionToken, transfer.transferId, chatId);
      setHistoryRevision(value => value + 1);
      setNotice('Повторная проверка истории поставлена в очередь. Окно можно закрыть.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось повторить загрузку'); }
    finally { setBusy(false); }
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
        <button type="button" className="ow-btn ow-btn--ghost" disabled={busy || groups.isFetching} onClick={() => void refreshGroups()}>Обновить группы</button>
        <label className="payment-decision-field">Название группы или ссылка приглашения
          <input value={query} disabled={busy} placeholder="Название или https://chat.whatsapp.com/…" onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="receipts-family-results" aria-live="polite">
          {!isInvite && groups.isLoading && <p>Проверяем группы и участие бота…</p>}
          {isInvite && lookingUp && <p>Проверяем группу по ссылке…</p>}
          {isInvite && lookupError && <p role="alert">{lookupError}</p>}
          {!isInvite && !error && groups.isError && <p role="alert">{groups.error instanceof Error ? groups.error.message : 'Список групп не загрузился. Закройте окно и попробуйте ещё раз.'}</p>}
          {!isInvite && !groups.isLoading && !groups.isError && !visible.length && <p>Групп нет. Добавьте номер бота в группу и нажмите «Обновить группы».</p>}
          {visible.map(group => {
            const current = group.chatId === chatId;
            const taken = Boolean(group.transferId && !current);
            return <button type="button" key={group.chatId} disabled={busy || taken || current} aria-pressed={current} onClick={() => void link(group.chatId)}>
              <strong>{current && <Check size={13} aria-hidden="true" />} {group.name ?? 'Без названия'}</strong>
              <span>{current ? 'Привязана к этому трансферу' : taken ? `Уже привязана к трансферу ${group.transferNumber}` : 'Свободна'}</span>
            </button>;
          })}
        </div>
        {chatId && <fieldset disabled={busy} className="receipts-history-fields">
          <legend>Старые чеки</legend>
          <p>После привязки группы автоматически загружаются только чеки за последние 7 дней. Более старые файлы не обрабатываются. Окно можно закрыть. Доступ к истории в WhatsApp должен быть предоставлен номеру бота. Платежи автоматически не создаются.</p>
          {historyJob && <div role="status" aria-live="polite">
            {historyJob.status === 'queued' || historyJob.status === 'running'
              ? `Автозагрузка: ${historyJob.total ? `обработано ${historyJob.position} из ${historyJob.total} файлов` : 'проверяем доступную историю…'}`
              : historyJob.status === 'completed'
                ? `Автозагрузка завершена. Чеков: ${historyJob.imported}, других файлов: ${historyJob.other}, уже были: ${historyJob.existing}, ошибок: ${historyJob.failed}. Проверено сообщений: ${historyJob.scanned}.`
                : historyJob.status === 'failed' ? 'Автозагрузка не выполнена. Проверьте подключение Green API и повторите проверку.' : 'Автозагрузка остановлена.'}
            {historyJob.status === 'completed' && historyJob.scanned === 0 && <p>Green API пока не передал историю этой группы.</p>}
            {historyJob.limited && <p>Проверены последние 10 000 сообщений. Более ранние сообщения в эту загрузку не вошли.</p>}
          </div>}
          {historyError && <p>{historyError}</p>}
          {historyJob && !['queued', 'running'].includes(historyJob.status) && <button type="button" className="ow-btn ow-btn--ghost" disabled={busy} onClick={() => void retryHistory()}>Проверить историю ещё раз</button>}

        </fieldset>}
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
