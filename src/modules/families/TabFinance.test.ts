import { Charge, FamilyPayment, PaymentItem } from '../../types';
import { buildPeriodRows, canCreateFamilyRefund, periodPaidDisplayAmount } from './TabFinance';

test('cashier can create a refund while the family card stays read-only', () => {
  expect(canCreateFamilyRefund(false, false, true)).toBe(true);
});

test('roles without finance management access cannot create a refund', () => {
  expect(canCreateFamilyRefund(false, false, false)).toBe(false);
});

test('combines deposit charges from different years into one row', () => {
  const charges: Charge[] = [
    {
      id: 'deposit-2026', childId: 'child-1', familyId: 'family-1', periodMonth: 0, year: 2026,
      chargeType: 'deposit', amount: 5000, paidAmount: 5000, debtAmount: 0, status: 'Оплачено', createdAt: '2026-09-01',
    },
    {
      id: 'deposit-2027', childId: 'child-2', familyId: 'family-1', periodMonth: 0, year: 2027,
      chargeType: 'deposit', amount: 5500, paidAmount: 5500, debtAmount: 0, status: 'Оплачено', createdAt: '2026-09-02',
    },
  ];
  const payments: FamilyPayment[] = [{
    id: 'payment-1', familyId: 'family-1', amount: 10500, paymentType: 'cash', paymentDate: '2026-09-03',
    actualPaymentDate: '2026-09-04', status: 'Подтверждено', createdAt: '2026-09-03',
  }];
  const paymentItems: PaymentItem[] = [{
    id: 'item-1', paymentId: 'payment-1', childId: 'child-1', familyId: 'family-1', periodMonth: 0, year: 2027,
    chargedAmount: 10500, paidAmount: 10500, debtAmount: 0, status: 'Оплачено', createdAt: '2026-09-03',
  }];

  const depositRows = buildPeriodRows(charges, payments, paymentItems).filter(row => row.label === 'Депозит');

  expect(depositRows).toHaveLength(1);
  expect(depositRows[0]).toMatchObject({ charged: 10500, paid: 10500, debt: 0, childrenCount: 2 });
  expect(depositRows[0].writeOffDate).toBe(new Date('2026-09-04').toLocaleDateString('ru-RU'));
});

test('shows outstanding debt as a negative amount in the paid column', () => {
  expect(periodPaidDisplayAmount({ paid: 0, debt: 10500 })).toBe(-10500);
  expect(periodPaidDisplayAmount({ paid: 10500, debt: 0 })).toBe(10500);
});
