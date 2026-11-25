import type { ReconciliationMonthData } from '../../services/driverCheckService';
import { transferIdentityKey } from './familiesRowHelpers';

/** Use the directory's logical routes, including routes with no check metadata yet. */
export function reconciliationRouteCounts(
  data: ReconciliationMonthData,
  workingRows: Parameters<typeof transferIdentityKey>[0][],
  schoolKey?: string,
) {
  const keys = new Set(workingRows.filter(row => !schoolKey || schoolKey === 'ALL' || row.branchFilter === schoolKey)
    .map(transferIdentityKey).filter((key): key is string => Boolean(key)));
  const groups = new Map<string, typeof data.transfers>();
  for (const transfer of data.transfers) {
    const key = `${transfer.schoolKey}:${transfer.transferNumber}`;
    if (keys.has(key)) groups.set(key, [...(groups.get(key) ?? []), transfer]);
  }
  const completed = Array.from(keys).filter(key => {
    const transfers = groups.get(key);
    return transfers?.length && transfers.every(transfer => transfer.rounds[data.currentRound]?.checked);
  }).length;
  return { completed, pending: keys.size - completed };
}
