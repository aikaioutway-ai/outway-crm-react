import React from 'react';
import { render, screen } from '@testing-library/react';
import ManagerModeTabs, { canAccessManagerAccruals, canAccessManagerReceipts, canAccessManagerReconciliation } from './ManagerModeTabs';
import type { UserRole } from '../../types';

test.each(['director', 'gen_director'] as UserRole[])('%s can access accruals', role => {
  expect(canAccessManagerAccruals(role, 'employee')).toBe(true);
});
test.each(['admin', 'manager', 'cashier', 'logist', 'senior_logist', 'b2b_manager', 'b2b_logist'] as UserRole[])('%s does not have accrual access as another employee', role => {
  expect(canAccessManagerAccruals(role, 'employee')).toBe(false);
});
test('owner retains access; hidden tab is absent by default', () => {
  expect(canAccessManagerAccruals('admin', 'emp-admin')).toBe(true);
  const { rerender } = render(<ManagerModeTabs value="directory" onChange={jest.fn()} />);
  expect(screen.queryByRole('tab', { name: 'Начисления' })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Оплаты' })).toBeInTheDocument();
  rerender(<ManagerModeTabs value="directory" onChange={jest.fn()} canViewAccruals />);
  expect(screen.getByRole('tab', { name: 'Начисления' })).toBeInTheDocument();
});
test.each([['admin', true], ['gen_director', true], ['director', true], ['manager', true], ['cashier', true], ['logist', false], ['senior_logist', false], ['b2b_manager', false]] as [UserRole, boolean][])('%s receipts access: %s', (role, allowed) => {
  expect(canAccessManagerReceipts(role)).toBe(allowed);
});
test('receipts tab appears only for employees with receipts access', () => {
  const onChange = jest.fn();
  const { rerender } = render(<ManagerModeTabs value="directory" onChange={onChange} />);
  expect(screen.queryByRole('tab', { name: 'Чеки' })).not.toBeInTheDocument();
  rerender(<ManagerModeTabs value="directory" onChange={onChange} showReceipts />);
  screen.getByRole('tab', { name: 'Чеки' }).click();
  expect(onChange).toHaveBeenCalledWith('receipts');
});

test.each([['manager', true], ['director', true], ['cashier', false], ['b2b_manager', false]] as [UserRole, boolean][])('%s logistics reconciliation access: %s', (role, allowed) => {
  expect(canAccessManagerReconciliation(role)).toBe(allowed);
});
test('reconciliation tab is shown only when allowed', () => {
  const { rerender } = render(<ManagerModeTabs value="directory" onChange={jest.fn()} />);
  expect(screen.queryByRole('tab', { name: 'Сверка' })).not.toBeInTheDocument();
  rerender(<ManagerModeTabs value="directory" onChange={jest.fn()} showReconciliation />);
  expect(screen.getByRole('tab', { name: 'Сверка' })).toBeInTheDocument();
});
