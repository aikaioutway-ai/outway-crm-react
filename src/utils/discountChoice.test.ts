import { applyChildPricingPatch, calcChildPrice, canManageDiscounts } from './pricing';
import { Child } from '../types';

const rules = { basePrice: 6500, siblingEligible: true };

test('automatic family discount differs from explicit zero and never stacks with a chosen percentage', () => {
  expect(calcChildPrice(rules, '2026-10')).toBe(6175);
  expect(calcChildPrice({ ...rules, discountOverridePercent: 0 }, '2026-10')).toBe(6500);
  expect(calcChildPrice({ ...rules, discountOverridePercent: 10 }, '2026-11')).toBe(5850);
  expect(calcChildPrice({ ...rules, discountOverridePercent: 50 }, '2026-12')).toBe(3250);
});

test('fixed price keeps priority over the percentage choice', () => {
  expect(calcChildPrice({ ...rules, fixedPrice: 4000, discountOverridePercent: 50 }, '2026-10')).toBe(4000);
});

test('edit preview applies zero, chosen percentage and restored automatic pricing', () => {
  const child = { basePrice: 6500, finalPrice: 6175, siblingApplied: true } as Child;
  const zero = applyChildPricingPatch(child, { discountOverridePercent: 0 });
  expect(zero.finalPrice).toBe(6500);
  const manual = applyChildPricingPatch(zero, { discountOverridePercent: 10 });
  expect(manual.finalPrice).toBe(5850);
  expect(applyChildPricingPatch(manual, { discountOverridePercent: null }).finalPrice).toBe(6175);
});

test('only existing discount management roles can change percentages', () => {
  ['director', 'gen_director', 'admin'].forEach(role => expect(canManageDiscounts(role)).toBe(true));
  ['manager', 'logist', 'cashier', undefined].forEach(role => expect(canManageDiscounts(role)).toBe(false));
});
