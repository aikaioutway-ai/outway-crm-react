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
  it('changes the vehicle type without changing the price and preserves the requested type', () => {
    const plan = build();
    expect(plan?.children[0]).toMatchObject({
      requestedVehicleType: 'minivan',
      previousVehicleType: 'minivan',
      newVehicleType: 'microbus',
      oldBasePrice: 9500,
      newBasePrice: 9500,
      oldFinalPrice: 9500,
      newFinalPrice: 9500,
    });
    expect(plan?.familyComments[0].text).toBe('Изначально выбран «Minivan»');
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
      newFinalPrice: 9500,
    });
  });

  it('leaves charges, discounts and the teacher price untouched', () => {
    const plan = build({
      children: [child({
        basePrice: 9500,
        finalPrice: 4800,
        siblingDiscountPercent: 5,
        manualDiscountAmount: 4700,
        charges: [{
          id: 'managed', chargeType: 'monthly', originalAmount: 4800, amount: 4800,
          paidAmount: 4800, pricingManaged: true, status: 'paid',
        }],
      })],
    });
    expect(plan?.children[0]).toMatchObject({
      newBasePrice: 9500,
      newFinalPrice: 4800,
      siblingDiscountPercent: 5,
      manualDiscountAmount: 4700,
      charges: [],
    });
  });
});
