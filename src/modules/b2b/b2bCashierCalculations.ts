import type { B2BDriverPayoutRecord, B2BExpenseRecord, B2BOrderRecord } from '../../services/b2bDataService';
import { B2B_LEGAL_ACCOUNT_TAX_RATE, type B2BPaymentMethod, type B2BPaymentRecord } from '../../services/b2bPaymentService';

export interface B2BCashierPeriod {
  year: number;
  month: number;
}

export interface B2BDriverPayableRow {
  orderId: string;
  orderNumber: string;
  driverName: string;
  tripDate: string;
  accrued: number;
  paidGross: number;
  remaining: number;
}

export interface B2BCashOperation {
  id: string;
  date: string;
  direction: 'income' | 'expense';
  kind: 'client_payment' | 'driver_payout' | 'manual_expense' | 'revenue_tax';
  title: string;
  description: string;
  amount: number;
  method: B2BPaymentMethod;
  paymentOrderNumber?: string;
  orderId?: string;
}

export interface B2BCashierSummary {
  clientAccrued: number;
  actualBalance: number;
  clientDebts: { orderId: string; orderNumber: string; client: string; accrued: number; paid: number; remaining: number }[];
  periodDriverPaid: number;
  periodDriverRemaining: number;
  confirmedReceived: number;
  pendingReview: number;
  outstandingReceivable: number;
  clientOverpayment: number;
  driverAccrued: number;
  driverPaidGross: number;
  driverRemaining: number;
  manualExpenses: number;
  calculatedTax: number;
  riskyManualExpenses: { count: number; amount: number };
  pendingPayments: B2BPaymentRecord[];
  driverPayables: B2BDriverPayableRow[];
  operations: B2BCashOperation[];
}

const pad = (value: number) => String(value).padStart(2, '0');

export function normalizeB2BCashierDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

export function b2bCashierPeriodBounds(period: B2BCashierPeriod) {
  const start = `${period.year}-${pad(period.month)}-01`;
  const lastDay = new Date(period.year, period.month, 0).getDate();
  return { start, end: `${period.year}-${pad(period.month)}-${pad(lastDay)}` };
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const calculatePaymentTax = (payment: B2BPaymentRecord) => payment.status === 'confirmed' && payment.method === 'legal_account'
  ? roundMoney(payment.amount * B2B_LEGAL_ACCOUNT_TAX_RATE)
  : 0;

export function calculateB2BCashierSummary(
  orders: B2BOrderRecord[],
  payments: B2BPaymentRecord[],
  payouts: B2BDriverPayoutRecord[],
  expenses: B2BExpenseRecord[],
  period: B2BCashierPeriod,
): B2BCashierSummary {
  const { start, end } = b2bCashierPeriodBounds(period);
  const isInPeriod = (value: string) => {
    const date = normalizeB2BCashierDate(value);
    return date >= start && date <= end;
  };
  const orderDate = (order: B2BOrderRecord) => normalizeB2BCashierDate(order.departureDate || order.requestDate);
  const accountableOrders = orders.filter(order => order.status !== 'cancelled');
  const periodOrders = accountableOrders.filter(order => isInPeriod(orderDate(order)));

  const confirmedThroughPeriod = new Map<string, number>();
  payments.forEach(payment => {
    if (payment.status !== 'confirmed') return;
    confirmedThroughPeriod.set(payment.orderId, (confirmedThroughPeriod.get(payment.orderId) ?? 0) + payment.amount);
  });

  let outstandingReceivable = 0;
  let clientOverpayment = 0;
  accountableOrders.forEach(order => {
    const confirmed = confirmedThroughPeriod.get(order.id) ?? 0;
    outstandingReceivable += Math.max(order.total - confirmed, 0);
    clientOverpayment += Math.max(confirmed - order.total, 0);
  });

  const periodConfirmedPayments = payments.filter(payment => payment.status === 'confirmed' && isInPeriod(payment.paymentDate));
  const pendingPayments = payments
    .filter(payment => payment.status === 'pending')
    .sort((left, right) => left.paymentDate.localeCompare(right.paymentDate));
  const periodPayouts = payouts.filter(payout => isInPeriod(payout.paymentDate));
  const periodManualExpenses = expenses.filter(expense => expense.source === 'manual' && isInPeriod(expense.expenseDate));
  const riskyManualRows = periodManualExpenses.filter(expense => expense.category === 'driver_payments' || expense.category === 'taxes');

  const payoutsThroughPeriodByAssignment = new Map<string, B2BDriverPayoutRecord[]>();
  payouts.forEach(payout => {

    const rows = payoutsThroughPeriodByAssignment.get(payout.assignmentId) ?? [];
    rows.push(payout);
    payoutsThroughPeriodByAssignment.set(payout.assignmentId, rows);
  });

  // The current order DTO exposes only the latest assignment. Matching by assignmentId prevents
  // a superseded assignment's payment from reducing the current assignment's payable balance.
  const driverPayables = accountableOrders.flatMap<B2BDriverPayableRow>(order => {
    if (!order.assignmentId || !order.driverName) return [];
    const accrued = order.driverTotal ?? (order.driverPricePerUnit ?? 0) * order.transportCount;
    const assignmentPayouts = payoutsThroughPeriodByAssignment.get(order.assignmentId) ?? [];
    const paidGross = assignmentPayouts.reduce((sum, payout) => sum + payout.amount, 0);
    const remaining = Math.max(accrued - paidGross, 0);
    if (remaining <= 0) return [];
    return [{
      orderId: order.id,
      orderNumber: order.number,
      driverName: order.driverName,
      tripDate: orderDate(order),
      accrued,
      paidGross,
      remaining,
    }];
  }).sort((left, right) => left.tripDate.localeCompare(right.tripDate));

  const ordersById = new Map(orders.map(order => [order.id, order]));
  const orderIdsByNumber = new Map(orders.map(order => [order.number, order.id]));
  const operations: B2BCashOperation[] = [
    ...periodConfirmedPayments.map(payment => ({
      id: `client-${payment.id}`,
      date: payment.paymentDate,
      direction: 'income' as const,
      kind: 'client_payment' as const,
      title: payment.clientName || 'Оплата клиента',
      description: payment.orderNumber,
      amount: payment.amount,
      method: payment.method,
      paymentOrderNumber: payment.paymentOrderNumber,
      orderId: payment.orderId,
    })),
    ...periodPayouts.map(payout => ({
      id: `driver-${payout.id}`,
      date: payout.paymentDate,
      direction: 'expense' as const,
      kind: 'driver_payout' as const,
      title: payout.driverName || 'Выплата водителю',
      description: ordersById.get(payout.orderId)?.number ?? 'Заказ B2B',
      amount: payout.amount,
      method: payout.method,
      paymentOrderNumber: payout.paymentOrderNumber,
      orderId: payout.orderId,
    })),
    ...periodManualExpenses.map(expense => ({
      id: `expense-${expense.id}`,
      date: expense.expenseDate,
      direction: 'expense' as const,
      kind: 'manual_expense' as const,
      title: expense.purpose || 'Ручной расход B2B',
      description: expense.orderNumber,
      amount: expense.amount,
      method: expense.method,
      paymentOrderNumber: expense.paymentOrderNumber,
      orderId: orderIdsByNumber.get(expense.orderNumber),
    })),
    ...periodConfirmedPayments.filter(payment => payment.method === 'legal_account').map(payment => ({
      id: `tax-${payment.id}`,
      date: payment.paymentDate,
      direction: 'expense' as const,
      kind: 'revenue_tax' as const,
      title: 'Налог 4% с выручки',
      description: payment.orderNumber,
      amount: roundMoney(payment.amount * B2B_LEGAL_ACCOUNT_TAX_RATE),
      method: payment.method,
      orderId: payment.orderId,
    })),
  ].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));

  const clientDebts = accountableOrders.map(order => ({ orderId: order.id, orderNumber: order.number, client: order.client, accrued: order.total, paid: confirmedThroughPeriod.get(order.id) ?? 0, remaining: Math.max(order.total - (confirmedThroughPeriod.get(order.id) ?? 0), 0) })).filter(row => row.remaining > 0);
  const periodDriverBalances = periodOrders.map(order => {
    const accrued = order.driverTotal ?? (order.driverPricePerUnit ?? 0) * order.transportCount;
    const paid = (payoutsThroughPeriodByAssignment.get(order.assignmentId ?? '') ?? []).reduce((sum, row) => sum + row.amount, 0);
    return { paid, remaining: Math.max(accrued - paid, 0) };
  });
  return {
    actualBalance: payments.filter(row => row.status === 'confirmed').reduce((sum, row) => sum + row.amount - calculatePaymentTax(row), 0) - payouts.reduce((sum, row) => sum + row.amount, 0) - expenses.filter(row => row.source === 'manual').reduce((sum, row) => sum + row.amount, 0),
    clientDebts,
    periodDriverPaid: periodDriverBalances.reduce((sum, row) => sum + row.paid, 0),
    periodDriverRemaining: periodDriverBalances.reduce((sum, row) => sum + row.remaining, 0),
    clientAccrued: periodOrders.reduce((sum, order) => sum + order.total, 0),
    confirmedReceived: periodConfirmedPayments.reduce((sum, payment) => sum + payment.amount, 0),
    pendingReview: pendingPayments.reduce((sum, payment) => sum + payment.amount, 0),
    outstandingReceivable,
    clientOverpayment,
    driverAccrued: periodOrders.reduce((sum, order) => sum + (order.driverTotal ?? (order.driverPricePerUnit ?? 0) * order.transportCount), 0),
    driverPaidGross: periodPayouts.reduce((sum, payout) => sum + payout.amount, 0),
    driverRemaining: driverPayables.reduce((sum, row) => sum + row.remaining, 0),
    manualExpenses: periodManualExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    calculatedTax: periodConfirmedPayments
      .filter(payment => payment.method === 'legal_account')
      .reduce((sum, payment) => sum + roundMoney(payment.amount * B2B_LEGAL_ACCOUNT_TAX_RATE), 0),
    riskyManualExpenses: {
      count: riskyManualRows.length,
      amount: riskyManualRows.reduce((sum, expense) => sum + expense.amount, 0),
    },
    pendingPayments,
    driverPayables,
    operations,
  };
}
