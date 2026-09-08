import type { EmployeeRole, UserRole } from '../../types';

const LIMITED_PAYROLL_VIEWER_ROLES = new Set<UserRole>(['director', 'senior_logist']);
const CONFIDENTIAL_PAYROLL_ROLES = new Set<EmployeeRole>(['director', 'senior_logist']);

/**
 * Directors and senior logisticians may work with ordinary employees' payroll,
 * but must not see payroll data belonging to either privileged role.
 */
export function canViewEmployeePayroll(viewerRole: UserRole | undefined, employeeRole: EmployeeRole): boolean {
  if (!viewerRole || !LIMITED_PAYROLL_VIEWER_ROLES.has(viewerRole)) return true;
  return !CONFIDENTIAL_PAYROLL_ROLES.has(employeeRole);
}
