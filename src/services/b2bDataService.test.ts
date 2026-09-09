import { supabase } from './supabase';
import { B2BOrderRecord, saveB2BAssignment } from './b2bDataService';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

const order: B2BOrderRecord = {
  id: 'order-1',
  number: 'P-2026-000107',
  clientId: 'client-1',
  client: 'Клиент',
  category: 'b2b',
  routeFrom: 'Бишкек',
  routeTo: 'Аэропорт',
  requestDate: '01.05.2026',
  departureDate: '02.05.2026',
  transport: 'Микроавтобус',
  transportCount: 3,
  pricePerUnit: 10_000,
  total: 30_000,
  paid: 0,
  status: 'driver_assigned',
  assignmentId: 'assignment-1',
  driverId: 'driver-1',
  driverName: 'Водитель',
  driverPricePerUnit: 0,
  driverTotal: 0,
};

beforeEach(() => jest.clearAllMocks());

test('saves driver unit price and recalculated total in one update', async () => {
  const assignmentSingle = jest.fn().mockResolvedValue({
    data: { id: 'assignment-1', driver_price: '5000.00', driver_total: '15000.00' },
    error: null,
  });
  const assignmentSelect = jest.fn(() => ({ single: assignmentSingle }));
  const assignmentEq = jest.fn(() => ({ select: assignmentSelect }));
  const assignmentUpdate = jest.fn(() => ({ eq: assignmentEq }));
  const orderEq = jest.fn().mockResolvedValue({ error: null });
  const orderUpdate = jest.fn(() => ({ eq: orderEq }));

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'v2_b2b_order_driver_assignments') return { update: assignmentUpdate };
    if (table === 'v2_b2b_orders') return { update: orderUpdate };
    throw new Error(`Unexpected table: ${table}`);
  });

  await expect(saveB2BAssignment(order, 'driver-1', 5_000)).resolves.toEqual({
    id: 'assignment-1',
    driverPricePerUnit: 5_000,
    driverTotal: 15_000,
  });
  expect(assignmentUpdate).toHaveBeenCalledWith({
    order_id: 'order-1',
    driver_id: 'driver-1',
    driver_price: 5_000,
    driver_total: 15_000,
  });
  expect(assignmentSelect).toHaveBeenCalledWith('id, driver_price, driver_total');
});
