import React from 'react';
import { render, screen } from '@testing-library/react';
import TabFinance from './TabFinance';

const props: React.ComponentProps<typeof TabFinance> = {
  charges: [], payments: [], paymentItems: [], refunds: [], children: [], loading: false,
  family: {} as React.ComponentProps<typeof TabFinance>['family'],
  isAdmin: true, isCashier: false, isManager: false,
  onSaveCharge: jest.fn(), onDeleteCharge: jest.fn(), onAddCharges: jest.fn(),
  onCreatePayment: jest.fn(), onConfirmPayment: jest.fn(), onSavePayment: jest.fn(),
  onDeletePayment: jest.fn(), onCreateRefund: jest.fn(), onConfirmRefund: jest.fn(), onRejectRefund: jest.fn(),
};

test('keeps charges separate and combines payment and refund forms', () => {
  const { rerender } = render(<TabFinance {...props} mode="charges" />);
  expect(screen.getByText('Начисления по периодам')).toBeInTheDocument();
  expect(screen.queryByText('Новый платёж')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Сумма возврата')).not.toBeInTheDocument();

  rerender(<TabFinance {...props} mode="payments" />);
  expect(screen.getByText('Новый платёж')).toBeInTheDocument();
  expect(screen.getByText('Прикрепить чек')).toBeInTheDocument();
  expect(screen.queryByText('Начисления по периодам')).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('Сумма возврата')).toBeInTheDocument();

  rerender(<TabFinance {...props} mode="refunds" />);
  expect(screen.getByPlaceholderText('Сумма возврата')).toBeInTheDocument();
  expect(screen.getByText('Новый платёж')).toBeInTheDocument();
  expect(screen.queryByText('Начисления по периодам')).not.toBeInTheDocument();
});
