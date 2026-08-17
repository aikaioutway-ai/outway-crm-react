import React, { useState } from 'react';
import { ClipboardList, Package, Users } from 'lucide-react';
import { UserRole } from '../../types';
import MarketOrdersTab from './MarketOrdersTab';
import MarketClientsTab from './MarketClientsTab';
import MarketCatalogTab from './MarketCatalogTab';
import './MarketModule.css';

interface MarketModuleProps {
  userName?: string;
  userRole?: UserRole;
  sessionToken?: string;
}

type MarketTab = 'orders' | 'clients' | 'catalog';

const TABS: { key: MarketTab; label: string; icon: React.ReactNode }[] = [
  { key: 'orders', label: 'Заказы', icon: <ClipboardList size={16} /> },
  { key: 'clients', label: 'Клиенты', icon: <Users size={16} /> },
  { key: 'catalog', label: 'Каталог', icon: <Package size={16} /> },
];

export default function MarketModule({ userName, userRole, sessionToken }: MarketModuleProps) {
  const [tab, setTab] = useState<MarketTab>('orders');

  return (
    <div className="market-module">
      <div className="market-tabbar">
        {TABS.map(item => (
          <button
            key={item.key}
            className={`market-tab${tab === item.key ? ' active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
      <div className="market-tab-body">
        {tab === 'orders' && <MarketOrdersTab userName={userName} userRole={userRole} sessionToken={sessionToken} />}
        {tab === 'clients' && <MarketClientsTab sessionToken={sessionToken} />}
        {tab === 'catalog' && <MarketCatalogTab sessionToken={sessionToken} />}
      </div>
    </div>
  );
}
