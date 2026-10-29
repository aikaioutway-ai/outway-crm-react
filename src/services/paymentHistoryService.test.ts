import { fetchDriverPaymentHistory } from './paymentHistoryService';
import { fetchDriverPayments } from './expenseService';
import { fetchSpendingPayments } from './spendingService';
jest.mock('./expenseService',()=>({fetchDriverPayments:jest.fn()}));
jest.mock('./spendingService',()=>({fetchSpendingPayments:jest.fn()}));
test('adds new driver payments without counting finance copies or other recipients', async () => {
  (fetchDriverPayments as jest.Mock).mockResolvedValue([{id:'salary-legacy',kind:'salary',amount:100,date:'2026-10-01',createdAt:''}]);
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
});
