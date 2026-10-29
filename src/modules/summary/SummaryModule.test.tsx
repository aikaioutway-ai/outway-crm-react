import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SummaryModule from './SummaryModule';
import { fetchSummaryForecast, fetchSummaryWorkingDays } from '../../services/summaryService';
import { useLogisticsTable } from '../../hooks/useCrmQueries';

jest.mock('../../hooks/useCrmQueries', () => ({
  ...jest.requireActual('../../hooks/useCrmQueries'),
  useLogisticsTable: jest.fn(),
}));

jest.mock('../../services/summaryService', () => ({
  fetchSummaryForecast: jest.fn(),
  fetchSummaryWorkingDays: jest.fn(),
  setSummaryWorkingDays: jest.fn(),
}));

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SummaryModule onSelectSchool={jest.fn()} /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchSummaryForecast as jest.Mock).mockResolvedValue([]);
  (fetchSummaryWorkingDays as jest.Mock).mockResolvedValue([]);
  (useLogisticsTable as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
});

const child = (id: string, transferNumber: string, vehicleType: string, status = 'active') => ({ rowId: id, familyId: id, branchFilter: 'TEST', transferNumber, vehicleType, status });

test('forecast opens on tab 1.0 with the microbus forecast', async () => {
  show();
  expect(screen.getByRole('tab', { name: '1.0' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: '2.0' })).toHaveAttribute('aria-selected', 'false');
  expect(await screen.findByText(/нет активных микроавтобусов/)).toBeInTheDocument();
});

test('tab 2.0 counts only minivan and sedan cars and passengers, without Days and money', async () => {
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
  expect(screen.getByText(/Revenue, COGS, налог и Gross Profit появятся/)).toBeInTheDocument();
});
