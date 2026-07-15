import { supabase } from './supabase';
import { safeStorageFileName, uploadToBucket } from './storage';
import { Child, ChildStatus, Family, SchoolCode, VehicleType, Zone } from '../types';
import { getBranchFilter, normalizeSchoolCode, normalizeVehicle, normalizeZone, VT_LABEL } from '../modules/families/constants';
import { queryClient, QK } from './queryClient';

/** Точечный сброс кэша семей/детей после мутации — вызывается вместо
 * полной перезагрузки CRM. React Query сам решит, кому из подписанных
 * компонентов сейчас нужен повторный запрос. */
export function invalidateFamiliesCache(): void {
  queryClient.invalidateQueries({ queryKey: QK.branchStats });
  queryClient.invalidateQueries({ queryKey: ['familiesTable'] });
  queryClient.invalidateQueries({ queryKey: ['familiesPage'] });
}

function derivePaymentStatus(totalCharged: number, totalPaid: number, debtAmount: number): 'no_charges' | 'paid' | 'partial' | 'debt' {
  if (totalCharged === 0) return 'no_charges';
  if (debtAmount <= 0) return 'paid';
  if (totalPaid > 0) return 'partial';
  return 'debt';
}

export interface V2BranchOption {
  id: string;
  schoolId: string;
  code: string;
  shortName: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
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
  missingDocumentCount: number;
  hasIncompleteDocuments: boolean;
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
  const path = `${driverId}/${type}/${Date.now()}_${safeStorageFileName(file.name)}`;
  return uploadToBucket('driver-documents', path, file);
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
  return (normalized || 'AES') as SchoolCode;
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

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
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
  childId: string;
  charged: number;
  paid: number;
  debt: number;
  penalty: number;
  pending: number;
}

export async function fetchChargesForPeriod(
  periodMonth: number | null,
  periodYear: number | null,
  chargeType: string | null,
): Promise<PeriodChargeStats[]> {
  if (!chargeType && (periodMonth === null || periodYear === null)) {
    throw new Error('fetchChargesForPeriod: нужно указать chargeType либо periodMonth+periodYear');
  }
  const data = await fetchAllRows<any>((from, to) => {
    let query = supabase
      .from('v2_charges')
      .select('family_id, child_id, amount, paid_amount, penalty_amount, debt_amount');
    if (chargeType) {
      query = query.eq('charge_type', chargeType);
    } else if (periodMonth !== null && periodYear !== null) {
      query = query.eq('period_month', periodMonth).eq('period_year', periodYear);
    }
    return query.range(from, to);
  });
  const pendingRows = await fetchAllRows<any>((from, to) => {
    const query = supabase
      .from('v2_payments')
      .select('family_id, amount, suggested_main_amount, suggested_deposit_amount')
      .eq('status', 'pending');
    return query.range(from, to);
  });
  const map: Record<string, PeriodChargeStats> = {};
  data.forEach((row: any) => {
    const fid = String(row.family_id);
    const childId = String(row.child_id ?? '');
    const key = childId || fid;
    if (!map[key]) map[key] = { familyId: fid, childId, charged: 0, paid: 0, debt: 0, penalty: 0, pending: 0 };
    const amount = Number(row.amount ?? 0);
    const paid = Number(row.paid_amount ?? 0);
    const penalty = Number(row.penalty_amount ?? 0);
    map[key].charged += amount;
    map[key].paid += paid;
    map[key].penalty += penalty;
    map[key].debt += Math.max(0, Number(row.debt_amount ?? amount + penalty - paid));
  });
  const pendingByFamily: Record<string, number> = {};
  pendingRows.forEach((row: any) => {
    const fid = String(row.family_id);
    const suggested = chargeType === 'deposit'
      ? Number(row.suggested_deposit_amount ?? 0)
      : Number(row.suggested_main_amount ?? 0);
    const amount = suggested > 0 ? suggested : Number(row.amount ?? 0);
    pendingByFamily[fid] = (pendingByFamily[fid] ?? 0) + amount;
  });
  Object.entries(pendingByFamily).forEach(([familyId, amount]) => {
    let remaining = amount;
    Object.values(map)
      .filter(row => row.familyId === familyId && row.debt > 0)
      .sort((a, b) => b.debt - a.debt)
      .forEach(row => {
        if (remaining <= 0) return;
        const applied = Math.min(remaining, row.debt);
        row.pending += applied;
        remaining -= applied;
      });
  });
  return Object.values(map);
}

export async function fetchV2FamiliesPendingDetails(): Promise<Record<string, any>> {
  const data = await fetchAllRows<any>((from, to) => supabase
      .from('v2_payments')
      .select('id, family_id, amount, status, payment_date, actual_payment_date, payment_method, receipt_url, comment, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(from, to));

  const map: Record<string, any> = {};
  data.forEach((p: any) => {
    if (!map[p.family_id]) map[p.family_id] = p;
  });
  return map;
}

const familiesTableInflight: Partial<Record<'withFinance' | 'base', Promise<FamilyListRow[]>>> = {};

export async function fetchV2FamiliesTableCached(): Promise<FamilyListRow[]> {
  return fetchV2FamiliesTable(false);
}

export async function fetchV2FamiliesTable(withFinance = true): Promise<FamilyListRow[]> {
  const cacheKey = withFinance ? 'withFinance' : 'base';
  if (familiesTableInflight[cacheKey]) return familiesTableInflight[cacheKey]!;

  const request = (async (): Promise<FamilyListRow[]> => {
  const [families, children, summaries, wallets, pendingMap, branches] = await Promise.all([
    fetchAllRows<any>((from, to) => supabase.from('v2_families').select('*').order('created_at', { ascending: false }).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_children').select(CHILD_SELECT).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_families_summary').select('*').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_family_wallets').select('family_id, main_balance, deposit_balance').range(from, to)),
    withFinance ? fetchV2FamiliesPendingDetails() : Promise.resolve({} as Record<string, any>),
    fetchV2Branches(),
  ]);

  const branchById: Record<string, typeof branches[number]> = {};
  branches.forEach(b => { branchById[b.id] = b; });

  const childMap: Record<string, any[]> = {};
  children.forEach((child: any) => {
    if (!childMap[child.family_id]) childMap[child.family_id] = [];
    childMap[child.family_id].push(child);
  });

  const summaryMap: Record<string, any> = {};
  summaries.forEach((s: any) => { summaryMap[s.family_id] = s; });
  const walletMap: Record<string, any> = {};
  wallets.forEach((wallet: any) => { walletMap[wallet.family_id] = wallet; });

  const rows: FamilyListRow[] = [];
  let familyIndex = 0;
  families.forEach((family: any) => {
    const kids = childMap[family.id] ?? [];
    const items = kids.length > 0 ? kids : [null];
    const s = summaryMap[family.id] ?? {};
    const wallet = walletMap[family.id] ?? {};
    const totalCharged = Number(s.total_charged ?? 0);
    const totalPaid = Number(s.total_paid ?? 0);
    const debtAmount = Number(s.debt_amount ?? 0);

    items.forEach((child: any, idx: number) => {
      const branch = child?.branch_id ? branchById[String(child.branch_id)] : null;
      const branchCode = branch?.code ?? '';
      const schoolCode = normalizeSchoolCode(branchCode);
      const vt = normalizeVehicle(child?.vehicle_type);
      const paymentStatus = derivePaymentStatus(totalCharged, totalPaid, debtAmount);
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
        allPaymentAmount: Number(s.confirmed_amount ?? 0) + Number(s.pending_amount ?? 0) + Number(s.rejected_amount ?? 0),
        childDebtAmount: debtAmount,
        debtAmount,
        balance: Number(wallet.main_balance ?? 0),
      });
    });
    familyIndex++;
  });

  return rows;
  })();

  familiesTableInflight[cacheKey] = request;
  request.finally(() => {
    delete familiesTableInflight[cacheKey];
  });
  return request;
}

export interface FamiliesPageParams {
  branchIds?: string[] | null;
  search?: string;
  childStatus?: string | null;
  hasTransfer?: boolean | null;
  transferNumber?: number | null;
  excludeRejectedChildren?: boolean;
  page?: number;
  pageSize?: number;
}

export interface FamiliesPageResult {
  rows: FamilyListRow[];
  totalFamilies: number;
  totalChildren: number;
  totalWithTransfer: number;
  totalWithoutTransfer: number;
}

const FAMILIES_PAGE_SIZE_DEFAULT = 100;

/** Постраничная загрузка таблицы семей через RPC get_families_page —
 * замена fetchV2FamiliesTable() для «Справочник»/«Заявки»: браузер получает
 * одну страницу семей (обычно 100), а не все 3000+. Строит FamilyListRow[]
 * из тех же сырых полей, что и fetchV2FamiliesTable, чтобы остальной код
 * (колонки, карточка семьи, экспорт) не заметил разницы в форме данных. */
export async function fetchV2FamiliesPage(params: FamiliesPageParams = {}): Promise<FamiliesPageResult> {
  const pageSize = params.pageSize ?? FAMILIES_PAGE_SIZE_DEFAULT;
  const page = params.page ?? 0;
  const { data, error } = await supabase.rpc('get_families_page', {
    p_branch_ids: params.branchIds && params.branchIds.length > 0 ? params.branchIds : null,
    p_search: params.search || null,
    p_child_status: params.childStatus || null,
    p_has_transfer: params.hasTransfer ?? null,
    p_transfer_number: params.transferNumber ?? null,
    p_exclude_rejected_children: params.excludeRejectedChildren ?? false,
    p_limit: pageSize,
    p_offset: page * pageSize,
  });
  if (error) throw new Error(error.message);

  const branches = await fetchV2Branches();
  const branchById: Record<string, typeof branches[number]> = {};
  branches.forEach(b => { branchById[b.id] = b; });

  const rowsByFamily: Record<string, any[]> = {};
  (data ?? []).forEach((row: any) => {
    if (!rowsByFamily[row.family_id]) rowsByFamily[row.family_id] = [];
    rowsByFamily[row.family_id].push(row);
  });

  const rows: FamilyListRow[] = [];
  let familyIndex = 0;
  let totalFamilies = 0;
  let totalChildren = 0;
  let totalWithTransfer = 0;
  let totalWithoutTransfer = 0;
  Object.values(rowsByFamily).forEach(familyRows => {
    const first = familyRows[0];
    totalFamilies = Number(first.total_families ?? 0);
    totalChildren = Number(first.total_children ?? 0);
    totalWithTransfer = Number(first.total_with_transfer ?? 0);
    totalWithoutTransfer = Number(first.total_without_transfer ?? 0);
    const totalCharged = Number(first.total_charged ?? 0);
    const totalPaid = Number(first.total_paid ?? 0);
    const debtAmount = Number(first.debt_amount ?? 0);
    const paymentStatus = derivePaymentStatus(totalCharged, totalPaid, debtAmount);

    familyRows.forEach((child: any, idx: number) => {
      const hasChild = child.child_id != null;
      const branch = child.branch_id ? branchById[String(child.branch_id)] : null;
      const branchCode = branch?.code ?? child.branch_code ?? '';
      const schoolCode = normalizeSchoolCode(branchCode);
      const vt = normalizeVehicle(child.vehicle_type);

      rows.push({
        rowId: hasChild ? String(child.child_id) : `${child.family_id}_empty`,
        familyId: String(child.family_id),
        familyIndex,
        isFirstChild: idx === 0,
        childName: child.child_name ?? '',
        childClass: child.class_name ?? '',
        parentName: child.parent_name ?? '',
        phone: child.phone ?? '',
        secondPhone: child.second_phone ?? '',
        contactName: child.contact_name ?? '',
        contactPhone: child.contact_phone ?? '',
        schoolId: child.school_id ?? null,
        branchId: child.branch_id ?? null,
        schoolCode,
        branchName: branch?.name ?? child.branch_name ?? branchCode,
        branchShort: branch?.shortName ?? child.branch_short ?? branchCode,
        branchFilter: getBranchFilter(branch?.name ?? child.branch_name ?? null, branchCode),
        streetAddress: stripAddress(child.address ?? ''),
        distanceKm: child.distance_km == null ? null : Number(child.distance_km),
        zone: normalizeZone(child.zone, 'A'),
        vehicleType: vt,
        vehicleLabel: '',
        monthlyPrice: Number(child.final_price ?? child.base_price ?? 0),
        status: mapChildStatus(child.child_status),
        paymentStatus,
        transferNumber: child.transfer_number ? String(child.transfer_number) : null,
        driverId: child.driver_id ? String(child.driver_id) : null,
        stopNumber: child.stop_order ? String(child.stop_order) : null,
        timeMorning: child.time_morning ?? null,
        selfExitAllowed: Boolean(child.self_exit_allowed),
        latitude: child.latitude == null ? null : Number(child.latitude),
        longitude: child.longitude == null ? null : Number(child.longitude),
        discountAmount: Math.max(0, Number(child.base_price ?? 0) - Number(child.final_price ?? 0)),
        totalCharged,
        totalPaid,
        paidPaymentCount: Number(first.paid_count ?? 0),
        paidPaymentAmount: Number(first.confirmed_amount ?? 0),
        pendingPayment: Number(first.pending_amount ?? 0),
        pendingPaymentCount: Number(first.pending_count ?? 0),
        pendingPaymentId: first.pending_payment_id ? String(first.pending_payment_id) : null,
        pendingPaymentAmount: Number(first.pending_payment_amount ?? first.pending_amount ?? 0),
        pendingPaymentDate: first.pending_payment_date ?? null,
        pendingActualPaymentDate: first.pending_actual_payment_date ?? null,
        pendingPaymentType: first.pending_payment_method ?? null,
        pendingPaymentReceiptUrl: first.pending_payment_receipt_url ?? null,
        pendingPaymentComment: first.pending_payment_comment ?? '',
        rejectedPaymentCount: Number(first.rejected_count ?? 0),
        rejectedPaymentAmount: Number(first.rejected_amount ?? 0),
        allPaymentCount: Number(first.paid_count ?? 0) + Number(first.pending_count ?? 0) + Number(first.rejected_count ?? 0),
        allPaymentAmount: Number(first.confirmed_amount ?? 0) + Number(first.pending_amount ?? 0) + Number(first.rejected_amount ?? 0),
        childDebtAmount: debtAmount,
        debtAmount,
        balance: Number(first.main_balance ?? 0),
      });
    });
    familyIndex++;
  });

  return { rows, totalFamilies, totalChildren, totalWithTransfer, totalWithoutTransfer };
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
    .select('id, school_id, code, short_name, name, latitude, longitude')
    .order('code', { ascending: true });
  if (error) throw new Error(error.message);
  branchesCache = (data ?? []).map((row: any) => ({
    id: String(row.id),
    schoolId: String(row.school_id),
    code: row.code ?? '',
    shortName: row.short_name ?? row.code ?? '',
    name: row.name ?? row.short_name ?? row.code ?? '',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  }));
  return branchesCache;
}

export interface BranchStat {
  branchId: string;
  branchCode: string;
  branchShort: string;
  branchName: string;
  childrenCount: number;
  newRequests: number;
  familiesCount: number;
  withTransferCount: number;
  withoutTransferCount: number;
  charged: number;
  paid: number;
  pendingCount: number;
  pendingSum: number;
  debtSum: number;
  balance: number;
}

export async function fetchBranchStats(): Promise<BranchStat[]> {
  const { data, error } = await supabase.rpc('get_branch_stats');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    branchId: String(row.branch_id),
    branchCode: row.branch_code ?? '',
    branchShort: row.branch_short ?? row.branch_code ?? '',
    branchName: row.branch_name ?? row.branch_short ?? row.branch_code ?? '',
    childrenCount: Number(row.children_count ?? 0),
    newRequests: Number(row.new_requests ?? 0),
    familiesCount: Number(row.families_count ?? 0),
    withTransferCount: Number(row.with_transfer_count ?? 0),
    withoutTransferCount: Number(row.without_transfer_count ?? 0),
    charged: Number(row.charged ?? 0),
    paid: Number(row.paid ?? 0),
    pendingCount: Number(row.pending_count ?? 0),
    pendingSum: Number(row.pending_sum ?? 0),
    debtSum: Number(row.debt_sum ?? 0),
    balance: Number(row.balance ?? 0),
  }));
}

/** Схлопывает статистику по филиалам (BranchStat[]) в статистику по вкладкам
 * школ (SCHOOL_TABS), используя ту же группировку getBranchFilter, что и
 * основная таблица — так карточки KPI остаются в 20-40 строк вместо полной
 * выборки семей/детей, но дают идентичный результат. */
export function foldBranchStatsBySchoolTab(branches: BranchStat[]): Record<string, {
  childrenCount: number;
  newRequests: number;
  familiesCount: number;
  withTransferCount: number;
  withoutTransferCount: number;
  charged: number;
  paid: number;
  pendingCount: number;
  pendingSum: number;
  debtSum: number;
  balance: number;
}> {
  const byTab: Record<string, ReturnType<typeof foldBranchStatsBySchoolTab>[string]> = {};
  branches.forEach(b => {
    const tabKey = getBranchFilter(b.branchName, b.branchCode);
    if (!byTab[tabKey]) {
      byTab[tabKey] = {
        childrenCount: 0, newRequests: 0, familiesCount: 0, withTransferCount: 0, withoutTransferCount: 0,
        charged: 0, paid: 0, pendingCount: 0, pendingSum: 0, debtSum: 0, balance: 0,
      };
    }
    const agg = byTab[tabKey];
    agg.childrenCount += b.childrenCount;
    agg.newRequests += b.newRequests;
    agg.familiesCount += b.familiesCount;
    agg.withTransferCount += b.withTransferCount;
    agg.withoutTransferCount += b.withoutTransferCount;
    agg.charged += b.charged;
    agg.paid += b.paid;
    agg.pendingCount += b.pendingCount;
    agg.pendingSum += b.pendingSum;
    agg.debtSum += b.debtSum;
    agg.balance += b.balance;
  });
  return byTab;
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
  invalidateFamiliesCache();
}

export async function updateV2Child(childId: string, updates: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('v2_children').update(updates).eq('id', childId);
  if (error) throw new Error(error.message);
  invalidateFamiliesCache();
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
  invalidateFamiliesCache();
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
  const data = await fetchAllRows<any>((from, to) => supabase
      .from('v2_transfers')
      .select('id, school_id, branch_id, transfer_number, vehicle_type, driver_id, created_at, updated_at, v2_school_branches(id, code, short_name, name)')
      .neq('status', 'archive')
      .order('transfer_number', { ascending: true })
      .range(from, to));

  return data.map((row: any) => {
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

let driversTableInflight: Promise<V2DriverTableRow[]> | null = null;

export async function fetchV2DriversTable(): Promise<V2DriverTableRow[]> {
  if (driversTableInflight) return driversTableInflight;
  const request = fetchV2DriversTableUncached();
  driversTableInflight = request;
  request.finally(() => {
    driversTableInflight = null;
  });
  return request;
}

async function fetchV2DriversTableUncached(): Promise<V2DriverTableRow[]> {
  const [drivers, vehicles, transfers, children, documents] = await Promise.all([
    fetchAllRows<any>((from, to) => supabase.from('v2_drivers').select('*').order('full_name', { ascending: true }).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_vehicles').select('*').order('created_at', { ascending: true }).range(from, to)),
    fetchAllRows<any>((from, to) => supabase
        .from('v2_transfers')
        .select('id, school_id, branch_id, transfer_number, vehicle_type, driver_id, v2_school_branches(id, code, short_name, name)')
        .neq('status', 'archive')
        .order('transfer_number', { ascending: true })
        .range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_children').select('transfer_id').neq('status', 'rejected').range(from, to)),
    fetchAllRows<any>((from, to) => supabase
      .from('v2_driver_documents')
      .select('driver_id, document_type, document_number, issued_at, expires_at, required, scan_url')
      .range(from, to)).catch(() => []),
  ]);

  const childCountByTransfer: Record<string, number> = {};
  children.forEach((child: any) => {
    if (!child.transfer_id) return;
    const key = String(child.transfer_id);
    childCountByTransfer[key] = (childCountByTransfer[key] ?? 0) + 1;
  });

  const vehiclesByDriver: Record<string, any> = {};
  vehicles.forEach((vehicle: any) => {
    if (vehicle.driver_id && !vehiclesByDriver[vehicle.driver_id]) {
      vehiclesByDriver[vehicle.driver_id] = vehicle;
    }
  });

  const transfersByDriver: Record<string, any[]> = {};
  transfers.forEach((transfer: any) => {
    if (!transfer.driver_id) return;
    const key = String(transfer.driver_id);
    if (!transfersByDriver[key]) transfersByDriver[key] = [];
    transfersByDriver[key].push(transfer);
  });

  const documentsByDriver: Record<string, any[]> = {};
  documents.forEach((document: any) => {
    if (!document.driver_id) return;
    const key = String(document.driver_id);
    if (!documentsByDriver[key]) documentsByDriver[key] = [];
    documentsByDriver[key].push(document);
  });

  return drivers.map((driver: any) => {
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
    const documentsByType = new Map<string, any>((documentsByDriver[String(driver.id)] ?? []).map(document => [String(document.document_type), document]));
    const missingDocumentCount = V2_DRIVER_DOCUMENT_TYPES.filter(defaultDocument => {
      const document = documentsByType.get(defaultDocument.type);
      const required = document?.required ?? defaultDocument.required;
      if (!required) return false;
      return !document
        || !String(document.document_number ?? '').trim()
        || !document.issued_at
        || !document.expires_at
        || !document.scan_url;
    }).length;

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
      missingDocumentCount,
      hasIncompleteDocuments: missingDocumentCount > 0,
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

export async function fetchV2DriverAdvancesForPeriod(periodMonth: number, periodYear: number): Promise<V2DriverAdvance[]> {
  if (periodMonth < 1 || periodMonth > 12 || !periodYear) return [];
  const month = String(periodMonth).padStart(2, '0');
  const startDate = `${periodYear}-${month}-01`;
  const endDate = new Date(periodYear, periodMonth, 0).toISOString().slice(0, 10);
  const data = await fetchAllRows<any>((from, to) => supabase
    .from('v2_driver_advances')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .range(from, to));

  return data.map((row: any) => ({
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

  invalidateFamiliesCache();
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
  invalidateFamiliesCache();
}

export async function deleteV2Child(childId: string): Promise<void> {
  const { error } = await supabase.from('v2_children').delete().eq('id', childId);
  if (error) throw new Error(error.message);
  invalidateFamiliesCache();
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
  invalidateFamiliesCache();
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

let cashierPaymentsInflight: Promise<CashierPaymentRow[]> | null = null;

export async function fetchCashierPaymentsTable(): Promise<CashierPaymentRow[]> {
  if (cashierPaymentsInflight) return cashierPaymentsInflight;
  const request = fetchCashierPaymentsTableUncached();
  cashierPaymentsInflight = request;
  request.finally(() => {
    cashierPaymentsInflight = null;
  });
  return request;
}

async function fetchCashierPaymentsTableUncached(): Promise<CashierPaymentRow[]> {
  const [payments, families, children] = await Promise.all([
    fetchAllRows<any>((from, to) => supabase
        .from('v2_payments')
        .select('id, family_id, amount, status, payment_method, receipt_url, payment_number, payment_date, actual_payment_date, comment, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_families').select('id, parent_name, phone').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_children').select('family_id, child_name, v2_school_branches(short_name), v2_transfers(transfer_number)').range(from, to)),
  ]);

  const familyMap: Record<string, { parentName: string; phone: string }> = {};
  families.forEach((f: any) => {
    familyMap[f.id] = { parentName: f.parent_name ?? '', phone: f.phone ?? '' };
  });

  const childrenByFamily: Record<string, { names: string[]; branchShort: string; transferNumber: string | null }> = {};
  children.forEach((c: any) => {
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

  return payments.map((p: any): CashierPaymentRow => {
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

let paymentsTableInflight: Promise<PaymentTableRow[]> | null = null;

export async function fetchPaymentsTable(): Promise<PaymentTableRow[]> {
  if (paymentsTableInflight) return paymentsTableInflight;
  const request = fetchPaymentsTableUncached();
  paymentsTableInflight = request;
  request.finally(() => {
    paymentsTableInflight = null;
  });
  return request;
}

async function fetchPaymentsTableUncached(): Promise<PaymentTableRow[]> {
  const [payments, families, children] = await Promise.all([
    fetchAllRows<any>((from, to) => supabase
        .from('v2_payments')
        .select('id, family_id, amount, status, payment_method, receipt_url, receipt_code, payment_number, payment_date, actual_payment_date, created_at')
        .order('created_at', { ascending: false })
        .range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_families').select('id, parent_name, phone').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('v2_children').select('family_id, child_name, v2_school_branches(short_name), v2_transfers(transfer_number)').range(from, to)),
  ]);

  const familyMap: Record<string, { parentName: string; phone: string }> = {};
  families.forEach((f: any) => {
    familyMap[f.id] = { parentName: f.parent_name ?? '', phone: f.phone ?? '' };
  });

  const childrenByFamily: Record<string, { names: string[]; branchShort: string; transferNumber: string | null }> = {};
  children.forEach((c: any) => {
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

  return payments.map((p: any): PaymentTableRow => {
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
