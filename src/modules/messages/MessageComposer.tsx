import React, { useEffect, useState } from 'react';
import { ExternalLink, Search, User, Users, X } from 'lucide-react';
import { sendMessage, useMessageContacts } from '../../services/messageService';
import { ROLE_LABELS, TaskTarget } from '../tasks/taskTypes';
import MessageEmojiPicker from './MessageEmojiPicker';
import './MessagesModule.css';

type Recipient = { kind: 'group'; channel: string; title: string } | { kind: 'person'; id: string; title: string; role: string };

/**
 * «Отправить сообщение» из меню правой кнопки: получатель — группа или сотрудник,
 * место, где нажали, уходит ссылкой (как цель задачи) и открывается из сообщения.
 */
export default function MessageComposer({ sessionToken, target, onClose }: { sessionToken?: string; target: TaskTarget | null; onClose: () => void }) {
  const contacts = useMessageContacts(sessionToken);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, sending]);
  useEffect(() => { if (!sent) return; const timer = setTimeout(onClose, 900); return () => clearTimeout(timer); }, [sent, onClose]);

  const needle = search.toLowerCase().trim();
  const groups = (contacts.data?.groups ?? []).filter(group => group.title.toLowerCase().includes(needle));
  const people = (contacts.data?.contacts ?? []).filter(person => `${person.full_name} ${ROLE_LABELS[person.role] ?? ''}`.toLowerCase().includes(needle));

  const send = async () => {
    if (!recipient || !text.trim() || sending) return;
    setSending(true); setError('');
    try {
      await sendMessage(sessionToken, recipient.kind === 'group' ? { channel: recipient.channel } : { toEmployeeId: recipient.id }, text.trim(), target);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Сообщение не отправлено');
    } finally { setSending(false); }
  };

  return (
    <div className="msg-composer-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !sending) onClose(); }}>
      <form className="msg-composer" role="dialog" aria-modal="true" aria-labelledby="msg-composer-title" onSubmit={event => { event.preventDefault(); void send(); }}>
        <header className="msg-composer-head">
          <h2 id="msg-composer-title">Отправить сообщение</h2>
          <button type="button" className="msg-composer-close" onClick={onClose} aria-label="Закрыть"><X size={18} aria-hidden="true" /></button>
        </header>
        {target && <div className="msg-composer-link"><ExternalLink size={13} aria-hidden="true" /><span>Ссылка: <b>{target.label}</b></span></div>}

        <div className="msg-composer-label">Кому</div>
        {recipient
          ? <div className="msg-recipient">
              {recipient.kind === 'group' ? <Users size={15} aria-hidden="true" /> : <User size={15} aria-hidden="true" />}
              <b>{recipient.title}</b>{recipient.kind === 'person' && <span>{ROLE_LABELS[recipient.role] ?? recipient.role}</span>}
              <button type="button" onClick={() => setRecipient(null)} aria-label="Сменить получателя">Сменить</button>
            </div>
          : <div className="msg-picker msg-picker--inline">
              <label className="msg-picker-search"><Search size={14} aria-hidden="true" />
                <input autoFocus aria-label="Найти получателя" placeholder="Группа или сотрудник" value={search} onChange={event => setSearch(event.target.value)} />
              </label>
              <div className="msg-picker-list">
                {contacts.isPending && <p className="msg-muted">Загрузка…</p>}
                {contacts.isError && <p className="msg-error" role="alert">{contacts.error instanceof Error ? contacts.error.message : 'Не удалось загрузить получателей'}</p>}
                {groups.length > 0 && <div className="msg-section">Группы</div>}
                {groups.map(group => (
                  <button key={group.channel} type="button" className="msg-picker-item" onClick={() => setRecipient({ kind: 'group', channel: group.channel, title: group.title })}>
                    <b>{group.title}</b><span>Группа</span>
                  </button>
                ))}
                {people.length > 0 && <div className="msg-section">Сотрудники</div>}
                {people.map(person => (
                  <button key={person.id} type="button" className="msg-picker-item" onClick={() => setRecipient({ kind: 'person', id: person.id, title: person.full_name, role: person.role })}>
                    <b>{person.full_name}</b><span>{ROLE_LABELS[person.role] ?? person.role}</span>
                  </button>
                ))}
                {!contacts.isPending && !groups.length && !people.length && <p className="msg-muted">Никого не нашли</p>}
              </div>
            </div>}

        <label className="msg-composer-label" htmlFor="msg-composer-text">Сообщение</label>
        <textarea id="msg-composer-text" rows={4} value={text} maxLength={4000} placeholder="Что нужно сделать или узнать"
          onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }} />
        {error && <p className="msg-error" role="alert">{error}</p>}
        <div className="msg-composer-actions">
          <MessageEmojiPicker onSelect={emoji => setText(current => current.length + emoji.length <= 4000 ? current + emoji : current)} />
          <button type="button" className="ow-btn ow-btn--ghost" onClick={onClose} disabled={sending}>Отмена</button>
          <button type="submit" className="msg-composer-send" disabled={!recipient || !text.trim() || sending || sent}>{sent ? 'Отправлено ✓' : sending ? 'Отправляю…' : 'Отправить'}</button>
        </div>
      </form>
    </div>
  );
}
