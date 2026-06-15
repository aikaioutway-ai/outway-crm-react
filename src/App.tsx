import React, { useEffect, useState } from 'react';
import Sidebar, { canAccessSection, getAllowedSections, NavSection } from './core/bars/Sidebar';
import FamiliesPage from './modules/families/FamiliesPage';
import { fetchV2FamiliesTable } from './services/crmV2Service';
import { UserRole } from './types';
import './index.css';

const PLACEHOLDERS: Partial<Record<NavSection, string>> = {
  drivers:   '🚗 Модуль Водители — в разработке',
  payroll:   '💰 Модуль Зарплата — в разработке',
  settings:  '⚙️ Настройки — в разработке',
};

const ROLES: UserRole[] = ['admin', 'director', 'manager', 'logist', 'cashier'];

function getSavedRole(): UserRole {
  const saved = localStorage.getItem('outway_user_role') as UserRole | null;
  return saved && ROLES.includes(saved) ? saved : 'admin';
}

export default function App() {
  const [currentUserRole] = useState<UserRole>(() => getSavedRole());
  const [section, setSection] = useState<NavSection>(() => getAllowedSections(getSavedRole())[0]);
  const [badges, setBadges] = useState<Partial<Record<NavSection, number>>>({});

  useEffect(() => {
    if (!canAccessSection(currentUserRole, section)) {
      setSection(getAllowedSections(currentUserRole)[0]);
    }
  }, [currentUserRole, section]);

  useEffect(() => {
    fetchV2FamiliesTable()
      .then(rows => {
        const unpaidFamilies = new Set(
          rows
            .filter(row => row.paymentStatus === 'debt' || row.paymentStatus === 'partial')
            .map(row => row.familyId)
        );
        const logisticsChildren = rows.filter(row => row.status !== 'new' && row.status !== 'rejected').length;
        const pendingFamilies = new Set(
          rows
            .filter(row => row.pendingPayment > 0)
            .map(row => row.familyId)
        );
        setBadges({
          finance: unpaidFamilies.size,
          cashier: pendingFamilies.size,
          logistics: logisticsChildren,
        });
      })
      .catch(() => setBadges({}));
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Sidebar active={section} onChange={setSection} badges={badges} userRole={currentUserRole} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {section === 'families' || section === 'finance' || section === 'cashier' || section === 'logistics' ? (
          <FamiliesPage
            mode={section === 'finance' ? 'payments' : section === 'cashier' ? 'cashier' : section === 'logistics' ? 'logistics' : 'requests'}
            userRole={currentUserRole}
          />
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
