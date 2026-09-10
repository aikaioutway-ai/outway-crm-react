import { fireEvent, render, screen } from '@testing-library/react';
import Sidebar, { canAccessFinanceExpenses, canAccessSection, getAllowedSections, MARKET_OWNER_EMPLOYEE_ID } from './Sidebar';

test('Kairat and the general director can access Market', () => {
  expect(canAccessSection('admin', 'market', MARKET_OWNER_EMPLOYEE_ID)).toBe(true);
  expect(canAccessSection('admin', 'market', 'another-admin')).toBe(false);
  expect(getAllowedSections('gen_director', 'general-director')).toContain('market');
  expect(getAllowedSections('gen_director', 'general-director'))
    .toEqual(getAllowedSections('admin', MARKET_OWNER_EMPLOYEE_ID));
  expect(getAllowedSections('manager', 'manager')).not.toContain('market');
  expect(getAllowedSections('cashier', 'cashier')).not.toContain('market');
});

test('cashier can open expenses while personal details stay handled separately', () => {
  expect(canAccessFinanceExpenses('cashier')).toBe(true);
  expect(canAccessSection('cashier', 'expenses', 'cashier')).toBe(true);
  expect(canAccessSection('cashier', 'b2b', 'cashier')).toBe(true);
  expect(getAllowedSections('cashier', 'cashier')).toEqual(['cashier', 'expenses', 'b2b']);
});

test('cashier sees B2B in the Sidebar and can open it', () => {
  const onChange = jest.fn();
  render(<Sidebar active="cashier" userRole="cashier" userId="cashier" onChange={onChange} />);

  fireEvent.click(screen.getByTitle('B2B'));

  expect(onChange).toHaveBeenCalledWith('b2b');
});
