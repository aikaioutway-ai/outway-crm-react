import { supabase } from './supabase';
import { Child, ChildStatus, Family, SchoolCode, VehicleType, Zone } from '../types';
import { normalizeSchoolCode, normalizeVehicle, normalizeZone, VT_LABEL } from '../modules/families/constants';

export interface V2BranchOption {
  id: string;
  schoolId: string;
  code: string;
  shortName: string;
  name: string;
}

export interface V2TransferDashboardRow {
  id: string;
  schoolId: string | null;
  branchId: string | null;
  branchCode: string;
  branchShort: string;
  branchName: string;
  transferNumber: string;
  vehicleType: VehicleType;
  driverId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface V2DriverTableRow {
  rowId: string;
  driverId: string;
  fullName: string;
  phone: string;
  secondPhone: string;
  status: string;
  address: string;
  comment: string;
  vehicleType: VehicleType | '';
  vehicleLabel: string;
  plateNumber: string;
  brand: string;
  model: string;
  seats: number | null;
  transferNumbers: string;
  transferCount: number;
  childrenCount: number;
  branchIds: string[];
  branchCodes: string[];
  branchShorts: string[];
  branchNames: string[];
}

export interface FamilyListRow {
  rowId: string;
  familyId: string;
  familyIndex: number;
  isFirstChild: boolean;
  childName: string;
  childClass: string;
  parentName: string;
  phone: string;
  secondPhone: string;
  contactName: string;
  contactPhone: string;
  schoolId: string | null;
  branchId: string | null;
  schoolCode: string;
  branchName: string;
  branchShort: string;
  branchFilter: string;
  streetAddress: string;
  distanceKm: number | null;
  zone: string;
  vehicleType: string;
  vehicleLabel: string;
  monthlyPrice: number;
  status: string;
  paymentStatus: string;
  transferNumber: string | null;
  driverId: string | null;
  stopNumber: string | null;
  timeMorning: string | null;
  selfExitAllowed: boolean;
  latitude: number | null;
  longitude: number | null;
  discountAmount: number;
  totalCharged: number;
  totalPaid: number;
  pendingPayment: number;
  pendingPaymentId: string | null;
  pendingPaymentAmount: number;
  pendingPaymentDate: string | null;
  pendingActualPaymentDate: string | null;
  pendingPaymentType: string | null;
  pendingPaymentComment: string;
  debtAmount: number;
  balance: number;
}

function stripAddress(addr: string | null): string {
  if (!addr) return '';
  return addr
    .replace(/^кыргызстан,?\s*/i, '')
    .replace(/^бишкек,?\s*/i, '')
    .replace(/^кыргызстан,?\s*бишкек,?\s*/i, '')
    .trim();
}

function toSchoolCode(branchCode?: string | null): SchoolCode {
  const normalized = normalizeSchoolCode(branchCode ?? '') as SchoolCode;
  return (normalized || 'KINGS') as SchoolCode;
}

function mapStatus(status: string | null | undefined): any {
  if (status === 'paused' || status === 'archive') return 'inactive';
  return status ?? 'new';
}

function mapChildStatus(status: string | null | undefined): ChildStatus {
  if (status === 'active') return 'boarded';
  if (status === 'inactive' || status === 'archive') return 'paused';
  if (status === 'waiting' || status === 'boarded' || status === 'rejected' || status === 'paused') return status;
  return 'new';
}

function firstPresent<T>(items: T[], pick: (item: T) => unknown): T | undefined {
  return items.find(item => pick(item) !== null && pick(item) !== undefined && pick(item) !== '');
}

export function mapV2Family(row: any, children: any[] = []): Family {
  const firstChild = firstPresent(children, c => c.branch_id) ?? children[0];
  const branch = firstChild?.v2_school_branches;
  const schoolCode = toSchoolCode(branch?.code);
  const vehicleType = normalizeVehicle(firstChild?.vehicle_type) as VehicleType;
  const zone = normalizeZone(firstChild?.zone, 'A') as Zone;
  const price = Number(firstChild?.final_price ?? firstChild?.base_price ?? 0);

  return {
    id: String(row.id),
    schoolCode,
    branchId: branch?.id,
    branchCode: branch?.code,
    branchName: branch?.name,
    branchShort: branch?.short_name ?? branch?.code,
    parentName: row.parent_name ?? '',
    phone: row.phone ?? '',
    phoneTelegram: row.phone_telegram ? 'Да' : '',
    secondPhone: row.second_phone ?? '',
    secondPhoneTelegram: Boolean(row.second_phone_telegram),
    contactName: row.contact_name ?? '',
    contactPhone: row.contact_phone ?? '',
    contactPhoneTelegram: Boolean(row.contact_phone_telegram),
    fullAddress: firstChild?.address ?? '',
    latitude: firstChild?.latitude ?? undefined,
    longitude: firstChild?.longitude ?? undefined,
    distanceKm: firstChild?.distance_km == null ? undefined : Number(firstChild.distance_km),
    zone,
    vehicleType,
    vehicleLabel: undefined,
    monthlyPrice: price,
    comment: row.comment ?? '',
    createdAt: row.created_at ?? '',
    status: mapStatus(row.status),
    transferNumber: firstChild?.v2_transfers?.transfer_number ?? undefined,
    stopNumber: firstChild?.stop_order ?? undefined,
  };
}

export function mapV2Child(row: any, family: Family): Child {
  const branch = row.v2_school_branches;
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    childName: row.child_name ?? '',
    class: row.class_name ?? '',
    selfExitAllowed: Boolean(row.self_exit_allowed),
    routeSource: undefined,
    transferNumber: row.v2_transfers?.transfer_number ?? undefined,
    stopNumber: row.stop_order ?? undefined,
    timeMorning: row.time_morning ?? undefined,
    status: mapChildStatus(row.status),
    address: row.address ?? family.fullAddress,
    latitude: row.latitude ?? family.latitude,
    longitude: row.longitude ?? family.longitude,
    distanceKm: row.distance_km == null ? family.distanceKm : Number(row.distance_km),
    discountType: row.manual_discount_percent ? 'percent' : row.manual_discount_amount ? 'fixed' : 'none',
    discountValue: Number(row.manual_discount_percent || row.manual_discount_amount || 0),
    schoolCode: toSchoolCode(branch?.code),
    schoolId: row.school_id ?? undefined,
    branchId: row.branch_id ?? undefined,
    branchCode: branch?.code,
    branchName: branch?.name,
    branchShort: branch?.short_name ?? branch?.code,
    zone: normalizeZone(row.zone, family.zone) as Zone,
    vehicleType: normalizeVehicle(row.vehicle_type) as VehicleType,
    basePrice: Number(row.base_price ?? 0),
    siblingDiscountPercent: Number(row.sibling_discount_percent ?? 0),
    manualDiscountPercent: Number(row.manual_discount_percent ?? 0),
    manualDiscountAmount: Number(row.manual_discount_amount ?? 0),
    finalPrice: Number(row.final_price ?? 0),
  };
}

const CHILD_SELECT = `
  *,
  v2_school_branches(id, code, short_name, name),
  v2_transfers(id, transfer_number, driver_id)
`;

export async function fetchV2FamiliesTable(): Promise<FamilyListRow[]> {
  const [famRes, childRes, chargeRes, paymentRes, walletRes] = await Promise.all([
    supabase.from('v2_families').select('*').order('created_at', { ascending: false }),
    supabase.from('v2_children').select(CHILD_SELECT),
    supabase.from('v2_charges').select('child_id, amount, paid_amount, status'),
    supabase
      .from('v2_payments')
      .select('id, family_id, amount, status, payment_date, actual_payment_date, payment_method, comment, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('v2_family_wallets').select('family_id, main_balance'),
  ]);
  if (famRes.error) throw new Error(famRes.error.message);
  if (childRes.error) throw new Error(childRes.error.message);
  if (chargeRes.error) throw new Error(chargeRes.error.message);
  if (paymentRes.error) throw new Error(paymentRes.error.message);
  if (walletRes.error) throw new Error(walletRes.error.message);

  const childMap: Record<string, any[]> = {};
  (childRes.data ?? []).forEach((child: any) => {
    if (!childMap[child.family_id]) childMap[child.family_id] = [];
    childMap[child.family_id].push(child);
  });
  const chargeMap: Record<string, any[]> = {};
  const familyChargeMap: Record<string, any[]> = {};
  (chargeRes.data ?? []).forEach((charge: any) => {
    if (!chargeMap[charge.child_id]) chargeMap[charge.child_id] = [];
    chargeMap[charge.child_id].push(charge);
    const child = (childRes.data ?? []).find((item: any) => item.id === charge.child_id);
    if (child?.family_id) {
      if (!familyChargeMap[child.family_id]) familyChargeMap[child.family_id] = [];
      familyChargeMap[child.family_id].push(charge);
    }
  });
  const pendingPaymentByFamily: Record<string, number> = {};
  const pendingPaymentDetailsByFamily: Record<string, any> = {};
  (paymentRes.data ?? []).forEach((payment: any) => {
    if (payment.status === 'pending') {
      pendingPaymentByFamily[payment.family_id] = (pendingPaymentByFamily[payment.family_id] ?? 0) + Number(payment.amount ?? 0);
      if (!pendingPaymentDetailsByFamily[payment.family_id]) {
        pendingPaymentDetailsByFamily[payment.family_id] = payment;
      }
    }
  });
  const balanceByFamily: Record<string, number> = {};
  (walletRes.data ?? []).forEach((wallet: any) => {
    balanceByFamily[wallet.family_id] = Number(wallet.main_balance ?? 0);
  });

  const rows: FamilyListRow[] = [];
  let familyIndex = 0;
  (famRes.data ?? []).forEach((family: any) => {
    const kids = childMap[family.id] ?? [];
    const items = kids.length > 0 ? kids : [null];

    items.forEach((child: any, idx: number) => {
      const branch = child?.v2_school_branches;
      const childCharges = child ? chargeMap[child.id] ?? [] : [];
      const familyCharges = familyChargeMap[family.id] ?? [];
      const childDebt = childCharges.reduce((sum, charge) => sum + Math.max(0, Number(charge.amount ?? 0) - Number(charge.paid_amount ?? 0)), 0);
      const childPaid = childCharges.reduce((sum, charge) => sum + Number(charge.paid_amount ?? 0), 0);
      const totalCharged = familyCharges.reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0);
      const totalPaid = familyCharges.reduce((sum, charge) => sum + Number(charge.paid_amount ?? 0), 0);
      const debtAmount = familyCharges.reduce((sum, charge) => sum + Math.max(0, Number(charge.amount ?? 0) - Number(charge.paid_amount ?? 0)), 0);
      const paymentStatus = childCharges.length === 0
        ? 'no_charges'
        : childDebt <= 0
          ? 'paid'
          : childPaid > 0
            ? 'partial'
            : 'debt';
      const branchCode = branch?.code ?? '';
      const schoolCode = normalizeSchoolCode(branchCode);
      const vt = normalizeVehicle(child?.vehicle_type);
      const pendingPayment = pendingPaymentDetailsByFamily[family.id];
      rows.push({
        rowId: child ? String(child.id) : `${family.id}_empty`,
        familyId: String(family.id),
        familyIndex,
        isFirstChild: idx === 0,
        childName: child?.child_name ?? '',
        childClass: child?.class_name ?? '',
        parentName: family.parent_name ?? '',
        phone: family.phone ?? '',
        secondPhone: family.second_phone ?? '',
        contactName: family.contact_name ?? '',
        contactPhone: family.contact_phone ?? '',
        schoolId: child?.school_id ?? null,
        branchId: child?.branch_id ?? null,
        schoolCode,
        branchName: branch?.name ?? branchCode,
        branchShort: branch?.short_name ?? branchCode,
        branchFilter: branchCode === 'ING_A' ? 'ING' : branchCode,
        streetAddress: stripAddress(child?.address ?? ''),
        distanceKm: child?.distance_km == null ? null : Number(child.distance_km),
        zone: normalizeZone(child?.zone, 'A'),
        vehicleType: vt,
        vehicleLabel: '',
        monthlyPrice: Number(child?.final_price ?? child?.base_price ?? 0),
        status: mapChildStatus(child?.status),
        paymentStatus,
        transferNumber: child?.v2_transfers?.transfer_number ? String(child.v2_transfers.transfer_number) : null,
        driverId: child?.v2_transfers?.driver_id ? String(child.v2_transfers.driver_id) : null,
        stopNumber: child?.stop_order ? String(child.stop_order) : null,
        timeMorning: child?.time_morning ?? null,
        selfExitAllowed: Boolean(child?.self_exit_allowed),
        latitude: child?.latitude == null ? null : Number(child.latitude),
        longitude: child?.longitude == null ? null : Number(child.longitude),
        discountAmount: Math.max(0, Number(child?.base_price ?? 0) - Number(child?.final_price ?? 0)),
        totalCharged,
        totalPaid,
        pendingPayment: pendingPaymentByFamily[family.id] ?? 0,
        pendingPaymentId: pendingPayment?.id ? String(pendingPayment.id) : null,
        pendingPaymentAmount: Number(pendingPayment?.amount ?? 0),
        pendingPaymentDate: pendingPayment?.payment_date ?? null,
        pendingActualPaymentDate: pendingPayment?.actual_payment_date ?? null,
        pendingPaymentType: pendingPayment?.payment_method ?? null,
        pendingPaymentComment: pendingPayment?.comment ?? '',
        debtAmount,
        balance: balanceByFamily[family.id] ?? 0,
      });
    });
    familyIndex++;
  });

  return rows;
}

export async function fetchV2Family(familyId: string): Promise<Family | null> {
  const [familyRes, childRes] = await Promise.all([
    supabase.from('v2_families').select('*').eq('id', familyId).single(),
    supabase.from('v2_children').select(CHILD_SELECT).eq('family_id', familyId),
  ]);
  if (familyRes.error) return null;
  if (childRes.error) throw new Error(childRes.error.message);
  return mapV2Family(familyRes.data, childRes.data ?? []);
}

export async function fetchV2Children(family: Family): Promise<Child[]> {
  const { data, error } = await supabase
    .from('v2_children')
    .select(CHILD_SELECT)
    .eq('family_id', family.id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => mapV2Child(row, family));
}

export async function fetchV2Branches(): Promise<V2BranchOption[]> {
  const { data, error } = await supabase
    .from('v2_school_branches')
    .select('id, school_id, code, short_name, name')
    .order('code', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    schoolId: String(row.school_id),
    code: row.code ?? '',
    shortName: row.short_name ?? row.code ?? '',
    name: row.name ?? row.short_name ?? row.code ?? '',
  }));
}

export async function updateV2Family(familyId: string, updated: Family): Promise<void> {
  const { error } = await supabase.from('v2_families').update({
    parent_name: updated.parentName,
    phone: updated.phone,
    phone_telegram: Boolean(updated.phoneTelegram),
    second_phone: updated.secondPhone || null,
    contact_name: updated.contactName || null,
    contact_phone: updated.contactPhone || null,
    comment: updated.comment || null,
    status: updated.status,
  }).eq('id', familyId);
  if (error) throw new Error(error.message);
}

export async function updateV2Child(childId: string, updates: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('v2_children').update(updates).eq('id', childId);
  if (error) throw new Error(error.message);
}

export async function ensureV2Transfer(params: {
  schoolId?: string;
  branchId?: string;
  transferNumber: number;
  vehicleType: VehicleType;
}): Promise<string> {
  if (!params.branchId) throw new Error('У ребенка не указан филиал');

  const { data: existing, error: selectError } = await supabase
    .from('v2_transfers')
    .select('id')
    .eq('branch_id', params.branchId)
    .eq('transfer_number', params.transferNumber)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);
  if (existing?.id) return String(existing.id);

  const { data, error } = await supabase
    .from('v2_transfers')
    .insert({
      school_id: params.schoolId ?? null,
      branch_id: params.branchId,
      transfer_number: params.transferNumber,
      vehicle_type: params.vehicleType,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function updateV2ChildRoute(params: {
  child: Child;
  vehicleType: VehicleType;
  transferNumber?: number;
  stopNumber?: number;
  timeMorning?: string;
}): Promise<void> {
  const transferId = params.transferNumber
    ? await ensureV2Transfer({
      schoolId: params.child.schoolId,
      branchId: params.child.branchId,
      transferNumber: params.transferNumber,
      vehicleType: params.vehicleType,
    })
    : null;

  await updateV2Child(params.child.id, {
    vehicle_type: params.vehicleType,
    transfer_id: transferId,
    stop_order: params.stopNumber ?? null,
    time_morning: params.timeMorning || null,
  });
}

export async function fetchV2TransfersDashboard(): Promise<V2TransferDashboardRow[]> {
  const { data, error } = await supabase
    .from('v2_transfers')
    .select('id, school_id, branch_id, transfer_number, vehicle_type, driver_id, created_at, updated_at, v2_school_branches(id, code, short_name, name)')
    .neq('status', 'archive')
    .order('transfer_number', { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => {
    const branch = row.v2_school_branches;
    return {
      id: String(row.id),
      schoolId: row.school_id ? String(row.school_id) : null,
      branchId: row.branch_id ? String(row.branch_id) : null,
      branchCode: branch?.code ?? '',
      branchShort: branch?.short_name ?? branch?.code ?? '',
      branchName: branch?.name ?? branch?.code ?? '',
      transferNumber: row.transfer_number ? String(row.transfer_number) : '',
      vehicleType: normalizeVehicle(row.vehicle_type) as VehicleType,
      driverId: row.driver_id ? String(row.driver_id) : null,
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
    };
  });
}

export async function fetchV2DriversTable(): Promise<V2DriverTableRow[]> {
  const [driverRes, vehicleRes, transferRes, childRes] = await Promise.all([
    supabase.from('v2_drivers').select('*').order('full_name', { ascending: true }),
    supabase.from('v2_vehicles').select('*').order('created_at', { ascending: true }),
    supabase
      .from('v2_transfers')
      .select('id, school_id, branch_id, transfer_number, vehicle_type, driver_id, v2_school_branches(id, code, short_name, name)')
      .neq('status', 'archive')
      .order('transfer_number', { ascending: true }),
    supabase.from('v2_children').select('transfer_id').neq('status', 'rejected'),
  ]);
  if (driverRes.error) throw new Error(driverRes.error.message);
  if (vehicleRes.error) throw new Error(vehicleRes.error.message);
  if (transferRes.error) throw new Error(transferRes.error.message);
  if (childRes.error) throw new Error(childRes.error.message);

  const childCountByTransfer: Record<string, number> = {};
  (childRes.data ?? []).forEach((child: any) => {
    if (!child.transfer_id) return;
    const key = String(child.transfer_id);
    childCountByTransfer[key] = (childCountByTransfer[key] ?? 0) + 1;
  });

  const vehiclesByDriver: Record<string, any> = {};
  (vehicleRes.data ?? []).forEach((vehicle: any) => {
    if (vehicle.driver_id && !vehiclesByDriver[vehicle.driver_id]) {
      vehiclesByDriver[vehicle.driver_id] = vehicle;
    }
  });

  const transfersByDriver: Record<string, any[]> = {};
  (transferRes.data ?? []).forEach((transfer: any) => {
    if (!transfer.driver_id) return;
    const key = String(transfer.driver_id);
    if (!transfersByDriver[key]) transfersByDriver[key] = [];
    transfersByDriver[key].push(transfer);
  });

  return (driverRes.data ?? []).map((driver: any) => {
    const vehicle = vehiclesByDriver[driver.id];
    const transfers = transfersByDriver[driver.id] ?? [];
    const transferNumbers = transfers
      .map(transfer => transfer.transfer_number ? String(transfer.transfer_number) : '')
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
    const branchIds = Array.from(new Set(transfers.map(transfer => transfer.branch_id ? String(transfer.branch_id) : '').filter(Boolean)));
    const branchCodes = Array.from(new Set(transfers.map(transfer => transfer.v2_school_branches?.code ?? '').filter(Boolean)));
    const branchShorts = Array.from(new Set(transfers.map(transfer => transfer.v2_school_branches?.short_name ?? transfer.v2_school_branches?.code ?? '').filter(Boolean)));
    const branchNames = Array.from(new Set(transfers.map(transfer => transfer.v2_school_branches?.name ?? transfer.v2_school_branches?.code ?? '').filter(Boolean)));
    const vehicleType = (vehicle?.vehicle_type ? normalizeVehicle(vehicle.vehicle_type) : '') as VehicleType | '';
    const transferVehicleType = transfers.find(transfer => transfer.vehicle_type)?.vehicle_type;
    const fallbackVehicleType = (transferVehicleType ? normalizeVehicle(transferVehicleType) : '') as VehicleType | '';
    const type = vehicleType || fallbackVehicleType;

    return {
      rowId: String(driver.id),
      driverId: String(driver.id),
      fullName: driver.full_name ?? '',
      phone: driver.phone ?? '',
      secondPhone: driver.second_phone ?? '',
      status: driver.status ?? 'active',
      address: driver.address ?? '',
      comment: driver.comment ?? '',
      vehicleType: type,
      vehicleLabel: type ? (VT_LABEL[type] ?? type) : '',
      plateNumber: vehicle?.plate_number ?? '',
      brand: vehicle?.brand ?? '',
      model: vehicle?.model ?? '',
      seats: vehicle?.seats == null ? null : Number(vehicle.seats),
      transferNumbers: transferNumbers.map(number => `№${number}`).join(', '),
      transferCount: transfers.length,
      childrenCount: transfers.reduce((sum, transfer) => sum + (childCountByTransfer[String(transfer.id)] ?? 0), 0),
      branchIds,
      branchCodes,
      branchShorts,
      branchNames,
    };
  });
}

export async function updateV2TransferVehicleType(params: {
  schoolId?: string | null;
  branchId?: string | null;
  transferNumber: number;
  vehicleType: VehicleType;
}): Promise<string> {
  if (!params.branchId) throw new Error('Не указан филиал трансфера');

  const transferId = await ensureV2Transfer({
    schoolId: params.schoolId ?? undefined,
    branchId: params.branchId,
    transferNumber: params.transferNumber,
    vehicleType: params.vehicleType,
  });

  const { error: transferError } = await supabase
    .from('v2_transfers')
    .update({ vehicle_type: params.vehicleType })
    .eq('id', transferId);
  if (transferError) throw new Error(transferError.message);

  const { error: childrenError } = await supabase
    .from('v2_children')
    .update({ vehicle_type: params.vehicleType })
    .eq('transfer_id', transferId)
    .neq('status', 'rejected');
  if (childrenError) throw new Error(childrenError.message);

  return transferId;
}

export async function clearV2TransferVehicleType(params: {
  branchId?: string | null;
  transferNumber: number;
}): Promise<void> {
  if (!params.branchId) throw new Error('Не указан филиал трансфера');

  const { data: transfer, error: transferFindError } = await supabase
    .from('v2_transfers')
    .select('id')
    .eq('branch_id', params.branchId)
    .eq('transfer_number', params.transferNumber)
    .neq('status', 'archive')
    .maybeSingle();
  if (transferFindError) throw new Error(transferFindError.message);
  if (!transfer?.id) return;

  const { count, error: childrenCountError } = await supabase
    .from('v2_children')
    .select('id', { count: 'exact', head: true })
    .eq('transfer_id', transfer.id)
    .neq('status', 'rejected');
  if (childrenCountError) throw new Error(childrenCountError.message);
  if ((count ?? 0) > 0) {
    throw new Error('У трансфера есть дети. Сначала перенесите детей или очистите трансфер.');
  }

  const { error: archiveError } = await supabase
    .from('v2_transfers')
    .update({ status: 'archive' })
    .eq('id', transfer.id);
  if (archiveError) throw new Error(archiveError.message);
}

export async function deleteV2Child(childId: string): Promise<void> {
  const { error } = await supabase.from('v2_children').delete().eq('id', childId);
  if (error) throw new Error(error.message);
}

export async function addV2Audit(params: {
  actorName?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  comment?: string;
}): Promise<void> {
  const { error } = await supabase.from('v2_audit_log').insert({
    actor_name: params.actorName ?? 'CRM',
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    comment: params.comment ?? null,
  });
  if (error) throw new Error(error.message);
}
