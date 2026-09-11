import { buildTransferRepricingPlan, TransferRepricingChildSnapshot } from './transferRepricing';

const child = (overrides: Partial<TransferRepricingChildSnapshot> = {}): TransferRepricingChildSnapshot => ({
  id: '10000000-0000-4000-8000-000000000001',
  familyId: 'FAM-000001',
  childName: 'Тестовый ребёнок',
  schoolCode: 'TENSAY',
  zone: 'B',
  requestedVehicleType: 'minivan',
  vehicleType: 'minivan',
  basePrice: 9500,
  finalPrice: 9500,
  siblingDiscountPercent: 0,
  manualDiscountPercent: 0,
  manualDiscountAmount: 0,
  transferId: '20000000-0000-4000-8000-000000000001',
  charges: [],
  ...overrides,
});

const build = (overrides: Partial<Parameters<typeof buildTransferRepricingPlan>[0]> = {}) => (
  buildTransferRepricingPlan({
    operationId: '30000000-0000-4000-8000-000000000001',
    transferId: '20000000-0000-4000-8000-000000000001',
    transferNumber: 6,
    previousTransferVehicleType: 'minivan',
    newVehicleType: 'microbus',
    source: 'logistics',
    children: [child()],
    ...overrides,
  })
);

describe('buildTransferRepricingPlan', () => {
  it('reprices Minivan to the actual Minibus tariff and preserves the requested type', () => {
    const plan = build();
    expect(plan?.children[0]).toMatchObject({
      requestedVehicleType: 'minivan',
      previousVehicleType: 'minivan',
      newVehicleType: 'microbus',
      oldFinalPrice: 9500,
      newBasePrice: 6800,
      newFinalPrice: 6800,
    });
    expect(plan?.familyComments[0].text).toContain('фактически определён Microbus');
  });

  it('reprices Sedan to Minibus', () => {
    const plan = build({
      previousTransferVehicleType: 'sedan',
      children: [child({ requestedVehicleType: 'sedan', vehicleType: 'sedan', basePrice: 10500, finalPrice: 10500 })],
    });
    expect(plan?.children[0]).toMatchObject({ oldFinalPrice: 10500, newFinalPrice: 6800 });
  });

  it('does not reprice when the actual transfer type did not change', () => {
    expect(build({ previousTransferVehicleType: 'microbus', newVehicleType: 'microbus' })).toBeNull();
  });

  it('uses the target transfer type when moving an existing child', () => {
    const plan = build({
      updateTransferType: false,
      force: true,
      source: 'transfer_move',
      children: [child({ transferId: 'old-transfer', vehicleType: 'minivan' })],
    });
    expect(plan?.updateTransferType).toBe(false);
    expect(plan?.children[0]).toMatchObject({
      oldTransferId: 'old-transfer',
      newTransferId: '20000000-0000-4000-8000-000000000001',
      requestedVehicleType: 'minivan',
      newVehicleType: 'microbus',
      newFinalPrice: 6800,
    });
  });

  it('updates only pricing-managed charges, preserves paid amount and releases overpayment', () => {
    const plan = build({
      previousTransferVehicleType: 'sedan',
      children: [child({
        requestedVehicleType: 'sedan',
        vehicleType: 'sedan',
        basePrice: 10500,
        finalPrice: 10500,
        charges: [
          {
            id: 'managed', chargeType: 'monthly', originalAmount: 10500, amount: 10500,
            paidAmount: 10500, pricingManaged: true, status: 'paid',
          },
          {
            id: 'manual', chargeType: 'monthly', originalAmount: 12000, amount: 12000,
            paidAmount: 0, pricingManaged: false, status: 'unpaid',
          },
        ],
      })],
    });
    expect(plan?.children[0].charges).toEqual([expect.objectContaining({
      id: 'managed', newAmount: 6800, paidAmount: 10500, walletDelta: 3700,
    })]);
  });

  it('preserves a partial payment when the new price increases', () => {
    const plan = build({
      previousTransferVehicleType: 'microbus',
      newVehicleType: 'sedan',
      children: [child({
        requestedVehicleType: 'microbus',
        vehicleType: 'microbus',
        basePrice: 6500,
        finalPrice: 6500,
        charges: [{
          id: 'managed', chargeType: 'monthly', originalAmount: 6500, amount: 6500,
          paidAmount: 5000, pricingManaged: true, status: 'partial',
        }],
      })],
    });
    expect(plan?.children[0].charges[0]).toMatchObject({
      newAmount: 10500,
      paidAmount: 5000,
      walletDelta: 0,
    });
    expect((plan?.children[0].charges[0].newAmount ?? 0) - (plan?.children[0].charges[0].paidAmount ?? 0)).toBe(5500);
  });

  it('keeps sibling and manual discounts separate during repricing', () => {
    const plan = build({ children: [child({ siblingDiscountPercent: 5, manualDiscountPercent: 0 })] });
    expect(plan?.children[0]).toMatchObject({
      siblingDiscountPercent: 5,
      manualDiscountPercent: 0,
      newFinalPrice: 6460,
    });
  });
});
