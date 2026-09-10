import type { UserRole } from '../../types';
export function b2bAccess(role: UserRole) {
  const manager = role === 'b2b_manager';
  const logist = role === 'b2b_logist';
  const cashier = role === 'cashier';
  const executiveAdmin = role === 'admin' || role === 'gen_director';
  return {
    tabs: manager ? ['orders', 'calendar', 'clients'] : logist ? ['logistics', 'calendar'] : cashier ? ['cashier', 'orders', 'clients', 'expenses', 'cashflow'] : ['cashier', 'orders', 'logistics', 'calendar', 'clients', 'expenses', 'finance', 'cashflow'],
    orderTabs: logist ? ['main', 'driver'] : manager ? ['main', 'payment', 'driver', 'documents'] : cashier ? ['main', 'payment', 'driver', 'pnl', 'documents'] : ['main', 'payment', 'driver', 'pnl', 'documents'],
    openOrders: true,
    clientFinance: !manager && !logist,
    openClient: !logist,
    driverPrice: !manager,
    driverPay: !manager && !logist,
    manageDriverPayouts: executiveAdmin || cashier,
    reviewPayments: executiveAdmin || cashier,
    editOrder: !logist,
  };
}
