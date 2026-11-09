import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronLeft, ExternalLink, Search, Send, User, Users, UsersRound } from 'lucide-react';
import {
  CrmMessage, dmChannelOf, loadOlderMessages, markChannelRead, MessageChannel, MessageLink, sendMessage,
  useChannelMessages, useMessageChannels, useMessageContacts,
} from '../../services/messageService';
import { SCHOOL_DIRECTORY } from '../families/constants';
import { ROLE_LABELS, TaskTarget } from '../tasks/taskTypes';
import './MessagesModule.css';

const TIME_ZONE = 'Asia/Bishkek';
const dayKey = (value: string) => new Date(value).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
const timeOf = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
function dayLabel(value: string): string {
  const key = dayKey(value);
  if (key === dayKey(new Date().toISOString())) return 'Сегодня';
  if (key === dayKey(new Date(Date.now() - 86400000).toISOString())) return 'Вчера';
  return new Date(value).toLocaleDateString('ru-RU', { timeZone: TIME_ZONE, day: 'numeric', month: 'long' });
}
function shortTime(value: string | null): string {
  if (!value) return '';
  return dayKey(value) === dayKey(new Date().toISOString()) ? timeOf(value) : new Date(value).toLocaleDateString('ru-RU', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' });
}
const isDm = (channel: string) => channel.startsWith('dm:');
const iconFor = (channel: string) => channel === 'notifications' ? <Bell size={17} aria-hidden="true" />
  : channel === 'all' ? <UsersRound size={17} aria-hidden="true" />
  : isDm(channel) ? <User size={17} aria-hidden="true" /> : <Users size={17} aria-hidden="true" />;
const schoolLabel = (key: string, fallback: string) => SCHOOL_DIRECTORY.find(school => school.key === key)?.label ?? fallback;
// Сервер подписывает некоторые школы иначе, чем CRM.
const SERVER_LABEL_KEYS: Record<string, string> = { Sanarip: 'SNP', Ellipse: 'ELS' };
const schoolKeyByLabel = (label: string) => SERVER_LABEL_KEYS[label] ?? SCHOOL_DIRECTORY.find(school => school.label === label || school.key === label)?.key ?? '';

type OverdueData = Extract<MessageLink, { type: 'overdue-requests' }>['data'];
/** Уведомления первой версии пришли одной строкой текста — разбираем их в ту же таблицу. */
export function parseLegacyOverdue(body: string): OverdueData | null {
  const [head, list] = body.split('\n');
  const total = Number(/(\d+)/.exec(head ?? '')?.[1]);
  if (!list || !Number.isFinite(total)) return null;
  const schools = list.split(/,\s*(?=[^,]+—)/).map(part => {
    const match = /^(.+?)\s+—\s+(\d+)$/.exec(part.trim());
    return match ? { key: schoolKeyByLabel(match[1]), label: match[1], count: Number(match[2]), new: 0, inWork: 0, waiting: 0 } : null;
  }).filter((item): item is NonNullable<typeof item> => !!item);
  return schools.length ? { total, schools, rules: { new: 2, inWork: 3, waiting: 5 } } : null;
}

export default function MessagesModule({ sessionToken, employeeId, onOpenRequests, onOpenTarget }: {
  sessionToken?: string; employeeId?: string;
  /** Уведомление о просрочке: открыть «Новые заявки» (всех школ или одной). */
  onOpenRequests?: (schoolKey?: string) => void;
  /** Ссылка в сообщении: открыть место в CRM — школу, трансфер, ребёнка, семью… */
  onOpenTarget?: (target: TaskTarget) => void;
}) {
  const channelsQuery = useMessageChannels(sessionToken);
  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data]);
  const [tab, setTab] = useState<'groups' | 'people'>('groups');
  const contactsQuery = useMessageContacts(sessionToken, tab === 'people');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  // Личная переписка с тем, кому ещё не писали, — её пока нет в списке с сервера.
  const [draftPeer, setDraftPeer] = useState<{ channel: string; title: string; role: string } | null>(null);
  const [mobileChat, setMobileChat] = useState(false);
  useEffect(() => {
    if (!selected && channels.length) setSelected((channels.find(item => item.unread > 0 && !isDm(item.channel)) ?? channels[0]).channel);
  }, [channels, selected]);
  const groups = channels.filter(item => !isDm(item.channel));
  const dmByChannel = new Map(channels.filter(item => isDm(item.channel)).map(item => [item.channel, item]));
  const unreadGroups = groups.reduce((sum, item) => sum + item.unread, 0);
  const unreadPeople = Array.from(dmByChannel.values()).reduce((sum, item) => sum + item.unread, 0);

  // «Личное»: все сотрудники; с кем уже переписывались — сверху по свежести, остальные по алфавиту.
  const needle = search.toLowerCase().trim();
  const people = (contactsQuery.data?.contacts ?? [])
    .map(contact => {
      const channel = employeeId ? dmChannelOf(employeeId, contact.id) : '';
      return { contact, channel, chat: dmByChannel.get(channel) };
    })
    .filter(({ contact }) => `${contact.full_name} ${ROLE_LABELS[contact.role] ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.chat?.lastAt ?? '').localeCompare(a.chat?.lastAt ?? '') || a.contact.full_name.localeCompare(b.contact.full_name));

  const current: MessageChannel | undefined = channels.find(item => item.channel === selected)
    ?? (draftPeer && draftPeer.channel === selected ? { channel: draftPeer.channel, title: draftPeer.title, readOnly: false, unread: 0, lastBody: null, lastAuthor: null, lastAt: null, peerRole: draftPeer.role } : undefined);

  const open = (channel: string) => { setSelected(channel); setMobileChat(true); };
  const openPerson = (contact: { id: string; full_name: string; role: string }, channel: string) => {
    if (!dmByChannel.has(channel)) setDraftPeer({ channel, title: contact.full_name, role: contact.role });
    open(channel);
  };

  const row = (key: string, active: boolean, icon: React.ReactNode, iconClass: string, title: string, subtitle: string, time: string | null, unread: number, onClick: () => void) => (
    <button key={key} type="button" className={`msg-channel${active ? ' is-active' : ''}`} aria-current={active ? 'true' : undefined} onClick={onClick}>
      <span className={`msg-channel-icon${iconClass}`}>{icon}</span>
      <span className="msg-channel-text">
        <span className="msg-channel-row"><b>{title}</b><span className="msg-channel-time">{shortTime(time)}</span></span>
        <span className="msg-channel-row">
          <span className="msg-channel-preview">{subtitle}</span>
          {unread > 0 && <span className="msg-unread" aria-label={`Непрочитано: ${unread}`}>{unread > 99 ? '99+' : unread}</span>}
        </span>
      </span>
    </button>
  );

  return (
    <div className={`msg-module${mobileChat ? ' msg-module--chat' : ''}`}>
      <aside className="msg-channels" aria-label="Группы и личные сообщения">
        <div className="msg-tabs" role="tablist" aria-label="Сообщения">
          <button type="button" role="tab" aria-selected={tab === 'groups'} className="msg-tab" onClick={() => setTab('groups')}>
            Группы{unreadGroups > 0 && <span className="msg-unread">{unreadGroups > 99 ? '99+' : unreadGroups}</span>}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'people'} className="msg-tab" onClick={() => setTab('people')}>
            Личное{unreadPeople > 0 && <span className="msg-unread">{unreadPeople > 99 ? '99+' : unreadPeople}</span>}
          </button>
        </div>
        {tab === 'groups' ? <>
          {channelsQuery.isPending && <p className="msg-muted">Загрузка…</p>}
          {channelsQuery.isError && <p className="msg-error" role="alert">{channelsQuery.error instanceof Error ? channelsQuery.error.message : 'Не удалось загрузить группы'}</p>}
          {groups.map(item => row(item.channel, item.channel === selected, iconFor(item.channel), item.channel === 'notifications' ? ' is-alert' : '',
            item.title, item.lastBody ? `${item.lastAuthor ? `${item.lastAuthor}: ` : ''}${item.lastBody}` : 'Пока пусто', item.lastAt, item.unread, () => open(item.channel)))}
        </> : <>
          <label className="msg-picker-search msg-people-search"><Search size={14} aria-hidden="true" />
            <input aria-label="Найти сотрудника" placeholder="Имя или должность" value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          {contactsQuery.isPending && <p className="msg-muted">Загрузка…</p>}
          {contactsQuery.isError && <p className="msg-error" role="alert">{contactsQuery.error instanceof Error ? contactsQuery.error.message : 'Не удалось загрузить сотрудников'}</p>}
          {people.map(({ contact, channel, chat }) => row(contact.id, channel === selected, <User size={17} aria-hidden="true" />, ' is-person',
            contact.full_name, chat?.lastBody ?? (ROLE_LABELS[contact.role] ?? contact.role), chat?.lastAt ?? null, chat?.unread ?? 0, () => openPerson(contact, channel)))}
          {!contactsQuery.isPending && !contactsQuery.isError && !people.length && <p className="msg-muted msg-section-empty">Никого не нашли</p>}
        </>}
      </aside>
      {current
        ? <ChatPane key={current.channel} channel={current} sessionToken={sessionToken} employeeId={employeeId}
            onBack={() => setMobileChat(false)} onOpenRequests={onOpenRequests} onOpenTarget={onOpenTarget} />
        : <section className="msg-chat msg-chat--empty"><p className="msg-muted">Выберите группу или сотрудника</p></section>}
    </div>
  );
}

/** Ссылка на место в CRM, откуда написали сообщение. */
function TargetChip({ link, onOpenTarget }: { link: Extract<MessageLink, { type: 'target' }>; onOpenTarget?: (target: TaskTarget) => void }) {
  return <button type="button" className="msg-link-chip" disabled={!onOpenTarget} onClick={() => onOpenTarget?.(link.target)} title="Открыть в CRM">
    <ExternalLink size={13} aria-hidden="true" /><span>{link.target.label || link.label || 'Открыть'}</span>
  </button>;
}

/** Уведомление о просрочке — таблица по школам; строка открывает заявки этой школы. */
function OverdueNotice({ link, onOpenRequests }: { link: Extract<MessageLink, { type: 'overdue-requests' }>; onOpenRequests?: (schoolKey?: string) => void }) {
  const { total, schools, rules } = link.data;
  // У старых уведомлений нет разбивки по колонкам — показываем только «Всего».
  const detailed = schools.some(school => school.new || school.inWork || school.waiting);
  return <div className="msg-overdue">
    <div className="msg-overdue-total"><b>{total}</b><span>просроченных новых заявок<br />в {schools.length} школах</span></div>
    <table className="msg-overdue-table">
      <thead><tr><th>Школа</th>{detailed && <><th title={`Больше ${rules.new} дн.`}>— Новые</th><th title={`Больше ${rules.inWork} дн.`}>! В работе</th><th title={`Больше ${rules.waiting} дн.`}>? Ожидание</th></>}<th>Просрочено</th></tr></thead>
      <tbody>{schools.map(school => (
        <tr key={school.key || school.label} tabIndex={onOpenRequests ? 0 : undefined} title="Открыть заявки школы"
          onClick={() => onOpenRequests?.(school.key || undefined)}
          onKeyDown={event => { if (event.key === 'Enter') onOpenRequests?.(school.key || undefined); }}>
          <td>{schoolLabel(school.key, school.label)}</td>
          {detailed && <><td>{school.new || '·'}</td><td>{school.inWork || '·'}</td><td>{school.waiting || '·'}</td></>}
          <td><b>{school.count}</b></td>
        </tr>
      ))}</tbody>
    </table>
    <div className="msg-overdue-foot">
      <span>Красные: больше {rules.new} дн. в «Новых», {rules.inWork} в «В работе», {rules.waiting} в «Ожидании».</span>
      {onOpenRequests && <button type="button" className="msg-note-link" onClick={() => onOpenRequests()}>{link.label ?? 'Открыть новые заявки'}</button>}
    </div>
  </div>;
}

function ChatPane({ channel, sessionToken, employeeId, onBack, onOpenRequests, onOpenTarget }: {
  channel: MessageChannel; sessionToken?: string; employeeId?: string; onBack: () => void;
  onOpenRequests?: (schoolKey?: string) => void; onOpenTarget?: (target: TaskTarget) => void;
}) {
  const query = useChannelMessages(sessionToken, channel.channel);
  const [older, setOlder] = useState<CrmMessage[]>([]);
  const [hasOlder, setHasOlder] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...older, ...(query.data?.messages ?? [])].filter(item => !seen.has(item.id) && (seen.add(item.id), true));
  }, [older, query.data]);
  const lastId = messages[messages.length - 1]?.id;

  // Открыли группу или пришло новое — отмечаем прочитанным.
  useEffect(() => {
    if (lastId && channel.unread > 0) void markChannelRead(sessionToken, channel.channel).catch(() => undefined);
  }, [lastId, channel.unread, channel.channel, sessionToken]);

  // Новые сообщения прокручивают вниз, если человек и так был внизу.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [lastId]);

  const showOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const list = listRef.current;
      const before = list?.scrollHeight ?? 0;
      const page = await loadOlderMessages(sessionToken, channel.channel, first.created_at);
      setOlder(current => [...page.messages, ...current]);
      setHasOlder(page.hasMore);
      requestAnimationFrame(() => { if (list) list.scrollTop = list.scrollHeight - before; });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить сообщения');
    } finally { setLoadingOlder(false); }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setError('');
    try {
      await sendMessage(sessionToken, { channel: channel.channel }, text);
      setDraft('');
      stickToBottom.current = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Сообщение не отправлено');
    } finally { setSending(false); }
  };

  const canLoadOlder = hasOlder ?? query.data?.hasMore ?? false;
  const dm = isDm(channel.channel);
  return (
    <section className="msg-chat" aria-label={channel.title}>
      <header className="msg-chat-head">
        <button type="button" className="msg-back" onClick={onBack} aria-label="К списку групп"><ChevronLeft size={18} aria-hidden="true" /></button>
        <span className={`msg-channel-icon${channel.channel === 'notifications' ? ' is-alert' : dm ? ' is-person' : ''}`}>{iconFor(channel.channel)}</span>
        <div><b>{channel.title}</b>
          {channel.readOnly ? <div className="msg-muted">Сюда пишет только CRM</div>
            : dm ? <div className="msg-muted">Личная переписка{channel.peerRole ? ` · ${ROLE_LABELS[channel.peerRole] ?? channel.peerRole}` : ''}</div> : null}
        </div>
      </header>
      <div className="msg-list" ref={listRef} onScroll={event => {
        const list = event.currentTarget;
        stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
      }}>
        {canLoadOlder && <button type="button" className="msg-older" onClick={() => void showOlder()} disabled={loadingOlder}>{loadingOlder ? 'Загрузка…' : 'Показать раньше'}</button>}
        {query.isPending && <p className="msg-muted">Загрузка…</p>}
        {query.isError && <p className="msg-error" role="alert">{query.error instanceof Error ? query.error.message : 'Не удалось загрузить сообщения'}</p>}
        {!query.isPending && !messages.length && <p className="msg-muted msg-empty">{channel.readOnly ? 'Уведомлений пока нет' : dm ? `Напишите ${channel.title} первым` : 'Сообщений пока нет — напишите первым'}</p>}
        {messages.map((message, index) => {
          const newDay = index === 0 || dayKey(messages[index - 1].created_at) !== dayKey(message.created_at);
          const own = !!employeeId && message.author_id === employeeId;
          const sameAuthor = !newDay && index > 0 && messages[index - 1].author_id === message.author_id && messages[index - 1].kind === message.kind;
          const link = message.link;
          return <React.Fragment key={message.id}>
            {newDay && <div className="msg-day"><span>{dayLabel(message.created_at)}</span></div>}
            {message.kind === 'notification'
              ? <article className="msg-note">
                  <div className="msg-note-head"><Bell size={14} aria-hidden="true" /> Уведомление CRM <span>{timeOf(message.created_at)}</span></div>
                  {link?.type === 'overdue-requests'
                    ? <OverdueNotice link={link} onOpenRequests={onOpenRequests} />
                    : link?.type === 'requests' && parseLegacyOverdue(message.body)
                    ? <OverdueNotice link={{ type: 'overdue-requests', label: link.label, data: parseLegacyOverdue(message.body)! }} onOpenRequests={onOpenRequests} />
                    : <>
                        <div className="msg-text">{message.body}</div>
                        {link?.type === 'requests' && onOpenRequests && <button type="button" className="msg-note-link" onClick={() => onOpenRequests()}>{link.label ?? 'Открыть'}</button>}
                      </>}
                </article>
              : <article className={`msg-bubble${own ? ' is-own' : ''}${sameAuthor ? ' is-follow' : ''}`}>
                  {!own && !sameAuthor && !dm && <div className="msg-author">{message.author_name}</div>}
                  {link?.type === 'target' && <TargetChip link={link} onOpenTarget={onOpenTarget} />}
                  <div className="msg-text">{message.body}</div>
                  <div className="msg-time">{timeOf(message.created_at)}</div>
                </article>}
          </React.Fragment>;
        })}
      </div>
      {channel.readOnly ? null : (
        <form className="msg-compose" onSubmit={event => { event.preventDefault(); void send(); }}>
          {error && <p className="msg-error" role="alert">{error}</p>}
          <div className="msg-compose-row">
            <textarea aria-label={`Сообщение в «${channel.title}»`} rows={1} value={draft} maxLength={4000} placeholder="Напишите сообщение…"
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
            <button type="submit" className="msg-send" disabled={!draft.trim() || sending} aria-label="Отправить"><Send size={17} aria-hidden="true" /></button>
          </div>
          <div className="msg-hint">Enter — отправить, Shift+Enter — новая строка</div>
        </form>
      )}
    </section>
  );
}
