import { fireEvent, render, screen } from '@testing-library/react';
import SchoolTransferDashboard from './SchoolTransferDashboard';
import { useFamiliesTable, useSchoolTransferStats } from '../../hooks/useCrmQueries';

jest.mock('../../hooks/useCrmQueries', () => ({ useFamiliesTable: jest.fn(), useSchoolTransferStats: jest.fn(), useSchoolTransferNumbers: () => [] }));

beforeEach(() => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: undefined });
  (useSchoolTransferStats as jest.Mock).mockReturnValue({ data: undefined });
});

test('directory transfer marker shows how many children are in the transfer', () => {
  // Справочник берёт готовые цифры из базы (get_school_transfer_stats).
  (useSchoolTransferStats as jest.Mock).mockReturnValue({ data: {
    1: { children: 2, debtSum: 0 },
    2: { children: 1, debtSum: 0 },
    new: { children: 1, debtSum: 0 },
    rejected: { children: 1, debtSum: 0 },
    all: { children: 4, debtSum: 0 },
  } });
  render(<SchoolTransferDashboard schoolKey="AES" />);
  expect(useFamiliesTable).toHaveBeenCalledWith({ enabled: false });
  // Трансфер 1: два ребёнка (отказник не считается), трансфер 2: один.
  expect(screen.getByTitle(/^2 детей/)).toHaveTextContent('21');
  expect(screen.getAllByTitle(/^1 детей/).some(cell => cell.textContent === '12')).toBe(true);
  expect(screen.queryByTitle(/Посадка не подтверждена/)).not.toBeInTheDocument();
});


test('school shows only transfers 1–15 and no pages beyond them', () => {
  (useSchoolTransferStats as jest.Mock).mockReturnValue({ data: { 20: { children: 1, debtSum: 0 }, all: { children: 1, debtSum: 0 } } });
  render(<SchoolTransferDashboard schoolKey="AES" onSelect={jest.fn()} />);
  expect(screen.getByRole('button', { name: '15' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '16' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '20' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Следующие трансферы' })).not.toBeInTheDocument();
});


test('payment badge counts debtor families instead of unboarded children', () => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [
    { familyId: 'a', branchFilter: 'AES', transferNumber: '1', status: 'boarded', debtAmount: 100 },
    { familyId: 'a', branchFilter: 'AES', transferNumber: '1', status: 'boarded', debtAmount: 100 },
    { familyId: 'b', branchFilter: 'AES', transferNumber: '1', status: 'new', debtAmount: 0 },
  ] });
  render(<SchoolTransferDashboard schoolKey="AES" mode="charges" />);
  expect(screen.getAllByTitle(/Должников: 1$/)).toHaveLength(1);
  expect(screen.queryByTitle(/Посадка не подтверждена/)).not.toBeInTheDocument();
});
