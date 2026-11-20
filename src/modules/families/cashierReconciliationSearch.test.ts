import { matchesReconcileSearch } from './CashierReconciliation';

jest.mock('../../services/supabase', () => ({ supabase: {} }));

const row = ['Платёжное поручение № 123456', 'Иванова Айгуль', 6800, 'MBIZ_S_01a1f2f9-325b-712f-9afc-951d93596699', '19.11.2026', 'ОсОО Ромашка'];

test('finds a reconciliation row by order number, parent, amount and receipt code', () => {
  expect(matchesReconcileSearch('', row)).toBe(true);
  expect(matchesReconcileSearch('123456', row)).toBe(true);
  expect(matchesReconcileSearch('айгуль', row)).toBe(true);
  expect(matchesReconcileSearch('6 800', row)).toBe(true);
  expect(matchesReconcileSearch('951d9359', row)).toBe(true);
  expect(matchesReconcileSearch('ромашка', row)).toBe(true);
  expect(matchesReconcileSearch('999999', row)).toBe(false);
});
