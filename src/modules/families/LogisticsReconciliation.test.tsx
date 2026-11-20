import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LogisticsReconciliation from './LogisticsReconciliation';
import * as driverCheckService from '../../services/driverCheckService';
import * as crmQueries from '../../hooks/useCrmQueries';

jest.mock('../../services/driverCheckService', () => {
  const actual = jest.requireActual('../../services/driverCheckService');
  return {
    ...actual,
    fetchLogisticsReconciliationMonth: jest.fn(),
    rotateTransferDriverToken: jest.fn(),
  };
});

jest.mock('../../hooks/useCrmQueries', () => ({
  useLogisticsTable: jest.fn(),
}));

const mockedService = driverCheckService as jest.Mocked<typeof driverCheckService>;
const mockedQueries = crmQueries as jest.Mocked<typeof crmQueries>;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('LogisticsReconciliation (monthly 4-round table)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedQueries.useLogisticsTable.mockReturnValue({
      data: [
        {
          rowId: 'c1',
          familyId: 'f1',
          childName: 'Алия Ахметова',
          parentName: 'Айгуль',
          streetAddress: 'ул. Чуй 10',
          phone: '0555111222',
          branchFilter: 'TIS',
          transferNumber: '3',
          stopNumber: '1',
          vehicleType: 'microbus',
          status: 'boarded',
        },
        {
          rowId: 'c2',
          familyId: 'f2',
          childName: 'Тимур Исаев',
          parentName: 'Марат',
          streetAddress: 'мкр. Джал 15',
          phone: '0555333444',
          branchFilter: 'TIS',
          transferNumber: '3',
          stopNumber: '2',
          vehicleType: 'microbus',
          status: 'boarded',
        },
      ] as any,
      isPending: false,
    } as any);

    mockedService.fetchLogisticsReconciliationMonth.mockResolvedValue({
      year: 2026,
      month: 11,
      today: '2026-11-20',
      currentRound: 3,
      transfers: [
        {
          transferId: 't3',
          schoolKey: 'TIS',
          schoolLabel: 'TIS',
          branchId: 'b1',
          transferNumber: 3,
          vehicleType: 'microbus',
          driverId: 'd1',
          driverName: 'Азамат Беков',
          driverPhone: '0555999888',
          driverLinkToken: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
          rounds: {
            1: { checked: true, lastAt: '2026-11-05T02:10:00Z' },
          },
        },
      ],
      marksByChild: {
        c1: {
          1: { present: true, checkDate: '2026-11-05', markedAt: '2026-11-05T02:10:00Z' },
        },
      },
    });
  });

  test('selects the first active transfer when opening a school without a selection', async () => {
    const select = jest.fn();
    renderWithQuery(<LogisticsReconciliation schoolKey="TIS" periodKey="11" sessionToken="tok" onTransferSelect={select} />);
    await waitFor(() => expect(select).toHaveBeenCalledWith('3'));
  });

  test('renders 4 check rounds, transfer link button, and opens family on child click', async () => {
    const onOpenFamily = jest.fn();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    renderWithQuery(
      <LogisticsReconciliation
        schoolKey="TIS"
        periodKey="11"
        transferFilter="3"
        sessionToken="tok"
        onOpenFamily={onOpenFamily}
      />,
    );

    expect(screen.getByText('Сверка 1')).toBeInTheDocument();
    expect(screen.getByText('Сверка 2')).toBeInTheDocument();
    expect(screen.getByText('Сверка 3')).toBeInTheDocument();
    expect(screen.getByText('Сверка 4')).toBeInTheDocument();

    const linkBtn = await screen.findByRole('button', { name: /Ссылка трансфера №3/i });
    fireEvent.click(linkBtn);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/driver/a1b2c3d4e5f60718293a4b5c6d7e8f90'));

    fireEvent.click(screen.getByRole('button', { name: 'Алия Ахметова' }));
    expect(onOpenFamily).toHaveBeenCalledWith('f1', 'c1');


  });
});

test('counts completed transfers for the current round independently of child marks', () => {
  const base = {
    currentRound: 3, transfers: [
      { schoolKey: 'TIS', rounds: { 1: { checked: true }, 3: { checked: true } } },
      { schoolKey: 'TIS', rounds: { 1: { checked: true } } },
      { schoolKey: 'AES', rounds: { 3: { checked: true } } },
    ],
    marksByChild: { child: { 3: { present: true } } },
  } as unknown as driverCheckService.ReconciliationMonthData;
  expect(driverCheckService.reconciliationTransferCounts(base, 'TIS')).toEqual({ completed: 1, pending: 1 });
  expect(driverCheckService.reconciliationTransferCounts(base)).toEqual({ completed: 2, pending: 1 });
});
