import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReceiptsModule from './ReceiptsModule';
import { useFamilySearch, useIncomingReceipts } from '../../hooks/useCrmQueries';
import { deleteIncomingReceipt, dismissIncomingReceipt, IncomingReceiptRow, submitIncomingReceipt, updateIncomingReceipt } from '../../services/incomingReceiptService';

jest.mock('../../hooks/useCrmQueries', () => ({ useIncomingReceipts: jest.fn(), useFamilySearch: jest.fn() }));
jest.mock('../families/ReceiptModal', () => ({ __esModule: true, default: () => null }));
jest.mock('../../services/incomingReceiptService', () => ({
  ...jest.requireActual('../../services/incomingReceiptService'),
  submitIncomingReceipt: jest.fn(),
  updateIncomingReceipt: jest.fn(),
  dismissIncomingReceipt: jest.fn(),
  deleteIncomingReceipt: jest.fn(),
  fetchIncomingReceiptFileUrl: jest.fn(),
}));
jest.mock('../../services/financeService', () => ({ createFamilyPayment: jest.fn() }));
jest.mock('../../services/supabase', () => ({ supabase: {} }));

const matched: IncomingReceiptRow = {
  id: 'r1', kind: 'review', status: 'recognized', chatName: 'Трансфер 12', messageAt: '2026-11-18T10:00:00Z',
  senderPhone: '996555123456', senderName: 'Айгуль', caption: null, fileName: null, mimeType: 'image/jpeg', hasFile: true,
  amount: 6800, receiptDate: '2026-11-18', receiptTime: null, receiptCardLast4: null, receiptBank: null, receiptCode: null,
  matchStatus: 'matched', familyMatchCount: 1, familyId: 'F1', parentName: 'Иванова Айгуль',
  children: [{ name: 'Иванов Иван', school: 'TIS', transfer: 12 }],
  duplicateFamilyId: null, paymentId: null, submittedBy: null, error: null, transferId: null, transferNumber: null,
};
const unknown: IncomingReceiptRow = { ...matched, id: 'r2', caption: 'Эсеналиева Наиля', matchStatus: 'none', familyMatchCount: 0, familyId: null, parentName: null, children: [] };
const counts = { review: 2, submitted: 0, duplicates: 0, other: 0, all: 2 };
const photo: IncomingReceiptRow = { ...matched, id: 'r3', kind: 'other', status: 'other', amount: null, receiptDate: null, messageAt: '2026-11-01T10:00:00Z' };

function show(data: unknown = { rows: [matched, unknown], counts, pageSize: 50 }, extra: Record<string, unknown> = {}, canDelete = false) {
  (useIncomingReceipts as jest.Mock).mockReturnValue({ data, isLoading: false, isError: false, refetch: jest.fn(), ...extra });
  return render(<QueryClientProvider client={new QueryClient()}><ReceiptsModule sessionToken="token" userName="Менеджер" onOpenFamily={jest.fn()} canDelete={canDelete} /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  (useFamilySearch as jest.Mock).mockReturnValue({
    data: [{ rowId: 'c1', familyId: 'F2', parentName: 'Петрова', phone: '', secondPhone: '', childName: 'Пётр', status: 'active', transferNumber: '3', branchFilter: 'TIS' }],
    isFetching: false, isError: false,
  });
});

test('shows a recognized family and sends the receipt for review', async () => {
  (submitIncomingReceipt as jest.Mock).mockResolvedValue(undefined);
  show();
  expect(screen.getByText('TIS')).toBeInTheDocument();
  expect(screen.getByText('12')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'На проверку' }));
  await waitFor(() => expect(submitIncomingReceipt).toHaveBeenCalledWith('token', matched, 'Менеджер'));
});

test('an unknown sender gets dashes, a hint and a family picker', async () => {
  (updateIncomingReceipt as jest.Mock).mockResolvedValue(undefined);
  show();
  expect(screen.getByText('Номера нет в CRM')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Комментарий' })).toBeInTheDocument();
  expect(screen.getByText('Эсеналиева Наиля')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать семью' }));
  fireEvent.click(screen.getByRole('button', { name: /Петрова/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(updateIncomingReceipt).toHaveBeenCalledWith('token', 'r2', { familyId: 'F2', amount: 6800, receiptDate: '2026-11-18' }));
});

test('an other file can be marked as a receipt or dismissed', async () => {
  (dismissIncomingReceipt as jest.Mock).mockResolvedValue(undefined);
  (updateIncomingReceipt as jest.Mock).mockResolvedValue(undefined);
  show({ rows: [photo], counts: { ...counts, other: 1 }, pageSize: 50 });
  expect(screen.getByText('Удалится 01.12')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Не чек' }));
  await waitFor(() => expect(dismissIncomingReceipt).toHaveBeenCalledWith('token', 'r3'));

  fireEvent.click(screen.getByRole('button', { name: 'Это чек' }));
  fireEvent.change(screen.getByLabelText('Сумма'), { target: { value: '6800' } });
  fireEvent.change(screen.getByLabelText('Дата чека'), { target: { value: '2026-11-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(updateIncomingReceipt).toHaveBeenCalledWith('token', 'r3', { familyId: 'F1', amount: 6800, receiptDate: '2026-11-01' }));
});

test('explains empty and failed loading states', () => {
  const { unmount } = show({ rows: [], counts: { ...counts, review: 0 }, pageSize: 50 });
  expect(screen.getByText('Новых чеков для разбора нет.')).toBeInTheDocument();
  unmount();
  show(undefined, { isError: true, error: new Error('Нет связи') });
  expect(screen.getByRole('alert')).toHaveTextContent('Нет связи');
  expect(screen.getByRole('button', { name: /Повторить/ })).toBeInTheDocument();
});

test('right click deletes a file forever only for leadership and after confirmation', async () => {
  (deleteIncomingReceipt as jest.Mock).mockResolvedValue(undefined);
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  const { unmount } = show();
  fireEvent.contextMenu(screen.getAllByRole('row')[1]);
  expect(screen.queryByRole('menuitem', { name: /Удалить навсегда/ })).not.toBeInTheDocument();
  unmount();
  show(undefined, {}, true);
  fireEvent.contextMenu(screen.getAllByRole('row')[1]);
  fireEvent.click(screen.getByRole('menuitem', { name: /Удалить навсегда/ }));
  expect(confirm).toHaveBeenCalled();
  await waitFor(() => expect(deleteIncomingReceipt).toHaveBeenCalledWith('token', 'r1'));
  confirm.mockRestore();
});
