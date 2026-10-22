import { fireEvent, render, screen } from '@testing-library/react';
import SchoolTransferDashboard from './SchoolTransferDashboard';
import { useFamiliesTable } from '../../hooks/useCrmQueries';

jest.mock('../../hooks/useCrmQueries', () => ({ useFamiliesTable: jest.fn(), useSchoolTransferNumbers: () => [] }));

test('directory transfer marker shows how many children are in the transfer', () => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [
    { familyId: 'a', branchFilter: 'AES', transferNumber: '1', status: 'new', debtAmount: 0 },
    { familyId: 'b', branchFilter: 'AES', transferNumber: '1', status: 'boarded', debtAmount: 0 },
    { familyId: 'c', branchFilter: 'AES', transferNumber: '1', status: 'rejected', debtAmount: 0 },
    { familyId: 'd', branchFilter: 'AES', transferNumber: '2', status: 'boarded', debtAmount: 0 },
    { familyId: 'e', branchFilter: 'AES', transferNumber: '', status: 'new', debtAmount: 0 },
    { familyId: 'f', branchFilter: 'TIS', transferNumber: '1', status: 'new', debtAmount: 0 },
  ] });
  render(<SchoolTransferDashboard schoolKey="AES" />);
  // Трансфер 1: два ребёнка (отказник не считается), трансфер 2: один.
  expect(screen.getByTitle(/^2 детей/)).toHaveTextContent('21');
  expect(screen.getAllByTitle(/^1 детей/).some(cell => cell.textContent === '12')).toBe(true);
  expect(screen.queryByTitle(/Посадка не подтверждена/)).not.toBeInTheDocument();
});


test('manager can select a transfer above 15 and still sees its boarding alert', () => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [
    { familyId: 'a', branchFilter: 'AES', transferNumber: '20', status: 'new', debtAmount: 0 },
  ] });
  const onSelect = jest.fn();
  render(<SchoolTransferDashboard schoolKey="AES" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Следующие трансферы' }));
  const transfer = screen.getByRole('button', { name: /20/ });
  expect(transfer).toHaveTextContent('1');
  expect(transfer).not.toHaveTextContent('!');
  fireEvent.click(transfer);
  expect(onSelect).toHaveBeenCalledWith('20');
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
