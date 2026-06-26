import { supabase } from './supabase';
import { Child, ChildStatus, Family, SchoolCode, VehicleType, Zone } from '../types';
import { getBranchFilter, normalizeSchoolCode, normalizeVehicle, normalizeZone, VT_LABEL } from '../modules/families/constants';

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

export type V2DriverDocumentType =
  | 'license'
  | 'contract'
  | 'insurance'
  | 'patent'
  | 'vehicle_certificate'
  | 'driver_license'
  | 'passport';

export interface V2DriverDocumentRow {
  id?: string;
  driverId: string;
  type: V2DriverDocumentType;
  title: string;
  number: string;
  issuedAt: string;
  expiresAt: string;
  required: boolean;
  scanUrl: string;
  scanFile?: File | null;
}

export type V2DriverDocumentInput = Omit<V2DriverDocumentRow, 'id' | 'driverId'>;

export const V2_DRIVER_DOCUMENT_TYPES: { type: V2DriverDocumentType; title: string; required: boolean }[] = [
  { type: 'license', title: 'Лицензия', required: true },
  { type: 'contract', title: 'Договор', required: true },
  { type: 'insurance', title: 'Страхование', required: true },
  { type: 'patent', title: 'Патент', required: true },
  { type: 'vehicle_certificate', title: 'Свидетельство ТС', required: true },
  { type: 'driver_license', title: 'Права', required: true },
  { type: 'passport', title: 'Паспорт', required: true },
];

export function createDefaultV2DriverDocuments(): V2DriverDocumentInput[] {
  return V2_DRIVER_DOCUMENT_TYPES.map(item => ({
    type: item.type,
    title: item.title,
    number: '',
    issuedAt: '',
    expiresAt: '',
    required: item.required,
    scanUrl: '',
    scanFile: null,
  }));
}

export interface NewV2DriverInput {
  fullName: string;
  phone: string;
  secondPhone?: string;
  address?: string;
  districts?: string[];
  branchId?: string;
  schoolId?: string;
  transferNumber?: number;
  vehicleType?: VehicleType;
  plateNumber?: string;
  brand?: string;
  model?: string;
  seats?: number | null;
  comment?: string;
  documents?: V2DriverDocumentInput[];
}

export interface UpdateV2DriverInput {
  fullName: string;
  phone: string;
  secondPhone?: string;
  address?: string;
  districts?: string[];
  status: string;
  comment?: string;
  vehicleType?: VehicleType | '';
  plateNumber?: string;
  brand?: string;
  model?: string;
  seats?: number | null;
}

export interface V2DriverAdvance {
  id: string;
  driverId: string;
  amount: number;
  date: string;
  comment: string;
  createdAt: string;
}

function normalizeDriverDocuments(driverId: string, rows: any[]): V2DriverDocumentRow[] {
  const byType = new Map<string, any>((rows ?? []).map(row => [String(row.document_type), row]));
  return V2_DRIVER_DOCUMENT_TYPES.map(defaultDoc => {
    const row = byType.get(defaultDoc.type);
    return {
      id: row?.id ? String(row.id) : undefined,
      driverId,
      type: defaultDoc.type,
      title: row?.title ?? defaultDoc.title,
      number: row?.document_number ?? '',
      issuedAt: row?.issued_at ?? '',
      expiresAt: row?.expires_at ?? '',
      required: row?.required ?? defaultDoc.required,
      scanUrl: row?.scan_url ?? '',
      scanFile: null,
    };
  });
}

async function uploadV2DriverDocumentScan(driverId: string, type: V2DriverDocumentType, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${driverId}/${type}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from('driver-documents')
    .upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('driver-documents').getPublicUrl(path);
  return data.publicUrl;
}

async function prepareV2DriverDocumentsForSave(driverId: string, documents: V2DriverDocumentInput[]) {
  return Promise.all(documents.map(async document => {
    const scanUrl = document.scanFile
      ? await uploadV2DriverDocumentScan(driverId, document.type, document.scanFile)
      : document.scanUrl;
    return {
      driver_id: driverId,
      document_type: document.type,
      title: document.title.trim() || V2_DRIVER_DOCUMENT_TYPES.find(item => item.type === document.type)?.title || document.type,
      document_number: document.number.trim() || null,
      issued_at: document.issuedAt || null,
      expires_at: document.expiresAt || null,
      required: document.required,
      scan_url: scanUrl || null,
    };
  }));
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
  paidPaymentCount: number;
  paidPaymentAmount: number;
  pendingPayment: number;
  pendingPaymentCount: number;
  pendingPaymentId: string | null;
  pendingPaymentAmount: number;
  pendingPaymentDate: string | null;
  pendingActualPaymentDate: string | null;
  pendingPaymentType: string | null;
  pendingPaymentReceiptUrl: string | null;
  pendingPaymentComment: string;
  rejectedPaymentCount: number;
  rejectedPaymentAmount: number;
  allPaymentCount: number;
  allPaymentAmount: number;
  childDebtAmount: number;
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

export interface PeriodChargeStats {
  familyId: string;
  charged: number;
  paid: number;
  debt: number;
}

export async function fetchChargesForPeriod(
  periodMonth: number | null,
  periodYear: number | null,
  chargeType: string | null,
): Promise<PeriodChargeStats[]> {
  let query = supabase
    .from('v2_charges')
    .select('family_id, amount, paid_amount');
  if (chargeType) {
    query = query.eq('charge_type', chargeType);
  } else if (periodMonth !== null && periodYear !== null) {
    query = query.eq('period_month', periodMonth).eq('period_year', periodYear);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const map: Record<string, PeriodChargeStats> = {};
  (data ?? []).forEach((row: any) => {
    const fid = String(row.family_id);
    if (!map[fid]) map[fid] = { familyId: fid, charged: 0, paid: 0, debt: 0 };
    const amount = Number(row.amount ?? 0);
    const paid = Number(row.paid_amount ?? 0);
    map[fid].charged += amount;
    map[fid].paid += paid;
    map[fid].debt += Math.max(0, amount - paid);
  });
  return Object.values(map);
}

export interface FamiliesRPCResult {
  rows: FamilyListRow[];
  totalFamilies: number;
}

export async function fetchV2FamiliesRPC(
  search: string = '',
  limit: number = 150,
  offset: number = 0,
): Promise<FamiliesRPCResult> {
  const { data, error } = await supabase.rpc('get_families_table', {
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);

  const rows: FamilyListRow[] = [];
  let totalFamilies = 0;
  let familyIndex = 0;
  let prevFamilyId = '';

  (data ?? []).forEach((row: any, idx: number) => {
    if (idx === 0) totalFamilies = Number(row.total_families ?? 0);
    if (row.family_id !== prevFamilyId) { familyIndex++; prevFamilyId = row.family_id; }

    const branchCode = row.branch_code ?? '';
    const schoolCode = normalizeSchoolCode(branchCode);
    const vt = normalizeVehicle(row.vehicle_type);
    const childChargedTotal = 0;
    const childPaid = 0;
    const childDebt = 0;
    const totalCharged = Number(row.total_charged ?? 0);
    const totalPaid = Number(row.total_paid ?? 0);
    const debtAmount = Math.max(0, totalCharged - totalPaid);
    const paymentStatus = totalCharged === 0
      ? 'no_charges'
      : debtAmount <= 0
        ? 'paid'
        : totalPaid > 0
          ? 'partial'
          : 'debt';

    rows.push({
      rowId: row.child_id ?? `${row.family_id}_empty`,
      familyId: String(row.family_id),
      familyIndex,
      isFirstChild: idx === 0 || (data[idx - 1]?.family_id !== row.family_id),
      childName: row.child_name ?? '',
      childClass: row.class_name ?? '',
      parentName: row.parent_name ?? '',
      phone: row.phone ?? '',
      secondPhone: row.second_phone ?? '',
      contactName: row.contact_name ?? '',
      contactPhone: row.contact_phone ?? '',
      schoolId: row.school_id ?? null,
      branchId: row.branch_id ?? null,
      schoolCode,
      branchName: row.branch_name ?? branchCode,
      branchShort: row.branch_short ?? branchCode,
      branchFilter: getBranchFilter(row.branch_name ?? null, branchCode),
      streetAddress: stripAddress(row.address ?? ''),
      distanceKm: row.distance_km == null ? null : Number(row.distance_km),
      zone: normalizeZone(row.zone, 'A'),
      vehicleType: vt,
      vehicleLabel: '',
      monthlyPrice: Number(row.final_price ?? row.base_price ?? 0),
      status: mapChildStatus(row.child_status),
      paymentStatus,
      transferNumber: row.transfer_number ? String(row.transfer_number) : null,
      driverId: row.driver_id ? String(row.driver_id) : null,
      stopNumber: row.stop_order ? String(row.stop_order) : null,
      timeMorning: row.time_morning ?? null,
      selfExitAllowed: Boolean(row.self_exit_allowed),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      discountAmount: Math.max(0, Number(row.base_price ?? 0) - Number(row.final_price ?? 0)),
      totalCharged,
      totalPaid,
      paidPaymentCount: Number(row.paid_count ?? 0),
      paidPaymentAmount: Number(row.paid_amount_sum ?? 0),
      pendingPayment: Number(row.pending_amount ?? 0),
      pendingPaymentCount: Number(row.pending_count ?? 0),
      pendingPaymentId: row.pending_payment_id ?? null,
      pendingPaymentAmount: Number(row.pending_amount ?? 0),
      pendingPaymentDate: row.pending_payment_date ?? null,
      pendingActualPaymentDate: row.pending_actual_date ?? null,
      pendingPaymentType: row.pending_method ?? null,
      pendingPaymentReceiptUrl: row.pending_receipt ?? null,
      pendingPaymentComment: row.pending_comment ?? '',
      rejectedPaymentCount: Number(row.rejected_count ?? 0),
      rejectedPaymentAmount: Number(row.rejected_amount ?? 0),
      allPaymentCount: Number(row.paid_count ?? 0) + Number(row.rejected_count ?? 0) + Number(row.pending_count ?? 0),
      allPaymentAmount: Number(row.paid_amount_sum ?? 0),
      childDebtAmount: debtAmount,
      debtAmount,
      balance: Number(row.balance ?? 0),
    });
  });

  return { rows, totalFamilies };
}

export async function fetchV2FamiliesPendingDetails(): Promise<Record<string, any>> {
  const { data } = await supabase
    .from('v2_payments')
    .select('id, family_id, amount, status, payment_date, actual_payment_date, payment_method, receipt_url, comment, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const map: Record<string, any> = {};
  (data ?? []).forEach((p: any) => {
    if (!map[p.family_id]) map[p.family_id] = p;
  });
  return map;
}

export async function fetchV2FamiliesTable(withFinance = true): Promise<FamilyListRow[]> {
  const [famRes, childRes, summaryRes, pendingMap, branches] = await Promise.all([
    supabase.from('v2_families').select('*').order('created_at', { ascending: false }),
    supabase.from('v2_children').select(CHILD_SELECT),
    supabase.from('v2_families_summary').select('*'),
    withFinance ? fetchV2FamiliesPendingDetails() : Promise.resolve({} as Record<string, any>),
    fetchV2Branches(),
  ]);
  if (famRes.error) throw new Error(famRes.error.message);
  if (childRes.error) throw new Error(childRes.error.message);

  const branchById: Record<string, typeof branches[number]> = {};
  branches.forEach(b => { branchById[b.id] = b; });

  const childMap: Record<string, any[]> = {};
  (childRes.data ?? []).forEach((child: any) => {
    if (!childMap[child.family_id]) childMap[child.family_id] = [];
    childMap[child.family_id].push(child);
  });

  const summaryMap: Record<string, any> = {};
  (summaryRes.data ?? []).forEach((s: any) => { summaryMap[s.family_id] = s; });

  const rows: FamilyListRow[] = [];
  let familyIndex = 0;
  (famRes.data ?? []).forEach((family: any) => {
    const kids = childMap[family.id] ?? [];
    const items = kids.length > 0 ? kids : [null];
    const s = summaryMap[family.id] ?? {};
    const totalCharged = Number(s.total_charged ?? 0);
    const totalPaid = Number(s.total_paid ?? 0);
    const debtAmount = Number(s.debt_amount ?? 0);

    items.forEach((child: any, idx: number) => {
      const branch = child?.branch_id ? branchById[String(child.branch_id)] : null;
      const branchCode = branch?.code ?? '';
      const schoolCode = normalizeSchoolCode(branchCode);
      const vt = normalizeVehicle(child?.vehicle_type);
      const paymentStatus = totalCharged === 0
        ? 'no_charges'
        : debtAmount <= 0
          ? 'paid'
          : totalPaid > 0
            ? 'partial'
            : 'debt';
      const pp = pendingMap[family.id];

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
        branchShort: branch?.shortName ?? branchCode,
        branchFilter: getBranchFilter(branch?.name ?? null, branchCode),
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
        paidPaymentCount: Number(s.paid_count ?? 0),
        paidPaymentAmount: Number(s.confirmed_amount ?? 0),
        pendingPayment: Number(s.pending_amount ?? 0),
        pendingPaymentCount: Number(s.pending_count ?? 0),
        pendingPaymentId: pp?.id ? String(pp.id) : null,
        pendingPaymentAmount: Number(pp?.amount ?? s.pending_amount ?? 0),
        pendingPaymentDate: pp?.payment_date ?? null,
        pendingActualPaymentDate: pp?.actual_payment_date ?? null,
        pendingPaymentType: pp?.payment_method ?? null,
        pendingPaymentReceiptUrl: pp?.receipt_url ?? null,
        pendingPaymentComment: pp?.comment ?? '',
        rejectedPaymentCount: Number(s.rejected_count ?? 0),
        rejectedPaymentAmount: Number(s.rejected_amount ?? 0),
        allPaymentCount: Number(s.paid_count ?? 0) + Number(s.pending_count ?? 0) + Number(s.rejected_count ?? 0),
        allPaymentAmount: Number(s.confirmed_amount ?? 0),
        childDebtAmount: debtAmount,
        debtAmount,
        balance: Number(s.balance ?? 0),
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

let branchesCache: V2BranchOption[] | null = null;

export async function fetchV2Branches(): Promise<V2BranchOption[]> {
  if (branchesCache) return branchesCache;
  const { data, error } = await supabase
    .from('v2_school_branches')
    .select('id, school_id, code, short_name, name')
    .order('code', { ascending: true });
  if (error) throw new Error(error.message);
  branchesCache = (data ?? []).map((row: any) => ({
    id: String(row.id),
    schoolId: String(row.school_id),
    code: row.code ?? '',
    shortName: row.short_name ?? row.code ?? '',
    name: row.name ?? row.short_name ?? row.code ?? '',
  }));
  return branchesCache;
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

export async function createV2Child(family: Family, input: Partial<Child> & { childName: string }): Promise<Child> {
  const { data, error } = await supabase
    .from('v2_children')
    .insert({
      family_id: family.id,
      child_name: input.childName,
      class_name: input.class ?? null,
      self_exit_allowed: Boolean(input.selfExitAllowed),
      school_id: input.schoolId ?? null,
      branch_id: input.branchId ?? null,
      address: input.address ?? family.fullAddress ?? null,
      latitude: input.latitude ?? family.latitude ?? null,
      longitude: input.longitude ?? family.longitude ?? null,
      distance_km: input.distanceKm ?? family.distanceKm ?? null,
      zone: input.zone ?? family.zone ?? 'A',
      vehicle_type: input.vehicleType ?? family.vehicleType ?? 'microbus',
      base_price: input.basePrice ?? input.finalPrice ?? 0,
      sibling_discount_percent: input.siblingDiscountPercent ?? 0,
      manual_discount_percent: input.manualDiscountPercent ?? 0,
      manual_discount_amount: input.manualDiscountAmount ?? 0,
      final_price: input.finalPrice ?? input.basePrice ?? 0,
      status: input.status ?? 'new',
    })
    .select(CHILD_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapV2Child(data, family);
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

export async function createV2Driver(input: NewV2DriverInput): Promise<string> {
  const districtsText = input.districts?.length ? `Районы: ${input.districts.join(', ')}` : '';
  const comment = [districtsText, input.comment ?? ''].filter(Boolean).join('\n');

  const { data: driver, error: driverError } = await supabase
    .from('v2_drivers')
    .insert({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      second_phone: input.secondPhone?.trim() || null,
      address: input.address?.trim() || null,
      status: input.transferNumber ? 'active' : 'vacation',
      comment: comment || null,
    })
    .select('id')
    .single();
  if (driverError) throw new Error(driverError.message);

  const driverId = String(driver.id);
  let vehicleId: string | null = null;

  if (input.vehicleType || input.plateNumber || input.brand || input.model || input.seats) {
    const { data: vehicle, error: vehicleError } = await supabase
      .from('v2_vehicles')
      .insert({
        driver_id: driverId,
        vehicle_type: input.vehicleType ?? null,
        plate_number: input.plateNumber?.trim() || null,
        brand: input.brand?.trim() || null,
        model: input.model?.trim() || null,
        seats: input.seats ?? null,
        status: 'active',
      })
      .select('id')
      .single();
    if (vehicleError) throw new Error(vehicleError.message);
    vehicleId = String(vehicle.id);
  }

  if (input.branchId && input.transferNumber && input.vehicleType) {
    const transferId = await ensureV2Transfer({
      schoolId: input.schoolId,
      branchId: input.branchId,
      transferNumber: input.transferNumber,
      vehicleType: input.vehicleType,
    });
    const { error: transferError } = await supabase
      .from('v2_transfers')
      .update({
        driver_id: driverId,
        vehicle_id: vehicleId,
        vehicle_type: input.vehicleType,
        status: 'active',
      })
      .eq('id', transferId);
    if (transferError) throw new Error(transferError.message);
  }

  const documents = input.documents ?? createDefaultV2DriverDocuments();
  if (documents.length) {
    const preparedDocuments = await prepareV2DriverDocumentsForSave(driverId, documents);
    const { error: documentsError } = await supabase
      .from('v2_driver_documents')
      .upsert(preparedDocuments, { onConflict: 'driver_id,document_type' });
    if (documentsError) throw new Error(documentsError.message);
  }

  return driverId;
}

export async function fetchV2DriverDocuments(driverId: string): Promise<V2DriverDocumentRow[]> {
  const { data, error } = await supabase
    .from('v2_driver_documents')
    .select('*')
    .eq('driver_id', driverId);
  if (error) throw new Error(error.message);
  return normalizeDriverDocuments(driverId, data ?? []);
}

export async function saveV2DriverDocuments(driverId: string, documents: V2DriverDocumentInput[]): Promise<void> {
  const preparedDocuments = await prepareV2DriverDocumentsForSave(driverId, documents);
  const { error } = await supabase
    .from('v2_driver_documents')
    .upsert(preparedDocuments, { onConflict: 'driver_id,document_type' });
  if (error) throw new Error(error.message);
}

export async function updateV2Driver(driverId: string, input: UpdateV2DriverInput): Promise<void> {
  const districtsText = input.districts?.length ? `Районы: ${input.districts.join(', ')}` : '';
  const comment = [districtsText, input.comment?.trim() ?? ''].filter(Boolean).join('\n') || null;

  const { error: driverError } = await supabase
    .from('v2_drivers')
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      second_phone: input.secondPhone?.trim() || null,
      address: input.address?.trim() || null,
      status: input.status || 'active',
      comment,
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverId);
  if (driverError) throw new Error(driverError.message);

  const { data: existingVehicle, error: vehicleLookupError } = await supabase
    .from('v2_vehicles')
    .select('id')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (vehicleLookupError) throw new Error(vehicleLookupError.message);

  const hasVehicleData = input.vehicleType || input.plateNumber || input.brand || input.model || input.seats;

  const vehiclePayload = {
    driver_id: driverId,
    vehicle_type: input.vehicleType || null,
    plate_number: input.plateNumber?.trim() || null,
    brand: input.brand?.trim() || null,
    model: input.model?.trim() || null,
    seats: input.seats ?? null,
    status: 'active',
    updated_at: new Date().toISOString(),
  };

  if (existingVehicle?.id) {
    const { error } = await supabase
      .from('v2_vehicles')
      .update(vehiclePayload)
      .eq('id', existingVehicle.id);
    if (error) throw new Error(error.message);
    return;
  }

  if (hasVehicleData) {
    const { error } = await supabase
      .from('v2_vehicles')
      .insert(vehiclePayload);
    if (error) throw new Error(error.message);
  }
}

export async function fetchV2DriverAdvances(driverId: string): Promise<V2DriverAdvance[]> {
  const { data, error } = await supabase
    .from('v2_driver_advances')
    .select('*')
    .eq('driver_id', driverId)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    driverId: String(row.driver_id),
    amount: Number(row.amount),
    date: row.date ?? '',
    comment: row.comment ?? '',
    createdAt: row.created_at ?? '',
  }));
}

export async function createV2DriverAdvance(driverId: string, amount: number, date: string, comment: string): Promise<V2DriverAdvance> {
  const { data, error } = await supabase
    .from('v2_driver_advances')
    .insert({ driver_id: driverId, amount, date, comment: comment.trim() || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: String(data.id),
    driverId: String(data.driver_id),
    amount: Number(data.amount),
    date: data.date ?? '',
    comment: data.comment ?? '',
    createdAt: data.created_at ?? '',
  };
}

export async function deleteV2DriverAdvance(advanceId: string): Promise<void> {
  const { error } = await supabase
    .from('v2_driver_advances')
    .delete()
    .eq('id', advanceId);
  if (error) throw new Error(error.message);
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

  const { error } = await supabase
    .from('v2_transfers')
    .update({ vehicle_type: null })
    .eq('id', transfer.id);
  if (error) throw new Error(error.message);
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

export async function deleteV2Family(familyId: string): Promise<void> {
  const { error } = await supabase.from('v2_families').delete().eq('id', familyId);
  if (error) throw new Error(error.message);
}

// crm_page_filters: id uuid pk, mode text, tab_key text, metric text, vehicle_filter text, updated_at timestamptz
// unique(mode, tab_key)
export interface PageFilterSettings {
  mode: string;
  tab_key: string;
  metric: string;
  vehicle_filter: string;
}

export async function fetchPageFilters(mode: string): Promise<PageFilterSettings[]> {
  const { data } = await supabase
    .from('crm_page_filters')
    .select('mode, tab_key, metric, vehicle_filter')
    .eq('mode', mode);
  return data ?? [];
}

export async function savePageFilter(settings: PageFilterSettings): Promise<void> {
  const { error } = await supabase
    .from('crm_page_filters')
    .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'mode,tab_key' });
  if (error) throw new Error(error.message);
}

export interface CashierPaymentRow {
  id: string;
  paymentNumber: number | null;
  familyId: string;
  parentName: string;
  phone: string;
  childrenNames: string;
  branchShort: string;
  transferNumber: string | null;
  amount: number;
  status: string;
  paymentMethod: string | null;
  receiptUrl: string | null;
  paymentDate: string | null;
  actualPaymentDate: string | null;
  comment: string;
  createdAt: string;
}

export async function fetchCashierPaymentsTable(): Promise<CashierPaymentRow[]> {
  const [paymentRes, familyRes, childRes] = await Promise.all([
    supabase
      .from('v2_payments')
      .select('id, family_id, amount, status, payment_method, receipt_url, payment_number, payment_date, actual_payment_date, comment, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase.from('v2_families').select('id, parent_name, phone'),
    supabase.from('v2_children').select('family_id, child_name, v2_school_branches(short_name), v2_transfers(transfer_number)'),
  ]);

  const familyMap: Record<string, { parentName: string; phone: string }> = {};
  (familyRes.data ?? []).forEach((f: any) => {
    familyMap[f.id] = { parentName: f.parent_name ?? '', phone: f.phone ?? '' };
  });

  const childrenByFamily: Record<string, { names: string[]; branchShort: string; transferNumber: string | null }> = {};
  (childRes.data ?? []).forEach((c: any) => {
    if (!childrenByFamily[c.family_id]) {
      const branch = Array.isArray(c.v2_school_branches) ? c.v2_school_branches[0] : c.v2_school_branches;
      const transfer = Array.isArray(c.v2_transfers) ? c.v2_transfers[0] : c.v2_transfers;
      childrenByFamily[c.family_id] = {
        names: [],
        branchShort: branch?.short_name ?? '',
        transferNumber: transfer?.transfer_number ? String(transfer.transfer_number) : null,
      };
    }
    const parts = (c.child_name ?? '').trim().split(' ');
    const name = parts[1] ?? parts[0] ?? '';
    if (name) childrenByFamily[c.family_id].names.push(name);
  });

  return (paymentRes.data ?? []).map((p: any): CashierPaymentRow => {
    const family = familyMap[p.family_id] ?? { parentName: '', phone: '' };
    const children = childrenByFamily[p.family_id];
    return {
      id: String(p.id),
      paymentNumber: p.payment_number ?? null,
      familyId: String(p.family_id),
      parentName: family.parentName,
      phone: family.phone,
      childrenNames: children?.names.join(', ') ?? '',
      branchShort: children?.branchShort ?? '',
      transferNumber: children?.transferNumber ?? null,
      amount: Number(p.amount ?? 0),
      status: p.status ?? '',
      paymentMethod: p.payment_method ?? null,
      receiptUrl: p.receipt_url ?? null,
      paymentDate: p.payment_date ?? null,
      actualPaymentDate: p.actual_payment_date ?? null,
      comment: p.comment ?? '',
      createdAt: String(p.created_at ?? ''),
    };
  });
}

export interface PaymentTableRow {
  id: string;
  paymentNumber: number | null;
  familyId: string;
  parentName: string;
  phone: string;
  childrenNames: string;
  branchShort: string;
  transferNumber: string | null;
  amount: number;
  status: string;
  paymentMethod: string | null;
  receiptUrl: string | null;
  receiptCode: string | null;
  paymentDate: string | null;
  actualPaymentDate: string | null;
  createdAt: string;
}

export async function fetchPaymentsTable(): Promise<PaymentTableRow[]> {
  const [paymentRes, familyRes, childRes] = await Promise.all([
    supabase
      .from('v2_payments')
      .select('id, family_id, amount, status, payment_method, receipt_url, receipt_code, payment_number, payment_date, actual_payment_date, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('v2_families').select('id, parent_name, phone'),
    supabase.from('v2_children').select('family_id, child_name, v2_school_branches(short_name), v2_transfers(transfer_number)'),
  ]);

  const familyMap: Record<string, { parentName: string; phone: string }> = {};
  (familyRes.data ?? []).forEach((f: any) => {
    familyMap[f.id] = { parentName: f.parent_name ?? '', phone: f.phone ?? '' };
  });

  const childrenByFamily: Record<string, { names: string[]; branchShort: string; transferNumber: string | null }> = {};
  (childRes.data ?? []).forEach((c: any) => {
    if (!childrenByFamily[c.family_id]) {
      const branch = Array.isArray(c.v2_school_branches) ? c.v2_school_branches[0] : c.v2_school_branches;
      const transfer = Array.isArray(c.v2_transfers) ? c.v2_transfers[0] : c.v2_transfers;
      childrenByFamily[c.family_id] = {
        names: [],
        branchShort: branch?.short_name ?? '',
        transferNumber: transfer?.transfer_number ? String(transfer.transfer_number) : null,
      };
    }
    const parts = (c.child_name ?? '').trim().split(' ');
    const name = parts[1] ?? parts[0] ?? '';
    if (name) childrenByFamily[c.family_id].names.push(name);
  });

  return (paymentRes.data ?? []).map((p: any): PaymentTableRow => {
    const family = familyMap[p.family_id] ?? { parentName: '', phone: '' };
    const children = childrenByFamily[p.family_id];
    return {
      id: String(p.id),
      paymentNumber: p.payment_number ?? null,
      familyId: String(p.family_id),
      parentName: family.parentName,
      phone: family.phone,
      childrenNames: children?.names.join(', ') ?? '',
      branchShort: children?.branchShort ?? '',
      transferNumber: children?.transferNumber ?? null,
      amount: Number(p.amount ?? 0),
      status: p.status ?? '',
      paymentMethod: p.payment_method ?? null,
      receiptUrl: p.receipt_url ?? null,
      receiptCode: p.receipt_code ?? null,
      paymentDate: p.payment_date ?? null,
      actualPaymentDate: p.actual_payment_date ?? null,
      createdAt: String(p.created_at ?? ''),
    };
  });
}
