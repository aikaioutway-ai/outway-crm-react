import type { B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord } from '../../services/b2bDataService';
import type { B2BPaymentRecord } from '../../services/b2bPaymentService';
import { calculateB2BCashierSummary } from './b2bCashierCalculations';

const order = (patch: Partial<B2BOrderRecord> = {}): B2BOrderRecord => ({
  id: 'order-1', number: 'B2B-001', clientId: 'client-1', client: 'Клиент', category: 'b2b',
  routeFrom: 'A', routeTo: 'B', requestDate: '01.09.2026', departureDate: '10.09.2026',
  transport: 'Минивэн', transportCount: 1, pricePerUnit: 10_000, total: 10_000, paid: 99_999,
  status: 'success', assignmentId: 'assignment-1', driverId: 'driver-1', driverName: 'Водитель',
  driverPricePerUnit: 6_000, driverTotal: 6_000, ...patch,
});

const payment = (patch: Partial<B2BPaymentRecord> = {}): B2BPaymentRecord => ({
  id: 'payment-1', orderId: 'order-1', orderNumber: 'B2B-001', clientName: 'Клиент', amount: 4_000,
  method: 'legal_account', paymentDate: '2026-09-12', comment: '', status: 'confirmed', createdAt: '2026-09-12T10:00:00Z', ...patch,
});

const payout = (patch: Partial<B2BDriverPayoutRecord> = {}): B2BDriverPayoutRecord => ({
  id: 'payout-1', orderId: 'order-1', assignmentId: 'assignment-1', driverId: 'driver-1', driverName: 'Водитель',
  amount: 2_000, taxAmount: 80, netAmount: 1_920, method: 'legal_account', paymentDate: '2026-09-15', comment: '', createdAt: '2026-09-15T10:00:00Z', ...patch,
});

const expense = (patch: Partial<B2BExpenseRecord> = {}): B2BExpenseRecord => ({
  id: 'expense-1', expenseDate: '2026-09-16', category: 'marketing', amount: 1_000, method: 'legal_account',
  taxAmount: 40, netAmount: 960, purpose: 'Реклама', orderNumber: 'B2B-001', comment: '', source: 'manual', ...patch,
});

const period = { year: 2026, month: 9 };

test('separates confirmed, pending and rejected payments without using order.paid', () => {
  const summary = calculateB2BCashierSummary(
    [order()],
    [payment(), payment({ id: 'pending', amount: 700, status: 'pending' }), payment({ id: 'rejected', amount: 900, status: 'rejected' })],
    [], [], period,
  );

  expect(summary.clientAccrued).toBe(10_000);
  expect(summary.confirmedReceived).toBe(4_000);
  expect(summary.pendingReview).toBe(700);
  expect(summary.outstandingReceivable).toBe(6_000);
  expect(summary.operations).toHaveLength(1);
});

test('calculates receivable and overpayment per order through period end', () => {
  const summary = calculateB2BCashierSummary(
    [order({ id: 'old', number: 'B2B-OLD', departureDate: '10.08.2026', total: 5_000 }), order({ id: 'current', number: 'B2B-CURRENT', total: 3_000 })],
    [payment({ id: 'old-payment', orderId: 'old', orderNumber: 'B2B-OLD', amount: 2_000, paymentDate: '2026-08-15' }), payment({ id: 'overpayment', orderId: 'current', orderNumber: 'B2B-CURRENT', amount: 3_500 })],
    [], [], period,
  );

  expect(summary.clientAccrued).toBe(3_000);
  expect(summary.outstandingReceivable).toBe(3_000);
  expect(summary.clientOverpayment).toBe(500);
});

test('keeps success-order driver debt and matches payouts to the current assignment', () => {
  const summary = calculateB2BCashierSummary(
    [order()], [],
    [payout(), payout({ id: 'old-assignment-payment', assignmentId: 'old-assignment', amount: 3_000, netAmount: 3_000, taxAmount: 0, method: 'cash' })],
    [], period,
  );

  expect(summary.driverPaidGross).toBe(5_000);
  expect(summary.driverPaidNet).toBe(4_920);
  expect(summary.driverRemaining).toBe(4_000);
  expect(summary.driverPayables[0]).toMatchObject({ paidGross: 2_000, paidNet: 1_920, remaining: 4_000 });
});

test('uses only primary cash movements and calculates revenue tax directly from confirmed payments', () => {
  const summary = calculateB2BCashierSummary(
    [order()],
    [payment({ amount: 10_000 }), payment({ id: 'cash-payment', amount: 2_000, method: 'cash' })],
    [payout()],
    [expense(), expense({ id: 'driver-copy', source: 'driver_payment', category: 'driver_payments', amount: 2_000, netAmount: 1_920 }), expense({ id: 'tax-copy', source: 'tax_4pct', category: 'taxes', amount: 400, netAmount: 400 })],
    period,
  );

  expect(summary.calculatedTax).toBe(400);
  expect(summary.manualExpenses).toBe(960);
  expect(summary.operations.map(row => [row.kind, row.amount])).toEqual(expect.arrayContaining([
    ['client_payment', 10_000], ['client_payment', 2_000], ['driver_payout', 1_920], ['manual_expense', 960],
  ]));
  expect(summary.operations).toHaveLength(4);
});

test('flags risky manual driver and tax categories without removing them from the manual total', () => {
  const summary = calculateB2BCashierSummary(
    [], [], [],
    [expense({ category: 'driver_payments', netAmount: 800 }), expense({ id: 'manual-tax', category: 'taxes', netAmount: 300 })],
    period,
  );

  expect(summary.manualExpenses).toBe(1_100);
  expect(summary.riskyManualExpenses).toEqual({ count: 2, amount: 1_100 });
});
