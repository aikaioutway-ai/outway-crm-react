import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GroupPickerModal from './GroupPickerModal';
import { useWhatsappGroups } from '../../hooks/useCrmQueries';
import { fetchWhatsappGroups, fetchReceiptHistoryStatus, linkTransferGroup, retryReceiptHistory } from '../../services/incomingReceiptService';

jest.mock('../../hooks/useCrmQueries', () => ({ useWhatsappGroups: jest.fn() }));
jest.mock('../../services/incomingReceiptService', () => ({ fetchWhatsappGroups: jest.fn(), fetchReceiptHistoryStatus: jest.fn(), retryReceiptHistory: jest.fn(), linkTransferGroup: jest.fn() }));

const refetch = jest.fn();
function open(chatId: string | null = 'group@g.us') {
  return render(<QueryClientProvider client={new QueryClient()}><GroupPickerModal sessionToken="session" onClose={jest.fn()} transfer={{
    transferId: 't1', schoolKey: 'KAS', transferNumber: 4, chatId, groupName: 'Группа', review: 0, duplicates: 0, other: 0, total: 0,
  }} /></QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  (fetchReceiptHistoryStatus as jest.Mock).mockResolvedValue(null);
  (useWhatsappGroups as jest.Mock).mockReturnValue({ data: [{ chatId: 'group@g.us', name: 'Группа', transferId: null }], refetch });
});

test('shows server progress without requiring a manual date range', async () => {
  (fetchReceiptHistoryStatus as jest.Mock).mockResolvedValue({ status: 'running', position: 2, total: 5 });
  const view = open();
  await screen.findByText('Автозагрузка: обработано 2 из 5 файлов');
  expect(fetchReceiptHistoryStatus).toHaveBeenCalledWith('session', 't1', 'group@g.us');
  view.unmount();
});

test('can restart failed background work without opening manual upload', async () => {
  (fetchReceiptHistoryStatus as jest.Mock).mockResolvedValue({ status: 'failed', total: 0 });
  (retryReceiptHistory as jest.Mock).mockResolvedValue(undefined);
  open();
  fireEvent.click(await screen.findByText('Проверить историю ещё раз'));
  await screen.findByText(/Повторная проверка истории поставлена в очередь/);
  expect(retryReceiptHistory).toHaveBeenCalledWith('session', 't1', 'group@g.us');
});

test('refreshes provider groups without requiring a group message', async () => {
  (fetchWhatsappGroups as jest.Mock).mockResolvedValue([{ chatId: 'a' }, { chatId: 'b' }, { chatId: 'c' }]);
  open(null);
  fireEvent.click(screen.getByText('Обновить группы'));
  await screen.findByText(/Получено групп: 3/);
  expect(fetchWhatsappGroups).toHaveBeenCalledWith('session');
});

test('keeps the picker open after linking so history can be imported', async () => {
  (linkTransferGroup as jest.Mock).mockResolvedValue(undefined);
  open(null);
  fireEvent.click(screen.getByText('Группа', { selector: 'strong' }));
  await screen.findByText(/Чеки за последние 7 дней поставлены в очередь/);
  expect(linkTransferGroup).toHaveBeenCalledWith('session', 't1', 'group@g.us');
});

test('looks up a pasted invitation without clicking refresh and shows only verified matches', async () => {
  (fetchWhatsappGroups as jest.Mock).mockResolvedValue([{ chatId: 'new@g.us', name: 'Новый трансфер', transferId: null }]);
  open(null);
  fireEvent.change(screen.getByLabelText('Название группы или ссылка приглашения'), { target: { value: 'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV' } });
  await screen.findByText('Новый трансфер');
  expect(fetchWhatsappGroups).toHaveBeenCalledWith('session', 'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV');
  expect(screen.queryByText('Группа', { selector: 'strong' })).not.toBeInTheDocument();
});

test('does not offer an unverified invitation result', async () => {
  (fetchWhatsappGroups as jest.Mock).mockRejectedValue(new Error('Не удалось подтвердить группу'));
  open(null);
  fireEvent.change(screen.getByLabelText('Название группы или ссылка приглашения'), { target: { value: 'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRSTUV' } });
  await screen.findByText('Не удалось подтвердить группу');
  expect(screen.queryByText('Группа', { selector: 'strong' })).not.toBeInTheDocument();
});

test('does not offer loading older dates', async () => {
  open();
  await waitFor(() => expect(fetchReceiptHistoryStatus).toHaveBeenCalled());
  expect(screen.getByText(/только чеки за последние 7 дней/)).toBeInTheDocument();
  expect(screen.queryByLabelText('С даты')).not.toBeInTheDocument();
});
