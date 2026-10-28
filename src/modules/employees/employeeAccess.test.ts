import { allowedEmployeeRoles, canWriteEmployee } from '../../../supabase/functions/employee-api/access';

test('cashier creates only cashier manager and logist, never leadership or B2B roles', () => {
  expect(allowedEmployeeRoles('cashier')).toEqual(['cashier','manager','logist']);
  for (const role of ['admin','gen_director','director','senior_logist','b2b_manager','b2b_logist','driver']) {
    expect(canWriteEmployee('cashier',role,undefined,false)).toBe(false);
  }
  expect(canWriteEmployee('cashier','manager',undefined,false)).toBe(true);
});
test('cashier cannot edit access or reset an existing employee password', () => {
  expect(canWriteEmployee('cashier','cashier','cashier',true)).toBe(false);
  expect(canWriteEmployee('cashier','manager','gen_director',true)).toBe(false);
});
test('directors cannot downgrade a privileged employee to gain control of their account', () => {
  expect(canWriteEmployee('director','manager','gen_director',true)).toBe(false);
  expect(canWriteEmployee('director','manager','manager',true)).toBe(true);
  expect(canWriteEmployee('manager','manager',undefined,false)).toBe(false);
  expect(canWriteEmployee('admin','gen_director',undefined,false)).toBe(true);
});

test('display role helper reads cashier and fails closed on malformed tokens', async () => {
  const { getEmployeeSessionRole } = await import('../../services/employeeSession');
  expect(getEmployeeSessionRole(`${btoa(JSON.stringify({role:'cashier'}))}.signature`)).toBe('cashier');
  expect(getEmployeeSessionRole('broken')).toBeNull();
});
