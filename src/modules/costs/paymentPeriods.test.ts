import { periodAmounts, periodTotal } from './paymentPeriods';
test('adding a period preserves existing allocations and requires a new explicit amount',()=>{
  expect(periodAmounts(['2026-10-1','2026-10-2'],'700',{'2026-10-1':'700'})).toEqual({'2026-10-1':'700','2026-10-2':''});
});
test('removed periods are excluded and totals use kopeck precision',()=>{
  expect(periodAmounts(['2026-10-2'],'900',{'2026-10-1':'700','2026-10-2':'200'})).toEqual({'2026-10-2':'200'});
  expect(periodTotal({first:'0.1',second:'0.2'})).toBe(0.3);
});
