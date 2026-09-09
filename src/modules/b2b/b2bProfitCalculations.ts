import type { B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord } from '../../services/b2bDataService';
import { calculateB2BRevenueTax, type B2BPaymentRecord } from '../../services/b2bPaymentService';

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export interface B2BOrderProfit {
  sold: number;
  received: number;
  driverCost: number;
  taxCost: number;
  otherCost: number;
  totalCosts: number;
  balance: number;
  receivable: number;
  payable: number;
  margin: number;
}

export function calculateB2BOrderProfit(
  order: B2BOrderRecord,
  payments: B2BPaymentRecord[],
  payouts: B2BDriverPayoutRecord[],
  expenses: B2BExpenseRecord[],
): B2BOrderProfit {
  const confirmedPayments = payments.filter(payment => payment.orderId === order.id && payment.status === 'confirmed');
  const received = confirmedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const driverCost = order.driverTotal ?? (order.driverPricePerUnit ?? 0) * order.transportCount;
  const taxCost = confirmedPayments.reduce((sum, payment) => sum + calculateB2BRevenueTax(payment.amount, payment.method).taxAmount, 0);
  const otherCost = expenses
    .filter(expense => expense.orderNumber === order.number && expense.source === 'manual' && !['driver_payments', 'taxes'].includes(expense.category))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const paidToCurrentDriver = payouts
    .filter(payout => payout.assignmentId === order.assignmentId)
    .reduce((sum, payout) => sum + payout.amount, 0);
  const totalCosts = roundMoney(driverCost + taxCost + otherCost);
  const balance = roundMoney(order.total - totalCosts);

  return {
    sold: order.total,
    received: roundMoney(received),
    driverCost: roundMoney(driverCost),
    taxCost: roundMoney(taxCost),
    otherCost: roundMoney(otherCost),
    totalCosts,
    balance,
    receivable: roundMoney(Math.max(order.total - received, 0)),
    payable: roundMoney(Math.max(driverCost - paidToCurrentDriver, 0)),
    margin: order.total > 0 ? (balance / order.total) * 100 : 0,
  };
}
