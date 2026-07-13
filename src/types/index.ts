// ─── ШКОЛЫ ───────────────────────────────────────────────────────────────────

export type SchoolCode =
  | 'LIGHT' | 'BILIM'
  | 'AES' | 'KAS' | 'EPSILON' | 'GENIUS' | 'GENIUS4' | 'NOVA' | 'INDIGO'
  | 'ERUDIT' | 'TENSAY' | 'EDISON'
  | 'KRT' | 'ABL1' | 'ABL2' | 'KLM' | 'TSL';

export interface School {
  short?: string;
  code: SchoolCode;
  name: string;
  zones: 2 | 3;
}

// ─── ТРАНСПОРТ ────────────────────────────────────────────────────────────────

export type VehicleType = 'microbus' | 'minivan' | 'sedan';
export type Zone = 'A' | 'B' | 'C';

// ─── СЕМЬЯ ───────────────────────────────────────────────────────────────────

export type FamilyStatus = 'active' | 'inactive' | 'new' | 'rejected';
export type PaymentMethod = 'наличные' | 'безнал';

export interface Family {
  id: string;
  schoolCode: SchoolCode;
  branchId?: string;
  branchCode?: string;
  branchName?: string;
  branchShort?: string;
  parentName: string;
  phone: string;
  phoneTelegram?: string;
  secondPhone?: string;
  secondPhoneTelegram?: boolean;
  contactName?: string;
  contactPhone?: string;
  contactPhoneTelegram?: boolean;
  fullAddress: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  zone: Zone;
  vehicleType: VehicleType;
  vehicleLabel?: string;
  monthlyPrice: number;
  startDate?: string;        // дата начала трансфера
  paymentMethod?: PaymentMethod; // наличные | безнал
  comment?: string;
  createdAt: string;
  status: FamilyStatus;
  transferNumber?: number;
  stopNumber?: number;
  timeMorning?: string;
  timeEvening?: string;
}

// ─── ДЕТИ ────────────────────────────────────────────────────────────────────

export interface Child {
  id: string;
  familyId: string;
  childName: string;
  class: string;
  selfExitAllowed: boolean;
  routeSource?: string;
  transferNumber?: number;
  stopNumber?: number;
  timeMorning?: string;
  status?: ChildStatus;
  address?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  discountType?: DiscountType;
  discountValue?: number;
  schoolCode: SchoolCode;
  schoolId?: string;
  branchId?: string;
  branchCode?: string;
  branchName?: string;
  branchShort?: string;
  zone: Zone;
  vehicleType: VehicleType;
  basePrice?: number;
  siblingDiscountPercent?: number;
  manualDiscountPercent?: number;
  manualDiscountAmount?: number;
  finalPrice?: number;
}

// ─── ОПЛАТЫ ──────────────────────────────────────────────────────────────────

export type PeriodKey =
  | 'deposit'
  | '9' | '10' | '11' | '12'
  | '1' | '2' | '3' | '4' | '5';

export type PaymentStatus =
  | 'Не оплачено'
  | 'Оплачено'
  | 'Частично оплачено'
  | 'Просрочено'
  | 'Заморожено';

export type PaymentReviewStatus =
  | 'Черновик'
  | 'На проверке'
  | 'Подтверждено'
  | 'Отклонено';

export type PaymentType = 'cash' | 'transfer' | 'card' | 'other';
export type ChildStatus = 'new' | 'waiting' | 'boarded' | 'rejected' | 'paused';
export type DiscountType = 'none' | 'percent' | 'fixed';

// Legacy shape kept for old code paths during migration.
export interface Payment {
  id: string;
  familyId: string;
  schoolCode: SchoolCode;
  periodKey: PeriodKey;
  month: number;   // 0=депозит, 9-12=осень, 1-5=весна
  year: number;
  amount: number;          // начислено
  managerAmount: number;   // внёс менеджер
  managerDate: string;
  hasReceipt: boolean;
  accountantStatus: PaymentStatus;
  factAmount: number;      // подтверждено кассиром
  factDate: string;
  isFrozen: boolean;       // пеня заморожена
  comment: string;
}

export interface Charge {
  id: string;
  childId: string;
  familyId: string;
  childName?: string;
  periodMonth: number;
  year: number;
  chargeType?: string;
  amount: number;
  paidAmount: number;
  debtAmount: number;
  penaltyAmount: number;
  status: PaymentStatus;
  isFrozen: boolean;
  comment?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FamilyPayment {
  id: string;
  familyId: string;
  periodMonth?: number;
  year?: number;
  amount: number;
  paymentType: PaymentType;
  receiptUrl?: string;
  paymentDate: string;
  actualPaymentDate?: string;
  status: PaymentReviewStatus;
  createdBy?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  comment?: string;
  createdAt: string;
}

export interface PaymentItem {
  id: string;
  paymentId: string;
  childId: string;
  familyId: string;
  periodMonth: number;
  year: number;
  chargedAmount: number;
  paidAmount: number;
  debtAmount: number;
  status: PaymentStatus;
  createdAt: string;
}

export interface FinanceSnapshot {
  charges: Charge[];
  payments: FamilyPayment[];
  paymentItems: PaymentItem[];
  mainBalance?: number;
  depositBalance?: number;
}

// ─── АУДИТ ───────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  familyId: string;
  userName: string;
  action: string;
  field: string;
  oldValue: string;
  newValue: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

// ─── РОЛИ ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'cashier' | 'logist' | 'senior_logist' | 'director' | 'gen_director';
export type EmployeeRole = UserRole | 'driver';
export type EmployeeStatus = 'active' | 'inactive' | 'dismissed';

export interface Employee {
  id: string;
  fullName: string;
  login: string;
  role: EmployeeRole;
  position: string;
  phone1: string;
  phone2?: string;
  address?: string;
  schoolKeys: string[];
  status: EmployeeStatus;
  startDate?: string;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}
