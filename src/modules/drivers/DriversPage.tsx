import React from 'react';
import { UserRole } from '../../types';
import FamiliesPage from '../families/FamiliesPage';

interface DriversPageProps {
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
  onSchoolsSidebarWidthChange?: (width: number) => void;
}

export default function DriversPage({ userRole, userName, allowedSchools, onSchoolsSidebarWidthChange }: DriversPageProps) {
  return (
    <FamiliesPage
      mode="logistics"
      settingsScope="drivers"
      userRole={userRole}
      userName={userName}
      allowedSchools={allowedSchools}
      onSchoolsSidebarWidthChange={onSchoolsSidebarWidthChange}
    />
  );
}
