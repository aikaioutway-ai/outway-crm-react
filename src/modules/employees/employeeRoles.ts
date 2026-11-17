import type { EmployeeRole, UserRole } from '../../types';

/** Директор заводит только менеджеров, нач. логистики — только логистов; остальным ролям раздел вообще недоступен (см. getAllowedSections).
 * Лежит отдельно от EmployeesPage, чтобы App не тянул всю страницу сотрудников в стартовый бандл. */
export function restrictedRoleFor(viewerRole: UserRole): EmployeeRole[] | null {
  if (viewerRole === 'cashier') return ['cashier', 'manager', 'logist'];
  if (viewerRole === 'director') return ['manager'];
  if (viewerRole === 'senior_logist') return ['logist', 'b2b_manager', 'b2b_logist', 'cashier'];
  return null;
}
