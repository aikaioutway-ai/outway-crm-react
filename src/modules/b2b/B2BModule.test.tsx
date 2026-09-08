import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import B2BModule from './B2BModule';
jest.mock('./B2BClients', () => () => <div>Clients content</div>);
jest.mock('./B2BOrders', () => () => <div>Orders content</div>);
jest.mock('./B2BCalendar', () => () => <div>Calendar content</div>);
jest.mock('./B2BLogistics', () => () => <div>Logistics content</div>);
jest.mock('./B2BExpenses', () => () => <div>Expenses content</div>);
jest.mock('./B2BFinance', () => () => <div>Finance content</div>);
jest.mock('./B2BCashflow', () => () => <div>Cashflow content</div>);
jest.mock('./B2BCashier', () => ({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) => <div>Cashier content{onOpenOrder && <button onClick={() => onOpenOrder('order')}>Open linked order</button>}</div>);

test('cashier cannot open restricted tabs or linked orders', () => {
  render(<B2BModule userRole="cashier" />);
  for (const name of ['Заказы', 'Логистика', 'Календарь', 'P&L по заказам', 'Open linked order']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
  expect(screen.getByText('Cashier content')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Расходы' }));
  expect(screen.getByText('Expenses content')).toBeInTheDocument();
});

test('role change cannot leave a restricted screen mounted', () => {
  const { rerender } = render(<B2BModule userRole="admin" />);
  expect(screen.getByText('Orders content')).toBeInTheDocument();
  rerender(<B2BModule userRole="cashier" />);
  expect(screen.queryByText('Orders content')).not.toBeInTheDocument();
  expect(screen.getByText('Cashier content')).toBeInTheDocument();
});
