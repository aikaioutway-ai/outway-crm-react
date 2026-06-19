import React from 'react';
import { UserRole } from '../../types';
import FamiliesPage from '../families/FamiliesPage';

interface DriversPageProps {
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
}

export default function DriversPage({ userRole, userName, allowedSchools }: DriversPageProps) {
  return (
    <FamiliesPage
      mode="logistics"
      dashboardMode="drivers"
      userRole={userRole}
      userName={userName}
      allowedSchools={allowedSchools}
    />
  );
}
