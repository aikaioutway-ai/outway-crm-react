import { reconciliationRouteCounts } from './logisticsReconciliationStats';
import type { ReconciliationMonthData } from '../../services/driverCheckService';

test('counts occupied logical routes once, excludes empty routes, and includes missing metadata as pending', () => {
  const rows = [
    { branchFilter: 'ING', transferNumber: '1' },
    { branchFilter: 'ING', transferNumber: '1' },
    { branchFilter: 'ING', transferNumber: '2' },
    { branchFilter: 'KAS', transferNumber: '3' },
  ];
  const data = { currentRound: 4, transfers: [
    { schoolKey: 'ING', transferNumber: 1, rounds: { 4: { checked: true } } },
    { schoolKey: 'ING', transferNumber: 1, rounds: { 4: { checked: true } } },
    { schoolKey: 'ING', transferNumber: 9, rounds: {} },
    { schoolKey: 'KAS', transferNumber: 3, rounds: {} },
  ] } as unknown as ReconciliationMonthData;
  expect(reconciliationRouteCounts(data, rows)).toEqual({ completed: 1, pending: 2 });
  expect(reconciliationRouteCounts(data, rows, 'ING')).toEqual({ completed: 1, pending: 1 });
  data.transfers[1].rounds = {};
  expect(reconciliationRouteCounts(data, rows, 'ING')).toEqual({ completed: 0, pending: 2 });
});
