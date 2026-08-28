import React from 'react';
import { UserRole } from '../../types';
import type { SchoolDockItem } from '../families/SchoolDockSidebar';
import TimesheetPage from './TimesheetPage';
import { PayrollSchoolTab, TimesheetPayrollHeaderRenderArgs, TimesheetPayrollSummary } from './timesheetTypes';

export interface TimesheetModuleProps {
  userRole?: UserRole;
  userName?: string;
  sessionToken?: string;
  allowedSchools?: string[];
  adminFiltersOpen?: boolean;
  onAdminFiltersClose?: () => void;
  columnsOpen?: boolean;
  onColumnsOpenChange?: (v: boolean) => void;
  rightReserveWidth?: number;
  onSchoolsSidebarWidthChange?: (width: number) => void;
  initialSchoolKey?: string;
  externalQuickTransfer?: string;
  onSchoolKeyChange?: (key: string) => void;
  periodKey: string;
  onPayrollSummaryChange?: (summary: TimesheetPayrollSummary) => void;
  renderPayrollHeader?: (args: TimesheetPayrollHeaderRenderArgs) => React.ReactNode;
  payrollSchoolTab?: PayrollSchoolTab;
  extraSchoolDockItems?: SchoolDockItem[];
  search?: string;
}

export default function TimesheetModule(props: TimesheetModuleProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TimesheetPage {...props} vehicleType={undefined} />
    </div>
  );
}
