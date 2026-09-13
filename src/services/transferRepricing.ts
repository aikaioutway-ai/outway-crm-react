import { Child, SchoolCode, VehicleType, Zone } from '../types';
import { getPriceByZone, isTeacherPriced, repriceChild, supportsTeacherPrice, TEACHER_MONTHLY_PRICE } from '../utils/pricing';

export type TransferRepricingSource =
  | 'logistics'
  | 'family_card'
  | 'map'
  | 'transfer_move'
  | 'vehicle_assignment';

export interface PricingManagedChargeSnapshot {
  id: string;
  chargeType: 'monthly' | 'deposit' | 'may';
  originalAmount: number;
  amount: number;
  paidAmount: number;
  pricingManaged: boolean;
  status: string;
}

export interface TransferRepricingChildSnapshot {
  id: string;
  familyId: string;
  childName: string;
  schoolCode: SchoolCode;
  zone: Zone;
  requestedVehicleType?: VehicleType | null;
  vehicleType: VehicleType;
  basePrice: number;
  finalPrice: number;
  siblingDiscountPercent: number;
  manualDiscountPercent: number;
  manualDiscountAmount: number;
  transferId?: string | null;
  charges: PricingManagedChargeSnapshot[];
}

export interface TransferRepricingPlanInput {
  operationId: string;
  transferId: string;
  transferNumber: number;
  previousTransferVehicleType: VehicleType | null;
  newVehicleType: VehicleType;
  source: TransferRepricingSource;
  actorId?: string | null;
  actorName?: string | null;
  children: TransferRepricingChildSnapshot[];
  updateTransferType?: boolean;
  force?: boolean;
}

export interface TransferRepricingChargePlan {
  id: string;
  chargeType: PricingManagedChargeSnapshot['chargeType'];
  oldOriginalAmount: number;
  newOriginalAmount: number;
  oldAmount: number;
  newAmount: number;
  paidAmount: number;
  walletDelta: number;
}

export interface TransferRepricingChildPlan {
  id: string;
  familyId: string;
  childName: string;
  oldTransferId: string | null;
  newTransferId: string;
  requestedVehicleType: VehicleType;
  previousVehicleType: VehicleType;
  newVehicleType: VehicleType;
  oldBasePrice: number;
  newBasePrice: number;
  oldFinalPrice: number;
  newFinalPrice: number;
  siblingDiscountPercent: number;
  manualDiscountPercent: number;
  manualDiscountAmount: number;
  charges: TransferRepricingChargePlan[];
}

export interface TransferRepricingPlan {
  operationId: string;
  transferId: string;
  transferNumber: number;
  previousTransferVehicleType: VehicleType | null;
  newVehicleType: VehicleType;
  updateTransferType: boolean;
  source: TransferRepricingSource;
  actorId: string | null;
  actorName: string;
  children: TransferRepricingChildPlan[];
  familyComments: Array<{ familyId: string; text: string }>;
}

function repricedValues(child: TransferRepricingChildSnapshot, newVehicleType: VehicleType) {
  const newBasePrice = getPriceByZone(child.schoolCode, child.zone, newVehicleType);
  const teacherPrice = supportsTeacherPrice(child) && isTeacherPriced(child);
  return repriceChild({
    basePrice: newBasePrice,
    siblingDiscountPercent: child.siblingDiscountPercent,
    manualDiscountPercent: child.manualDiscountPercent,
    manualDiscountAmount: child.manualDiscountAmount,
    fixedFinalPrice: teacherPrice ? TEACHER_MONTHLY_PRICE : undefined,
  });
}

function chargeStatus(amount: number, paidAmount: number): string {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount < amount) return 'partial';
  if (paidAmount === amount) return 'paid';
  return 'overpaid';
}

/** Detects stale stored pricing even when the transfer type itself is already correct. */
export function hasTransferPricingMismatch(
  child: TransferRepricingChildSnapshot,
  newVehicleType: VehicleType,
): boolean {
  const repriced = repricedValues(child, newVehicleType);
  if (
    child.vehicleType !== newVehicleType
    || child.basePrice !== repriced.basePrice
    || child.finalPrice !== repriced.finalPrice
    || child.manualDiscountPercent !== repriced.manualDiscountPercent
    || child.manualDiscountAmount !== repriced.manualDiscountAmount
  ) return true;

  return child.charges.some(charge => (
    charge.pricingManaged
    && charge.status !== 'cancelled'
    && (
      charge.originalAmount !== repriced.finalPrice
      || charge.amount !== repriced.finalPrice
      || charge.status !== chargeStatus(repriced.finalPrice, charge.paidAmount)
    )
  ));
}

function money(value: number): string {
  return Math.round(value).toLocaleString('ru-RU');
}

const VEHICLE_NAME: Record<VehicleType, string> = {
  sedan: 'Sedan',
  minivan: 'Minivan',
  microbus: 'Microbus',
};

export function buildTransferRepricingPlan(input: TransferRepricingPlanInput): TransferRepricingPlan | null {
  const updateTransferType = input.updateTransferType !== false;

  const children = input.children.map<TransferRepricingChildPlan>(child => {
    const repriced = repricedValues(child, input.newVehicleType);
    const charges = child.charges
      .filter(charge => charge.pricingManaged && charge.status !== 'cancelled')
      .map<TransferRepricingChargePlan>(charge => {
        const oldExcess = Math.max(0, charge.paidAmount - charge.amount);
        const newExcess = Math.max(0, charge.paidAmount - repriced.finalPrice);
        return {
          id: charge.id,
          chargeType: charge.chargeType,
          oldOriginalAmount: charge.originalAmount,
          newOriginalAmount: repriced.finalPrice,
          oldAmount: charge.amount,
          newAmount: repriced.finalPrice,
          paidAmount: charge.paidAmount,
          walletDelta: newExcess - oldExcess,
        };
      });

    return {
      id: child.id,
      familyId: child.familyId,
      childName: child.childName,
      oldTransferId: child.transferId ?? null,
      newTransferId: input.transferId,
      requestedVehicleType: child.requestedVehicleType ?? child.vehicleType,
      previousVehicleType: child.vehicleType,
      newVehicleType: input.newVehicleType,
      oldBasePrice: child.basePrice,
      newBasePrice: repriced.basePrice,
      oldFinalPrice: child.finalPrice,
      newFinalPrice: repriced.finalPrice,
      siblingDiscountPercent: child.siblingDiscountPercent,
      manualDiscountPercent: repriced.manualDiscountPercent,
      manualDiscountAmount: repriced.manualDiscountAmount,
      charges,
    };
  });

  const changedChildren = children.filter((_, index) => (
    hasTransferPricingMismatch(input.children[index], input.newVehicleType)
  ));
  const transferTypeChanged = input.previousTransferVehicleType !== input.newVehicleType;
  if (!input.force && !transferTypeChanged && changedChildren.length === 0) return null;
  const familyComments = Array.from(new Set(changedChildren.map(child => child.familyId))).map(familyId => {
    const familyChildren = changedChildren.filter(child => child.familyId === familyId);
    const details = familyChildren.map(child => (
      `${child.childName}: изначально выбран ${VEHICLE_NAME[child.requestedVehicleType]}, фактически определён ${VEHICLE_NAME[child.newVehicleType]}; стоимость ${money(child.oldFinalPrice)} → ${money(child.newFinalPrice)}`
    )).join('; ');
    return { familyId, text: `[Логистика] Трансфер №${input.transferNumber}: ${details}.` };
  });

  return {
    operationId: input.operationId,
    transferId: input.transferId,
    transferNumber: input.transferNumber,
    previousTransferVehicleType: input.previousTransferVehicleType,
    newVehicleType: input.newVehicleType,
    updateTransferType,
    source: input.source,
    actorId: input.actorId ?? null,
    actorName: input.actorName?.trim() || 'CRM',
    children,
    familyComments,
  };
}

export function childSnapshotFromModel(child: Child): Omit<TransferRepricingChildSnapshot, 'charges'> {
  return {
    id: child.id,
    familyId: child.familyId,
    childName: child.childName,
    schoolCode: child.schoolCode,
    zone: child.zone,
    requestedVehicleType: child.requestedVehicleType ?? null,
    vehicleType: child.vehicleType,
    basePrice: Number(child.basePrice ?? 0),
    finalPrice: Number(child.finalPrice ?? child.basePrice ?? 0),
    siblingDiscountPercent: Number(child.siblingDiscountPercent ?? 0),
    manualDiscountPercent: Number(child.manualDiscountPercent ?? 0),
    manualDiscountAmount: Number(child.manualDiscountAmount ?? 0),
    transferId: child.transferId ?? null,
  };
}
