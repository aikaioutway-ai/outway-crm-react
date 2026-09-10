import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import B2BClientPaymentsTable from './B2BClientPaymentsTable';
import { updateB2BClientPayment } from '../../services/b2bDataService';
import type { B2BPaymentRecord } from '../../services/b2bPaymentService';

jest.mock('../../services/b2bDataService', () => ({ updateB2BClientPayment: jest.fn() }));

const payments: B2BPaymentRecord[] = [
  { id: 'one', orderId: 'order-10', orderNumber: 'P-10', clientName: 'Клиент', amount: 4500, method: 'personal_account', paymentOrderNumber: 'PP-20', paymentDate: '2026-04-27', comment: 'Вторая часть', status: 'confirmed', createdAt: '' },
  { id: 'two', orderId: 'order-2', orderNumber: 'P-2', clientName: 'Клиент', amount: 1, method: 'cash', paymentDate: '2026-04-28', comment: 'Первая часть', status: 'pending', createdAt: '' },
];

test('shows the payment document column and sorts every column header', () => {
  render(<B2BClientPaymentsTable payments={payments} canEditStatus />);
  expect(screen.getByRole('button', { name: /№ платёжного документа/i })).toBeInTheDocument();
  expect(within(screen.getAllByRole('row')[1]).getByText('P-2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Заказ/i }));
  expect(within(screen.getAllByRole('row')[1]).getByText('P-2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Заказ/i }));
  expect(within(screen.getAllByRole('row')[1]).getByText('P-10')).toBeInTheDocument();
});

test('edits payment fields directly in the selected row', async () => {
  const update = jest.mocked(updateB2BClientPayment).mockResolvedValue(undefined);
  render(<B2BClientPaymentsTable payments={payments} canEditStatus />);
  fireEvent.click(screen.getAllByTitle('Редактировать платёж')[0]);
  fireEvent.change(screen.getByPlaceholderText('Необязательно'), { target: { value: 'DOC-42' } });
  fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2500' } });
  fireEvent.change(screen.getByDisplayValue('На проверке'), { target: { value: 'confirmed' } });
  fireEvent.click(screen.getByTitle('Сохранить'));
  await waitFor(() => expect(update).toHaveBeenCalledWith('two', expect.objectContaining({
    amount: 2500,
    paymentOrderNumber: 'DOC-42',
    status: 'confirmed',
  })));
});
