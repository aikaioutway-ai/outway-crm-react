import { FamilyListRow } from '../services/crmV2Service';
import { isLogisticsWorkRow, rowMatches, schoolsFor } from './data';

function row(patch: Partial<FamilyListRow>): FamilyListRow {
  return {
    childName: 'Абдибанапов Самат', parentName: 'Шералиева Айсулу', contactName: '', streetAddress: 'улица Абая, 56/3',
    childClass: '7', phone: '+996227113800', secondPhone: '', contactPhone: '', status: 'boarded', branchFilter: 'TIS',
    ...patch,
  } as FamilyListRow;
}

test('finds a family by phone in any format', () => {
  expect(rowMatches(row({}), '0227 113 800')).toBe(true);
  expect(rowMatches(row({ phone: '0227113800' }), '+996 227 11-38-00')).toBe(true);
  expect(rowMatches(row({ phone: '', contactPhone: '996227113800' }), '227113')).toBe(true);
  expect(rowMatches(row({}), '0555 12 34 56')).toBe(false);
});

test('finds by child, parent and address regardless of spaces and case', () => {
  expect(rowMatches(row({}), 'самат')).toBe(true);
  expect(rowMatches(row({}), 'шералиева айсулу')).toBe(true);
  expect(rowMatches(row({}), 'абая')).toBe(true);
  expect(rowMatches(row({}), '')).toBe(true);
});

test('logistics works with everyone except rejected children', () => {
  expect(isLogisticsWorkRow(row({ status: 'new' }))).toBe(true);
  expect(isLogisticsWorkRow(row({ status: 'rejected' }))).toBe(false);
});

test('school list respects the employee school access', () => {
  expect(schoolsFor(['TIS']).map(school => school.key)).toEqual(['TIS']);
  expect(schoolsFor(['ALL']).some(school => school.key === 'ALL')).toBe(false);
});
