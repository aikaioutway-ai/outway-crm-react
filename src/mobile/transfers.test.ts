import { FamilyListRow, V2DriverTableRow } from '../services/crmV2Service';
import { buildExportList, NO_TRANSFER, REJECTED, rowsForTransfer } from './transfers';

function child(patch: Partial<FamilyListRow>): FamilyListRow {
  return {
    rowId: Math.random().toString(36), familyId: 'f1', childName: 'Иванов Иван', parentName: 'Иванова Анна',
    phone: '0555123456', secondPhone: '', streetAddress: 'улица Абая, 1', status: 'boarded', transferNumber: '4',
    stopNumber: null, timeMorning: null, vehicleType: 'microbus', vehicleLabel: 'Микроавтобус', driverId: null,
    ...patch,
  } as FamilyListRow;
}

const rows = [
  child({ transferNumber: '4' }),
  child({ transferNumber: '4', status: 'rejected' }),
  child({ transferNumber: null }),
  child({ transferNumber: '5', status: 'rejected' }),
];

test('splits school children into transfers, without transfer and rejected', () => {
  expect(rowsForTransfer(rows, '4')).toHaveLength(1);
  expect(rowsForTransfer(rows, NO_TRANSFER)).toHaveLength(1);
  expect(rowsForTransfer(rows, REJECTED)).toHaveLength(2);
});

test('driver list is ordered by stop and carries both parent phones', () => {
  const driver = { driverId: 'd1', fullName: 'Петров Пётр' } as V2DriverTableRow;
  const list = buildExportList('TIS', '4', [
    child({ childName: 'Борисов Борис', stopNumber: '2', driverId: 'd1', secondPhone: '996700111222', timeMorning: '07:40:00' }),
    child({ childName: 'Алиев Али', stopNumber: '1', driverId: 'd1' }),
  ], [driver]);
  expect(list.title).toBe('TIS · Трансфер №4');
  expect(list.subtitle).toContain('водитель Петров Пётр');
  expect(list.rows.map(row => row.name)).toEqual(['Алиев Али', 'Борисов Борис']);
  expect(list.rows[1].phones).toEqual(['+996555123456', '+996700111222']);
  expect(list.rows[1].time).toBe('07:40');
});
