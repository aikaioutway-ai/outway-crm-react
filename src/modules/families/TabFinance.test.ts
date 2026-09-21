import { canCreateFamilyRefund } from './TabFinance';

test('cashier can create a refund while the family card stays read-only', () => {
  expect(canCreateFamilyRefund(false, false, true)).toBe(true);
});

test('roles without finance management access cannot create a refund', () => {
  expect(canCreateFamilyRefund(false, false, false)).toBe(false);
});
