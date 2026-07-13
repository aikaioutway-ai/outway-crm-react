import React from 'react';
import { UserRole } from '../../types';
import FamiliesPage from '../families/FamiliesPage';

interface DriversPageProps {
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
  schoolKey?: string;
  externalQuickTransfer?: string;
  onSchoolsSidebarWidthChange?: (width: number) => void;
}

export default function DriversPage({ userRole, userName, allowedSchools, schoolKey, externalQuickTransfer, onSchoolsSidebarWidthChange }: DriversPageProps) {
  return (
    <FamiliesPage
      mode="logistics"
      settingsScope="drivers"
      userRole={userRole}
      userName={userName}
      allowedSchools={allowedSchools}
      initialQuickFilter={schoolKey ? { activeTab: schoolKey, quickChildStatus: '' } : undefined}
      hideDashboard={Boolean(schoolKey)}
      hideTransferBars={Boolean(schoolKey)}
      externalQuickTransfer={externalQuickTransfer}
      onSchoolsSidebarWidthChange={onSchoolsSidebarWidthChange}
    />
  );
}
