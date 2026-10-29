import { DriverPaymentRecord, driverPaymentTotals, driverPaymentPeriodLabel } from './driverPayments';
const payment=(kind:'advance'|'salary',amount:number,periodKey:string)=>({kind,amount,periodKey,date:'2026-10-20'}) as DriverPaymentRecord;
test('half-month payments aggregate once in the correct month and keep years separate',()=>{
  expect(driverPaymentTotals([payment('salary',700,'2026-10-1'),payment('salary',300,'2026-10-2'),payment('advance',200,'2026-10'),payment('salary',90,'2025-10-1')])).toEqual([
    {key:'2026-10',salary:1000,advance:200,payment:0,total:1200},
    {key:'2025-10',salary:90,advance:0,payment:0,total:90},
  ]);
});
test('history labels distinguish exact halves from legacy monthly periods',()=>{
  expect(driverPaymentPeriodLabel('2026-10-1')).toContain('1–15');
  expect(driverPaymentPeriodLabel('2026-10-2')).toContain('16–31');
  expect(driverPaymentPeriodLabel('2026-10')).not.toContain('·');
  expect(driverPaymentTotals([payment('salary',0.1,'2026-10-1'),payment('advance',0.2,'2026-10-1')])[0].total).toBe(0.3);
});

test('other driver payments contribute to paid total without changing salary or advances',()=>{
  const row={kind:'payment',amount:250,periodKey:'2026-10',date:'2026-10-20'} as DriverPaymentRecord;
  expect(driverPaymentTotals([row])[0]).toMatchObject({salary:0,advance:0,payment:250,total:250});
});
