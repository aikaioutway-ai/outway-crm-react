import { fireEvent, render, screen } from '@testing-library/react';
import Sidebar, { canAccessFinanceExpenses, canAccessSection, getAllowedSections } from './Sidebar';

test('cashier can open expenses while personal details stay handled separately', () => {
  expect(canAccessFinanceExpenses('cashier')).toBe(true);
  expect(canAccessSection('cashier', 'families', 'cashier')).toBe(true);
  expect(canAccessSection('cashier', 'expenses', 'cashier')).toBe(true);
  expect(canAccessSection('cashier', 'b2b', 'cashier')).toBe(true);
  expect(getAllowedSections('cashier', 'cashier')).toEqual(['cashier', 'families', 'schools2', 'expenses', 'spending', 'b2b', 'tasks']);
});

test('cashier sees Manager in the Sidebar and can open it', () => {
  const onChange = jest.fn();
  render(<Sidebar active="cashier" userRole="cashier" userId="cashier" onChange={onChange} />);

  fireEvent.click(screen.getByTitle('Менеджер'));

  expect(onChange).toHaveBeenCalledWith('families');
});

test('cashier sees B2B in the Sidebar and can open it', () => {
  const onChange = jest.fn();
  render(<Sidebar active="cashier" userRole="cashier" userId="cashier" onChange={onChange} />);

  fireEvent.click(screen.getByTitle('B2B'));

  expect(onChange).toHaveBeenCalledWith('b2b');
});

test('Schools 2.0 is shown only in the expanded Sidebar', () => {
  const onChange = jest.fn();
  render(<Sidebar active="families" userRole="manager" userId="manager" onChange={onChange} />);
  expect(screen.queryByTitle('Школы 2.0')).toBeNull();

  fireEvent.click(screen.getByLabelText('Развернуть меню'));
  fireEvent.click(screen.getByTitle('Школы 2.0'));

  expect(onChange).toHaveBeenCalledWith('schools2');
  expect(getAllowedSections('logist', 'logist')).not.toContain('schools2');
});

test('spending is available to the same roles as finance', () => {
  expect(getAllowedSections('admin', 'emp-admin')).toContain('spending');
  expect(getAllowedSections('admin', 'other-admin')).toContain('spending');
  expect(getAllowedSections('gen_director', 'director')).toContain('spending');
  expect(getAllowedSections('cashier', 'cashier')).toContain('spending');
  expect(getAllowedSections('director', 'director')).not.toContain('spending');
  expect(getAllowedSections('manager', 'manager')).not.toContain('spending');
});
