import FinanceTabs from './modules/costs/FinanceTabs';
import { ExpenseCategory, EXPENSE_CATEGORIES } from './modules/costs/expenseTypes';
import LogisticsTabs from './modules/families/LogisticsTabs';
import HiddenSchoolsList from './modules/families/HiddenSchoolsList';
import CashierViewTabs from './modules/families/CashierViewTabs';
import ManagerModeTabs from './modules/families/ManagerModeTabs';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import { Family, UserRole } from './types';
import { fetchV2Family } from './services/crmV2Service';
import { callTaskApi, useTaskSummary } from './services/taskService';
import { TASK_COMPOSER_EVENT, TASK_VIEW_EVENT, TaskTarget } from './modules/tasks/taskTypes';
import TaskButton from './modules/tasks/TaskButton';
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
const PayrollModule = lazy(() => import('./modules/payroll/PayrollModule'));
const ExpensesModule = lazy(() => import('./modules/costs/ExpensesModule'));
const MarketModule = lazy(() => import('./modules/market/MarketModule'));
const B2BModule = lazy(() => import('./modules/b2b/B2BModule'));
const TasksModule = lazy(() => import('./modules/tasks/TasksModule'));
const TaskComposer = lazy(() => import('./modules/tasks/TaskComposer'));
const TaskFamilyCard = lazy(() => import('./modules/families/InlineFamilyCard'));
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
  const taskUserRef = useRef(currentUser?.id);
  taskUserRef.current = currentUser?.id;
  const currentUserRole = currentUser?.role ?? getSavedRole();
  const taskSummary = useTaskSummary(currentUser?.sessionToken);
  const [taskContext, setTaskContext] = useState<TaskTarget | null>(null);
  const [taskTarget, setTaskTarget] = useState<TaskTarget | null>(null);
  const [taskFamily, setTaskFamily] = useState<Family | null>(null);
  const [taskDriverId, setTaskDriverId] = useState('');


  const isMobileViewport = useIsMobileViewport();
  const [forceDesktop, setForceDesktop] = useForceDesktop();
  useEffect(() => {
    let active = true;
    const compose = (event: Event) => { if (currentUser) setTaskTarget((event as CustomEvent<TaskTarget>).detail); };
    const view = (event: Event) => {
      if (!currentUser || (isMobileViewport && !forceDesktop)) return;
      void callTaskApi<{target:TaskTarget}>(currentUser.sessionToken,{action:'resolveTarget',target:(event as CustomEvent<TaskTarget>).detail})
        .then(({target})=>{if(active){setTaskContext(target);setSection('tasks');}})
        .catch(error=>window.alert(error instanceof Error?error.message:'Не удалось открыть задачи'));
    };
    window.addEventListener(TASK_COMPOSER_EVENT, compose);
    window.addEventListener(TASK_VIEW_EVENT, view);
    return () => { active=false;window.removeEventListener(TASK_COMPOSER_EVENT, compose);window.removeEventListener(TASK_VIEW_EVENT, view); };
  }, [currentUser,isMobileViewport,forceDesktop]);
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
  const [payrollSchoolKey, setPayrollSchoolKey] = useState<string | null>(null);
  const [payrollTransferFilter, setPayrollTransferFilter] = useState('');
  const [payrollSearch, setPayrollSearch] = useState('');
  const [payrollPeriodKey, setPayrollPeriodKey] = useState(currentPayrollPeriodKey);
  const [salarySchoolKey, setSalarySchoolKey] = useState<string | null>(null);
  const [salaryTransferFilter, setSalaryTransferFilter] = useState('');
  const [salarySearch, setSalarySearch] = useState('');
  const [salaryPeriodKey, setSalaryPeriodKey] = useState(currentPayrollPeriodKey);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory | null>(null);
  const [expenseSubcategory, setExpenseSubcategory] = useState('ALL');
  const [financeTab, setFinanceTab] = useState<'expenses' | 'timesheet' | 'salary'>(() => (
    canAccessFinanceExpenses(currentUserRole) ? 'expenses' : 'timesheet'
  ));
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
    setFinanceTab(canAccessFinanceExpenses(user.role) ? 'expenses' : 'timesheet');
    return true;
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
      setTaskTarget(null);setTaskFamily(null);setTaskContext(null);setTaskDriverId('');
  };

  useEffect(() => {
    const expireSession = () => {
      localStorage.removeItem(SESSION_KEY);
      setCurrentUser(null);
      setTaskTarget(null);setTaskFamily(null);setTaskContext(null);setTaskDriverId('');
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

  useEffect(() => {
    setPayrollTransferFilter('');
  }, [payrollSchoolKey]);

  useEffect(() => {
    setSalaryTransferFilter('');
  }, [salarySchoolKey]);

  useEffect(() => {
    if (financeTab === 'expenses' && !canAccessFinanceExpenses(currentUserRole)) {
      setFinanceTab('timesheet');
    }
    if (financeTab === 'expenses') setSchoolSidebarReserveWidth(0);
  }, [currentUserRole, financeTab]);

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
    ? { logistics: badgesQuery.data.filter(row => row.status !== 'new' && row.status !== 'rejected').length, tasks: taskSummary.data?.attention ?? 0 }
    : { tasks: taskSummary.data?.attention ?? 0 };

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

  const changeFinanceTab = (next: 'expenses' | 'timesheet' | 'salary') => {
    if (financeTab !== 'expenses' && next !== 'expenses' && next !== financeTab) {
      if (next === 'salary') {
        setSalarySchoolKey(payrollSchoolKey);
        setSalaryTransferFilter(payrollTransferFilter);
        setSalarySearch(payrollSearch);
        setSalaryPeriodKey(payrollPeriodKey);
      } else {
        setPayrollSchoolKey(salarySchoolKey);
        setPayrollTransferFilter(salaryTransferFilter);
        setPayrollSearch(salarySearch);
        setPayrollPeriodKey(salaryPeriodKey);
      }
    }
    setFinanceTab(next);
  };

  const activePayrollSchoolKey = financeTab === 'salary' ? salarySchoolKey : payrollSchoolKey;
  const activePayrollTransferFilter = financeTab === 'salary' ? salaryTransferFilter : payrollTransferFilter;
  const activePayrollSearch = financeTab === 'salary' ? salarySearch : payrollSearch;
  const activePayrollPeriodKey = financeTab === 'salary' ? salaryPeriodKey : payrollPeriodKey;

  const taskSchool = section === 'families' ? managerSchoolKey : section === 'logistics' ? logisticsSchoolKey : section === 'drivers' ? driversSchoolKey : null;
  const taskTransfer = section === 'families' ? managerTransferFilter : section === 'logistics' ? logisticsTransferFilter : section === 'drivers' ? driversTransferFilter : '';
  const contextTaskTarget: TaskTarget | null = taskSchool ? (/^\d+$/.test(taskTransfer)
    ? {type:'transfer',id:'',schoolKey:taskSchool,transferNumber:Number(taskTransfer),label:`${taskSchool} · Трансфер № ${taskTransfer}`}
    : {type:'school',id:taskSchool,label:SCHOOL_TABS.find(s=>s.key===taskSchool)?.label ?? taskSchool,schoolKey:taskSchool}) : null;
  const openTaskTarget = async (target: TaskTarget) => {
    try {
      const requestedUser = currentUser?.id;
      const resolved = (await callTaskApi<{target:TaskTarget}>(currentUser?.sessionToken,{action:'resolveTarget',target})).target;
      if (taskUserRef.current !== requestedUser) return;
      if (resolved.type === 'family' || resolved.type === 'child') {
        const family = await fetchV2Family(resolved.familyId ?? resolved.id);
        if (!family) throw new Error('Семья не найдена');
        if (taskUserRef.current !== requestedUser) return;
        setTaskFamily(family);
      } else if (resolved.type === 'group' && resolved.schoolKey && canAccessSection(currentUserRole,'families',currentUser?.id)) {
        setManagerSchoolKey(resolved.schoolKey);setManagerTransferFilter(resolved.group ?? '');setSection('families');
      } else if (resolved.type === 'driver') {
        if (!canAccessSection(currentUserRole,'drivers',currentUser?.id)) throw new Error('Карточка водителя недоступна вашей роли');
        setTaskDriverId(resolved.id);setDriversSchoolKey(resolved.schoolKey ?? null);setDriversSearch(resolved.label);setSection('drivers');
      } else if (resolved.schoolKey) {
        if (canAccessSection(currentUserRole,'logistics',currentUser?.id)) {
          setLogisticsSchoolKey(resolved.schoolKey);setLogisticsTransferFilter(resolved.transferNumber ? String(resolved.transferNumber) : '');setLogisticsView('table');setSection('logistics');
        } else if (canAccessSection(currentUserRole,'families',currentUser?.id)) {
          setManagerSchoolKey(resolved.schoolKey);setManagerTransferFilter(resolved.transferNumber ? String(resolved.transferNumber) : '');setSection('families');
        } else throw new Error('Раздел школы недоступен вашей роли');
      }
    } catch(error) { window.alert(error instanceof Error ? error.message : 'Не удалось открыть объект'); }
  };

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (isMobileViewport && !forceDesktop) {
    return (
      <Suspense fallback={<SectionLoading />}>
        <MobileApp user={currentUser} onLogout={handleLogout} onOpenDesktop={() => setForceDesktop(true)} onOpenTaskTarget={target => { setForceDesktop(true); void openTaskTarget(target); }} />
        {taskTarget && <TaskComposer token={currentUser.sessionToken} target={taskTarget} onClose={() => setTaskTarget(null)} />}
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
                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
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

                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
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
                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
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
                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
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
                  initialOpenDriverId={taskDriverId}
                  externalQuickTransfer={driversTransferFilter}
                  initialSearch={driversSearch}
                  onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                />
              </>
            ) : taskDriverId ? (
              <DriversPage userRole={currentUserRole} userName={currentUser.name} authToken={currentUser.sessionToken} allowedSchools={currentUser.schoolKeys} initialOpenDriverId={taskDriverId} initialSearch={driversSearch} />
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
                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
                {extraTabs(true)}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 14, color: '#7A859D', fontSize: 16, fontWeight: 700 }}>
              {PLACEHOLDERS.dispatch}
            </div>
          </div>
        ) : section === 'expenses' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                <div style={{ padding: '0 14px 8px 10px', marginRight: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#17222F' }}>Финансы</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>
                    {financeTab === 'expenses'
                      ? ['Расходы', expenseCategory ? EXPENSE_CATEGORIES[expenseCategory].label : 'Категории', expenseSubcategory !== 'ALL' ? expenseSubcategory : ''].filter(Boolean).join(' / ')
                      : [financeTab === 'timesheet' ? 'Табель' : 'Зарплата', activePayrollSchoolKey ? SCHOOL_TABS.find(school => school.key === activePayrollSchoolKey)?.label ?? (activePayrollSchoolKey === 'OFFICE' ? 'Офис' : activePayrollSchoolKey) : 'Все школы'].join(' / ')}
                  </div>
                </div>
                {financeTab === 'expenses' && expenseCategory && <>
                  <button type="button" onClick={() => { if (expenseSubcategory !== 'ALL') setExpenseSubcategory('ALL'); else setExpenseCategory(null); }} style={managerModeTabStyle(false)}>{expenseSubcategory !== 'ALL' ? '← Подкатегории' : '← Категории'}</button>
                </>}
                {financeTab !== 'expenses' && activePayrollSchoolKey && <FinanceTabs compact value={financeTab} onChange={changeFinanceTab} showExpenses={false} />}
                {financeTab !== 'expenses' && activePayrollSchoolKey && (
                  <button onClick={() => {
                    if (financeTab === 'salary') {
                      setSalarySchoolKey(null);
                      setSalarySearch('');
                    } else {
                      setPayrollSchoolKey(null);
                      setPayrollSearch('');
                    }
                  }} style={managerModeTabStyle(false)}>
                    ← Все школы
                  </button>
                )}
                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
                {extraTabs(true)}
              </div>
            </div>
            {canAccessFinanceExpenses(currentUserRole) && (
              <div style={{ flex: 1, minHeight: 0, display: financeTab === 'expenses' ? 'flex' : 'none' }}>
                <ExpensesModule selectedCategory={expenseCategory} onCategoryChange={setExpenseCategory} selectedSubcategory={expenseSubcategory} onSubcategoryChange={setExpenseSubcategory} toolbarContent={!expenseCategory ? <FinanceTabs value={financeTab} onChange={changeFinanceTab} showExpenses={canAccessFinanceExpenses(currentUserRole)} /> : undefined} userName={currentUser?.name} userRole={currentUserRole} sessionToken={currentUser?.sessionToken} />
              </div>
            )}
            {financeTab !== 'expenses' && (
              <PayrollModule
                toolbarContent={!activePayrollSchoolKey ? <FinanceTabs value={financeTab} onChange={changeFinanceTab} showExpenses={canAccessFinanceExpenses(currentUserRole)} /> : undefined}
                userRole={currentUserRole}
                userName={currentUser?.name}
                sessionToken={currentUser?.sessionToken}
                allowedSchools={currentUser?.schoolKeys}
                adminFiltersOpen={adminFiltersOpen}
                onAdminFiltersClose={() => setAdminFiltersOpen(false)}
                columnsOpen={columnsOpen}
                onColumnsOpenChange={setColumnsOpen}
                rightReserveWidth={schoolSidebarReserveWidth}
                onSchoolsSidebarWidthChange={setSchoolSidebarReserveWidth}
                schoolKey={activePayrollSchoolKey}
                transferFilter={activePayrollTransferFilter}
                schoolTab={financeTab}
                periodKey={activePayrollPeriodKey}
                onSelectSchool={financeTab === 'salary' ? setSalarySchoolKey : setPayrollSchoolKey}
                onTransferFilterChange={financeTab === 'salary' ? setSalaryTransferFilter : setPayrollTransferFilter}
                onPeriodKeyChange={financeTab === 'salary' ? setSalaryPeriodKey : setPayrollPeriodKey}
                search={activePayrollSearch}
                onSearchChange={financeTab === 'salary' ? setSalarySearch : setPayrollSearch}
              />
            )}
          </div>
        ) : section === 'market' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Маркет')}
                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
                {extraTabs(true)}
              </div>
            </div>
            <MarketModule userName={currentUser?.name} userRole={currentUserRole} sessionToken={currentUser?.sessionToken} />
          </div>
        ) : section === 'tasks' ? (
          <TasksModule user={currentUser} context={taskContext ?? undefined} onClearContext={()=>setTaskContext(null)} onOpenTarget={target => void openTaskTarget(target)} />
        ) : section === 'employees' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 0 }}>
            <div style={tabRowStyle}>
              <div style={tabBarStyle}>
                {sectionLabel('Сотрудники')}
                {contextTaskTarget && <TaskButton target={contextTaskTarget} toolbar />}
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
      <Suspense fallback={null}>
        {taskTarget && <TaskComposer token={currentUser.sessionToken} target={taskTarget} onClose={() => setTaskTarget(null)} />}
        {taskFamily && <div style={{position:'fixed',inset:0,zIndex:2400,background:'#17374740',padding:20,overflow:'auto'}}><TaskFamilyCard family={taskFamily} userRole={currentUserRole} userName={currentUser.name} sessionToken={currentUser.sessionToken} onClose={()=>setTaskFamily(null)} /></div>}
      </Suspense>
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
