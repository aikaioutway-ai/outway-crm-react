import { fetchDriverPayments } from './expenseService';
import { fetchSpendingPayments } from './spendingService';
import type { DriverPaymentRecord } from '../modules/drivers/driverPayments';

export async function fetchDriverPaymentHistory(driverId: string, token?: string): Promise<DriverPaymentRecord[]> {
  if (!token) throw new Error('Для просмотра выплат войдите в CRM');
  const [legacy, spending] = await Promise.all([fetchDriverPayments(driverId, token), fetchSpendingPayments(token, {driverId})]);
  // Копия старой записи в «Расходах» — главная версия: её можно было исправить (сумму, категорию, водителя).
  const copied = new Set(spending.map(row => row.sourceRef).filter(Boolean));
  const legacyKept = legacy.filter(row => !copied.has(`${row.kind === 'advance' ? 'v2_driver_advances' : 'v2_expenses'}:${row.sourceId}`));
  const added: DriverPaymentRecord[] = spending.filter(row => row.driverId === driverId).map(row => ({
    id:`spending-${row.id}`,sourceId:row.id,spendingId:row.id,
    kind:row.subcategory === 'Авансы водителям' ? 'advance' : row.subcategory === 'Зарплата водителей' ? 'salary' : 'payment',
    date:row.date,amount:row.amount,periodKey:row.salaryPeriodKey || row.date.slice(0,7),schoolKey:row.schoolKey,
    paymentMethod:row.method === 'Наличные' ? 'cash' : 'cashless',paymentOrderNumber:row.paymentOrderNumber,comment:row.comment || '',createdAt:'',
  }));
  return [...legacyKept,...added].sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
