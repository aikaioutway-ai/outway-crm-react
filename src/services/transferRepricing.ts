import { SchoolCode, VehicleType, Zone } from '../types';

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

const VEHICLE_NAME: Record<VehicleType, string> = {
  sedan: 'Sedan',
  minivan: 'Minivan',
  microbus: 'Microbus',
};

export function buildTransferRepricingPlan(input: TransferRepricingPlanInput): TransferRepricingPlan | null {
  const updateTransferType = input.updateTransferType !== false;
  if (!input.force && updateTransferType && input.previousTransferVehicleType === input.newVehicleType) return null;

  // Смена типа ТС не меняет цену: переносим тип и трансфер, цены и начисления остаются прежними.
  const children = input.children.map<TransferRepricingChildPlan>(child => ({
    id: child.id,
    familyId: child.familyId,
    childName: child.childName,
    oldTransferId: child.transferId ?? null,
    newTransferId: input.transferId,
    requestedVehicleType: child.requestedVehicleType ?? child.vehicleType,
    previousVehicleType: child.vehicleType,
    newVehicleType: input.newVehicleType,
    oldBasePrice: child.basePrice,
    newBasePrice: child.basePrice,
    oldFinalPrice: child.finalPrice,
    newFinalPrice: child.finalPrice,
    siblingDiscountPercent: child.siblingDiscountPercent,
    manualDiscountPercent: child.manualDiscountPercent,
    manualDiscountAmount: child.manualDiscountAmount,
    charges: [],
  }));

  const changedChildren = children.filter(child => (
    child.previousVehicleType !== child.newVehicleType || child.oldFinalPrice !== child.newFinalPrice
  ));
  const familyComments = Array.from(new Set(changedChildren.map(child => child.familyId))).map(familyId => {
    const familyChildren = changedChildren.filter(child => child.familyId === familyId);
    const details = familyChildren.map(child => (
      `Изначально выбран «${VEHICLE_NAME[child.requestedVehicleType]}»`
    )).filter((text, index, texts) => texts.indexOf(text) === index).join('\n');
    return { familyId, text: details };
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
