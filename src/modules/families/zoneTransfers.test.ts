import type { FamilyListRow } from '../../services/crmV2Service';
import { collectZoneTransfers, isPointInZone, rowsForZoneTransfers, zoneTransferKey } from './zoneTransfers';

// Квадрат 0..10 × 0..10 и вогнутая «буква C» с вырезом справа по центру.
const square = { shapeType: 'polygon' as const, coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0]]] };
const rectangle = { shapeType: 'rectangle' as const, coordinates: [[[10, 0], [10, 10], [0, 10], [0, 0]]] };
const concave = {
  shapeType: 'polygon' as const,
  coordinates: [[[0, 0], [0, 10], [3, 10], [3, 3], [7, 3], [7, 10], [10, 10], [10, 0]]],
};

function row(overrides: Partial<FamilyListRow>): FamilyListRow {
  return {
    rowId: Math.random().toString(36),
    branchFilter: 'ABL1',
    branchShort: '',
    transferNumber: '5',
    status: 'active',
    latitude: 5,
    longitude: 5,
    ...overrides,
  } as FamilyListRow;
}

test('isPointInZone handles polygons, rectangles and concave shapes', () => {
  expect(isPointInZone(5, 5, square)).toBe(true);
  expect(isPointInZone(11, 5, square)).toBe(false);
  expect(isPointInZone(5, 5, rectangle)).toBe(true);
  expect(isPointInZone(-1, 5, rectangle)).toBe(false);
  expect(isPointInZone(1, 5, concave)).toBe(true);
  expect(isPointInZone(5, 8, concave)).toBe(false);
  expect(isPointInZone(5, 1, concave)).toBe(true);
  expect(isPointInZone(5, 5, { shapeType: 'polygon', coordinates: [[[0, 0], [1, 1]]] })).toBe(false);
});

test('collectZoneTransfers groups transfers of every allowed school with points inside the zone', () => {
  const rows = [
    row({ branchFilter: 'ABL1', transferNumber: '5', latitude: 2, longitude: 2 }),
    row({ branchFilter: 'ABL1', transferNumber: '5', latitude: 2, longitude: 2 }), // тот же адрес
    row({ branchFilter: 'ABL1', transferNumber: '5', latitude: 20, longitude: 20 }), // вне зоны, но в маршруте
    row({ branchFilter: 'LA', transferNumber: '3', latitude: 4, longitude: 4 }),
    row({ branchFilter: 'LA', transferNumber: '3', latitude: 6, longitude: 6 }),
    row({ branchFilter: 'LA', transferNumber: null, latitude: 7, longitude: 7 }),
    row({ branchFilter: 'ERU', transferNumber: '1', latitude: 50, longitude: 50 }), // нет точек в зоне
    row({ branchFilter: 'LA', transferNumber: '9', latitude: 3, longitude: 3, status: 'rejected' }),
    row({ branchFilter: 'LA', transferNumber: '8', latitude: null, longitude: null }),
  ];

  const groups = collectZoneTransfers(rows, square, { schoolKey: 'ABL1' });

  expect(groups.map(group => group.key)).toEqual([
    zoneTransferKey('ABL1', '5'),
    zoneTransferKey('LA', '3'),
    zoneTransferKey('LA', null),
  ]);
  expect(groups[0]).toMatchObject({ isCurrentSchool: true, pointsInZone: 1, totalPoints: 2, childrenInZone: 2 });
  expect(groups[1]).toMatchObject({ schoolLabel: 'LA', transferNumber: '3', pointsInZone: 2, totalPoints: 2 });
  expect(groups[2]).toMatchObject({ transferNumber: null, pointsInZone: 1 });
});

test('collectZoneTransfers hides schools the user cannot access', () => {
  const rows = [
    row({ branchFilter: 'ABL1', transferNumber: '5' }),
    row({ branchFilter: 'LA', transferNumber: '3' }),
  ];

  const groups = collectZoneTransfers(rows, square, { schoolKey: 'ABL1', allowedSchools: ['ABL1'] });

  expect(groups.map(group => group.branchFilter)).toEqual(['ABL1']);
  expect(rowsForZoneTransfers(rows, [zoneTransferKey('LA', '3')], ['ABL1'])).toEqual([]);
});

test('rowsForZoneTransfers returns the whole route of the selected transfers', () => {
  const rows = [
    row({ branchFilter: 'LA', transferNumber: '3', latitude: 4, longitude: 4 }),
    row({ branchFilter: 'LA', transferNumber: '3', latitude: 40, longitude: 40 }),
    row({ branchFilter: 'LA', transferNumber: '4', latitude: 4, longitude: 4 }),
    row({ branchFilter: 'LA', transferNumber: '3', latitude: 5, longitude: 5, status: 'rejected' }),
  ];

  expect(rowsForZoneTransfers(rows, [zoneTransferKey('LA', '3')])).toHaveLength(2);
});
