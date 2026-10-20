import SalaryExpensesView from './modules/costs/SalaryExpensesView';
import { ExpenseCategory, EXPENSE_CATEGORIES } from './modules/costs/expenseTypes';
import LogisticsTabs from './modules/families/LogisticsTabs';
import HiddenSchoolsList from './modules/families/HiddenSchoolsList';
import CashierViewTabs from './modules/families/CashierViewTabs';
import ManagerModeTabs from './modules/families/ManagerModeTabs';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import Sidebar, { canAccessFinanceExpenses, canAccessSection, getAllowedSections, NavSection } from './core/bars/Sidebar';
import ManagerOverview, { ManagerSearch } from './modules/families/ManagerOverview';
import CashierOverview from './modules/families/CashierOverview';
import CashierSchoolKpiStrip from './modules/families/CashierSchoolKpiStrip';
import CashierSchoolTransferDashboard from './modules/families/CashierSchoolTransferDashboard';
import CashierRefundsTable from './modules/families/CashierRefundsTable';
import LogisticsOverview from './modules/families/LogisticsOverview';
import LogisticsSchoolKpiStrip from './modules/families/LogisticsSchoolKpiStrip';
import LogisticsSchoolTransferDashboard from './modules/families/LogisticsSchoolTransferDashboard';
import LogisticsMapView from './modules/families/LogisticsMapView';
import SchoolKpiStrip from './modules/families/SchoolKpiStrip';
import SchoolTransferDashboard from './modules/families/SchoolTransferDashboard';
import ManagerPeriodBar from './modules/families/ManagerPeriodBar';
import DriversOverview from './modules/drivers/DriversOverview';
import DriversSchoolKpiStrip from './modules/drivers/DriversSchoolKpiStrip';
import DriversTransferDashboard from './modules/drivers/DriversTransferDashboard';
import LoginPage from './modules/auth/LoginPage';
import {
  AuthenticatedUser,
  authenticateEmployee,
} from './services/employeeService';
import {
  EMPLOYEE_SESSION_EXPIRED_EVENT,
  getEmployeeSessionExpiresAt,
  isEmployeeSessionActive,
} from './services/employeeSession';
import { useFamiliesTable } from './hooks/useCrmQueries';
import { SCHOOL_TABS, CASHIER_PERIODS, currentCashierPeriodKey, currentPayrollPeriodKey, isSchoolAllowed } from './modules/families/constants';
import { UserRole } from './types';
import { DashboardSearch, DashboardTopPanel } from './core/dashboard/DashboardUI';
import { supabase } from './services/supabase';
import { invalidateFamiliesCache } from './services/crmV2Service';
import { useDesktopViewport, useForceDesktop, useIsMobileViewport } from './mobile/useIsMobile';
import './index.css';

// Крупные страницы разделов подгружаются только при первом открытии раздела —
// сотрудник больше не скачивает код всех модулей CRM при каждом входе.
const FamiliesPage = lazy(() => import('./modules/families/FamiliesPage'));
const DriversPage = lazy(() => import('./modules/drivers/DriversPage'));
const EmployeesPage = lazy(() => import('./modules/employees/EmployeesPage'));
const ExpensesModule = lazy(() => import('./modules/costs/ExpensesModule'));
const MarketModule = lazy(() => import('./modules/market/MarketModule'));
const B2BModule = lazy(() => import('./modules/b2b/B2BModule'));
const MobileApp = lazy(() => import('./mobile/MobileApp'));

function SectionLoading() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontSize: 15, fontWeight: 600 }}>
      Загрузка…
    </div>
  );
}

const PLACEHOLDERS: Partial<Record<NavSection, string>> = {
  dispatch: 'Диспетчер — в разработке',
  settings:  'Настройки — в разработке',
};

const ROLES: UserRole[] = ['b2b_manager', 'b2b_logist', 'admin', 'gen_director', 'director', 'manager', 'logist', 'senior_logist', 'cashier'];
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
    if (!parsed?.role || !ROLES.includes(parsed.role) || !isEmployeeSessionActive(parsed.sessionToken)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() => getSavedUser());
  const currentUserRole = currentUser?.role ?? getSavedRole();
  const isMobileViewport = useIsMobileViewport();
  const [forceDesktop, setForceDesktop] = useForceDesktop();
  useDesktopViewport(isMobileViewport && forceDesktop && !!currentUser);
  const [section, setSection] = useState<NavSection>(() => getAllowedSections(currentUserRole, currentUser?.id)[0]);
  const [sidebarCollapseSignal, setSidebarCollapseSignal] = useState(0);
  const [cashierSchoolKey, setCashierSchoolKey] = useState<string | null>(null);
  const [cashierPeriodKey, setCashierPeriodKey] = useState(currentCashierPeriodKey);
  const [cashierTransferFilter, setCashierTransferFilter] = useState('');
  const [cashierOpenFamilySearch, setCashierOpenFamilySearch] = useState('');
  const [cashierView, setCashierView] = useState<'pending' | 'confirmed' | 'refunds'>('pending');
  const [logisticsSchoolKey, setLogisticsSchoolKey] = useState<string | null>(null);
  const [logisticsTransferFilter, setLogisticsTransferFilter] = useState('');
  const [logisticsSearch, setLogisticsSearch] = useState('');
  const [logisticsView, setLogisticsView] = useState<'table' | 'map' | 'schools'>('table');
  const [driversSchoolKey, setDriversSchoolKey] = useState<string | null>(null);
  const [driversTransferFilter, setDriversTransferFilter] = useState('');
  const [driversSearch, setDriversSearch] = useState('');
  const [financeView, setFinanceView] = useState<'expenses' | 'salary'>('expenses');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory | null>(null);
  const [expenseSubcategory, setExpenseSubcategory] = useState('ALL');
  const [managerSchoolKey, setManagerSchoolKey] = useState<string | null>(null);
  const [managerSchoolMode, setManagerSchoolMode] = useState<'directory' | 'charges'>('directory');
  const [managerTransferFilter, setManagerTransferFilter] = useState('');
  const [managerOpenFamilySearch, setManagerOpenFamilySearch] = useState('');
  const [managerPeriodKey, setManagerPeriodKey] = useState(currentPayrollPeriodKey);
  const canAccessManagerSchool = (schoolKey: string) => isSchoolAllowed(schoolKey, currentUser?.schoolKeys);
  const handleManagerSelectSchool = (schoolKey: string) => {
    if (!canAccessManagerSchool(schoolKey)) return;
    setManagerOpenFamilySearch('');
    setManagerSchoolKey(schoolKey);
  };
  const handleManagerOpenFamily = (schoolKey: string, _familyId: string, searchQuery: string) => {
    if (!canAccessManagerSchool(schoolKey)) return;
    setManagerOpenFamilySearch(searchQuery);
    setManagerSchoolMode('directory');
    setManagerSchoolKey(schoolKey);
  };
  const handleLogisticsSelectSchool = (schoolKey: string) => {
    if (!isSchoolAllowed(schoolKey, currentUser?.schoolKeys)) return;
    if (logisticsView === 'schools') setLogisticsView('map');
    setLogisticsSchoolKey(schoolKey);
  };
  const handleLogisticsOpenFamily = (schoolKey: string, _familyId: string, searchQuery: string) => {
    if (!isSchoolAllowed(schoolKey, currentUser?.schoolKeys)) return;
    setLogisticsSearch(searchQuery);
    setLogisticsView('table');
    if (logisticsView === 'schools') setLogisticsView('map');
    setLogisticsSchoolKey(schoolKey);
  };
  const handleCashierSelectSchool = (schoolKey: string) => {
    if (!isSchoolAllowed(schoolKey, currentUser?.schoolKeys)) return;
    setCashierOpenFamilySearch('');
    setCashierSchoolKey(schoolKey);
  };
  const handleCashierOpenFamily = (schoolKey: string, _familyId: string, searchQuery: string, periodKey: string) => {
    if (!isSchoolAllowed(schoolKey, currentUser?.schoolKeys)) return;
    setCashierOpenFamilySearch(searchQuery);
    setCashierPeriodKey(periodKey);
    setCashierView('pending');
    setCashierSchoolKey(schoolKey);
  };
  const [adminFiltersOpen, setAdminFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [schoolSidebarReserveWidth, setSchoolSidebarReserveWidth] = useState(0);

  const handleLogin = async (login: string, password: string) => {
    const user = await authenticateEmployee(login, password);
    if (!user) return false;

    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    localStorage.setItem('outway_user_role', user.role);
    setCurrentUser(user);
    setSection(getAllowedSections(user.role, user.id)[0]);
    return true;
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  };

  useEffect(() => {
    const expireSession = () => {
      localStorage.removeItem(SESSION_KEY);
      setCurrentUser(null);
    };
    window.addEventListener(EMPLOYEE_SESSION_EXPIRED_EVENT, expireSession);

    const expiresAt = getEmployeeSessionExpiresAt(currentUser?.sessionToken);
    const remaining = expiresAt === null ? 0 : expiresAt - Date.now();
    if (currentUser && remaining <= 0) expireSession();
    const timer = remaining > 0
      ? window.setTimeout(expireSession, Math.min(remaining, 2_147_483_647))
      : undefined;

    return () => {
      window.removeEventListener(EMPLOYEE_SESSION_EXPIRED_EVENT, expireSession);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel('crm-transfer-allocation-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_children' }, invalidateFamiliesCache)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_transfers' }, invalidateFamiliesCache)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUser]);

  useEffect(() => {
    if (!canAccessSection(currentUserRole, section, currentUser?.id)) {
      setSection(getAllowedSections(currentUserRole, currentUser?.id)[0]);
    }
    setAdminFiltersOpen(false);
    setColumnsOpen(false);
  }, [currentUser?.id, currentUserRole, section]);

  useEffect(() => {
    if (!managerSchoolKey || isSchoolAllowed(managerSchoolKey, currentUser?.schoolKeys)) return;
    setManagerSchoolKey(null);
    setManagerOpenFamilySearch('');
    setManagerTransferFilter('');
  }, [currentUser?.schoolKeys, managerSchoolKey]);

  useEffect(() => {
    setAdminFiltersOpen(false);
    setColumnsOpen(false);
    setSchoolSidebarReserveWidth(0);
    setManagerTransferFilter('');
    setCashierSchoolKey(null);
    setCashierTransferFilter('');
    setCashierOpenFamilySearch('');
    if (section !== 'logistics' && section !== 'drivers') {
      setLogisticsSchoolKey(null);
      setLogisticsTransferFilter('');
      setDriversSchoolKey(null);
      setDriversTransferFilter('');
    }
  }, [section, managerSchoolKey]);

  useEffect(() => {
    setCashierTransferFilter('');
  }, [cashierSchoolKey, cashierPeriodKey]);

  useEffect(() => {
    setLogisticsTransferFilter('');
  }, [logisticsSchoolKey]);

  useEffect(() => {
    setDriversTransferFilter('');
  }, [driversSchoolKey]);

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

  const badgesQuery = useFamiliesTable({ enabled: !!currentUser });
  const badges: Partial<Record<NavSection, number>> = currentUser && badgesQuery.data
    ? { logistics: badgesQuery.data.filter(row => row.status !== 'new' && row.status !== 'rejected').length }
    : {};

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-end',
    flex: 1,
    minWidth: 0,
    background: '#FFFFFF',
    borderRadius: '14px 14px 0 0',
    padding: '8px 10px 0',
    gap: 8,
    marginBottom: 0,
    marginRight: 0,
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  };

  const managerModeTabStyle = (active: boolean): React.CSSProperties => ({
    height: 34,
    padding: '0 16px',
    marginBottom: 8,
    border: 'none',
    borderRadius: 10,
    background: active ? '#31A4A5' : '#fff',
    color: active ? '#fff' : '#354052',
    fontSize: 13,
    fontWeight: active ? 800 : 650,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background .15s, color .15s, border-color .15s',
    boxShadow: active ? '0 5px 12px rgba(49, 164, 165, .2)' : '0 5px 16px rgba(43, 72, 89, .06)',
  });

  const sectionLabel = (label: string) => (
    <span style={{
      fontSize: 17,
      fontWeight: 800,
      color: '#17222F',
      paddingLeft: 10,
      paddingRight: 14,
      paddingBottom: 10,
      whiteSpace: 'nowrap' as const,
      borderRight: 'none',
      marginRight: 8,
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

  if (isMobileViewport && !forceDesktop) {
    return (
      <Suspense fallback={<SectionLoading />}>
        <MobileApp user={currentUser} onLogout={handleLogout} onOpenDesktop={() => setForceDesktop(true)} />
      </Suspense>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--active-bg)' }}>
      <Sidebar
        active={section === 'drivers' ? 'logistics' : section}
        onChange={setSection}
        badges={badges}
        userRole={currentUserRole}
        userId={currentUser.id}
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
        {section === 'b2b' ? (
          <B2BModule userRole={currentUserRole} userName={currentUser.name} sessionToken={currentUser.sessionToken} />
        ) : section === 'cashier' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Кассир')}
                {cashierSchoolKey && (
                  <>
                    <button onClick={() => { setCashierSchoolKey(null); setCashierOpenFamilySearch(''); }} style={managerModeTabStyle(false)}>
                      ← Все школы
                    </button>
                    <CashierViewTabs compact value={cashierView} onChange={setCashierView} />
                  </>
                )}
                {extraTabs(true)}
              </div>
            </div>
            {cashierSchoolKey ? (
              <>
              {cashierView === 'refunds' ? (
                <DashboardTopPanel>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                      <ManagerPeriodBar periodKey={cashierPeriodKey} onPeriodKeyChange={setCashierPeriodKey} periods={CASHIER_PERIODS} />
                    </div>
                    <DashboardSearch value={cashierOpenFamilySearch} onChange={setCashierOpenFamilySearch} />
                  </div>
                </DashboardTopPanel>
              ) : (
                <DashboardTopPanel>
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                        <ManagerPeriodBar periodKey={cashierPeriodKey} onPeriodKeyChange={setCashierPeriodKey} periods={CASHIER_PERIODS} />
                      </div>
                      <DashboardSearch value={cashierOpenFamilySearch} onChange={setCashierOpenFamilySearch} />
                    </div>
                  <CashierSchoolKpiStrip
                    view={cashierView}
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
                    statusFilter={cashierView}
                  />
                </DashboardTopPanel>
              )}
              {cashierView === 'refunds' ? (
                <CashierRefundsTable
                  schoolKey={cashierSchoolKey}
                  periodKey={cashierPeriodKey}
                  searchQuery={cashierOpenFamilySearch}
                  confirmedBy={currentUser?.name}
                />
              ) : (
                <FamiliesPage
                  mode="cashier"
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  authToken={currentUser?.sessionToken}
                  allowedSchools={currentUser?.schoolKeys}
                  initialQuickFilter={{ activeTab: cashierSchoolKey }}
                  onSchoolKeyChange={handleCashierSelectSchool}
                  adminFiltersOpen={adminFiltersOpen}
                  onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                  columnsOpen={columnsOpen}
                  onColumnsOpenChange={setColumnsOpen}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                  externalPeriodKey={cashierPeriodKey}
                  hideTransferBars
                  externalQuickTransfer={cashierTransferFilter}
                  initialSearch={cashierOpenFamilySearch}
                  cashierView={cashierView}
                />
              )}
              </>
            ) : (
              <CashierOverview
                view={cashierView}
                onViewChange={setCashierView}
                periodKey={cashierPeriodKey}
                onPeriodKeyChange={setCashierPeriodKey}
                onSelectSchool={handleCashierSelectSchool}
                onOpenPaymentFamily={handleCashierOpenFamily}
                allowedSchools={currentUser?.schoolKeys}
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
                    <button onClick={() => { setLogisticsSchoolKey(null); setLogisticsSearch(''); }} style={managerModeTabStyle(false)}>
                      ← Все школы
                    </button>
                    <div style={{ marginBottom: 8 }}>
                      <LogisticsTabs school value={logisticsView} onChange={key => {
                        if (key === 'drivers') {
                          setDriversSchoolKey(logisticsSchoolKey);
                          setDriversTransferFilter(logisticsTransferFilter);
                          setDriversSearch(logisticsSearch);
                          setSection('drivers');
                        } else if (key !== 'schools') setLogisticsView(key);
                      }} />
                    </div>
                  </>
                )}

                {extraTabs(true)}
              </div>
            </div>
            {logisticsSchoolKey && isSchoolAllowed(logisticsSchoolKey, currentUser?.schoolKeys) ? (
              <>
              <DashboardTopPanel>
                <LogisticsSchoolKpiStrip
                  schoolKey={logisticsSchoolKey}
                  rightReserveWidth={schoolSidebarReserveWidth}
                />
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, paddingRight: schoolSidebarReserveWidth, transition: 'padding-right .18s ease' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <LogisticsSchoolTransferDashboard schoolKey={logisticsSchoolKey} selectedKey={logisticsTransferFilter} onSelect={setLogisticsTransferFilter} />
                  </div>
                  <div style={{ paddingTop: 10 }}><DashboardSearch value={logisticsSearch} onChange={setLogisticsSearch} placeholder="Имя, телефон, ребёнок, адрес..." /></div>
                </div>
              </DashboardTopPanel>
              {logisticsView === 'map' ? (
                <LogisticsMapView
                  schoolKey={logisticsSchoolKey}
                  transferFilter={logisticsTransferFilter}
                  search={logisticsSearch}
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  sessionToken={currentUser?.sessionToken}
                  onSelectSchool={handleLogisticsSelectSchool}
                  allowedSchools={currentUser?.schoolKeys}
                  onSidebarWidthChange={setSchoolSidebarReserveWidth}
                />
              ) : (
                <FamiliesPage
                  mode="logistics"
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  authToken={currentUser?.sessionToken}
                  allowedSchools={currentUser?.schoolKeys}
                  initialQuickFilter={{ activeTab: logisticsSchoolKey }}
                  onSchoolKeyChange={handleLogisticsSelectSchool}
                  adminFiltersOpen={adminFiltersOpen}
                  onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                  columnsOpen={columnsOpen}
                  onColumnsOpenChange={setColumnsOpen}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                  hideTransferBars
                  externalQuickTransfer={logisticsTransferFilter === 'rejected' ? '' : logisticsTransferFilter}
                  externalQuickChildStatus={logisticsTransferFilter === 'rejected' ? 'rejected' : ''}
                  initialSearch={logisticsSearch}
                />
              )}
              </>
            ) : (
              <LogisticsOverview
                onDrivers={() => setSection('drivers')}
                view={logisticsView}
                onViewChange={setLogisticsView}
                onOpenFamily={handleLogisticsOpenFamily}
                onSelectSchool={handleLogisticsSelectSchool}
                allowedSchools={currentUser?.schoolKeys}
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
                  <button onClick={() => { setManagerSchoolKey(null); setManagerOpenFamilySearch(''); }} style={managerModeTabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {managerSchoolKey && <ManagerModeTabs compact value={managerSchoolMode} onChange={setManagerSchoolMode} />}
                {extraTabs(true)}
              </div>
            </div>
            {managerSchoolKey ? (
              <>
                <DashboardTopPanel>
                  {managerSchoolMode === 'charges' && (
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                        <ManagerPeriodBar periodKey={managerPeriodKey} onPeriodKeyChange={setManagerPeriodKey} />
                      </div>
                      <DashboardSearch value={managerOpenFamilySearch} onChange={setManagerOpenFamilySearch} />
                    </div>
                  )}
                  <SchoolKpiStrip mode={managerSchoolMode} schoolKey={managerSchoolKey} rightReserveWidth={schoolSidebarReserveWidth} allowedSchools={currentUser?.schoolKeys} />
                  {managerSchoolMode === 'charges' ? (
                    <SchoolTransferDashboard mode={managerSchoolMode} periodKey={managerPeriodKey} schoolKey={managerSchoolKey} rightReserveWidth={schoolSidebarReserveWidth} selectedKey={managerTransferFilter} onSelect={setManagerTransferFilter} allowedSchools={currentUser?.schoolKeys} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, paddingTop: 10, paddingRight: schoolSidebarReserveWidth, transition: 'padding-right .18s ease' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <SchoolTransferDashboard topPadding={0} mode={managerSchoolMode} periodKey={managerPeriodKey} schoolKey={managerSchoolKey} selectedKey={managerTransferFilter} onSelect={setManagerTransferFilter} allowedSchools={currentUser?.schoolKeys} />
                      </div>
                      <DashboardSearch value={managerOpenFamilySearch} onChange={setManagerOpenFamilySearch} />
                    </div>
                  )}
                </DashboardTopPanel>
                <FamiliesPage
                  mode={managerSchoolMode}
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  authToken={currentUser?.sessionToken}
                  allowedSchools={currentUser?.schoolKeys}
                  initialQuickFilter={{ activeTab: managerSchoolKey }}
                  onSchoolKeyChange={handleManagerSelectSchool}
                  adminFiltersOpen={adminFiltersOpen}
                  onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                  columnsOpen={columnsOpen}
                  onColumnsOpenChange={setColumnsOpen}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                  hideTransferBars
                  externalQuickTransfer={managerTransferFilter === 'new' || managerTransferFilter === 'rejected' ? '' : managerTransferFilter}
                  externalQuickChildStatus={managerTransferFilter === 'new' || managerTransferFilter === 'rejected' ? managerTransferFilter : ''}
                  externalPeriodKey={managerSchoolMode === 'charges' ? managerPeriodKey : undefined}
                  initialSearch={managerOpenFamilySearch}
                />
              </>
            ) : (
              <ManagerOverview
                mode={managerSchoolMode}
                onModeChange={setManagerSchoolMode}
                onSelectSchool={handleManagerSelectSchool}
                onSidebarWidthChange={setSchoolSidebarReserveWidth}
                onOpenFamily={handleManagerOpenFamily}
                allowedSchools={currentUser?.schoolKeys}
              />
            )}
          </div>
        ) : section === 'drivers' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Логистика')}
                {driversSchoolKey && (
                  <button onClick={() => { setDriversSchoolKey(null); setDriversSearch(''); }} style={managerModeTabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {driversSchoolKey && <div style={{ marginBottom: 8 }}><LogisticsTabs school value="drivers" onChange={key => { if (key !== 'drivers') { setLogisticsSchoolKey(driversSchoolKey); setLogisticsTransferFilter(driversTransferFilter); setLogisticsSearch(driversSearch); setSection('logistics'); setLogisticsView(key); } }} /></div>}
                {extraTabs(true)}
              </div>
            </div>
            {driversSchoolKey ? (
              <>
                <DashboardTopPanel>
                  <DriversSchoolKpiStrip
                    schoolKey={driversSchoolKey}
                    rightReserveWidth={schoolSidebarReserveWidth}
                  />
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, paddingRight: schoolSidebarReserveWidth, transition: 'padding-right .18s ease' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <DriversTransferDashboard schoolKey={driversSchoolKey} selectedKey={driversTransferFilter} onSelect={setDriversTransferFilter} />
                    </div>
                    <div style={{ paddingTop: 10 }}><DashboardSearch value={driversSearch} onChange={setDriversSearch} placeholder="ФИО, телефон, трансфер, авто..." /></div>
                  </div>
                </DashboardTopPanel>
                <DriversPage
                  userRole={currentUserRole}
                  userName={currentUser?.name}
                  authToken={currentUser?.sessionToken}
                  allowedSchools={currentUser?.schoolKeys}
                  schoolKey={driversSchoolKey}
                  externalQuickTransfer={driversTransferFilter}
                  initialSearch={driversSearch}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                />
              </>
            ) : (
              <DriversOverview
                onSearchChange={setDriversSearch}
                onTabChange={key => { if (key !== 'drivers') { setLogisticsSchoolKey(driversSchoolKey); setLogisticsTransferFilter(driversTransferFilter); setLogisticsSearch(driversSearch); setSection('logistics'); setLogisticsView(key); } }}
                search={driversSearch}
                onSelectSchool={setDriversSchoolKey}
                onSidebarWidthChange={setSchoolSidebarReserveWidth}
                allowedSchools={currentUser?.schoolKeys}
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
        ) : section === 'expenses' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={tabRowStyle}><div style={tabBarStyle}>
              {sectionLabel('Финансы')}
              <button type="button" onClick={() => setFinanceView('expenses')} style={managerModeTabStyle(financeView === 'expenses')}>Расходы</button>
              <button type="button" onClick={() => setFinanceView('salary')} style={managerModeTabStyle(financeView === 'salary')}>Зарплата</button>
              {financeView === 'expenses' && expenseCategory && <button type="button" onClick={() => { if (expenseSubcategory !== 'ALL') setExpenseSubcategory('ALL'); else setExpenseCategory(null); }} style={managerModeTabStyle(false)}>← Категории</button>}
              {extraTabs(true)}
            </div></div>
            {canAccessFinanceExpenses(currentUserRole) && financeView === 'salary' && <SalaryExpensesView sessionToken={currentUser?.sessionToken} />}
            {canAccessFinanceExpenses(currentUserRole) && financeView === 'expenses' && <ExpensesModule selectedCategory={expenseCategory} onCategoryChange={setExpenseCategory} selectedSubcategory={expenseSubcategory} onSubcategoryChange={setExpenseSubcategory} userName={currentUser?.name} userRole={currentUserRole} sessionToken={currentUser?.sessionToken} />}
          </div>
        ) : section === 'market' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Маркет')}
                {extraTabs(true)}
              </div>
            </div>
            <MarketModule userName={currentUser?.name} userRole={currentUserRole} sessionToken={currentUser?.sessionToken} />
          </div>
        ) : section === 'employees' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Сотрудники')}
                {extraTabs(true)}
              </div>
            </div>
            <EmployeesPage viewerRole={currentUserRole} sessionToken={currentUser?.sessionToken} />
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
      {isMobileViewport && (
        <button
          type="button"
          onClick={() => setForceDesktop(false)}
          // Страница здесь шириной 1280px и уменьшена под экран — кнопку увеличиваем,
          // чтобы на телефоне она оставалась обычного размера.
          style={{ position: 'fixed', zIndex: 2000, left: '50%', bottom: 24, transform: `translateX(-50%) scale(${Math.max(1, 1280 / (window.screen?.width || 1280))})`, transformOrigin: 'bottom center', height: 44, padding: '0 18px', border: 0, borderRadius: 22, background: 'var(--accent-h)', color: '#fff', fontSize: 14, fontWeight: 800, boxShadow: '0 8px 24px rgba(23, 34, 47, .25)' }}
        >
          Мобильная версия
        </button>
      )}
    </div>
  );
}
