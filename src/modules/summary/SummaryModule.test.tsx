import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SummaryModule from './SummaryModule';
import { fetchSummaryForecast, fetchSummaryWorkingDays } from '../../services/summaryService';
import { useLogisticsTable, usePeriodChargeStats } from '../../hooks/useCrmQueries';

jest.mock('../../hooks/useCrmQueries', () => ({
  ...jest.requireActual('../../hooks/useCrmQueries'),
  useLogisticsTable: jest.fn(),
  usePeriodChargeStats: jest.fn(),
}));

// Настройки колонок таблицы детей (DataTable) — без реальной базы.
jest.mock('../../services/supabase', () => ({ supabase: { from: jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ error: null }) })) } }));

jest.mock('../../services/summaryService', () => ({
  fetchSummaryForecast: jest.fn(),
  fetchSummaryWorkingDays: jest.fn(),
  setSummaryWorkingDays: jest.fn(),
}));

const onSelectSchool = jest.fn();
const onOpenChild = jest.fn();
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SummaryModule onSelectSchool={onSelectSchool} onOpenChild={onOpenChild} /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchSummaryForecast as jest.Mock).mockResolvedValue([]);
  (fetchSummaryWorkingDays as jest.Mock).mockResolvedValue([]);
  (useLogisticsTable as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
  (usePeriodChargeStats as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
});

const child = (id: string, transferNumber: string, vehicleType: string, status = 'active') => ({ rowId: id, familyId: `fam-${id}`, childName: `Ребёнок ${id}`, parentName: '', branchFilter: 'TEST', transferNumber, vehicleType, status });
const charge = (childId: string, charged: number) => ({ familyId: `fam-${childId}`, childId, charged, paid: 0, debt: 0, pending: 0 });

test('forecast opens on tab 1.0 with the microbus forecast', async () => {
  show();
  expect(screen.getByRole('tab', { name: '1.0' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: '2.0' })).toHaveAttribute('aria-selected', 'false');
  expect(await screen.findByText(/нет активных микроавтобусов/)).toBeInTheDocument();
});

test('tab 2.0 counts only minivan and sedan cars, passengers, revenue and tax, without Days', async () => {
  (fetchSummaryForecast as jest.Mock).mockResolvedValue([{ branchId: '1', branchCode: 'TEST', branchName: 'Тестовая школа', revenue: 120000, microbusCount: 2 }]);
  (useLogisticsTable as jest.Mock).mockReturnValue({
    isPending: false,
    isError: false,
    data: [
      child('a', '1', 'microbus'), child('b', '1', 'microbus'),
      child('c', '2', 'minivan'), child('d', '2', 'minivan'),
      child('e', '3', 'sedan'), child('f', '3', 'sedan', 'rejected'),
    ],
  });
  // Микроавтобус «a» не входит в Revenue 2.0: 10 000 + 5 000 + 10 000 = 25 000, налог 4% = 1 000.
  (usePeriodChargeStats as jest.Mock).mockReturnValue({ isPending: false, isError: false, data: [charge('a', 99000), charge('c', 10000), charge('d', 5000), charge('e', 10000)] });
  show();
  await screen.findByText('Тестовая школа');
  expect(screen.getByText('Days')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '2.0' }));
  expect(screen.getByRole('tab', { name: '2.0' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Тестовая школа')).toBeInTheDocument();
  expect(screen.queryByText('Days')).not.toBeInTheDocument();
  expect(screen.getByText('Cars')).toBeInTheDocument();
  expect(screen.getByText('Passengers')).toBeInTheDocument();
  // 2 машины (минивэн + седан) и 3 пассажира (отказник не считается) — в строке школы и в итоге.
  expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByText(/120\s?000/)).not.toBeInTheDocument();
  expect(screen.getAllByText(/25\s000/).length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText(/^1\s000/).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText(/COGS, оплата водителю, остаток и Gross Profit появятся/)).toBeInTheDocument();

  // Клик по школе во 2.0 открывает экран школы здесь же: дети минивэнов и седанов.
  fireEvent.click(screen.getByText('Тестовая школа'));
  expect(onSelectSchool).not.toHaveBeenCalled();
  expect(await screen.findByText('Оплата водителю')).toBeInTheDocument();
  expect(screen.getByText('Ребёнок c')).toBeInTheDocument();
  expect(screen.getByText('Ребёнок e')).toBeInTheDocument();
  expect(screen.queryByText('Ребёнок a')).not.toBeInTheDocument();
  expect(screen.queryByText('Ребёнок f')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Ребёнок c'));
  expect(onOpenChild).toHaveBeenCalledWith('fam-c', 'c');
  fireEvent.click(screen.getByRole('button', { name: /Все школы/ }));
  expect(screen.queryByText('Оплата водителю')).not.toBeInTheDocument();
});

test('school click in 1.0 still opens the manager screen', async () => {
  (fetchSummaryForecast as jest.Mock).mockResolvedValue([{ branchId: '1', branchCode: 'TEST', branchName: 'Тестовая школа', revenue: 120000, microbusCount: 2 }]);
  show();
  fireEvent.click(await screen.findByText('Тестовая школа'));
  expect(onSelectSchool).toHaveBeenCalledWith('TEST', expect.any(String));
});
