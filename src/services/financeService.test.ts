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

test('saves receipt metadata with a verified row and no amount mutation', async () => {
  const single = jest.fn().mockResolvedValue({data: {id: 'payment-1'}, error: null});
  const select = jest.fn(() => ({single}));
  const eq = jest.fn(() => ({select}));
  const update = jest.fn(() => ({eq}));
  (supabase.from as jest.Mock).mockReturnValue({update});
  await updateFamilyPayment('payment-1', {receiptCode: ' mbiz:123 ', receiptTime: '17:39', receiptCardLast4: '7985', receiptBank: 'Optima'});
  expect(update).toHaveBeenCalledWith({receipt_code: 'mbiz:123', receipt_time: '17:39', receipt_card_last4: '7985', receipt_bank: 'Optima'});
  expect(select).toHaveBeenCalledWith('id');
});

test('rejects invalid time and card details before a database write', async () => {
  await expect(updateFamilyPayment('payment-1', {receiptTime: '25:00'})).rejects.toThrow('Время');
  await expect(updateFamilyPayment('payment-1', {receiptCardLast4: '123'})).rejects.toThrow('4 цифры');
  expect(supabase.from).not.toHaveBeenCalled();
});
