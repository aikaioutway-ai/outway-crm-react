import { useState } from 'react';
import { b2bAccess } from './b2bAccess';
import type { UserRole } from '../../types';
import { CalendarDays, CircleDollarSign, ReceiptText, Route, UserRound, ClipboardList, WalletCards, BadgeDollarSign } from 'lucide-react';
import B2BIcon from '../../core/icons/B2BIcon';
import B2BClients from './B2BClients';
import B2BOrders from './B2BOrders';
import B2BCalendar from './B2BCalendar';
import B2BLogistics from './B2BLogistics';
import B2BExpenses from './B2BExpenses';
import B2BFinance, { type B2BFinancePeriod } from './B2BFinance';
import B2BCashflow from './B2BCashflow';
import B2BCashier from './B2BCashier';
import B2BExcelExport from './B2BExcelExport';
import './B2BModule.css';

const B2B_TABS = [
  { key: 'cashier', label: 'Cashier', icon: BadgeDollarSign },
  { key: 'orders', label: 'Заказы', icon: ClipboardList },
  { key: 'logistics', label: 'Логистика', icon: Route },
  { key: 'calendar', label: 'Календарь', icon: CalendarDays },
  { key: 'clients', label: 'Клиенты', icon: UserRound },
  { key: 'expenses', label: 'Расходы', icon: ReceiptText },
  { key: 'finance', label: 'P&L по заказам', icon: CircleDollarSign },
  { key: 'cashflow', label: 'Cashflow', icon: WalletCards },
] as const;

type B2BTab = typeof B2B_TABS[number]['key'];

export default function B2BModule({ userRole, sessionToken }: { userRole: UserRole; sessionToken?: string }) {
  const access = b2bAccess(userRole);
  const canOpenOrders = access.openOrders;
  const allowedTabs = B2B_TABS.filter(tab => access.tabs.includes(tab.key));
  const [activeTab, setActiveTab] = useState<B2BTab>(userRole === 'cashier' ? 'cashier' : 'orders');
  const [orderToOpenId, setOrderToOpenId] = useState<string | null>(null);
  const [returnTabAfterOrder, setReturnTabAfterOrder] = useState<B2BTab | null>(null);
  const [financeMonth, setFinanceMonth] = useState<B2BFinancePeriod | null>(null);
  const visibleTab = allowedTabs.some(tab => tab.key === activeTab) ? activeTab : allowedTabs[0].key;
  const currentTab = B2B_TABS.find(tab => tab.key === visibleTab) ?? B2B_TABS[0];
  const CurrentIcon = currentTab.icon;

  const openOrderCard = (orderId: string) => {
    if (!canOpenOrders) return;
    setReturnTabAfterOrder(activeTab === 'orders' ? null : activeTab);
    setOrderToOpenId(orderId);
    setActiveTab('orders');
  };

  const closeLinkedOrderCard = () => {
    setOrderToOpenId(null);
    if (returnTabAfterOrder) setActiveTab(returnTabAfterOrder);
    setReturnTabAfterOrder(null);
  };

  return (
    <section className="b2b-module">
      <header className="b2b-header">
        <span className="b2b-icon"><B2BIcon size={30} /></span>
        <div className="b2b-header-copy">
          <h1>B2B</h1>
          <p>Корпоративные перевозки</p>
        </div>
        <B2BExcelExport activeTab={visibleTab} label={currentTab.label} />
      </header>

      <nav className="b2b-tabs" aria-label="Разделы B2B">
        {allowedTabs.map(tab => {
          const Icon = tab.icon;
          const active = tab.key === visibleTab;
          return (
            <button
              key={tab.key}
              type="button"
              className={`b2b-tab${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                setOrderToOpenId(null);
                setReturnTabAfterOrder(null);
                setActiveTab(tab.key);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {orderToOpenId && canOpenOrders ? (
        <B2BOrders userRole={userRole} sessionToken={sessionToken} cardOnly openOrderId={orderToOpenId} onCloseOrder={closeLinkedOrderCard} />
      ) : visibleTab === 'cashier' ? (
        <B2BCashier onOpenOrder={canOpenOrders ? openOrderCard : undefined} />
      ) : visibleTab === 'orders' ? (
        <B2BOrders userRole={userRole} sessionToken={sessionToken} openOrderId={orderToOpenId} onCloseOrder={orderToOpenId ? closeLinkedOrderCard : undefined} />
      ) : visibleTab === 'logistics' ? (
        <B2BLogistics canPay={access.driverPay} onOpenOrder={openOrderCard} />
      ) : visibleTab === 'calendar' ? (
        <B2BCalendar onOpenOrder={openOrderCard} />
      ) : visibleTab === 'clients' ? (
        <B2BClients canViewFinance={access.clientFinance} onOpenOrder={canOpenOrders ? openOrderCard : undefined} />
      ) : visibleTab === 'expenses' ? (
        <B2BExpenses onOpenOrder={canOpenOrders ? openOrderCard : undefined} />
      ) : visibleTab === 'finance' ? (
        <B2BFinance selectedMonthNumber={financeMonth} onSelectedMonthChange={setFinanceMonth} onOpenOrder={canOpenOrders ? openOrderCard : undefined} />
      ) : visibleTab === 'cashflow' ? (
        <B2BCashflow onOpenOrder={canOpenOrders ? openOrderCard : undefined} />
      ) : (
        <div className="b2b-empty" role="tabpanel">
          <CurrentIcon size={34} aria-hidden="true" />
          <h2>{currentTab.label}</h2>
          <p>Раздел готов к наполнению.</p>
        </div>
      )}
    </section>
  );
}
