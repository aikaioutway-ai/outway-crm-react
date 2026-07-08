import React, { useEffect, useState } from 'react';
import Sidebar, { canAccessSection, getAllowedSections, NavSection } from './core/bars/Sidebar';
import FamiliesPage from './modules/families/FamiliesPage';
import ManagerOverview from './modules/families/ManagerOverview';
import SchoolKpiStrip from './modules/families/SchoolKpiStrip';
import DriversPage from './modules/drivers/DriversPage';
import EmployeesPage from './modules/employees/EmployeesPage';
import LoginPage from './modules/auth/LoginPage';
import { AuthenticatedUser, authenticateEmployee } from './services/employeeService';
import { fetchV2FamiliesTable } from './services/crmV2Service';
import { UserRole } from './types';
import TimesheetModule from './modules/expenses/TimesheetModule';
import './index.css';

const PLACEHOLDERS: Partial<Record<NavSection, string>> = {
  settings:  'Настройки — в разработке',
};

const ROLES: UserRole[] = ['admin', 'gen_director', 'director', 'manager', 'logist', 'senior_logist', 'cashier'];
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
  const [managerSchoolKey, setManagerSchoolKey] = useState<string | null>(null);
  const [adminFiltersOpen, setAdminFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [schoolSidebarReserveWidth, setSchoolSidebarReserveWidth] = useState(78);

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

  useEffect(() => {
    setAdminFiltersOpen(false);
    setColumnsOpen(false);
    setSchoolSidebarReserveWidth(78);
  }, [section, cashierTab, logisticsTab, managerSchoolKey, expensesTab]);

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
    padding: '8px 10px 0',
    gap: 2,
    marginBottom: 0,
    marginRight: 0,
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  };

  const tabStyle = (active: boolean) => ({
    height: 34,
    padding: '0 16px',
    border: 'none',
    borderRadius: active ? '10px 10px 0 0' : 10,
    background: active ? 'var(--active-bg)' : 'transparent',
    color: active ? '#0C7A74' : '#7A859D',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.15s, color 0.15s',
    position: 'relative' as const,
    zIndex: active ? 3 : 1,
    marginBottom: active ? -1 : 0,
  } as React.CSSProperties);

  const sectionLabel = (label: string) => (
    <span style={{
      fontSize: 15,
      fontWeight: 800,
      color: '#17222F',
      paddingLeft: 10,
      paddingRight: 14,
      paddingBottom: 10,
      whiteSpace: 'nowrap' as const,
      borderRight: '1px solid #E2ECEE',
      marginRight: 6,
      letterSpacing: '-0.01em',
    }}>{label}</span>
  );

  const userInitials = (name?: string) => (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  const extraTabs = (_hasFamiliesPage: boolean) => currentUser ? (
    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', paddingRight: 10, paddingBottom: 8, gap: 8 }}>
      <div style={{ textAlign: 'right' }}>
        {currentUser.position && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9AABB0', lineHeight: 1.3 }}>{currentUser.position}</div>
        )}
        {currentUser.name && (
          <div style={{ fontSize: 13, fontWeight: 800, color: '#17222F', lineHeight: 1.3 }}>{currentUser.name}</div>
        )}
      </div>
      {currentUser.name && (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {userInitials(currentUser.name)}
        </div>
      )}
    </div>
  ) : null;

  const tabRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-end',
    flexShrink: 0,
    paddingRight: schoolSidebarReserveWidth,
    transition: 'padding-right .18s ease',
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
                {([['payments', 'Проверка'], ['manager_payments', 'Платежи']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setCashierTab(key)} style={tabStyle(cashierTab === key)}>
                    {label}
                  </button>
                ))}
                {extraTabs(true)}
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
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
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
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
              />
            ) : null}
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
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
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
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
              />
            ) : logisticsTab === 'drivers' ? (
              <DriversPage
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
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
                {managerSchoolKey && (
                  <button onClick={() => setManagerSchoolKey(null)} style={tabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {extraTabs(true)}
              </div>
            </div>
            {managerSchoolKey ? (
              <>
                <SchoolKpiStrip schoolKey={managerSchoolKey} rightReserveWidth={schoolSidebarReserveWidth} />
                <FamiliesPage
                  key={managerSchoolKey}
                  mode="directory"
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  allowedSchools={[managerSchoolKey]}
                  hideDashboard
                  adminFiltersOpen={adminFiltersOpen}
                  onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                  columnsOpen={columnsOpen}
                  onColumnsOpenChange={setColumnsOpen}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                />
              </>
            ) : (
              <ManagerOverview onSelectSchool={setManagerSchoolKey} />
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
              onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
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
              {expensesTab === 'payroll'
                ? 'Модуль Зарплата — в разработке'
                : expensesTab === 'advances'
                  ? 'Модуль Авансы — в разработке'
                  : 'Модуль Расходы — в разработке'}
            </div>
          </div>
        ) : section === 'timesheet' ? (
          <TimesheetModule
            userRole={currentUserRole}
            userName={currentUser?.name}
            allowedSchools={currentUser?.schoolKeys}
            adminFiltersOpen={adminFiltersOpen}
            onAdminFiltersClose={() => setAdminFiltersOpen(false)}
            columnsOpen={columnsOpen}
            onColumnsOpenChange={setColumnsOpen}
            rightReserveWidth={schoolSidebarReserveWidth}
            onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
          />
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
