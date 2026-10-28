import { splitPayment } from './paymentAmounts';

test('keeps the original total when dividing among periods or drivers', () => {
  expect(splitPayment(50000, 2)).toEqual([25000, 25000]);
  expect(splitPayment(100, 3)).toEqual([33.34, 33.33, 33.33]);
  expect(splitPayment(5000, 1)).toEqual([5000]);
});
