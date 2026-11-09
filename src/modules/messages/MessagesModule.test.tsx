import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MessagesModule, { parseLegacyOverdue } from './MessagesModule';
import MessageComposer from './MessageComposer';
import { markChannelRead, sendMessage } from '../../services/messageService';

const now = new Date().toISOString();
const overdue = { type: 'overdue-requests', label: 'Открыть новые заявки', data: { total: 12, rules: { new: 2, inWork: 3, waiting: 5 }, schools: [
  { key: 'ABL1', label: 'ABL #2', count: 11, new: 10, inWork: 1, waiting: 0 },
  { key: 'EDI', label: 'EDI', count: 1, new: 1, inWork: 0, waiting: 0 },
] } };
const target = { type: 'transfer', id: 't-3', label: 'ABL #2 · Трансфер № 3', schoolKey: 'ABL1', transferNumber: 3 };
jest.mock('../../services/messageService', () => ({
  useMessageChannels: () => ({ isPending: false, isError: false, data: [
    { channel: 'notifications', title: 'Уведомления', readOnly: true, unread: 1, lastBody: 'Просрочено новых заявок: 12 в 2 школах.', lastAuthor: 'CRM', lastAt: now },
    { channel: 'all', title: 'Все', readOnly: false, unread: 0, lastBody: 'Привет', lastAuthor: 'Асылбек', lastAt: now },
    { channel: 'dept:logistics', title: 'Логистика', readOnly: false, unread: 3, lastBody: null, lastAuthor: null, lastAt: null },
    { channel: 'dm:emp-1:emp-2', title: 'Асылбек', readOnly: false, unread: 0, lastBody: 'Ок', lastAuthor: 'Асылбек', lastAt: now, peerId: 'emp-2', peerRole: 'logist' },
  ] }),
  useChannelMessages: (_token: string, channel: string) => ({ isPending: false, isError: false, data: channel === 'notifications'
    ? { hasMore: false, messages: [{ id: 'n1', channel, author_id: null, author_name: 'CRM', kind: 'notification', body: 'Просрочено', link: overdue, created_at: now }] }
    : { hasMore: false, messages: [
      { id: 'm1', channel, author_id: 'emp-2', author_name: 'Асылбек', kind: 'message', body: 'Посмотри трансфер', link: { type: 'target', target }, created_at: now },
      { id: 'm2', channel, author_id: 'emp-1', author_name: 'Я', kind: 'message', body: 'Здравствуйте', link: null, created_at: now },
    ] } }),
  useMessageContacts: () => ({ isPending: false, isError: false, data: {
    contacts: [{ id: 'emp-3', full_name: 'Нурсултан', role: 'logist' }, { id: 'emp-4', full_name: 'Зульфия', role: 'manager' }],
    groups: [{ channel: 'all', title: 'Все' }, { channel: 'dept:logistics', title: 'Логистика' }],
  } }),
  dmChannelOf: (a: string, b: string) => `dm:${[a, b].sort().join(':')}`,
  markChannelRead: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn().mockResolvedValue({}),
  loadOlderMessages: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

test('overdue notification is a table by school; a row opens that school', async () => {
  const onOpenRequests = jest.fn();
  render(<MessagesModule sessionToken="t" employeeId="emp-1" onOpenRequests={onOpenRequests} />);
  const chat = await screen.findByRole('region', { name: 'Уведомления' });
  expect(within(chat).getByText('12')).toBeInTheDocument();
  fireEvent.click(within(chat).getByText('ABL #2'));
  expect(onOpenRequests).toHaveBeenCalledWith('ABL1');
  fireEvent.click(within(chat).getByRole('button', { name: 'Открыть новые заявки' }));
  expect(onOpenRequests).toHaveBeenLastCalledWith();
  expect(within(chat).queryByRole('textbox')).not.toBeInTheDocument();
  await waitFor(() => expect(markChannelRead).toHaveBeenCalledWith('t', 'notifications'));
});

test('message link opens the place in CRM; own messages are marked; Enter sends', async () => {
  const onOpenTarget = jest.fn();
  render(<MessagesModule sessionToken="t" employeeId="emp-1" onOpenTarget={onOpenTarget} />);
  fireEvent.click(screen.getByRole('button', { name: /^Все/ }));
  const chat = await screen.findByRole('region', { name: 'Все' });
  fireEvent.click(within(chat).getByRole('button', { name: 'ABL #2 · Трансфер № 3' }));
  expect(onOpenTarget).toHaveBeenCalledWith(target);
  expect(within(chat).getByText('Здравствуйте').closest('article')).toHaveClass('is-own');
  const box = within(chat).getByRole('textbox', { name: 'Сообщение в «Все»' });
  fireEvent.change(box, { target: { value: '  Машина на месте  ' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('t', { channel: 'all' }, 'Машина на месте'));
});

test('«Личное» lists every employee with search; existing chats first; writing opens a DM', async () => {
  render(<MessagesModule sessionToken="t" employeeId="emp-1" />);
  fireEvent.click(screen.getByRole('tab', { name: /Личное/ }));
  const names = screen.getAllByRole('button').map(button => button.textContent ?? '').filter(text => /Нурсултан|Зульфия/.test(text));
  expect(names).toHaveLength(2);
  fireEvent.change(screen.getByRole('textbox', { name: 'Найти сотрудника' }), { target: { value: 'нурс' } });
  expect(screen.queryByRole('button', { name: /Зульфия/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Нурсултан/ }));
  const chat = await screen.findByRole('region', { name: 'Нурсултан' });
  expect(within(chat).getByText(/Личная переписка/)).toBeInTheDocument();
  const box = within(chat).getByRole('textbox');
  fireEvent.change(box, { target: { value: 'Привет' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('t', { channel: 'dm:emp-1:emp-3' }, 'Привет'));
});

test('the old one-line overdue notice is split into one school per row', () => {
  const parsed = parseLegacyOverdue('Просрочено новых заявок: 92.\nABL #2 — 11, EDI — 10, Sanarip — 10, GEN #2 — 5, ABL #1 — 1\nКрасные: больше 2 дней в «Новых», 3 в «В работе», 5 в «Ожидании».');
  expect(parsed?.total).toBe(92);
  expect(parsed?.schools.map(school => [school.label, school.count, school.key])).toEqual([
    ['ABL #2', 11, 'ABL1'], ['EDI', 10, 'EDI'], ['Sanarip', 10, 'SNP'], ['GEN #2', 5, 'GEN2'], ['ABL #1', 1, 'ABL2'],
  ]);
  expect(parseLegacyOverdue('Просто текст')).toBeNull();
});

test('right-click composer: pick a person, write, the place goes as a link', async () => {
  const onClose = jest.fn();
  render(<MessageComposer sessionToken="t" target={target as any} onClose={onClose} />);
  expect(screen.getByText('ABL #2 · Трансфер № 3')).toBeInTheDocument();
  const send = screen.getByRole('button', { name: 'Отправить' });
  expect(send).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Зульфия/ }));
  fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Позвони родителю' } });
  fireEvent.click(send);
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('t', { toEmployeeId: 'emp-4' }, 'Позвони родителю', target));
});

test('right-click composer can also send to a group', async () => {
  render(<MessageComposer sessionToken="t" target={null} onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Логистика/ }));
  fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'Всем: проверьте трансферы' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('t', { channel: 'dept:logistics' }, 'Всем: проверьте трансферы', null));
});
