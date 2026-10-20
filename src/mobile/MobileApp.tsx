import React, { lazy, Suspense, useEffect, useState } from 'react';
import { ListTodo, ChevronRight, LogOut, Menu, Monitor, Route, UserCog, Users, Wallet } from 'lucide-react';
import { canAccessSection, NavSection } from '../core/bars/Sidebar';
import { AuthenticatedUser } from '../services/employeeService';
import { MobileNavProvider, Screen, useMobileNav, useNavPosition } from './nav';
import { Skeletons } from './ui';
import { callTaskApi, useTaskSummary } from '../services/taskService';
import { TASK_VIEW_EVENT, TaskTarget } from '../modules/tasks/taskTypes';
import { isMobilePreview } from './useIsMobile';
import './mobile.css';

const ManagerSection = lazy(() => import('./sections/ManagerSection'));
const LogisticsSection = lazy(() => import('./sections/LogisticsSection'));
const CashierSection = lazy(() => import('./sections/CashierSection'));
const TasksSection = lazy(() => import('./sections/TasksSection'));
const TaskFamilySheet = lazy(() => import('./FamilySheet'));
const EmployeesSection = lazy(() => import('./sections/EmployeesSection'));

type MobileTab = 'manager' | 'logistics' | 'cashier' | 'tasks' | 'more';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ', gen_director: 'Ген. директор', director: 'Директор', manager: 'Менеджер', cashier: 'Кассир',
  logist: 'Логист', senior_logist: 'Нач. логистики', b2b_manager: 'Менеджер B2B', b2b_logist: 'Логист B2B',
};

const TABS: { key: MobileTab; label: string; icon: React.ReactNode; sections: NavSection[] }[] = [
  { key: 'manager', label: 'Менеджер', icon: <Users size={21} />, sections: ['families'] },
  { key: 'logistics', label: 'Логистика', icon: <Route size={21} />, sections: ['logistics', 'drivers'] },
  { key: 'cashier', label: 'Кассир', icon: <Wallet size={21} />, sections: ['cashier'] },
  { key: 'tasks', label: 'Задачи', icon: <ListTodo size={21} />, sections: ['tasks'] },
  { key: 'more', label: 'Ещё', icon: <Menu size={21} />, sections: [] },
];

const TAB_STORAGE_KEY = 'outway_mobile_tab';

function MoreSection({ user, onLogout, onOpenDesktop }: {
  user: AuthenticatedUser;
  onLogout: () => void;
  onOpenDesktop: () => void;
  onOpenTaskTarget?: (target: TaskTarget) => void;
}) {
  const nav = useNavPosition();
  const canSeeEmployees = canAccessSection(user.role, 'employees', user.id);

  if (nav.page?.kind === 'employees') return <EmployeesSection user={user} onBack={nav.back} />;

  const hasDesktopOnly = canAccessSection(user.role, 'b2b', user.id) || canAccessSection(user.role, 'market', user.id);
  return (
    <Screen pageKey="more:home" title="Ещё">
      <div className="m-card">
        <div className="m-card-row">
          <div className="m-avatar">
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
              <span className="m-menu-icon"><UserCog size={18} /></span>
              <div className="m-card-main"><div className="m-card-title">Сотрудники</div></div>
              <ChevronRight className="m-card-chevron" size={20} />
            </div>
          </button>
        )}
        <button type="button" className="m-card" onClick={onOpenDesktop}>
          <div className="m-card-row">
            <span className="m-menu-icon"><Monitor size={18} /></span>
            <div className="m-card-main">
              <div className="m-card-title">Открыть полную версию</div>
              <div className="m-card-sub">Все функции, как на компьютере{hasDesktopOnly ? ' (B2B и другие разделы)' : ''}</div>
            </div>
            <ChevronRight className="m-card-chevron" size={20} />
          </div>
        </button>
        <button type="button" className="m-card" onClick={() => { if (window.confirm('Выйти из CRM?')) onLogout(); }}>
          <div className="m-card-row">
            <span className="m-menu-icon m-menu-icon--danger"><LogOut size={18} /></span>
            <div className="m-card-main"><div className="m-card-title" style={{ color: 'var(--m-danger)' }}>Выйти</div></div>
          </div>
        </button>
      </div>
    </Screen>
  );
}

function MobileShell({ user, onLogout, onOpenDesktop, onOpenTaskTarget }: {
  user: AuthenticatedUser;
  onLogout: () => void;
  onOpenDesktop: () => void;
  onOpenTaskTarget?: (target: TaskTarget) => void;
}) {
  const nav = useMobileNav();
  const taskSummary = useTaskSummary(user.sessionToken);
  const [taskFamilyId, setTaskFamilyId] = useState('');
  const [taskContext, setTaskContext] = useState<TaskTarget | undefined>();
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

  useEffect(() => {
    const view = (event: Event) => {
      void callTaskApi<{target:TaskTarget}>(user.sessionToken,{action:'resolveTarget',target:(event as CustomEvent<TaskTarget>).detail})
        .then(({target})=>{setTaskContext(target);setTaskFamilyId('');nav.reset();setTab('tasks');})
        .catch(error=>window.alert(error instanceof Error?error.message:'Не удалось открыть задачи'));
    };
    window.addEventListener(TASK_VIEW_EVENT,view);
    return()=>window.removeEventListener(TASK_VIEW_EVENT,view);
  },[user.sessionToken,nav]);

  const section = tab === 'manager' ? <ManagerSection user={user} />
    : tab === 'logistics' ? <LogisticsSection user={user} />
    : tab === 'cashier' ? <CashierSection user={user} />
    : tab === 'tasks' ? <TasksSection user={user} context={taskContext} onClearContext={()=>setTaskContext(undefined)} onOpenTarget={(target: TaskTarget) => { if (target.type === 'family' || target.type === 'child') setTaskFamilyId(target.familyId ?? target.id); else if(onOpenTaskTarget) onOpenTaskTarget(target); else onOpenDesktop(); }} />
    : <MoreSection user={user} onLogout={onLogout} onOpenDesktop={onOpenDesktop} />;

  return (
    <div className={`m-app ${isMobilePreview() ? 'm-app--preview' : ''}`}>
      <Suspense fallback={<div className="m-content"><div className="m-page"><Skeletons /></div></div>}>
        {section}
        {taskFamilyId && <TaskFamilySheet familyId={taskFamilyId} onClose={()=>setTaskFamilyId('')} canEditStatus={false} showFinance={false} userName={user.name} />}
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
            <span className="m-tab-icon">
              {item.icon}
              {item.key === 'tasks' && Boolean(taskSummary.data?.attention) && (
                <span className="m-tab-badge" aria-label={`Требуют внимания: ${taskSummary.data?.attention}`}>{taskSummary.data?.attention}</span>
              )}
            </span>
            <span className="m-tab-label">{item.label}</span>
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
  onOpenTaskTarget?: (target: TaskTarget) => void;
}) {
  return (
    <MobileNavProvider>
      <MobileShell {...props} />
    </MobileNavProvider>
  );
}
