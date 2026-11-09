import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabase } from './supabase';
import { queryClient } from './queryClient';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, isEmployeeSessionExpiredMessage } from './employeeSession';
import type { TaskTarget } from '../modules/tasks/taskTypes';

export interface MessageChannel {
  channel: string;
  title: string;
  readOnly: boolean;
  unread: number;
  lastBody: string | null;
  lastAuthor: string | null;
  lastAt: string | null;
  /** Личная переписка: собеседник. */
  peerId?: string;
  peerRole?: string | null;
}

export interface MessageContact { id: string; full_name: string; role: string }

export interface OverdueSchool { key: string; label: string; count: number; new: number; inWork: number; waiting: number }

/** Ссылка в сообщении: место в CRM (как цель задачи) или сводка просрочки. */
export type MessageLink =
  | { type: 'target'; label?: string; target: TaskTarget }
  | { type: 'overdue-requests'; label?: string; data: { total: number; schools: OverdueSchool[]; rules: { new: number; inWork: number; waiting: number } } }
  | { type: 'requests'; label?: string };

export interface CrmMessage {
  id: string;
  channel: string;
  author_id: string | null;
  author_name: string;
  body: string;
  kind: 'message' | 'notification';
  link: MessageLink | null;
  created_at: string;
}

/** Все запросы — через message-api с сессией сотрудника; к таблицам браузер не ходит. */
export async function callMessageApi<T>(sessionToken: string | undefined, body: Record<string, unknown>): Promise<T> {
  if (!sessionToken) throw new Error('Войдите в CRM, чтобы читать сообщения');
  const { data, error } = await supabase.functions.invoke('message-api', { body, headers: { 'x-employee-session': sessionToken } });
  let message = '';
  if (error) {
    message = error.message;
    if (/failed to send a request|failed to fetch/i.test(message)) message = 'Не удалось подключиться к серверу сообщений. Проверьте соединение.';
    try { message = (await error.context?.clone().json())?.error || message; } catch { /* ответ не JSON */ }
  } else if (!data?.ok) message = data?.error || 'Не удалось загрузить сообщения';
  if (message) {
    if (isEmployeeSessionExpiredMessage(message)) window.dispatchEvent(new Event(EMPLOYEE_SESSION_EXPIRED_EVENT));
    throw new Error(message);
  }
  return data as T;
}

const channelsKey = (token?: string) => ['messages', token, 'channels'] as const;
const messagesKey = (token: string | undefined, channel: string) => ['messages', token, 'list', channel] as const;

/** Группы и непрочитанные — обновляются раз в 20 секунд, пока CRM открыта. */
export function useMessageChannels(token?: string): UseQueryResult<MessageChannel[]> {
  return useQuery({
    queryKey: channelsKey(token),
    queryFn: async () => (await callMessageApi<{ channels: MessageChannel[] }>(token, { action: 'channels' })).channels,
    enabled: Boolean(token),
    refetchInterval: 20000,
    staleTime: 10000,
    retry: 1,
  });
}

/** Открытая переписка обновляется раз в 5 секунд. */
export function useChannelMessages(token: string | undefined, channel: string): UseQueryResult<{ messages: CrmMessage[]; hasMore: boolean }> {
  return useQuery({
    queryKey: messagesKey(token, channel),
    queryFn: () => callMessageApi<{ messages: CrmMessage[]; hasMore: boolean }>(token, { action: 'messages', channel }),
    enabled: Boolean(token && channel),
    refetchInterval: 5000,
    retry: 1,
  });
}

/** В группу — по channel, лично — по toEmployeeId (личный канал создаётся первым сообщением). */
export async function sendMessage(token: string | undefined, to: { channel?: string; toEmployeeId?: string }, body: string, target?: TaskTarget | null): Promise<CrmMessage> {
  const { message } = await callMessageApi<{ message: CrmMessage }>(token, { action: 'send', ...to, body, link: target ? { target } : undefined });
  queryClient.setQueryData(messagesKey(token, message.channel), (current: { messages: CrmMessage[]; hasMore: boolean } | undefined) =>
    current ? { ...current, messages: [...current.messages.filter(item => item.id !== message.id), message] } : current);
  void queryClient.invalidateQueries({ queryKey: channelsKey(token) });
  return message;
}

/** Кому можно написать: сотрудники и свои группы. */
export function useMessageContacts(token?: string, enabled = true): UseQueryResult<{ contacts: MessageContact[]; groups: { channel: string; title: string }[] }> {
  return useQuery({
    queryKey: ['messages', token, 'contacts'],
    queryFn: () => callMessageApi<{ contacts: MessageContact[]; groups: { channel: string; title: string }[] }>(token, { action: 'contacts' }),
    enabled: Boolean(token) && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Личный канал двух сотрудников — так же, как на сервере (id по алфавиту). */
export function dmChannelOf(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

const MESSAGE_COMPOSER_EVENT = 'outway-message-composer';
/** Открыть окно «Отправить сообщение» со ссылкой на место в CRM (из меню правой кнопки). */
export function openMessageComposer(target?: TaskTarget | null): void {
  window.dispatchEvent(new CustomEvent(MESSAGE_COMPOSER_EVENT, { detail: { target: target ?? null } }));
}
export function onMessageComposer(handler: (target: TaskTarget | null) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent).detail?.target ?? null);
  window.addEventListener(MESSAGE_COMPOSER_EVENT, listener);
  return () => window.removeEventListener(MESSAGE_COMPOSER_EVENT, listener);
}

export async function markChannelRead(token: string | undefined, channel: string): Promise<void> {
  await callMessageApi(token, { action: 'read', channel });
  queryClient.setQueryData(channelsKey(token), (current: MessageChannel[] | undefined) =>
    current?.map(item => item.channel === channel ? { ...item, unread: 0 } : item));
}

export async function loadOlderMessages(token: string | undefined, channel: string, before: string): Promise<{ messages: CrmMessage[]; hasMore: boolean }> {
  return callMessageApi(token, { action: 'messages', channel, before });
}

/** Раз в день сводка просрочки в «Уведомления»; сервер сам не даёт повторов. */
export async function requestOverdueNotification(token: string | undefined): Promise<void> {
  const result = await callMessageApi<{ created: boolean }>(token, { action: 'notify-overdue' });
  if (result.created) void queryClient.invalidateQueries({ queryKey: channelsKey(token) });
}
