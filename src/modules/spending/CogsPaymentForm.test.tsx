import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SpendingEntry } from './SpendingModule';
import CogsPaymentForm from './CogsPaymentForm';
import { SCHOOL_TABS } from '../families/constants';

jest.mock('../../hooks/useCrmQueries', () => ({ useDriversTable: () => ({ data: [
  { driverId: 'driver-a', status: 'active', fullName: 'Водитель А', transfers: [{ id: 'transfer-a', transferNumber: 1, branchShort: SCHOOL_TABS.find(item => item.key !== 'ALL')!.label, branchCode: '' }] },
  { driverId: 'driver-b', status: 'active', fullName: 'Водитель Б', transfers: [{ id: 'transfer-b', transferNumber: 2, branchShort: SCHOOL_TABS.find(item => item.key !== 'ALL')!.label, branchCode: '' }] },
], isLoading: false, error: null }) }));

test('saves separate payments for each selected driver and period in one batch', () => {
  const save = jest.fn((_entries: SpendingEntry[]) => true);
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => Math.random().toString() });
  render(<CogsPaymentForm entry={{ id: '', category: 'COGS', subcategory: 'Авансы водителям', date: '2026-10-28', amount: 0, description: '', recipient: '', method: 'Безналичные' }} disabled={false} onCancel={() => undefined} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: SCHOOL_TABS.find(item => item.key !== 'ALL')!.label }));
  fireEvent.click(screen.getByRole('button', { name: /Все/ }));
  fireEvent.click(screen.getByLabelText('Выбрать всех в списке'));
  fireEvent.change(screen.getByLabelText('Сумма для всех выбранных'), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  expect(screen.getByLabelText('Сумма для Водитель А')).toHaveValue(1000);
  fireEvent.click(screen.getByRole('button', { name: 'Разделить' }));
  const firstAmount = screen.getByLabelText('Сумма для Водитель А');
  const secondAmount = screen.getByLabelText('Сумма для Водитель Б');
  expect(firstAmount).toHaveValue(500);
  firstAmount.focus();
  fireEvent.keyDown(firstAmount, { key: 'Tab' });
  expect(secondAmount).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  expect(screen.getByRole('form', { name: 'Новая выплата COGS' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Учебный год')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать: За период' }));
  // Периоды — кнопки по половинам месяца, все месяцы видны сразу.
  const periodButtons = () => screen.getAllByRole('button').filter(button => button.closest('.payment-period-month-grid'));
  fireEvent.click(periodButtons()[0]);
  fireEvent.click(periodButtons()[1]);
  expect(periodButtons().filter(button => button.getAttribute('aria-pressed') === 'true')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Платёжное поручение'), { target: { value: 'ПП-123' } });
  fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'Выплата по ведомости' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить выплаты' }));
  expect(save).toHaveBeenCalledTimes(1);
  const entries = save.mock.calls[0][0];
  expect(entries).toHaveLength(4);
  expect(entries.every(entry => entry.paymentOrderNumber === 'ПП-123' && entry.comment === 'Выплата по ведомости')).toBe(true);
  expect(entries.reduce((sum: number, entry: { amount: number }) => sum + entry.amount, 0)).toBe(1000);
  expect(new Set(entries.map((entry) => entry.driverId)).size).toBe(2);
  expect(new Set(entries.map((entry) => entry.salaryPeriodKey)).size).toBe(2);
});

test('finds and pays a driver without selecting school or transfer first', () => {
  const save = jest.fn((_entries: SpendingEntry[]) => true);
  render(<CogsPaymentForm entry={{ id: '', category: 'COGS', subcategory: 'Авансы водителям', date: '2026-10-29', amount: 0, description: '', recipient: '', method: 'Безналичные' }} disabled={false} onCancel={() => undefined} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать водителей' }));
  fireEvent.change(screen.getByLabelText('Поиск водителя'), { target: { value: 'Водитель Б' } });
  expect(screen.queryByLabelText('Водитель А')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Водитель Б'));
  fireEvent.change(screen.getByLabelText('Сумма для Водитель Б'), { target: { value: '2500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать: За период' }));
  fireEvent.click(screen.getAllByRole('button').filter(button => button.closest('.payment-period-month-grid'))[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить выплаты' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0][0]).toMatchObject({ driverId: 'driver-b', transferId: 'transfer-b', schoolKey: SCHOOL_TABS.find(item => item.key !== 'ALL')!.key, amount: 2500 });
});
