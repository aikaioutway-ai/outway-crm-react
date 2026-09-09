import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import B2BModule from './B2BModule';
jest.mock('./B2BClients', () => () => <div>Clients content</div>);
jest.mock('./B2BOrders', () => ({ onCloseOrder }: { onCloseOrder?: () => void }) => <div>Orders content{onCloseOrder && <button onClick={onCloseOrder}>Close linked order</button>}</div>);
jest.mock('./B2BCalendar', () => () => <div>Calendar content</div>);
jest.mock('./B2BLogistics', () => () => <div>Logistics content</div>);
jest.mock('./B2BExpenses', () => () => <div>Expenses content</div>);
jest.mock('./B2BFinance', () => ({ selectedMonthNumber, onSelectedMonthChange, onOpenOrder }: { selectedMonthNumber: number | 'all' | null; onSelectedMonthChange: (month: number | 'all' | null) => void; onOpenOrder?: (id: string) => void }) => <div>Finance content · month {selectedMonthNumber ?? 'none'}<button onClick={() => onSelectedMonthChange(1)}>Open January</button><button onClick={() => onSelectedMonthChange('all')}>Open all periods</button>{onOpenOrder && <button onClick={() => onOpenOrder('order')}>Open finance order</button>}</div>);
jest.mock('./B2BCashflow', () => () => <div>Cashflow content</div>);
jest.mock('./B2BCashier', () => ({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) => <div>Cashier content{onOpenOrder && <button onClick={() => onOpenOrder('order')}>Open linked order</button>}</div>);

test('cashier sees orders while operational sections stay restricted', () => {
  render(<B2BModule userRole="cashier" />);
  expect(screen.getByRole('button', { name: 'Заказы' })).toBeInTheDocument();
  for (const name of ['Логистика', 'Календарь', 'P&L по заказам']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
  expect(screen.getByText('Cashier content')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open linked order' }));
  expect(screen.getByText('Orders content')).toBeInTheDocument();
});

test('cashier can still navigate after returning from linked order', () => {
  render(<B2BModule userRole="cashier" />);
  fireEvent.click(screen.getByRole('button', { name: 'Расходы' }));
  expect(screen.getByText('Expenses content')).toBeInTheDocument();
});

test('role change keeps an order screen mounted when it is allowed for cashier', () => {
  const { rerender } = render(<B2BModule userRole="admin" />);
  expect(screen.getByText('Orders content')).toBeInTheDocument();
  rerender(<B2BModule userRole="cashier" />);
  expect(screen.getByText('Orders content')).toBeInTheDocument();
});

test('returning from an order keeps the selected P&L month open', () => {
  render(<B2BModule userRole="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'P&L по заказам' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open January' }));
  expect(screen.getByText('Finance content · month 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open finance order' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close linked order' }));
  expect(screen.getByText('Finance content · month 1')).toBeInTheDocument();
});

test('all P&L periods remain selected after opening an order', () => {
  render(<B2BModule userRole="admin" />);
  fireEvent.click(screen.getByRole('button', { name: 'P&L по заказам' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open all periods' }));
  expect(screen.getByText('Finance content · month all')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open finance order' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close linked order' }));
  expect(screen.getByText('Finance content · month all')).toBeInTheDocument();
});
