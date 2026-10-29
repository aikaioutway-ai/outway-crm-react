import { fetchDriverPaymentHistory } from './paymentHistoryService';
import { fetchDriverPayments } from './expenseService';
import { fetchSpendingPayments } from './spendingService';
jest.mock('./expenseService',()=>({fetchDriverPayments:jest.fn()}));
jest.mock('./spendingService',()=>({fetchSpendingPayments:jest.fn()}));
test('adds new driver payments, replaces finance records by their copies and skips other recipients', async () => {
  (fetchDriverPayments as jest.Mock).mockResolvedValue([{id:'salary-legacy',sourceId:'legacy',kind:'salary',amount:100,date:'2026-10-01',createdAt:''}]);
  (fetchSpendingPayments as jest.Mock).mockResolvedValue([
    {id:'copy',sourceRef:'v2_expenses:legacy',driverId:'driver',subcategory:'Зарплата водителей',amount:100,date:'2026-10-01'},
    {id:'new',driverId:'driver',subcategory:'Авансы водителям',amount:50,date:'2026-10-02',salaryPeriodKey:'2026-10-1'},
    {id:'trip',driverId:'driver',subcategory:'Оплата водителю',amount:25,date:'2026-10-03'},
    {id:'other',driverId:'another',amount:999,date:'2026-10-03'},
  ]);
  const rows = await fetchDriverPaymentHistory('driver','session');
  expect(rows).toHaveLength(3);
  expect(rows.reduce((sum,row)=>sum+row.amount,0)).toBe(175);
  expect(rows.find(row=>row.spendingId==='new')).toMatchObject({kind:'advance',periodKey:'2026-10-1'});
  expect(rows.find(row=>row.spendingId==='trip')).toMatchObject({kind:'payment'});
  expect(rows.find(row=>row.id==='salary-legacy')).toBeUndefined();
  expect(rows.find(row=>row.spendingId==='copy')).toMatchObject({kind:'salary',amount:100});
});

test('a finance record moved to COGS with a driver appears in that driver history', async () => {
  (fetchDriverPayments as jest.Mock).mockResolvedValue([]);
  (fetchSpendingPayments as jest.Mock).mockResolvedValue([
    {id:'finance:v2_expenses:x',sourceRef:'v2_expenses:x',driverId:'alym',category:'COGS',subcategory:'Авансы водителям',amount:10000,date:'2026-10-15'},
  ]);
  const rows = await fetchDriverPaymentHistory('alym','session');
  expect(rows).toEqual([expect.objectContaining({kind:'advance',amount:10000,date:'2026-10-15'})]);
});
