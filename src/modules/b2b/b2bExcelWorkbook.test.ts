import type { B2BExportData } from './b2bExcelWorkbook';
import { buildB2BExportSheets, getB2BExportRowCount } from './b2bExcelWorkbook';

const data: B2BExportData = {
  orders: [{
    id: 'order-1', number: 'P-2026-000001', clientId: 'client-1', client: 'ОсОО Тест', category: 'b2b',
    routeFrom: 'Бишкек', routeTo: 'Аэропорт', requestDate: '10.05.2026', departureDate: '12.05.2026',
    transport: 'Микроавтобус', transportCount: 1, pricePerUnit: 10_000, total: 10_000, paid: 0,
    status: 'success', assignmentId: 'assignment-1', driverId: 'driver-1', driverName: 'Мирлан',
    driverPricePerUnit: 6_000, driverTotal: 6_000,
  }],
  clients: [{
    id: 'client-1', clientType: 'company', companyName: 'ОсОО Тест', contactName: 'Иван', phone1: '0555000000',
    phone2: '', email: 'test@example.com', comments: '', orgName: 'ОсОО Тест', inn: '123', okpo: '456',
    legalAddress: 'Бишкек', bankName: 'Банк', bik: '001', bankAccount: '123456', signerPosition: 'Директор', signerName: 'Иван',
  }],
  payments: [{
    id: 'payment-1', orderId: 'order-1', orderNumber: 'P-2026-000001', clientName: 'ОсОО Тест', amount: 10_000,
    method: 'legal_account', paymentOrderNumber: 'ПП-10', paymentDate: '2026-05-13', comment: 'Оплата заказа', status: 'confirmed', createdAt: '2026-05-13',
  }],
  payouts: [{
    id: 'payout-1', orderId: 'order-1', assignmentId: 'assignment-1', driverId: 'driver-1', driverName: 'Мирлан',
    amount: 6_000, taxAmount: 0, netAmount: 6_000, method: 'personal_account', paymentOrderNumber: 'ПП-11',
    paymentDate: '2026-05-14', comment: 'Выплата водителю', createdAt: '2026-05-14',
  }],
  expenses: [{
    id: 'expense-1', expenseDate: '2026-05-15', category: 'other', amount: 500, method: 'cash', taxAmount: 0, netAmount: 500,
    purpose: 'Парковка', orderNumber: 'P-2026-000001', comment: '', source: 'manual',
  }],
};

test('cashflow export has separate income and payout sheets with stable IDs', () => {
  const sheets = buildB2BExportSheets('cashflow', data, '2026-05-01', '2026-05-31');
  expect(sheets.map(sheet => sheet.name)).toEqual(['Поступления', 'Выплаты']);
  expect(sheets[0].rows).toHaveLength(1);
  expect(sheets[0].rows[0]).toContain('payment-1');
  expect(sheets[1].rows).toHaveLength(2);
  expect(sheets[1].rows.flat()).toEqual(expect.arrayContaining(['payout-1', 'expense-1']));
});

test('period removes transactions and orders outside selected dates', () => {
  expect(getB2BExportRowCount('orders', data, '2026-06-01', '2026-06-30')).toBe(0);
  expect(getB2BExportRowCount('cashier', data, '2026-06-01', '2026-06-30')).toBe(0);
});

test('client export keeps the full register and calculates selected-period turnover', () => {
  const [sheet] = buildB2BExportSheets('clients', data, '2026-05-01', '2026-05-31');
  expect(sheet.rows).toHaveLength(1);
  expect(sheet.rows[0]).toEqual(expect.arrayContaining(['ОсОО Тест', 10_000, 'client-1']));
});
