import React, { useEffect, useState } from 'react';
import Sidebar, { canAccessSection, getAllowedSections, NavSection } from './core/bars/Sidebar';
import FamiliesPage from './modules/families/FamiliesPage';
import EmployeesPage from './modules/employees/EmployeesPage';
import LoginPage from './modules/auth/LoginPage';
import { AuthenticatedUser, authenticateEmployee } from './services/employeeService';
import { fetchV2FamiliesTable } from './services/crmV2Service';
import { UserRole } from './types';
import DriversPage from './modules/drivers/DriversPage';
import './index.css';

const PLACEHOLDERS: Partial<Record<NavSection, string>> = {
  payroll:   'Модуль Зарплата — в разработке',
  expenses:  'Модуль Расходы — в разработке',
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
  }, [currentUserRole, section]);

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
          cashier: pendingFamilies.size,
          logistics: logisticsChildren,
        });
      })
      .catch(() => setBadges({}));
  }, [currentUser]);

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
      />

      <main
        onClick={() => setSidebarCollapseSignal(value => value + 1)}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 10, background: 'var(--active-bg)' }}
      >
        {section === 'families' || section === 'cashier' || section === 'logistics' ? (
          <FamiliesPage
            mode={section === 'cashier' ? 'cashier' : section === 'logistics' ? 'logistics' : 'requests'}
            userRole={currentUserRole}
            userName={currentUser?.name}
            allowedSchools={currentUser?.schoolKeys}
          />
        ) : section === 'employees' ? (
          <EmployeesPage />
        ) : section === 'drivers' ? (
          <DriversPage userRole={currentUserRole} userName={currentUser?.name} allowedSchools={currentUser?.schoolKeys} />
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
