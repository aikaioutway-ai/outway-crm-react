import { canEditTimesheet, isPayrollApprover } from './payrollApproval';

test('cashier can edit a draft but not a submitted timesheet', () => {
  expect(canEditTimesheet('draft', 'cashier', 'Кассир')).toBe(true);
  expect(canEditTimesheet('pending', 'cashier', 'Кассир')).toBe(false);
  expect(canEditTimesheet('approved', 'cashier', 'Кассир')).toBe(false);
});

test('general director can edit the whole timesheet while it is pending', () => {
  expect(isPayrollApprover('gen_director', 'Генеральный директор')).toBe(true);
  expect(canEditTimesheet('pending', 'gen_director', 'Генеральный директор')).toBe(true);
});

test('Kairat can edit the whole timesheet while it is pending', () => {
  expect(isPayrollApprover('admin', 'Эсенали Кайрат')).toBe(true);
  expect(canEditTimesheet('pending', 'admin', 'Эсенали Кайрат')).toBe(true);
});

test('other finance users cannot approve a pending timesheet', () => {
  expect(isPayrollApprover('admin', 'Другой администратор')).toBe(false);
  expect(canEditTimesheet('pending', 'senior_logist', 'Старший логист')).toBe(false);
});
