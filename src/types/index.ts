// ─── ШКОЛЫ ───────────────────────────────────────────────────────────────────

export type SchoolCode =
  | 'KINGS' | 'LIGHT' | 'BILIM'
  | 'AES' | 'KAS' | 'EPSILON' | 'GENIUS' | 'GENIUS4' | 'NOVA' | 'INDIGO'
  | 'ERUDIT' | 'TENSAY' | 'EDISON';

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
  parentName: string;
  phone: string;
  phoneTelegram?: string;
  secondPhone?: string;
  contactName?: string;
  contactPhone?: string;
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
  schoolCode: SchoolCode;
  zone: Zone;
  vehicleType: VehicleType;
}

// ─── ОПЛАТЫ ──────────────────────────────────────────────────────────────────

export type PeriodKey =
  | 'deposit'
  | '9' | '10' | '11' | '12'
  | '1' | '2' | '3' | '4' | '5';

export type PaymentStatus =
  | 'Не оплачено'
  | 'На проверке'
  | 'На проверке (чек)'
  | 'Оплачено'
  | 'Частично оплачено'
  | 'Просрочено';

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

export type UserRole = 'admin' | 'manager' | 'cashier' | 'logist' | 'director';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}
