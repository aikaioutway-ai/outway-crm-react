import { normalizeExpenseClassification, OPEX_SUBCATEGORIES, CAPEX_SUBCATEGORIES } from './expenseClassification';

test('moves legacy marketing records to OPEX without losing payment details', () => {
  const row = { id: 'old', category: 'CAPEX', subcategory: 'Реклама', amount: 2500, comment: 'campaign' };
  expect(normalizeExpenseClassification(row)).toEqual({ ...row, category: 'OPEX', operationType: 'expense' });
  expect(OPEX_SUBCATEGORIES).toContain('Реклама');
  expect(CAPEX_SUBCATEGORIES).not.toContain('Реклама');
});
test('retains durable assets and identifies parent refunds separately', () => {
  expect(normalizeExpenseClassification({ category: 'CAPEX', subcategory: 'Мебель' }).category).toBe('CAPEX');
  expect(normalizeExpenseClassification({ category: 'OPEX', subcategory: 'Возврат родителю' }).operationType).toBe('customer_refund');
});
