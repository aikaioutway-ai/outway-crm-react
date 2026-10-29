import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SummaryModule from './SummaryModule';
import { fetchSummaryForecast, fetchSummaryWorkingDays } from '../../services/summaryService';

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
});

test('forecast opens on tab 1.0 with the microbus forecast', async () => {
  show();
  expect(screen.getByRole('tab', { name: '1.0' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: '2.0' })).toHaveAttribute('aria-selected', 'false');
  expect(await screen.findByText(/нет активных микроавтобусов/)).toBeInTheDocument();
});

test('tab 2.0 explains that minivan and sedan forecast waits for driver rates', async () => {
  show();
  await screen.findByText(/нет активных микроавтобусов/);
  fireEvent.click(screen.getByRole('tab', { name: '2.0' }));
  expect(screen.getByRole('tab', { name: '2.0' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText(/Прогноз по минивэнам и седанам появится/)).toBeInTheDocument();
  expect(screen.queryByText(/нет активных микроавтобусов/)).not.toBeInTheDocument();
});
