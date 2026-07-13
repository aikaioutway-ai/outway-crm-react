import { formatClassName, formatName, formatPhone } from '../../utils/format';
import { ALL_PERIODS, CASHIER_PERIODS, VT_LABEL } from './constants';
import { PaymentTableRow, V2DriverDocumentInput } from '../../services/crmV2Service';
import type { ChildRow } from './FamiliesPage';

export function normalizeRows(rows: ChildRow[]): ChildRow[] {
  return rows.map(row => ({
    ...row,
    parentName: formatName(row.parentName),
    phone: formatPhone(row.phone),
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

export function childDebtorRows(rows: ChildRow[]): ChildRow[] {
  return rows.filter(row => childDebtAmount(row) > 0);
}

export function logisticsWorkRows(rows: ChildRow[]): ChildRow[] {
  return rows.filter(row => row.status !== 'rejected');
}

export function transferVehicleSummary(rows: ChildRow[]) {
  const transferMap = new Map<string, { vehicleType?: string; studentCount: number }>();

  logisticsWorkRows(rows).forEach(row => {
    if (!row.transferNumber) return;
    const branchKey = row.branchId ?? row.branchFilter ?? row.branchShort ?? row.branchName ?? 'school';
    const key = `${branchKey}:${row.transferNumber}`;
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

export function logisticsTransferCountColor(count: number): string {
  if (count <= 0) return '#C9D4D6';
  if (count < 16) return '#EF7168';
  if (count === 16) return '#E49A55';
  if (count === 17) return '#74BE92';
  return '#31A4A5';
}

export function logisticsVehicleTypeLineColor(vehicleType?: string): string | null {
  if (vehicleType === 'minivan') return '#74BE92';
  if (vehicleType === 'sedan') return '#E49A55';
  return null;
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
