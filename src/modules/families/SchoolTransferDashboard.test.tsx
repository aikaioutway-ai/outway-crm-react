import { fireEvent, render, screen } from '@testing-library/react';
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


test('manager can select a transfer above 15 and still sees its boarding alert', () => {
  (useFamiliesTable as jest.Mock).mockReturnValue({ data: [
    { familyId: 'a', branchFilter: 'AES', transferNumber: '20', status: 'new', debtAmount: 0 },
  ] });
  const onSelect = jest.fn();
  render(<SchoolTransferDashboard schoolKey="AES" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Следующие трансферы' }));
  const transfer = screen.getByRole('button', { name: /#20/ });
  expect(transfer).toHaveTextContent('! 1');
  fireEvent.click(transfer);
  expect(onSelect).toHaveBeenCalledWith('20');
});
