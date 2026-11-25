import { accountIds, inviteCode, verifiedGroups, verifyGroup, GroupRequest } from '../../supabase/functions/_shared/greenApiGroups';

const link = 'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV';
const account = { stateInstance: 'authorized', phone: '996555123456', chatId: '123456789@lid' };
const data = (id: string, member = true) => ({ groupId: id, subject: id,
  groupInviteLink: link, participants: member ? [{ id: '123456789@lid' }] : [{ id: 'other@lid' }] });

test('accepts only WhatsApp invitations and normalizes query parameters', () => {
  expect(inviteCode(`${link}?mode=gi_t`)).toBe('ABCDEFGHIJKLMNOPQRSTUV');
  for (const value of ['http://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV', 'https://chat.whatsapp.com.evil.test/ABCDEFGHIJKLMNOPQRSTUV', 'https://evil.test/', 'https://chat.whatsapp.com/bad']) expect(inviteCode(value)).toBeNull();
});
test('checks membership against both the bot phone and lid', () => {
  const ids = accountIds(account);
  expect(verifyGroup(data('a@g.us'), 'a@g.us', ids)).toMatchObject({ chatId: 'a@g.us' });
  expect(verifyGroup({ ...data('a@g.us'), participants: [{ phoneNumber: '996555123456@c.us' }] }, 'a@g.us', ids)).not.toBeNull();
  expect(verifyGroup(data('a@g.us', false), 'a@g.us', ids)).toBeNull();
  expect(verifyGroup('Error: forbidden', 'a@g.us', ids)).toBeNull();
  expect(() => verifyGroup({}, 'a@g.us', ids)).toThrow('Не удалось проверить');
});
test('finds a silent group in contacts and excludes a historical group the bot left', async () => {
  const request: GroupRequest = jest.fn(async (method, body) => {
    if (method === 'getWaSettings') return account;
    if (method === 'getContacts') return [{ type: 'group', id: 'silent@g.us' }];
    if (method === 'getChats') return [{ type: 'group', id: 'old@g.us' }];
    return data(String(body?.groupId), body?.groupId === 'silent@g.us');
  });
  expect((await verifiedGroups(request, ['old@g.us'])).map(g => g.chatId)).toEqual(['silent@g.us']);
});
test('looks up invitation only when a matching current member group is confirmed', async () => {
  const request: GroupRequest = jest.fn(async (method, body) => {
    if (method === 'getWaSettings') return account;
    if (method === 'getContacts') return [{ type: 'group', id: 'new@g.us' }];
    if (method === 'getChats') return [];
    return data(String(body?.groupId));
  });
  expect((await verifiedGroups(request, [], link)).map(g => g.chatId)).toEqual(['new@g.us']);
  const noLink: GroupRequest = async (method, body) => method === 'getGroupData' ? { ...data(String(body?.groupId)), groupInviteLink: '' } : request(method, body);
  await expect(verifiedGroups(noLink, [], link)).rejects.toThrow('Не удалось подтвердить');
});
test('does not claim membership when provider verification fails', async () => {
  const request: GroupRequest = async method => {
    if (method === 'getWaSettings') return account;
    if (method === 'getGroupData') throw new Error('offline');
    return [{ id: 'a@g.us', type: 'group' }];
  };
  await expect(verifiedGroups(request, [])).rejects.toThrow('offline');
  expect(() => accountIds({ stateInstance: 'notAuthorized' })).toThrow('не подключён');
});

test('reuses recently confirmed groups and checks only new ones', async () => {
  const request = jest.fn(async (method: string, body?: Record<string, unknown>) => {
    if (method === 'getWaSettings') return account;
    if (method === 'getContacts') return [{ type: 'group', id: 'known@g.us' }, { type: 'group', id: 'new@g.us' }];
    if (method === 'getChats') return [];
    return data(String(body?.groupId));
  }) as unknown as GroupRequest;
  const recent = [{ chatId: 'known@g.us', name: 'Известная', inviteCode: null }];
  const groups = await verifiedGroups(request, ['known@g.us'], undefined, recent);
  expect(groups.map(g => g.chatId)).toEqual(['known@g.us', 'new@g.us']);
  expect((request as unknown as jest.Mock).mock.calls.filter(([method]) => method === 'getGroupData')).toEqual([['getGroupData', { groupId: 'new@g.us' }]]);
});
