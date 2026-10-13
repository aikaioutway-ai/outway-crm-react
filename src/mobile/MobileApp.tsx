import React, { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronRight, LogOut, Menu, Monitor, Receipt, Route, UserCog, Users, Wallet } from 'lucide-react';
import { canAccessSection, NavSection } from '../core/bars/Sidebar';
import { AuthenticatedUser } from '../services/employeeService';
import { MobileNavProvider, Screen, useMobileNav, useNavPosition } from './nav';
import { Skeletons } from './ui';
import './mobile.css';

const ManagerSection = lazy(() => import('./sections/ManagerSection'));
const LogisticsSection = lazy(() => import('./sections/LogisticsSection'));
const CashierSection = lazy(() => import('./sections/CashierSection'));
const FinanceSection = lazy(() => import('./sections/FinanceSection'));
const EmployeesSection = lazy(() => import('./sections/EmployeesSection'));

type MobileTab = 'manager' | 'logistics' | 'cashier' | 'finance' | 'more';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ', gen_director: 'Ген. директор', director: 'Директор', manager: 'Менеджер', cashier: 'Кассир',
  logist: 'Логист', senior_logist: 'Нач. логистики', b2b_manager: 'Менеджер B2B', b2b_logist: 'Логист B2B',
};

const TABS: { key: MobileTab; label: string; icon: React.ReactNode; sections: NavSection[] }[] = [
  { key: 'manager', label: 'Менеджер', icon: <Users size={22} />, sections: ['families'] },
  { key: 'logistics', label: 'Логистика', icon: <Route size={22} />, sections: ['logistics', 'drivers'] },
  { key: 'cashier', label: 'Кассир', icon: <Wallet size={22} />, sections: ['cashier'] },
  { key: 'finance', label: 'Финансы', icon: <Receipt size={22} />, sections: ['expenses'] },
  { key: 'more', label: 'Ещё', icon: <Menu size={22} />, sections: [] },
];

const TAB_STORAGE_KEY = 'outway_mobile_tab';

function MoreSection({ user, onLogout, onOpenDesktop }: {
  user: AuthenticatedUser;
  onLogout: () => void;
  onOpenDesktop: () => void;
}) {
  const nav = useNavPosition();
  const canSeeEmployees = canAccessSection(user.role, 'employees', user.id);

  if (nav.page?.kind === 'employees') return <EmployeesSection user={user} onBack={nav.back} />;

  const hasDesktopOnly = canAccessSection(user.role, 'b2b', user.id) || canAccessSection(user.role, 'market', user.id);
  return (
    <Screen pageKey="more:home" title="Ещё">
      <div className="m-card">
        <div className="m-card-row">
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--accent-l)', color: 'var(--accent-h)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
            {user.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="m-card-main">
            <div className="m-card-title">{user.name}</div>
            <div className="m-card-sub">{user.position || ROLE_LABEL[user.role] || user.role}</div>
          </div>
        </div>
      </div>
      <div className="m-list">
        {canSeeEmployees && (
          <button type="button" className="m-card" onClick={() => nav.push({ kind: 'employees' })}>
            <div className="m-card-row">
              <UserCog size={22} color="var(--accent-h)" />
              <div className="m-card-main"><div className="m-card-title">Сотрудники</div></div>
              <ChevronRight className="m-card-chevron" size={20} />
            </div>
          </button>
        )}
        <button type="button" className="m-card" onClick={onOpenDesktop}>
          <div className="m-card-row">
            <Monitor size={22} color="var(--accent-h)" />
            <div className="m-card-main">
              <div className="m-card-title">Открыть полную версию</div>
              <div className="m-card-sub">Все функции, как на компьютере{hasDesktopOnly ? ' (B2B и другие разделы)' : ''}</div>
            </div>
            <ChevronRight className="m-card-chevron" size={20} />
          </div>
        </button>
        <button type="button" className="m-card" onClick={() => { if (window.confirm('Выйти из CRM?')) onLogout(); }}>
          <div className="m-card-row" style={{ color: 'var(--danger)' }}>
            <LogOut size={22} />
            <div className="m-card-main"><div className="m-card-title">Выйти</div></div>
          </div>
        </button>
      </div>
    </Screen>
  );
}

function MobileShell({ user, onLogout, onOpenDesktop }: {
  user: AuthenticatedUser;
  onLogout: () => void;
  onOpenDesktop: () => void;
}) {
  const nav = useMobileNav();
  const tabs = TABS.filter(tab => tab.key === 'more' || tab.sections.some(section => canAccessSection(user.role, section, user.id)));
  const [tab, setTab] = useState<MobileTab>(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(TAB_STORAGE_KEY); } catch { /* приватный режим */ }
    return tabs.find(item => item.key === saved)?.key ?? tabs[0].key;
  });

  useEffect(() => {
    try { sessionStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* приватный режим */ }
  }, [tab]);

  const selectTab = (next: MobileTab) => {
    if (next === tab) {
      nav.reset();
      return;
    }
    nav.reset();
    setTab(next);
  };

  const section = tab === 'manager' ? <ManagerSection user={user} />
    : tab === 'logistics' ? <LogisticsSection user={user} />
    : tab === 'cashier' ? <CashierSection user={user} />
    : tab === 'finance' ? <FinanceSection user={user} />
    : <MoreSection user={user} onLogout={onLogout} onOpenDesktop={onOpenDesktop} />;

  return (
    <div className="m-app">
      <Suspense fallback={<div className="m-content"><div className="m-page"><Skeletons /></div></div>}>
        {section}
      </Suspense>
      <nav className="m-tabbar" aria-label="Разделы">
        {tabs.map(item => (
          <button
            key={item.key}
            type="button"
            className={`m-tab ${item.key === tab ? 'm-tab--active' : ''}`}
            aria-current={item.key === tab ? 'page' : undefined}
            onClick={() => selectTab(item.key)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Отдельный интерфейс для телефона: нижнее меню, карточки вместо таблиц, листы снизу. */
export default function MobileApp(props: {
  user: AuthenticatedUser;
  onLogout: () => void;
  onOpenDesktop: () => void;
}) {
  return (
    <MobileNavProvider>
      <MobileShell {...props} />
    </MobileNavProvider>
  );
}
