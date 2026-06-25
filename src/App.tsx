import React, { useEffect, useState } from 'react';
import Sidebar, { canAccessSection, getAllowedSections, NavSection } from './core/bars/Sidebar';
import FamiliesPage from './modules/families/FamiliesPage';
import DriversPage from './modules/drivers/DriversPage';
import EmployeesPage from './modules/employees/EmployeesPage';
import LoginPage from './modules/auth/LoginPage';
import { AuthenticatedUser, authenticateEmployee } from './services/employeeService';
import { fetchV2FamiliesTable } from './services/crmV2Service';
import { UserRole } from './types';
import BankStatementPage from './modules/finance/BankStatementPage';
import './index.css';

const PLACEHOLDERS: Partial<Record<NavSection, string>> = {
  settings:  'Настройки — в разработке',
};

const ROLES: UserRole[] = ['admin', 'gen_director', 'director', 'manager', 'logist', 'cashier'];
const SESSION_KEY = 'outway_auth_user';

function getSavedRole(): UserRole {
  const saved = localStorage.getItem('outway_user_role') as UserRole | null;
  return saved && ROLES.includes(saved) ? saved : 'admin';
}

function getSavedUser(): AuthenticatedUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthenticatedUser;
    return parsed?.role && ROLES.includes(parsed.role) ? parsed : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() => getSavedUser());
  const currentUserRole = currentUser?.role ?? getSavedRole();
  const [section, setSection] = useState<NavSection>(() => getAllowedSections(currentUserRole)[0]);
  const [badges, setBadges] = useState<Partial<Record<NavSection, number>>>({});
  const [sidebarCollapseSignal, setSidebarCollapseSignal] = useState(0);
  const [cashierTab, setCashierTab] = useState<'payments' | 'manager_payments' | 'statement'>('payments');
  const [logisticsTab, setLogisticsTab] = useState<'requests' | 'transfers' | 'drivers' | 'dispatch' | 'routes'>('transfers');
  const [expensesTab, setExpensesTab] = useState<'payroll' | 'advances' | 'expenses'>('payroll');
  const [managerTab, setManagerTab] = useState<'directory' | 'requests' | 'charges' | 'payments' | 'dispatch'>('directory');
  const [adminFiltersOpen, setAdminFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const handleLogin = async (login: string, password: string) => {
    const user = await authenticateEmployee(login, password);
    if (!user) return false;

    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    localStorage.setItem('outway_user_role', user.role);
    setCurrentUser(user);
    setSection(getAllowedSections(user.role)[0]);
    return true;
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setBadges({});
  };

  useEffect(() => {
    if (!canAccessSection(currentUserRole, section)) {
      setSection(getAllowedSections(currentUserRole)[0]);
    }
    setAdminFiltersOpen(false);
    setColumnsOpen(false);
  }, [currentUserRole, section]);

  useEffect(() => { setAdminFiltersOpen(false); setColumnsOpen(false); }, [cashierTab, logisticsTab, managerTab, expensesTab]);

  // Обновляем сессию если position ещё не загружен (старый localStorage)
  useEffect(() => {
    if (!currentUser || currentUser.position !== undefined) return;
    import('./services/employeeService').then(({ getEmployeeById }) => {
      getEmployeeById(currentUser.id).then(emp => {
        if (!emp) return;
        const updated = { ...currentUser, position: emp.position ?? '' };
        localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
        setCurrentUser(updated);
      }).catch(() => {});
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchV2FamiliesTable()
      .then(rows => {
        const logisticsChildren = rows.filter(row => row.status !== 'new' && row.status !== 'rejected').length;
        const pendingFamilies = new Set(
          rows
            .filter(row => row.pendingPayment > 0)
            .map(row => row.familyId)
        );
        setBadges({
          logistics: logisticsChildren,
        });
      })
      .catch(() => setBadges({}));
  }, [currentUser]);

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    background: '#FFFFFF',
    borderRadius: '14px 14px 0 0',
    padding: '4px 6px 0',
    gap: 2,
    marginBottom: 0,
    marginRight: 0,
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  };

  const tabStyle = (active: boolean) => ({
    height: 30,
    padding: '0 14px',
    border: 'none',
    borderRadius: active ? '9px 9px 0 0' : 9,
    background: active ? 'var(--active-bg)' : 'transparent',
    color: active ? '#0C7A74' : '#7A859D',
    fontSize: 13,
    fontWeight: active ? 650 : 450,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.15s, color 0.15s',
    position: 'relative' as const,
    zIndex: active ? 3 : 1,
    marginBottom: active ? -1 : 0,
  } as React.CSSProperties);

  const adminTabStyle = (active: boolean) => ({
    height: 28,
    padding: '0 10px',
    border: `1px solid ${active ? '#2DD4BF' : 'rgba(45,212,191,0.25)'}`,
    borderRadius: 7,
    background: active ? 'rgba(45,212,191,0.1)' : 'transparent',
    color: active ? '#0F7B75' : '#9AABB0',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    letterSpacing: '0.02em',
  } as React.CSSProperties);

  const sectionLabel = (label: string) => (
    <span style={{
      fontSize: 13,
      fontWeight: 700,
      color: '#17222F',
      paddingLeft: 8,
      paddingRight: 10,
      whiteSpace: 'nowrap' as const,
      borderRight: '1px solid #E2ECEE',
      marginRight: 4,
      letterSpacing: '-0.01em',
    }}>{label}</span>
  );

  const extraTabs = (_hasFamiliesPage: boolean) => currentUser ? (
    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', paddingRight: 8, gap: 4 }}>
      {currentUser.position && (
        <span style={{ fontSize: 12, fontWeight: 600, color: '#9AABB0' }}>{currentUser.position}</span>
      )}
      {currentUser.position && currentUser.name && (
        <span style={{ fontSize: 12, color: '#C8D5D8' }}>·</span>
      )}
      {currentUser.name && (
        <span style={{ fontSize: 12, fontWeight: 700, color: '#17222F' }}>{currentUser.name}</span>
      )}
    </div>
  ) : null;

  const tabRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-end',
    flexShrink: 0,
    paddingRight: 78,
  };

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--active-bg)' }}>
      <Sidebar
        active={section}
        onChange={setSection}
        badges={badges}
        userRole={currentUserRole}
        onLogout={handleLogout}
        collapseSignal={sidebarCollapseSignal}
        onFiltersClick={() => setAdminFiltersOpen(v => !v)}
        onColumnsClick={() => setColumnsOpen(v => !v)}
        filtersActive={adminFiltersOpen}
        columnsActive={columnsOpen}
      />

      <main
        onClick={() => setSidebarCollapseSignal(value => value + 1)}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', padding: 10, background: 'var(--active-bg)' }}
      >
        {section === 'cashier' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Кассир')}
                {([['payments', 'Проверка'], ['manager_payments', 'Платежи'], ['statement', 'Выписка']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setCashierTab(key)} style={tabStyle(cashierTab === key)}>
                    {label}
                  </button>
                ))}
                {extraTabs(cashierTab !== 'statement')}
              </div>
            </div>
            {cashierTab === 'payments' ? (
              <FamiliesPage
                mode="cashier"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : cashierTab === 'manager_payments' ? (
              <FamiliesPage
                mode="payments"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : (
              <BankStatementPage userName={currentUser?.name} />
            )}
          </div>
        ) : section === 'logistics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Логистика')}
                {([['requests', 'Заявки'], ['transfers', 'Трансфер'], ['drivers', 'Водители'], ['dispatch', 'Диспетчер'], ['routes', 'Маршруты']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setLogisticsTab(key)} style={tabStyle(logisticsTab === key)}>
                    {label}
                  </button>
                ))}
                {extraTabs(logisticsTab !== 'dispatch')}
              </div>
            </div>
            {logisticsTab === 'requests' ? (
              <FamiliesPage
                mode="requests"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : logisticsTab === 'transfers' ? (
              <FamiliesPage
                mode="logistics"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : logisticsTab === 'drivers' ? (
              <DriversPage
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
              />
            ) : logisticsTab === 'dispatch' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 14, color: '#7A859D', fontSize: 16, fontWeight: 700 }}>
                Диспетчер — в разработке
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 14, color: '#7A859D', fontSize: 16, fontWeight: 700 }}>
                Маршруты — в разработке
              </div>
            )}
          </div>
        ) : section === 'families' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Менеджер')}
                {([['directory', 'Справочник'], ['requests', 'Заявки'], ['charges', 'Финансы'], ['payments', 'Платежи'], ['dispatch', 'Диспетчер']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setManagerTab(key)} style={tabStyle(managerTab === key)}>
                    {label}
                  </button>
                ))}
                {extraTabs(managerTab !== 'dispatch')}
              </div>
            </div>
            {managerTab === 'directory' ? (
              <FamiliesPage
                mode="directory"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : managerTab === 'requests' ? (
              <FamiliesPage
                mode="requests"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : managerTab === 'charges' ? (
              <FamiliesPage
                mode="charges"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : managerTab === 'payments' ? (
              <FamiliesPage
                mode="payments"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 14, color: '#7A859D', fontSize: 16, fontWeight: 700 }}>
                Диспетчер — в разработке
              </div>
            )}
          </div>
        ) : section === 'drivers' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Водители')}
                {extraTabs(true)}
              </div>
            </div>
            <DriversPage
              userRole={currentUserRole}
              userName={currentUser?.name}
              allowedSchools={currentUser?.schoolKeys}
            />
          </div>
        ) : section === 'expenses' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Финансы')}
                {([['payroll', 'Зарплата'], ['advances', 'Авансы'], ['expenses', 'Расходы']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setExpensesTab(key)} style={tabStyle(expensesTab === key)}>
                    {label}
                  </button>
                ))}
                {extraTabs(true)}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 14, color: '#7A859D', fontSize: 16, fontWeight: 700 }}>
              {expensesTab === 'payroll' ? 'Модуль Зарплата — в разработке' : expensesTab === 'advances' ? 'Модуль Авансы — в разработке' : 'Модуль Расходы — в разработке'}
            </div>
          </div>
        ) : section === 'employees' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Сотрудники')}
                {extraTabs(true)}
              </div>
            </div>
            <EmployeesPage />
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-2)', fontSize: 18,
          }}>
            {PLACEHOLDERS[section]}
          </div>
        )}
      </main>
    </div>
  );
}
