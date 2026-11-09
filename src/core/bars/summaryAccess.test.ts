import { canAccessSection, canAccessSummary, getAllowedSections, OWNER_EMPLOYEE_ID } from './Sidebar';
import type { UserRole } from '../../types';

const roles: UserRole[] = ['admin', 'gen_director', 'director', 'manager', 'logist', 'senior_logist', 'b2b_manager', 'b2b_logist', 'cashier'];

test.each(roles)('summary access for %s follows the cashier exclusion', role => {
  const allowed = role !== 'cashier';
  expect(canAccessSummary(role)).toBe(allowed);
  expect(canAccessSection(role, 'summary')).toBe(allowed);
  expect(getAllowedSections(role).includes('summary')).toBe(allowed);
});

test('cashier cannot bypass summary restriction with owner id', () => {
  expect(canAccessSummary('cashier', OWNER_EMPLOYEE_ID)).toBe(false);
});
