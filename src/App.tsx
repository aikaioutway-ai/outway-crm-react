import React, { useState } from 'react';
import Sidebar, { NavSection } from './core/bars/Sidebar';
import FamiliesPage from './modules/families/FamiliesPage';
import './index.css';

const PLACEHOLDERS: Partial<Record<NavSection, string>> = {
  finance:   '💳 Модуль Оплаты — в разработке',
  logistics: '🗺️ Модуль Логистика — в разработке',
  drivers:   '🚗 Модуль Водители — в разработке',
  payroll:   '💰 Модуль Зарплата — в разработке',
  settings:  '⚙️ Настройки — в разработке',
};

export default function App() {
  const [section, setSection] = useState<NavSection>('families');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active={section} onChange={setSection} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {section === 'families' ? (
          <FamiliesPage />
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
