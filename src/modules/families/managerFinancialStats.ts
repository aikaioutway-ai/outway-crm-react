import type { FamilyListRow, PeriodChargeStats } from '../../services/crmV2Service';
import type { SchoolStat } from './ManagerOverview';

export function managerFinancialStats(stats: SchoolStat[], rows: FamilyListRow[], periodStats: PeriodChargeStats[], allTime: boolean) {
    const byChild = new Map(periodStats.filter(s => s.childId).map(s => [s.childId, s]));
    const familySchool = new Map((rows).map(r => [r.familyId, r.branchFilter]));
    return stats.map(s => {
      const children = (rows).filter(r => r.branchFilter === s.key);
      const active = children.filter(r => r.status !== 'rejected');
      const period = periodStats.filter(p => p.childId
        ? children.some(r => r.rowId === p.childId)
        : familySchool.get(p.familyId) === s.key);
      return {
        ...s,
        charged: allTime ? s.charged : period.reduce((sum, p) => sum + p.charged, 0),
        paid: allTime ? s.paid : period.reduce((sum, p) => sum + p.paid, 0),
        debtSum: allTime ? s.debtSum : period.reduce((sum, p) => sum + p.debt, 0),
        debtorsCount: children.filter(r => (allTime ? r.childDebtAmount : byChild.get(r.rowId)?.debt ?? 0) > 0).length,
        boarded: active.filter(r => r.status === 'boarded').length,
        uncharged: active.filter(r => !!r.transferNumber && !byChild.has(r.rowId)).length,
      };
    });
}
