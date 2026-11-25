import { fireEvent, render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { useLogisticsTable } from '../../hooks/useCrmQueries';
import LogisticsReconciliationOverview from './LogisticsReconciliationOverview';

jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQuery: jest.fn() }));
jest.mock('../../hooks/useCrmQueries', () => ({ useLogisticsTable: jest.fn() }));
jest.mock('../../services/driverCheckService', () => ({ fetchLogisticsReconciliationMonth: jest.fn() }));
jest.mock('./LogisticsReconciliation', () => ({
  RECONCILIATION_PERIODS: [{ key: 'nov', month: 11, year: 2026, label: 'Ноябрь' }],
  resolveReconciliationPeriod: () => ({ key: 'nov', month: 11, year: 2026 }),
}));

test('starts with school summaries and opens only the selected school', () => {
  (useLogisticsTable as jest.Mock).mockReturnValue({ data: [
    { branchFilter: 'TIS', transferNumber: '1', status: 'boarded' },
    { branchFilter: 'TIS', transferNumber: '2', status: 'boarded' },
  ] });
  (useQuery as jest.Mock).mockReturnValue({ data: { currentRound: 4, transfers: [
    { schoolKey: 'TIS', transferNumber: 1, rounds: { 4: { checked: true } } },
    { schoolKey: 'TIS', transferNumber: 2, rounds: {} },
    { schoolKey: 'AES', transferNumber: 1, rounds: {} },
  ] } });
  const onSelectSchool = jest.fn();
  render(<LogisticsReconciliationOverview sessionToken="token" schoolTier="1.0" allowedSchools={['TIS']} periodKey="nov" onPeriodChange={jest.fn()} onSelectSchool={onSelectSchool} />);
  expect(screen.getByRole('heading', { name: 'Не сделано 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /AES/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /TIS.*Не сделано 1/ }));
  expect(onSelectSchool).toHaveBeenCalledWith('TIS');
});
