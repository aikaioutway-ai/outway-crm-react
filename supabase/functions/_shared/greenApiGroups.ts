export class GroupLookupError extends Error {}
export type VerifiedGroup = { chatId: string; name: string | null; inviteCode: string | null };
export type GroupRequest = (method: 'getContacts' | 'getChats' | 'getWaSettings' | 'getGroupData', body?: Record<string, unknown>) => Promise<unknown>;
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function inviteCode(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'chat.whatsapp.com' || url.username || url.password || url.port) return null;
    return url.pathname.match(/^\/([a-zA-Z0-9_-]{22})\/?$/)?.[1] ?? null;
  } catch { return null; }
}

export function accountIds(value: unknown): Set<string> {
  const data = object(value);
  if (!data || data.stateInstance !== 'authorized') throw new GroupLookupError('Номер WhatsApp не подключён к Green API');
  const ids = [data.chatId, data.wid].filter((id): id is string => typeof id === 'string' && /@(c\.us|lid)$/.test(id));
  if (typeof data.phone === 'string' && /^\d{9,15}$/.test(data.phone)) ids.push(`${data.phone}@c.us`);
  if (!ids.length) throw new GroupLookupError('Green API не передал идентификатор номера бота');
  return new Set(ids);
}

export function verifyGroup(value: unknown, chatId: string, ownIds: Set<string>): VerifiedGroup | null {
  if (value === null || (typeof value === 'string' && /Error: (forbidden|item-not-found)/i.test(value))) return null;
  const data = object(value);
  if (!data || data.groupId !== chatId || !Array.isArray(data.participants)) throw new GroupLookupError('Не удалось проверить участие бота в группе. Повторите проверку.');
  const member = data.participants.some(item => {
    const participant = object(item);
    return participant && [participant.id, participant.lid, participant.phoneNumber].some(id => typeof id === 'string' && ownIds.has(id));
  });
  if (!member) return null;
  return { chatId, name: typeof data.subject === 'string' ? data.subject : null, inviteCode: typeof data.groupInviteLink === 'string' ? inviteCode(data.groupInviteLink) : null };
}

export async function verifiedGroups(request: GroupRequest, knownIds: string[], link?: string): Promise<VerifiedGroup[]> {
  const code = link === undefined ? null : inviteCode(link);
  if (link !== undefined && !code) throw new GroupLookupError('Вставьте корректную ссылку вида https://chat.whatsapp.com/…');
  const [contacts, chats, account] = await Promise.all([request('getContacts'), request('getChats'), request('getWaSettings')]);
  if (!Array.isArray(contacts) || !Array.isArray(chats)) throw new GroupLookupError('Green API не передал список групп');
  const ownIds = accountIds(account);
  const candidates = new Set(knownIds.filter(id => id.endsWith('@g.us')));
  for (const item of [...contacts, ...chats]) {
    const row = object(item);
    if (row?.type === 'group' && typeof row.id === 'string' && row.id.endsWith('@g.us')) candidates.add(row.id);
  }
  const ids = Array.from(candidates);
  const result: VerifiedGroup[] = [];
  // Состав проверяется по очереди: Green API допускает один getGroupData в секунду.
  for (const id of ids) {
    const group = verifyGroup(await request('getGroupData', { groupId: id }), id, ownIds);
    if (group && (!code || group.inviteCode === code)) result.push(group);
    if (code && result.length) return result;
  }
  if (code && !result.length) throw new GroupLookupError('Не удалось подтвердить группу по ссылке. Проверьте, что бот в группе и ему доступна ссылка приглашения. Новые группы могут появляться в Green API до 5 минут.');
  return result;
}
