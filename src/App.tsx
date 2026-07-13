import React, { lazy, Suspense, useEffect, useState } from 'react';
import Sidebar, { canAccessSection, getAllowedSections, NavSection } from './core/bars/Sidebar';
import ManagerOverview from './modules/families/ManagerOverview';
import CashierOverview from './modules/families/CashierOverview';
import CashierSchoolKpiStrip from './modules/families/CashierSchoolKpiStrip';
import CashierSchoolTransferDashboard from './modules/families/CashierSchoolTransferDashboard';
import LogisticsOverview from './modules/families/LogisticsOverview';
import LogisticsSchoolKpiStrip from './modules/families/LogisticsSchoolKpiStrip';
import LogisticsSchoolTransferDashboard from './modules/families/LogisticsSchoolTransferDashboard';
import LogisticsMapView from './modules/families/LogisticsMapView';
import SchoolKpiStrip from './modules/families/SchoolKpiStrip';
import SchoolTransferDashboard from './modules/families/SchoolTransferDashboard';
import DriversOverview from './modules/drivers/DriversOverview';
import DriversSchoolKpiStrip from './modules/drivers/DriversSchoolKpiStrip';
import DriversTransferDashboard from './modules/drivers/DriversTransferDashboard';
import LoginPage from './modules/auth/LoginPage';
import { AuthenticatedUser, authenticateEmployee } from './services/employeeService';
import { fetchV2FamiliesTable } from './services/crmV2Service';
import { currentCashierPeriodKey } from './modules/families/constants';
import type { PayrollSchoolTab } from './modules/expenses/timesheetTypes';
import { UserRole } from './types';
import './index.css';

// Крупные страницы разделов подгружаются только при первом открытии раздела —
// сотрудник больше не скачивает код всех модулей CRM при каждом входе.
const FamiliesPage = lazy(() => import('./modules/families/FamiliesPage'));
const DriversPage = lazy(() => import('./modules/drivers/DriversPage'));
const EmployeesPage = lazy(() => import('./modules/employees/EmployeesPage'));
const TimesheetModule = lazy(() => import('./modules/expenses/TimesheetModule'));
const PayrollModule = lazy(() => import('./modules/payroll/PayrollModule'));

function SectionLoading() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontSize: 15, fontWeight: 600 }}>
      Загрузка…
    </div>
  );
}

const PLACEHOLDERS: Partial<Record<NavSection, string>> = {
  dispatch: 'Диспетчер — в разработке',
  routes: 'Маршруты — в разработке',
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
  const [cashierSchoolKey, setCashierSchoolKey] = useState<string | null>(null);
  const [cashierPeriodKey, setCashierPeriodKey] = useState(currentCashierPeriodKey);
  const [cashierTransferFilter, setCashierTransferFilter] = useState('');
  const [logisticsSchoolKey, setLogisticsSchoolKey] = useState<string | null>(null);
  const [logisticsTransferFilter, setLogisticsTransferFilter] = useState('');
  const [logisticsView, setLogisticsView] = useState<'table' | 'map'>('table');
  const [routesSchoolKey, setRoutesSchoolKey] = useState<string | null>(null);
  const [routesTransferFilter, setRoutesTransferFilter] = useState('');
  const [driversSchoolKey, setDriversSchoolKey] = useState<string | null>(null);
  const [driversTransferFilter, setDriversTransferFilter] = useState('');
  const [expensesTab, setExpensesTab] = useState<'payroll' | 'advances' | 'expenses'>('payroll');
  const [payrollSchoolKey, setPayrollSchoolKey] = useState<string | null>(null);
  const [payrollTransferFilter, setPayrollTransferFilter] = useState('');
  const [payrollSchoolTab, setPayrollSchoolTab] = useState<PayrollSchoolTab>('timesheet');
  const [managerSchoolKey, setManagerSchoolKey] = useState<string | null>(null);
  const [managerSchoolMode, setManagerSchoolMode] = useState<'directory' | 'charges'>('directory');
  const [managerTransferFilter, setManagerTransferFilter] = useState('');
  const [managerOpenFamilyId, setManagerOpenFamilyId] = useState<string | null>(null);
  const handleManagerOpenFamily = (schoolKey: string, familyId: string) => {
    setManagerSchoolKey(schoolKey);
    setManagerOpenFamilyId(familyId);
  };
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
    setManagerTransferFilter('');
    setManagerSchoolMode('directory');
    setCashierSchoolKey(null);
    setCashierTransferFilter('');
    setLogisticsSchoolKey(null);
    setLogisticsTransferFilter('');
    setLogisticsView('table');
    setRoutesSchoolKey(null);
    setRoutesTransferFilter('');
    setDriversSchoolKey(null);
    setDriversTransferFilter('');
    setPayrollSchoolKey(null);
    setPayrollTransferFilter('');
  // expensesTab намеренно не в зависимостях — ни одно из состояний здесь не
  // относится к разделу «Финансы», переключение его вкладок не должно
  // сбрасывать навигацию по школам в Кассире/Логистике/Менеджере/Водителях.
  }, [section, cashierTab, managerSchoolKey]);

  useEffect(() => {
    setCashierTransferFilter('');
  }, [cashierSchoolKey, cashierPeriodKey]);

  useEffect(() => {
    setLogisticsTransferFilter('');
    setLogisticsView('table');
  }, [logisticsSchoolKey]);

  useEffect(() => {
    setRoutesTransferFilter('');
  }, [routesSchoolKey]);

  useEffect(() => {
    setDriversTransferFilter('');
  }, [driversSchoolKey]);

  useEffect(() => {
    setPayrollTransferFilter('');
    setPayrollSchoolTab('timesheet');
  }, [payrollSchoolKey]);

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
    alignItems: 'flex-end',
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
    boxShadow: active ? 'inset 0 4px 0 #31A4A5' : 'none',
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
        <Suspense fallback={<SectionLoading />}>
        {section === 'cashier' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Кассир')}
                {cashierSchoolKey && (
                  <button onClick={() => setCashierSchoolKey(null)} style={tabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {extraTabs(true)}
              </div>
            </div>
            {cashierSchoolKey ? (
              <>
              <CashierSchoolKpiStrip
                schoolKey={cashierSchoolKey}
                periodKey={cashierPeriodKey}
                rightReserveWidth={schoolSidebarReserveWidth}
              />
              <CashierSchoolTransferDashboard
                schoolKey={cashierSchoolKey}
                periodKey={cashierPeriodKey}
                rightReserveWidth={schoolSidebarReserveWidth}
                selectedKey={cashierTransferFilter}
                onSelect={setCashierTransferFilter}
              />
              <FamiliesPage
                mode="cashier"
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                initialQuickFilter={{ activeTab: cashierSchoolKey }}
                onSchoolKeyChange={setCashierSchoolKey}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                externalPeriodKey={cashierPeriodKey}
                onPeriodKeyChange={setCashierPeriodKey}
                hideDashboard
                hideTransferBars
                externalQuickTransfer={cashierTransferFilter}
              />
              </>
            ) : (
              <CashierOverview
                periodKey={cashierPeriodKey}
                onPeriodKeyChange={setCashierPeriodKey}
                onSelectSchool={setCashierSchoolKey}
                onSidebarWidthChange={setSchoolSidebarReserveWidth}
              />
            )}
          </div>
        ) : section === 'logistics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Логистика')}
                {logisticsSchoolKey && (
                  <>
                    <button onClick={() => setLogisticsSchoolKey(null)} style={tabStyle(false)}>
                      ← Все школы
                    </button>
                    <button onClick={() => setLogisticsView('table')} style={tabStyle(logisticsView === 'table')}>
                      Таблица
                    </button>
                    <button onClick={() => setLogisticsView('map')} style={tabStyle(logisticsView === 'map')}>
                      Карта
                    </button>
                  </>
                )}
                {extraTabs(true)}
              </div>
            </div>
            {logisticsSchoolKey ? (
              <>
              <LogisticsSchoolKpiStrip
                schoolKey={logisticsSchoolKey}
                rightReserveWidth={schoolSidebarReserveWidth}
              />
              <LogisticsSchoolTransferDashboard
                schoolKey={logisticsSchoolKey}
                rightReserveWidth={schoolSidebarReserveWidth}
                selectedKey={logisticsTransferFilter}
                onSelect={setLogisticsTransferFilter}
              />
              {logisticsView === 'map' ? (
                <LogisticsMapView
                  schoolKey={logisticsSchoolKey}
                  transferFilter={logisticsTransferFilter}
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  onSelectSchool={setLogisticsSchoolKey}
                  onSidebarWidthChange={setSchoolSidebarReserveWidth}
                />
              ) : (
                <FamiliesPage
                  mode="logistics"
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  allowedSchools={currentUser?.schoolKeys}
                  initialQuickFilter={{ activeTab: logisticsSchoolKey }}
                  onSchoolKeyChange={setLogisticsSchoolKey}
                  adminFiltersOpen={adminFiltersOpen}
                  onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                  columnsOpen={columnsOpen}
                  onColumnsOpenChange={setColumnsOpen}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                  hideDashboard
                  hideTransferBars
                  externalQuickTransfer={logisticsTransferFilter === 'rejected' ? '' : logisticsTransferFilter}
                  externalQuickChildStatus={logisticsTransferFilter === 'rejected' ? 'rejected' : ''}
                />
              )}
              </>
            ) : (
              <LogisticsOverview
                onSelectSchool={setLogisticsSchoolKey}
                onSidebarWidthChange={setSchoolSidebarReserveWidth}
              />
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
                {managerSchoolKey && ([['directory', 'Справочник'], ['charges', 'Оплаты']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setManagerSchoolMode(key)} style={tabStyle(managerSchoolMode === key)}>
                    {label}
                  </button>
                ))}
                {extraTabs(true)}
              </div>
            </div>
            {managerSchoolKey ? (
              <>
                <SchoolKpiStrip schoolKey={managerSchoolKey} rightReserveWidth={schoolSidebarReserveWidth} />
                <SchoolTransferDashboard
                  schoolKey={managerSchoolKey}
                  rightReserveWidth={schoolSidebarReserveWidth}
                  selectedKey={managerTransferFilter}
                  onSelect={setManagerTransferFilter}
                />
                <FamiliesPage
                  mode={managerSchoolMode}
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  allowedSchools={currentUser?.schoolKeys}
                  initialQuickFilter={{ activeTab: managerSchoolKey }}
                  onSchoolKeyChange={setManagerSchoolKey}
                  hideDashboard
                  adminFiltersOpen={adminFiltersOpen}
                  onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                  columnsOpen={columnsOpen}
                  onColumnsOpenChange={setColumnsOpen}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                  hideTransferBars
                  externalQuickTransfer={managerTransferFilter === 'new' || managerTransferFilter === 'rejected' ? '' : managerTransferFilter}
                  externalQuickChildStatus={managerTransferFilter === 'new' || managerTransferFilter === 'rejected' ? managerTransferFilter : ''}
                  initialOpenFamilyId={managerOpenFamilyId}
                  onInitialFamilyOpened={() => setManagerOpenFamilyId(null)}
                />
              </>
            ) : (
              <ManagerOverview onSelectSchool={setManagerSchoolKey} onSidebarWidthChange={setSchoolSidebarReserveWidth} onOpenFamily={handleManagerOpenFamily} />
            )}
          </div>
        ) : section === 'drivers' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Водители')}
                {driversSchoolKey && (
                  <button onClick={() => setDriversSchoolKey(null)} style={tabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {extraTabs(true)}
              </div>
            </div>
            {driversSchoolKey ? (
              <>
                <DriversSchoolKpiStrip
                  schoolKey={driversSchoolKey}
                  rightReserveWidth={schoolSidebarReserveWidth}
                />
                <DriversTransferDashboard
                  schoolKey={driversSchoolKey}
                  rightReserveWidth={schoolSidebarReserveWidth}
                  selectedKey={driversTransferFilter}
                  onSelect={setDriversTransferFilter}
                />
                <DriversPage
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  allowedSchools={currentUser?.schoolKeys}
                  schoolKey={driversSchoolKey}
                  externalQuickTransfer={driversTransferFilter}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                />
              </>
            ) : (
              <DriversOverview
                onSelectSchool={setDriversSchoolKey}
                onSidebarWidthChange={setSchoolSidebarReserveWidth}
              />
            )}
          </div>
        ) : section === 'dispatch' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Диспетчер')}
                {extraTabs(true)}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 14, color: '#7A859D', fontSize: 16, fontWeight: 700 }}>
              {PLACEHOLDERS.dispatch}
            </div>
          </div>
        ) : section === 'routes' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Маршруты')}
                {routesSchoolKey && (
                  <button onClick={() => setRoutesSchoolKey(null)} style={tabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {extraTabs(true)}
              </div>
            </div>
            {routesSchoolKey ? (
              <>
              <LogisticsSchoolKpiStrip
                schoolKey={routesSchoolKey}
                rightReserveWidth={schoolSidebarReserveWidth}
              />
              <LogisticsSchoolTransferDashboard
                schoolKey={routesSchoolKey}
                rightReserveWidth={schoolSidebarReserveWidth}
                selectedKey={routesTransferFilter}
                onSelect={setRoutesTransferFilter}
              />
              <LogisticsMapView
                schoolKey={routesSchoolKey}
                transferFilter={routesTransferFilter}
                userRole={currentUserRole}
                userName={currentUser?.name}
                onSelectSchool={setRoutesSchoolKey}
                onSidebarWidthChange={setSchoolSidebarReserveWidth}
              />
              </>
            ) : (
              <LogisticsOverview
                onSelectSchool={setRoutesSchoolKey}
                onSidebarWidthChange={setSchoolSidebarReserveWidth}
              />
            )}
          </div>
        ) : section === 'expenses' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Финансы')}
                {expensesTab === 'payroll' && payrollSchoolKey && (
                  <button onClick={() => setPayrollSchoolKey(null)} style={tabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {expensesTab === 'payroll' && payrollSchoolKey && ([
                  ['timesheet', 'Табель'],
                  ['advance', 'Аванс'],
                  ['salary', 'Зарплата'],
                ] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setPayrollSchoolTab(key)} style={tabStyle(payrollSchoolTab === key)}>
                    {label}
                  </button>
                ))}
                {expensesTab !== 'payroll' && ([['payroll', 'Зарплата'], ['advances', 'Авансы'], ['expenses', 'Расходы']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setExpensesTab(key)} style={tabStyle(expensesTab === key)}>
                    {label}
                  </button>
                ))}
                {extraTabs(true)}
              </div>
            </div>
            {expensesTab === 'payroll' ? (
              <PayrollModule
                userRole={currentUserRole}
                userName={currentUser?.name}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
                rightReserveWidth={schoolSidebarReserveWidth}
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                schoolKey={payrollSchoolKey}
                transferFilter={payrollTransferFilter}
                schoolTab={payrollSchoolTab}
                onSelectSchool={setPayrollSchoolKey}
                onTransferFilterChange={setPayrollTransferFilter}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 14, color: '#7A859D', fontSize: 16, fontWeight: 700 }}>
                {expensesTab === 'advances'
                  ? 'Модуль Авансы — в разработке'
                  : 'Модуль Расходы — в разработке'}
              </div>
            )}
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
        </Suspense>
      </main>
    </div>
  );
}
