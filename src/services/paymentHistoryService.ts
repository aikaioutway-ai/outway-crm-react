import { fetchDriverPayments } from './expenseService';
import { fetchSpendingPayments } from './spendingService';
import type { DriverPaymentRecord } from '../modules/drivers/driverPayments';

export async function fetchDriverPaymentHistory(driverId: string, token?: string): Promise<DriverPaymentRecord[]> {
  if (!token) throw new Error('Для просмотра выплат войдите в CRM');
  const [legacy, spending] = await Promise.all([fetchDriverPayments(driverId, token), fetchSpendingPayments(token, {driverId})]);
  const added: DriverPaymentRecord[] = spending.filter(row => row.driverId === driverId && !row.sourceRef).map(row => ({
    id:`spending-${row.id}`,sourceId:row.id,spendingId:row.id,
    kind:row.subcategory === 'Авансы водителям' ? 'advance' : row.subcategory === 'Зарплата водителей' ? 'salary' : 'payment',
    date:row.date,amount:row.amount,periodKey:row.salaryPeriodKey || row.date.slice(0,7),schoolKey:row.schoolKey,
    paymentMethod:row.method === 'Наличные' ? 'cash' : 'cashless',paymentOrderNumber:row.paymentOrderNumber,comment:row.comment || '',createdAt:'',
  }));
  return [...legacy,...added].sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
