import { render, screen } from '@testing-library/react';
import SchoolTransferDashboard from './SchoolTransferDashboard';
import { useFamiliesTable } from '../../hooks/useCrmQueries';

jest.mock('../../hooks/useCrmQueries', () => ({ useFamiliesTable: jest.fn() }));

test('flags assigned unboarded children only in their school and transfer', () => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [
    { familyId: 'a', branchFilter: 'AES', transferNumber: '1', status: 'new', debtAmount: 0 },
    { familyId: 'b', branchFilter: 'AES', transferNumber: '1', status: 'boarded', debtAmount: 0 },
    { familyId: 'c', branchFilter: 'AES', transferNumber: '1', status: 'rejected', debtAmount: 0 },
    { familyId: 'd', branchFilter: 'AES', transferNumber: '2', status: 'boarded', debtAmount: 0 },
    { familyId: 'e', branchFilter: 'AES', transferNumber: '', status: 'new', debtAmount: 0 },
    { familyId: 'f', branchFilter: 'TIS', transferNumber: '1', status: 'new', debtAmount: 0 },
  ] });
  render(<SchoolTransferDashboard schoolKey="AES" />);
  expect(screen.getAllByLabelText('Посадка не подтверждена: 1')).toHaveLength(1);
  expect(screen.getByLabelText('Посадка не подтверждена: 1').closest('button')).toHaveTextContent('#1');
});


test('payment badge counts debtor families instead of unboarded children', () => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [
    { familyId: 'a', branchFilter: 'AES', transferNumber: '1', status: 'boarded', debtAmount: 100 },
    { familyId: 'a', branchFilter: 'AES', transferNumber: '1', status: 'boarded', debtAmount: 100 },
    { familyId: 'b', branchFilter: 'AES', transferNumber: '1', status: 'new', debtAmount: 0 },
  ] });
  render(<SchoolTransferDashboard schoolKey="AES" mode="charges" />);
  expect(screen.getAllByLabelText('Должников: 1')).toHaveLength(1);
  expect(screen.queryByLabelText(/Посадка не подтверждена/)).not.toBeInTheDocument();
});
