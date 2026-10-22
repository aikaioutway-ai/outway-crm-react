import { formatClassName, formatName, formatPhone } from '../../utils/format';
import { ALL_PERIODS, CASHIER_PERIODS, VT_LABEL } from './constants';
import { PaymentTableRow, V2DriverDocumentInput } from '../../services/crmV2Service';
import type { ChildRow } from './FamiliesPage';

export function normalizeRows(rows: ChildRow[]): ChildRow[] {
  return rows.map(row => ({
    ...row,
    parentName: formatName(row.parentName),
    phone: formatPhone(row.phone),
    childName: formatName(row.childName),
    childClass: formatClassName(row.childClass),
    vehicleLabel: VT_LABEL[row.vehicleType] ?? row.vehicleType,
  }));
}

export function compactMoney(value: number): string {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}м`;
  if (Math.abs(amount) >= 10000) return `${Math.round(amount / 1000)}к`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}к`;
  return Math.round(amount).toLocaleString('ru-RU');
}

export function downloadXlsxBuffer(filename: string, buffer: ArrayBuffer) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const XLSX_BRAND = {
  teal: 'FF10B981',
  tealDark: 'FF0D9B6C',
  mint: 'FFE8F4F3',
  stripe: 'FFF3FAF9',
  border: 'FFCBDEDA',
  text: 'FF17222F',
  textMuted: 'FF64748B',
  white: 'FFFFFFFF',
};

export function paymentRowMatchesPeriod(row: Pick<PaymentTableRow, 'paymentDate' | 'actualPaymentDate' | 'createdAt'>, periodKey: string): boolean {
  const period = CASHIER_PERIODS.find(item => item.key === periodKey) ?? ALL_PERIODS.find(item => item.key === periodKey);
  if (!period) return true;
  const rawDate = row.actualPaymentDate || row.paymentDate || row.createdAt;
  if (!rawDate) return false;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return false;
  return date.getMonth() + 1 === period.month && date.getFullYear() === period.year;
}

export function uniqueFamilyRows(rows: ChildRow[]): ChildRow[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (seen.has(row.familyId)) return false;
    seen.add(row.familyId);
    return true;
  });
}

export function childDebtAmount(row: ChildRow): number {
  return Number(row.childDebtAmount ?? row.debtAmount ?? 0);
}

export function logisticsWorkRows(rows: ChildRow[]): ChildRow[] {
  return rows.filter(row => row.status !== 'rejected');
}

export function isNewUnassignedRow(row: Pick<ChildRow, 'status' | 'transferNumber'>): boolean {
  return row.status === 'new' && !row.transferNumber;
}

type TransferIdentityRow = {
  transferNumber?: string | null;
  branchFilter?: string | null;
  branchId?: string | null;
  branchShort?: string | null;
  branchName?: string | null;
};

export function transferIdentityKey(row: TransferIdentityRow): string | null {
  if (!row.transferNumber) return null;
  // branchFilter is the CRM-level school/route grouping. For example,
  // Indigo Kids and Asylkech both belong to ING, so transfer #1 is one
  // transfer even though the children point to different branch rows.
  const scopeKey = row.branchFilter || row.branchId || row.branchShort || row.branchName || 'school';
  return `${scopeKey}:${row.transferNumber}`;
}

export function transferVehicleSummary(rows: ChildRow[]) {
  const transferMap = new Map<string, { vehicleType?: string; studentCount: number }>();

  logisticsWorkRows(rows).forEach(row => {
    const key = transferIdentityKey(row);
    if (!key) return;
    const prev = transferMap.get(key);
    transferMap.set(key, {
      vehicleType: prev?.vehicleType ?? row.vehicleType,
      studentCount: (prev?.studentCount ?? 0) + 1,
    });
  });

  const transfers = Array.from(transferMap.values());
  const microbusTransfers = transfers.filter(item => item.vehicleType === 'microbus');
  const minivanTransfers = transfers.filter(item => item.vehicleType === 'minivan');
  const sedanTransfers = transfers.filter(item => item.vehicleType === 'sedan');
  const microbusStudents = microbusTransfers.reduce((sum, item) => sum + item.studentCount, 0);

  return {
    transferCount: transfers.length,
    studentCount: logisticsWorkRows(rows).length,
    microbusCount: microbusTransfers.length,
    minivanCount: minivanTransfers.length,
    sedanCount: sedanTransfers.length,
    microbusAverage: microbusTransfers.length ? microbusStudents / microbusTransfers.length : 0,
  };
}

export function driverDocumentMissing(document: V2DriverDocumentInput): boolean {
  return document.required && (!document.number.trim() || !document.issuedAt || !document.expiresAt || !document.scanUrl);
}

export function driverDocumentExpired(document: V2DriverDocumentInput): boolean {
  if (!document.expiresAt) return false;
  const expires = new Date(`${document.expiresAt}T23:59:59`);
  return !Number.isNaN(expires.getTime()) && expires.getTime() < Date.now();
}

export function vehicleTypeShortLabel(vehicleType?: string): string {
  if (vehicleType === 'microbus') return 'BUS';
  if (vehicleType === 'minivan') return 'MINI';
  if (vehicleType === 'sedan') return 'CAR';
  return '';
}

export function formatDateShort(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ru-RU');
}

export function isNewLogisticsRow(row:Pick<ChildRow,'status'|'transferNumber'|'isTestTransfer'>):boolean{
  return row.status!=='rejected' && (Boolean(row.isTestTransfer) || isNewUnassignedRow(row));
}

export function matchesLogisticsMapFilter(row: Pick<ChildRow, 'status' | 'transferNumber' | 'isTestTransfer'>, transferFilter: string): boolean {
  // Отказы видны на карте только по фишке «Отказ»; в «Все» и по трансферам их нет.
  if (transferFilter === 'rejected') return row.status === 'rejected';
  if (row.status === 'rejected') return false;
  if (transferFilter === 'empty') return isNewLogisticsRow(row);
  return !transferFilter || row.transferNumber === transferFilter;
}

/** Только для показа: +996555616136 → +996 555 616 136. Значение в базе не меняется. */
export function formatPhoneDisplay(value?: string | null): string {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('996')) return `+996 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  if (digits.length === 10 && digits.startsWith('0')) return `0${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return raw;
}
