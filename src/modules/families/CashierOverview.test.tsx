import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CashierOverview from './CashierOverview';
import { usePaymentsTable, useRefundsTable } from '../../hooks/useCrmQueries';
jest.mock('../../hooks/useCrmQueries', () => ({ usePaymentsTable: jest.fn(), useRefundsTable: jest.fn() }));

test('cashier totals respect the selected status and hidden schools; whole school cell opens once', () => {
  (usePaymentsTable as jest.Mock).mockReturnValue({ data: [
    { familyId: 'a', branchShort: 'AES', status: 'pending', amount: 100, paymentMethod: 'qr', paymentDate: '2026-10-12' },
    { familyId: 'b', branchShort: 'AES', status: 'confirmed', amount: 200, paymentMethod: 'qr', paymentDate: '2026-10-12' },
    { familyId: 'c', branchShort: 'BJ', status: 'pending', amount: 999, paymentMethod: 'qr', paymentDate: '2026-10-12' },
  ] });
  (useRefundsTable as jest.Mock).mockReturnValue({ data: [] });
  const onSelect = jest.fn();
  const props = { periodKey: '10', onPeriodKeyChange: jest.fn(), onSelectSchool: onSelect, onViewChange: jest.fn() };
  const { rerender } = render(<CashierOverview {...props} view="pending" />);
  expect(screen.getByRole('columnheader', { name: /100 сом QR/ })).toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: 'BJ BJ' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('cell', { name: 'AES AES' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith('AES');
  rerender(<CashierOverview {...props} view="confirmed" />);
  expect(screen.getByRole('columnheader', { name: /200 сом QR/ })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /200 сом Подтверждено/ })).toBeInTheDocument();
});
