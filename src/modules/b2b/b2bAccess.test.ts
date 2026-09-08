import { b2bAccess } from './b2bAccess';
import { getAllowedSections } from '../../core/bars/Sidebar';
test('manager sees business orders without driver prices and client finance', () => {
  expect(b2bAccess('b2b_manager')).toMatchObject({ tabs: ['orders', 'calendar', 'clients'], orderTabs: ['main', 'payment', 'driver', 'documents'], driverPrice: false, driverPay: false, clientFinance: false });
});
test('logistics sees driver price but cannot pay or open clients', () => {
  expect(b2bAccess('b2b_logist')).toMatchObject({ tabs: ['logistics', 'calendar'], orderTabs: ['main', 'driver'], driverPrice: true, driverPay: false, openClient: false });
  expect(getAllowedSections('b2b_logist')).toEqual(['b2b']);
});
test('logistics head can access all B2B sections', () => {
  expect(getAllowedSections('senior_logist')).toContain('b2b');
  expect(b2bAccess('senior_logist').tabs).toHaveLength(8);
});

test('director has no B2B sidebar access while logistics head retains it', () => {
  expect(getAllowedSections('director')).not.toContain('b2b');
  expect(getAllowedSections('senior_logist')).toContain('b2b');
});
