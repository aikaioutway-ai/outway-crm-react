import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SchoolRequestsKanban from './SchoolRequestsKanban';
import { updateV2ChildRoute } from '../../services/crmV2Service';
import { askTransferComment } from '../../core/dashboard/askTransferComment';

const base = { familyId: 'family-1', branchFilter: 'ABL2', branchShort: 'ABL2', parentName: 'Родитель', phone: '+996 555 000 111', streetAddress: 'Ахунбаева 12', transferNumber: null, childCreatedAt: '2026-11-08T10:00:00Z' };
jest.mock('../../hooks/useCrmQueries', () => ({ useLogisticsTable: () => ({ data: [
  { ...base, rowId: 'new-1', childName: 'Новый', status: 'new', transferMark: null },
  { ...base, rowId: 'work-1', childName: 'Вработе', status: 'new', transferMark: 'in_work' },
  { ...base, rowId: 'wait-1', childName: 'Ждёт', status: 'new', transferMark: 'waiting', transferComment: 'Ждём ответ', transferCommentBy: 'Асылбек', transferCommentAt: '2026-11-10T08:00:00Z' },
  { ...base, rowId: 'rej-1', childName: 'Отказник', status: 'rejected', transferMark: null },
  { ...base, rowId: 'boarded-1', childName: 'Посажен', status: 'boarded', transferNumber: '2' },
  { ...base, rowId: 'old-1', childName: 'Старая', status: 'new', transferMark: null, childCreatedAt: '2020-01-01T10:00:00Z' },
], refetch: jest.fn(), isPending: false, isError: false }), useEmployees: () => ({ data: [
  { id: 'l1', fullName: 'Адилет', role: 'logist', status: 'active', schoolKeys: ['ABL2', 'TIS'] },
  { id: 'm1', fullName: 'Эркинбекова Аяна', role: 'manager', status: 'active', schoolKeys: ['ABL2'] },
  { id: 'm2', fullName: 'Уволенный', role: 'manager', status: 'dismissed', schoolKeys: ['ABL2'] },
  { id: 'd1', fullName: 'Директор', role: 'director', status: 'active', schoolKeys: ['ALL'] },
] }) }));
jest.mock('../../services/crmV2Service', () => ({ updateV2ChildRoute: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../core/dashboard/askTransferComment', () => ({
  askTransferComment: jest.fn(),
  formatTransferComment: (comment?: string | null, by?: string | null) => comment ? `${by}: ${comment}` : '',
}));
beforeEach(() => jest.clearAllMocks());
const renderBoard = (onOpen = jest.fn(), canEdit = true) => render(<SchoolRequestsKanban schoolKey="ABL2" schoolTier="1.0" onOpen={onOpen} canEdit={canEdit} />);

test('columns follow the transfer: —, !, ?, and Отказ shows no cards', () => {
  renderBoard();
  expect(within(screen.getByRole('region', { name: 'Новые' })).getByText('Новый')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'В работе' })).getByText('Вработе')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Ожидание' })).getByText('Ждёт')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Отказ' })).queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryByText('Отказник')).not.toBeInTheDocument();
  expect(screen.queryByText('Посажен')).not.toBeInTheDocument();
});

test('card shows school, name, address, phone and opens the family on click', () => {
  const onOpen = jest.fn();
  renderBoard(onOpen);
  const card = screen.getByRole('button', { name: 'Новый: открыть карточку семьи' });
  expect(within(card).getByText('Ахунбаева 12')).toBeInTheDocument();
  expect(within(card).getAllByText('ABL2').length).toBeGreaterThan(0);
  fireEvent.click(card);
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ rowId: 'new-1' }));
});

test('moving to В работе sets transfer «!» without a comment', async () => {
  renderBoard();
  fireEvent.click(screen.getByRole('button', { name: 'Вперёд в «В работе»: Новый' }));
  await waitFor(() => expect(updateV2ChildRoute).toHaveBeenCalledWith(expect.objectContaining({ transferNumber: '!', comment: null })));
  expect(askTransferComment).not.toHaveBeenCalled();
});

test('dropping on Отказ asks for a comment and sets transfer Х; cancel changes nothing', async () => {
  (askTransferComment as jest.Mock).mockResolvedValueOnce(null);
  renderBoard();
  const reject = screen.getByRole('region', { name: 'Отказ' });
  fireEvent.drop(reject, { dataTransfer: { getData: () => 'work-1' } });
  await waitFor(() => expect(askTransferComment).toHaveBeenCalled());
  expect(updateV2ChildRoute).not.toHaveBeenCalled();

  (askTransferComment as jest.Mock).mockResolvedValueOnce('Дорого');
  fireEvent.drop(reject, { dataTransfer: { getData: () => 'work-1' } });
  await waitFor(() => expect(updateV2ChildRoute).toHaveBeenCalledWith(expect.objectContaining({ transferNumber: 'X', comment: 'Дорого' })));
});

test('moving to Ожидание requires a comment', async () => {
  (askTransferComment as jest.Mock).mockResolvedValueOnce('Ждём машину');
  renderBoard();
  fireEvent.click(screen.getByRole('button', { name: 'Вперёд в «Ожидание»: Вработе' }));
  await waitFor(() => expect(updateV2ChildRoute).toHaveBeenCalledWith(expect.objectContaining({ transferNumber: '?', comment: 'Ждём машину' })));
});

test('overdue requests are red and can be filtered', () => {
  renderBoard();
  const old = screen.getByRole('button', { name: 'Старая: открыть карточку семьи' });
  expect(old).toHaveClass('request-card--overdue');
  expect(screen.getByRole('button', { name: 'Новый: открыть карточку семьи' })).not.toHaveClass('request-card--overdue');
  fireEvent.click(screen.getByRole('button', { name: /Просрочено/ }));
  expect(screen.queryByText('Новый')).not.toBeInTheDocument();
  expect(screen.getByText('Старая')).toBeInTheDocument();
});

test('without edit rights cards only open, nothing moves', () => {
  const onOpen = jest.fn();
  renderBoard(onOpen, false);
  expect(screen.queryByRole('button', { name: /Вперёд/ })).not.toBeInTheDocument();
  expect(screen.getByText('Только просмотр: переносить заявки могут логисты.')).toBeInTheDocument();
  fireEvent.drop(screen.getByRole('region', { name: 'Отказ' }), { dataTransfer: { getData: () => 'new-1' } });
  expect(askTransferComment).not.toHaveBeenCalled();
  expect(updateV2ChildRoute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Новый: открыть карточку семьи' }));
  expect(onOpen).toHaveBeenCalled();
});

test('board shows which school it is and who runs it', () => {
  renderBoard();
  const staff = screen.getByText('Л: Адилет · М: Аяна');
  expect(staff).toHaveAttribute('title', 'Логист: Адилет\nМенеджер: Эркинбекова Аяна');
  expect(staff.closest('.requests-school')).toHaveTextContent('ABL #1');
});
