import type { B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord } from '../../services/b2bDataService';
import type { B2BPaymentRecord } from '../../services/b2bPaymentService';
import { calculateB2BOrderProfit } from './b2bProfitCalculations';

const order = { id: 'o1', number: 'B2B-001', total: 20_000, transportCount: 1, driverTotal: 15_000, assignmentId: 'a1' } as B2BOrderRecord;
const payment = (patch: Partial<B2BPaymentRecord> = {}) => ({ id: 'p1', orderId: 'o1', orderNumber: 'B2B-001', clientName: 'Клиент', amount: 20_000, method: 'legal_account', paymentDate: '2026-09-08', comment: '', status: 'confirmed', createdAt: '', ...patch } as B2BPaymentRecord);
const payout = (patch: Partial<B2BDriverPayoutRecord> = {}) => ({ id: 'd1', orderId: 'o1', assignmentId: 'a1', driverId: 'driver', driverName: 'Водитель', amount: 10_000, taxAmount: 0, netAmount: 10_000, method: 'legal_account', paymentDate: '2026-09-08', comment: '', createdAt: '', ...patch } as B2BDriverPayoutRecord);
const expense = (patch: Partial<B2BExpenseRecord> = {}) => ({ id: 'e1', expenseDate: '2026-09-08', category: 'other', amount: 500, method: 'legal_account', taxAmount: 0, netAmount: 500, purpose: '', orderNumber: 'B2B-001', comment: '', source: 'manual', ...patch } as B2BExpenseRecord);

describe('calculateB2BOrderProfit', () => {
  it('charges 4% only on confirmed legal-account revenue', () => {
    expect(calculateB2BOrderProfit(order, [payment()], [payout()], [])).toMatchObject({
      sold: 20_000,
      received: 20_000,
      driverCost: 15_000,
      taxCost: 800,
      otherCost: 0,
      totalCosts: 15_800,
      balance: 4_200,
      payable: 5_000,
    });
  });

  it('does not tax cash revenue, driver payouts, or expenses', () => {
    const result = calculateB2BOrderProfit(order, [payment({ method: 'cash' })], [payout()], [expense()]);
    expect(result.taxCost).toBe(0);
    expect(result.otherCost).toBe(500);
    expect(result.balance).toBe(4_500);
  });

  it('ignores automatic and legacy manual driver/tax expense copies', () => {
    const rows = [
      expense({ id: 'driver-copy', category: 'driver_payments', source: 'driver_payment', amount: 10_000 }),
      expense({ id: 'tax-copy', category: 'taxes', source: 'tax_4pct', amount: 800 }),
      expense({ id: 'legacy-tax', category: 'taxes', source: 'manual', amount: 800 }),
    ];
    expect(calculateB2BOrderProfit(order, [payment()], [payout()], rows).totalCosts).toBe(15_800);
  });
});
