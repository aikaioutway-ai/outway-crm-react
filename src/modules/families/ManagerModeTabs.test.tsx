import React from 'react';
import { render, screen } from '@testing-library/react';
import ManagerModeTabs, { canAccessManagerAccruals } from './ManagerModeTabs';
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
