import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReceiptsBrowser from './ReceiptsBrowser';
import { useIncomingReceipts, useIncomingReceiptsSummary, useWhatsappGroups } from '../../hooks/useCrmQueries';
import { fetchIncomingReceiptsSummary, linkTransferGroup } from '../../services/incomingReceiptService';

jest.mock('../../hooks/useCrmQueries', () => ({
  useIncomingReceipts: jest.fn(), useIncomingReceiptsSummary: jest.fn(), useWhatsappGroups: jest.fn(), useFamilySearch: jest.fn(),
}));
jest.mock('../families/ReceiptModal', () => ({ __esModule: true, default: () => null }));
jest.mock('../../services/incomingReceiptService', () => ({
  ...jest.requireActual('../../services/incomingReceiptService'),
  linkTransferGroup: jest.fn(), fetchIncomingReceiptsSummary: jest.fn(),
}));
jest.mock('../../services/financeService', () => ({ createFamilyPayment: jest.fn() }));
jest.mock('../../services/supabase', () => ({ supabase: {} }));

const counts = { review: 0, duplicates: 0, other: 0, total: 0 };
const summary = {
  schools: [{ key: 'TIS', transfers: 2, linked: 1, review: 3, duplicates: 1, other: 0, total: 5 }],
  transfers: [
    { transferId: 't12', schoolKey: 'TIS', transferNumber: 12, chatId: 'g1@g.us', groupName: 'Трансфер 12 родители', review: 3, duplicates: 1, other: 0, total: 5 },
    { transferId: 't14', schoolKey: 'TIS', transferNumber: 14, chatId: null, groupName: null, ...counts },
  ],
  unassigned: { review: 1, duplicates: 0, other: 0, total: 1 },
};

function show(schoolKey: string | null, onSelectSchool = jest.fn()) {
  (useIncomingReceiptsSummary as jest.Mock).mockReturnValue({ data: summary, isLoading: false, isError: false, refetch: jest.fn() });
  (useIncomingReceipts as jest.Mock).mockReturnValue({ data: { rows: [], counts: { review: 0, submitted: 0, duplicates: 0, other: 0, all: 0 }, pageSize: 50 }, isLoading: false, isError: false, refetch: jest.fn() });
  (useWhatsappGroups as jest.Mock).mockReturnValue({ data: [{ chatId: 'g2@g.us', name: 'Трансфер 14 TIS', lastSeenAt: '', transferId: null, transferNumber: null }], isLoading: false, isError: false });
  render(<QueryClientProvider client={new QueryClient()}><ReceiptsBrowser sessionToken="token" schoolKey={schoolKey} onSelectSchool={onSelectSchool} onOpenFamily={jest.fn()} /></QueryClientProvider>);
  return onSelectSchool;
}

beforeEach(() => { jest.clearAllMocks(); (fetchIncomingReceiptsSummary as jest.Mock).mockResolvedValue(summary); });

test('schools come first, with receipts without a transfer kept visible', () => {
  const onSelectSchool = show(null);
  expect(screen.getByText('Без трансфера')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /TIS.*Нужно разобрать/ }));
  expect(onSelectSchool).toHaveBeenCalledWith('TIS');
});

test('a transfer opens receipts of its group, and a free group can be linked', async () => {
  (linkTransferGroup as jest.Mock).mockResolvedValue(undefined);
  show('TIS');
  expect(screen.getByRole('group', { name: 'Период чеков' })).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Трансфер №14'));
  expect(useIncomingReceipts).toHaveBeenLastCalledWith('token', expect.objectContaining({ transferId: 't14' }));
  fireEvent.click(screen.getByRole('button', { name: /Привязать группу/ }));
  fireEvent.click(screen.getByRole('button', { name: /Трансфер 14 TIS/ }));
  await waitFor(() => expect(linkTransferGroup).toHaveBeenCalledWith('token', 't14', 'g2@g.us'));
});

test('school month tiles filter the receipt list by date and keep the school scope', async () => {
  show('TIS');
  fireEvent.click(screen.getByTitle('Ноябрь 2026'));
  await waitFor(() => expect(useIncomingReceipts).toHaveBeenLastCalledWith('token', expect.objectContaining({
    schoolKey: 'TIS', dateFrom: '2026-11-01', dateTo: '2026-12-01',
  })));
});
