import type { V2DriverTableRow, V2TransferDashboardRow } from '../../services/crmV2Service';
import type { TransferDriverHistoryEntry } from '../../services/expenseService';

export function withFormerTransferDrivers(drivers: V2DriverTableRow[], transfers: V2TransferDashboardRow[], history: TransferDriverHistoryEntry[]): V2DriverTableRow[] {
  const rows = [...drivers];
  const seen = new Set<string>();
  for (const event of history) {
    const transfer = transfers.find(item => item.id === event.transferId);
    if (!transfer) continue;
    for (const id of [event.previousDriverId, event.driverId]) {
      if (!id || transfer.driverId === id || seen.has(`${id}:${transfer.id}`)) continue;
      const driver = drivers.find(item => item.driverId === id);
      if (!driver) continue;
      seen.add(`${id}:${transfer.id}`);
      rows.push({...driver, rowId:`former:${id}:${transfer.id}`, previousAssignment:true,
        branchIds:transfer.branchId?[transfer.branchId]:[], branchCodes:[transfer.branchCode],
        branchShorts:[transfer.branchShort], branchNames:[transfer.branchName],
        transferCount:1, transferNumbers:`№${transfer.transferNumber}`, childrenCount:0,
        transfers:[{id:transfer.id,transferNumber:Number(transfer.transferNumber),branchCode:transfer.branchCode,branchShort:transfer.branchShort,telegramChatId:transfer.telegramChatId??null}],
      });
    }
  }
  return rows;
}
