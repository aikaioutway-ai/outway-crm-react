import { calculateB2BRevenueTax, normalizeB2BPaymentMethod } from './b2bPaymentService';

describe('B2B revenue tax', () => {
  test('calculates 4% for legal-account client revenue', () => {
    expect(calculateB2BRevenueTax(10_000, 'legal_account')).toEqual({
      grossAmount: 10_000,
      taxAmount: 400,
      netAmount: 9_600,
    });
  });

  test.each(['cash', 'personal_account'])('does not withhold tax for %s', method => {
    expect(calculateB2BRevenueTax(10_000, method)).toEqual({
      grossAmount: 10_000,
      taxAmount: 0,
      netAmount: 10_000,
    });
  });

  test('maps legacy QR payments to the legal-entity account', () => {
    expect(normalizeB2BPaymentMethod('qr')).toBe('legal_account');
  });

  test('maps Lovable accounts to the new payment names', () => {
    expect(normalizeB2BPaymentMethod('osu')).toBe('legal_account');
    expect(normalizeB2BPaymentMethod('bank_account')).toBe('personal_account');
  });
});
