import { SchoolCode, Zone, VehicleType } from '../types';

// ─── ТАРИФЫ ──────────────────────────────────────────────────────────────────

const PRICE_RULES: Record<SchoolCode, { zone1: number; zone2: number; zone3: number | null }> = {
  KINGS:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  LIGHT:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  BILIM:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  AES:     { zone1: 5500, zone2: 6000, zone3: 6500 },
  KAS:     { zone1: 5500, zone2: 6000, zone3: 6500 },
  EPSILON: { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS4: { zone1: 5500, zone2: 6000, zone3: 6500 },
  NOVA:    { zone1: 5500, zone2: 6000, zone3: 6500 },
  INDIGO:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  ERUDIT:  { zone1: 6000, zone2: 6500, zone3: null },
  TENSAY:  { zone1: 6400, zone2: 6800, zone3: null },
  EDISON:  { zone1: 6500, zone2: 7000, zone3: null },
};

export function getPriceByZone(schoolCode: SchoolCode, zone: Zone, vehicleType: VehicleType): number {
  if (vehicleType === 'minivan') return 9500;
  if (vehicleType === 'sedan')   return 10500;

  const rule = PRICE_RULES[schoolCode];
  if (!rule) return 0;

  if (zone === 'A') return rule.zone1;
  if (zone === 'B') return rule.zone2;
  if (zone === 'C') return rule.zone3 ?? rule.zone2;

  return rule.zone1;
}

export function getZoneByDistance(km: number): Zone {
  if (km <= 3.3) return 'A';
  if (km <= 6.3) return 'B';
  return 'C';
}

// ─── СЕМЕЙНАЯ ЦЕНА (скидка 5% на 2+ детей) ──────────────────────────────────

interface KidPriceInput {
  schoolCode: SchoolCode;
  zone: Zone;
  vehicleType: VehicleType;
  discountType?: 'none' | 'percent' | 'fixed';
  discountValue?: number;
}

export function getChildPrice(kid: KidPriceInput, index = 0): number {
  const base = getPriceByZone(kid.schoolCode, kid.zone, kid.vehicleType);
  let price = index === 0 ? base : Math.round(base * 0.95);

  if (kid.discountType === 'percent' && kid.discountValue) {
    price = Math.round(price * (1 - kid.discountValue / 100));
  }
  if (kid.discountType === 'fixed' && kid.discountValue) {
    price = Math.max(0, price - kid.discountValue);
  }

  return price;
}

export function getFamilyPrice(kids: KidPriceInput[]): number {
  if (!kids.length) return 0;
  return kids.reduce((sum, kid, index) => sum + getChildPrice(kid, index), 0);
}

// ─── ПЕНЯ ────────────────────────────────────────────────────────────────────

export function calcPenalty(amount: number, dueDate: Date, today = new Date()): number {
  const day5 = new Date(dueDate.getFullYear(), dueDate.getMonth(), 5);
  if (today <= day5) return 0;

  const daysLate = Math.floor((today.getTime() - day5.getTime()) / 86400000);
  const maxPenalty = Math.round(amount * 0.15);
  return Math.min(daysLate * 100, maxPenalty);
}

// ─── ФОРМАТИРОВАНИЕ ──────────────────────────────────────────────────────────

export function money(n: number): string {
  return n.toLocaleString('ru-RU') + ' сом';
}
