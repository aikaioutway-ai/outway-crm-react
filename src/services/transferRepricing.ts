import { Child, SchoolCode, VehicleType, Zone } from '../types';
import { getPriceByZone, repriceChild } from '../utils/pricing';

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
  if (!input.force && updateTransferType && input.previousTransferVehicleType === input.newVehicleType) return null;

  const children = input.children.map<TransferRepricingChildPlan>(child => {
    const newBasePrice = getPriceByZone(child.schoolCode, child.zone, input.newVehicleType);
    const repriced = repriceChild({
      basePrice: newBasePrice,
      siblingDiscountPercent: child.siblingDiscountPercent,
      manualDiscountPercent: child.manualDiscountPercent,
      manualDiscountAmount: child.manualDiscountAmount,
    });
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

  const changedChildren = children.filter(child => (
    child.previousVehicleType !== child.newVehicleType || child.oldFinalPrice !== child.newFinalPrice
  ));
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
