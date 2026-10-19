import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmployeeAdvanceModal from './EmployeeAdvanceModal';
import { createV2DriverAdvance } from '../../services/crmV2Service';
import { createEmployeeAdvance } from '../../services/employeeService';

jest.mock('../../services/crmV2Service', () => ({ createV2DriverAdvance: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/employeeService', () => ({ createEmployeeAdvance: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../hooks/useCrmQueries', () => ({
  useEmployees: () => ({ data: [{ id: 'office', fullName: 'Офисный сотрудник', status: 'active', role: 'manager' }] }),
  useDriversTable: () => ({ data: [
    { driverId: 'driver-a', fullName: 'Водитель А', status: 'active', transfers: [{ id: 'transfer-a', transferNumber: 3, branchCode: 'TENSAY', branchShort: 'TIS' }] },
    { driverId: 'driver-b', fullName: 'Водитель Б', status: 'active', transfers: [{ id: 'transfer-b', transferNumber: 5, branchCode: 'ERUDIT', branchShort: 'ERU' }] },
    { driverId: 'inactive', fullName: 'Уволенный водитель', status: 'dismissed', transfers: [] },
  ] }),
}));

beforeEach(() => jest.clearAllMocks());

test('choosing a driver directly fills assignment and saves to driver advances', async () => {
  const saved = jest.fn();
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={saved} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Подразделение' }), { target: { value: 'drivers' } });
  expect(screen.queryByRole('option', { name: 'Уволенный водитель' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Водитель' }), { target: { value: 'driver-a' } });
  expect(screen.getByRole('combobox', { name: 'Школа' })).toHaveValue('TIS');
  expect(screen.getByRole('combobox', { name: 'Трансфер' })).toHaveValue('transfer-a');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Сумма, сом' }), { target: { value: '500' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Способ оплаты' }), { target: { value: 'cash' } });
  fireEvent.click(screen.getByRole('button', { name: 'Выдать аванс' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(createV2DriverAdvance).toHaveBeenCalledWith(expect.objectContaining({ driverId: 'driver-a', transferId: 'transfer-a', schoolKey: 'TIS', amount: 500, paymentMethod: 'cash' }));
  expect(createEmployeeAdvance).not.toHaveBeenCalled();
});

test('school filters drivers and selecting a transfer fills its driver', () => {
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Подразделение' }), { target: { value: 'drivers' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Школа' }), { target: { value: 'ERU' } });
  expect(screen.queryByRole('option', { name: 'Водитель А' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Трансфер' }), { target: { value: 'transfer-b' } });
  expect(screen.getByRole('combobox', { name: 'Водитель' })).toHaveValue('driver-b');
  fireEvent.change(screen.getByRole('combobox', { name: 'Школа' }), { target: { value: 'TIS' } });
  expect(screen.getByRole('combobox', { name: 'Водитель' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Трансфер' })).toHaveValue('');
});

test('office advances remain separate from driver advances', async () => {
  render(<EmployeeAdvanceModal onClose={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Подразделение' }), { target: { value: 'office' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Сотрудник' }), { target: { value: 'office' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Сумма, сом' }), { target: { value: '300' } });
  fireEvent.click(screen.getByRole('button', { name: 'Выдать аванс' }));
  await waitFor(() => expect(createEmployeeAdvance).toHaveBeenCalled());
  expect(createEmployeeAdvance).toHaveBeenCalledWith('office', 300, expect.any(String), '', expect.objectContaining({ schoolKey: 'OFFICE' }));
  expect(createV2DriverAdvance).not.toHaveBeenCalled();
});
