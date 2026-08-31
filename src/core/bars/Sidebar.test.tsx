import { canAccessFinanceExpenses, canAccessSection, getAllowedSections, MARKET_OWNER_EMPLOYEE_ID } from './Sidebar';

test('only Kairat employee account can access Market', () => {
  expect(canAccessSection('admin', 'market', MARKET_OWNER_EMPLOYEE_ID)).toBe(true);
  expect(canAccessSection('admin', 'market', 'another-admin')).toBe(false);
  expect(getAllowedSections('gen_director', 'general-director')).not.toContain('market');
  expect(getAllowedSections('manager', 'manager')).not.toContain('market');
  expect(getAllowedSections('cashier', 'cashier')).not.toContain('market');
});

test('cashier can open expenses while personal details stay handled separately', () => {
  expect(canAccessFinanceExpenses('cashier')).toBe(true);
  expect(canAccessSection('cashier', 'expenses', 'cashier')).toBe(true);
});
