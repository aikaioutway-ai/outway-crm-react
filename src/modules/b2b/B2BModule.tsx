import { useState } from 'react';
import { CalendarDays, CircleDollarSign, ReceiptText, Route, UserRound, ClipboardList, WalletCards, BadgeDollarSign } from 'lucide-react';
import B2BIcon from '../../core/icons/B2BIcon';
import B2BClients from './B2BClients';
import B2BOrders from './B2BOrders';
import B2BCalendar from './B2BCalendar';
import B2BLogistics from './B2BLogistics';
import B2BExpenses from './B2BExpenses';
import B2BFinance from './B2BFinance';
import B2BCashflow from './B2BCashflow';
import B2BCashier from './B2BCashier';
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

export default function B2BModule() {
  const [activeTab, setActiveTab] = useState<B2BTab>('orders');
  const [orderToOpenId, setOrderToOpenId] = useState<string | null>(null);
  const [returnTabAfterOrder, setReturnTabAfterOrder] = useState<B2BTab | null>(null);
  const currentTab = B2B_TABS.find(tab => tab.key === activeTab) ?? B2B_TABS[0];
  const CurrentIcon = currentTab.icon;

  const openOrderCard = (orderId: string) => {
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
        <div>
          <h1>B2B</h1>
          <p>Корпоративные перевозки</p>
        </div>
      </header>

      <nav className="b2b-tabs" aria-label="Разделы B2B">
        {B2B_TABS.map(tab => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
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

      {activeTab === 'cashier' ? (
        <B2BCashier onOpenOrder={openOrderCard} />
      ) : activeTab === 'orders' ? (
        <B2BOrders openOrderId={orderToOpenId} onCloseOrder={orderToOpenId ? closeLinkedOrderCard : undefined} />
      ) : activeTab === 'logistics' ? (
        <B2BLogistics />
      ) : activeTab === 'calendar' ? (
        <B2BCalendar />
      ) : activeTab === 'clients' ? (
        <B2BClients onOpenOrder={openOrderCard} />
      ) : activeTab === 'expenses' ? (
        <B2BExpenses onOpenOrder={openOrderCard} />
      ) : activeTab === 'finance' ? (
        <B2BFinance onOpenOrder={openOrderCard} />
      ) : activeTab === 'cashflow' ? (
        <B2BCashflow onOpenOrder={openOrderCard} />
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
