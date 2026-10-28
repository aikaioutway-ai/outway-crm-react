const roles = ['admin','gen_director','director','manager','cashier','logist','b2b_manager','b2b_logist','senior_logist','driver'];
export function allowedEmployeeRoles(viewer: string): string[] {
  if (['admin','gen_director'].includes(viewer)) return roles;
  if (viewer === 'cashier') return ['cashier','manager','logist'];
  if (viewer === 'director') return ['manager'];
  if (viewer === 'senior_logist') return ['logist','b2b_manager','b2b_logist','cashier'];
  return [];
}
export function canWriteEmployee(viewer: string, nextRole: string, previousRole: string | undefined, updating: boolean): boolean {
  // Cashiers can create inactive payment recipients, never change existing access.
  if (viewer === 'cashier' && updating) return false;
  const allowed = allowedEmployeeRoles(viewer);
  return allowed.includes(nextRole) && (!previousRole || allowed.includes(previousRole));
}
