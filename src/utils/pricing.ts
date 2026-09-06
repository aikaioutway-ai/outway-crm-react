import { SchoolCode, Zone, VehicleType } from '../types';

// ─── ТАРИФЫ ──────────────────────────────────────────────────────────────────

const PRICE_RULES: Record<SchoolCode, { zone1: number; zone2: number; zone3: number | null }> = {
  LIGHT:   { zone1: 5000, zone2: 5500, zone3: 6000 },
  BILIM:   { zone1: 5000, zone2: 5500, zone3: 6500 },
  AES:     { zone1: 5600, zone2: 6100, zone3: 6600 },
  KAS:     { zone1: 5600, zone2: 6100, zone3: 6600 },
  EPSILON: { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  GENIUS4: { zone1: 5500, zone2: 6000, zone3: 6500 },
  NOVA:    { zone1: 5500, zone2: 6000, zone3: 6500 },
  INDIGO:  { zone1: 5500, zone2: 6000, zone3: 6500 },
  ERUDIT:  { zone1: 6000, zone2: 6500, zone3: null },
  TENSAY:  { zone1: 6400, zone2: 6800, zone3: null },
  EDISON:  { zone1: 6500, zone2: 7000, zone3: null },
  ABL1:    { zone1: 6000, zone2: 6500, zone3: null },
  ABL2:    { zone1: 6000, zone2: 6500, zone3: null },
  KLM:     { zone1: 6000, zone2: 6500, zone3: null },
  TSL:     { zone1: 6000, zone2: 6500, zone3: null },
  SANARIP: { zone1: 6000, zone2: 6500, zone3: null },
  ELLIPSE: { zone1: 6000, zone2: 6500, zone3: null },
  Ilim_k:  { zone1: 5500, zone2: 6000, zone3: 6500 },
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

/** Первый ребёнок семьи — 0%, второй и каждый последующий — 5%.
 * index — порядковый номер ребёнка в семье, начиная с 0. */
export function getSiblingDiscountPercent(index: number): number {
  return index === 0 ? 0 : 5;
}

export function getChildPrice(kid: KidPriceInput, index = 0): number {
  const base = getPriceByZone(kid.schoolCode, kid.zone, kid.vehicleType);
  let price = Math.round(base * (1 - getSiblingDiscountPercent(index) / 100));

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

// ─── ФОРМАТИРОВАНИЕ ──────────────────────────────────────────────────────────

export function money(n: number): string {
  return n.toLocaleString('ru-RU') + ' сом';
}
