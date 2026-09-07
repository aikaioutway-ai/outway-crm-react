import { supabase } from './supabase';
import { updateFamilyPayment } from './financeService';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('./queryClient', () => ({
  QK: {
    branchStats: ['branchStats'],
    paymentsTable: ['paymentsTable'],
    cashierPaymentsTable: ['cashierPaymentsTable'],
    refundsTable: ['refundsTable'],
  },
  queryClient: { invalidateQueries: jest.fn() },
}));

function mockPaymentMethodUpdate(savedPaymentMethod: string) {
  const single = jest.fn().mockResolvedValue({
    data: { payment_method: savedPaymentMethod },
    error: null,
  });
  const select = jest.fn(() => ({ single }));
  const eq = jest.fn(() => ({ select }));
  const update = jest.fn(() => ({ eq }));
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq, select, single };
}

beforeEach(() => jest.clearAllMocks());

test('persists and returns АйКай Мбанк as transfer', async () => {
  const chain = mockPaymentMethodUpdate('transfer');

  await expect(updateFamilyPayment('payment-1', { paymentType: 'transfer' }))
    .resolves.toBe('transfer');
  expect(supabase.from).toHaveBeenCalledWith('v2_payments');
  expect(chain.update).toHaveBeenCalledWith({ payment_method: 'transfer' });
  expect(chain.eq).toHaveBeenCalledWith('id', 'payment-1');
  expect(chain.select).toHaveBeenCalledWith('payment_method');
});

test('rejects a silent payment-method fallback from the database', async () => {
  mockPaymentMethodUpdate('cash');

  await expect(updateFamilyPayment('payment-1', { paymentType: 'transfer' }))
    .rejects.toThrow('База не подтвердила выбранный вид оплаты');
});
