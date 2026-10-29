import { managerSchoolKpi, rowsForTransferSelection } from './schoolKpiStats';

const row = (rowId: string, familyId: string, status: string, transferNumber: string | null, balance = 0) =>
  ({ rowId, familyId, status, transferNumber, balance } as any);

const rows = [
  row('a', 'f1', 'boarded', '7', 100),
  row('b', 'f1', 'boarded', '8', 100),
  row('c', 'f2', 'new', null, 50),
  row('d', 'f3', 'rejected', null, 0),
];

test('transfer chip picks the right children', () => {
  expect(rowsForTransferSelection(rows, '').map(r => r.rowId)).toEqual(['a', 'b', 'c']);
  expect(rowsForTransferSelection(rows, '7').map(r => r.rowId)).toEqual(['a']);
  expect(rowsForTransferSelection(rows, 'new').map(r => r.rowId)).toEqual(['c']);
  expect(rowsForTransferSelection(rows, 'empty').map(r => r.rowId)).toEqual(['c']);
  expect(rowsForTransferSelection(rows, 'rejected').map(r => r.rowId)).toEqual(['d']);
});

test('school figures follow the period charges of the chosen children; family balance counted once', () => {
  const period = [
    { familyId: 'f1', childId: 'a', charged: 5000, paid: 3000, debt: 2000, pending: 0 },
    { familyId: 'f1', childId: 'b', charged: 4750, paid: 4750, debt: 0, pending: 0 },
  ];
  expect(managerSchoolKpi(rowsForTransferSelection(rows, '7'), period)).toEqual({
    childrenCount: 1, newRequests: 0, charged: 5000, paid: 3000, debtSum: 2000, balance: 100,
  });
  expect(managerSchoolKpi(rowsForTransferSelection(rows, ''), period)).toMatchObject({
    childrenCount: 3, newRequests: 1, charged: 9750, paid: 7750, debtSum: 2000, balance: 150,
  });
});
