import { PayrollApprovalStatus } from '../../services/crmV2Service';
import { UserRole } from '../../types';

export function isPayrollApprover(userRole?: UserRole, userName?: string): boolean {
  if (userRole === 'gen_director') return true;
  if (userRole !== 'admin') return false;
  const normalized = (userName ?? '').trim().toLowerCase().replace(/ё/g, 'е');
  return (normalized.includes('эсенали') || normalized.includes('есенали'))
    && normalized.includes('кайрат');
}

export function canEditTimesheet(
  approvalStatus: PayrollApprovalStatus,
  userRole?: UserRole,
  userName?: string,
): boolean {
  if (approvalStatus === 'draft' || approvalStatus === 'rejected') return true;
  return approvalStatus === 'pending' && isPayrollApprover(userRole, userName);
}
