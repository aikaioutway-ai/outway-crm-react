import { fireEvent, render, screen } from '@testing-library/react';
import Sidebar, { canAccessSection, canAccessSpending, getAllowedSections } from './Sidebar';

test('cashier works with spending; the old Finance section is gone for everyone', () => {
  expect(canAccessSpending('cashier')).toBe(true);
  expect(canAccessSection('cashier', 'families', 'cashier')).toBe(true);
  expect(canAccessSection('cashier', 'b2b', 'cashier')).toBe(true);
  expect(getAllowedSections('cashier', 'cashier')).toEqual(['cashier', 'cashier2', 'families', 'manager2', 'schools2', 'b2b', 'spending', 'tasks', 'messages']);
});

test('spending stays limited to admin, general director, cashier and the owner', () => {
  expect(canAccessSpending('admin')).toBe(true);
  expect(canAccessSpending('gen_director')).toBe(true);
  expect(canAccessSpending('director')).toBe(false);
  expect(canAccessSpending('senior_logist')).toBe(false);
  expect(canAccessSpending('director', 'emp-admin')).toBe(true);
});

test('nobody sees Finance in the sidebar', () => {
  render(<Sidebar active="cashier" userRole="admin" userId="emp-admin" onChange={jest.fn()} />);
  expect(screen.queryByTitle('Финансы')).toBeNull();
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

  for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByLabelText('Развернуть меню'));
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

test('only the owner expands the Sidebar with one click; staff need five clicks in a row', () => {
  const { unmount } = render(<Sidebar active="families" userRole="admin" userId="emp-admin" onChange={jest.fn()} />);
  fireEvent.click(screen.getByLabelText('Развернуть меню'));
  expect(screen.getByLabelText('Свернуть меню')).toBeTruthy();
  unmount();

  render(<Sidebar active="families" userRole="director" userId="director" onChange={jest.fn()} />);
  for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByLabelText('Развернуть меню'));
  expect(screen.queryByLabelText('Свернуть меню')).toBeNull();
  fireEvent.click(screen.getByLabelText('Развернуть меню'));
  expect(screen.getByLabelText('Свернуть меню')).toBeTruthy();
});

test('the 2.0 switch sends Manager, Logistics and Cashier to their 2.0 sections for the owner', () => {
  localStorage.clear();
  const onChange = jest.fn();
  render(<Sidebar active="summary" userRole="admin" userId="emp-admin" onChange={onChange} />);
  fireEvent.click(screen.getByLabelText('Развернуть меню'));
  expect(screen.queryByTitle('Кассир 2.0')).toBeNull();

  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByTitle('Менеджер'));
  fireEvent.click(screen.getByTitle('Логистика'));
  fireEvent.click(screen.getByTitle('Кассир'));
  expect(onChange.mock.calls.map(call => call[0])).toEqual(['manager2', 'logistics2', 'cashier2']);
  expect(localStorage.getItem('ow-sidebar-v2:emp-admin')).toBe('1');
});

test('staff can switch versions after expanding the menu, within their role', () => {
  localStorage.removeItem('ow-sidebar-v2:manager');
  const onChange = jest.fn();
  const { rerender } = render(<Sidebar active="families" userRole="manager" userId="manager" onChange={onChange} />);
  expect(screen.queryByRole('switch')).toBeNull();
  for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByLabelText('Развернуть меню'));

  fireEvent.click(screen.getByRole('switch'));
  expect(onChange).toHaveBeenLastCalledWith('manager2');
  expect(screen.queryByTitle('Кассир')).toBeNull();
  expect(screen.queryByTitle('Логистика')).toBeNull();
  expect(localStorage.getItem('ow-sidebar-v2:manager')).toBe('1');

  rerender(<Sidebar active="manager2" userRole="manager" userId="manager" onChange={onChange} />);
  fireEvent.click(screen.getByRole('switch'));
  expect(onChange).toHaveBeenLastCalledWith('families');
});
