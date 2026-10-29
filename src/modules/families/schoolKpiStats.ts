import type { FamilyListRow, PeriodChargeStats } from '../../services/crmV2Service';
import { isNewUnassignedRow } from './familiesRowHelpers';

type SelectableRow = { status: string; transferNumber: string | null };

/** Дети, попадающие под выбранную фишку ряда трансферов:
 * '' — все (без отказников), номер — трансфер, 'new' / 'empty' — без трансфера, 'rejected' — Х. */
export function rowsForTransferSelection<T extends SelectableRow>(schoolRows: T[], selectedKey: string): T[] {
  if (selectedKey === 'rejected') return schoolRows.filter(row => row.status === 'rejected');
  if (selectedKey === 'new') return schoolRows.filter(isNewUnassignedRow);
  const working = schoolRows.filter(row => row.status !== 'rejected');
  if (selectedKey === 'empty') return working.filter(row => !row.transferNumber);
  if (selectedKey) return working.filter(row => row.transferNumber === selectedKey);
  return working;
}

export interface ManagerSchoolKpi {
  childrenCount: number;
  newRequests: number;
  charged: number;
  paid: number;
  debtSum: number;
  balance: number;
}

/** Цифры полосы школы Менеджера по выбранным детям и периоду.
 * Деньги — по начислениям этих детей за период; баланс — кошельки их семей. */
export function managerSchoolKpi(rows: FamilyListRow[], periodStats: PeriodChargeStats[]): ManagerSchoolKpi {
  const byChild = new Map<string, PeriodChargeStats>();
  periodStats.forEach(stat => { if (stat.childId) byChild.set(stat.childId, stat); });
  const families = new Map<string, number>();
  let charged = 0, paid = 0, debtSum = 0;
  rows.forEach(row => {
    const stat = byChild.get(row.rowId);
    if (stat) { charged += stat.charged; paid += stat.paid; debtSum += stat.debt; }
    families.set(row.familyId, row.balance);
  });
  return {
    childrenCount: rows.length,
    newRequests: rows.filter(isNewUnassignedRow).length,
    charged,
    paid,
    debtSum,
    balance: Array.from(families.values()).reduce((sum, value) => sum + value, 0),
  };
}
