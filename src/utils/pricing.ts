import { Child, SchoolCode, Zone, VehicleType } from '../types';

export const TEACHER_MONTHLY_PRICE = 4800;

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

// ─── РЕПРАЙСИНГ УЖЕ СОЗДАННОГО РЕБЁНКА (смена зоны/авто, ручная скидка) ────────

function roundToStep(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export interface RepriceChildInput {
  basePrice: number;
  siblingDiscountPercent: number;
  manualDiscountPercent: number;
  manualDiscountAmount: number;
  fixedFinalPrice?: number;
}

export interface RepriceChildResult {
  basePrice: number;
  manualDiscountPercent: number;
  manualDiscountAmount: number;
  finalPrice: number;
}

/**
 * manualDiscountPercent в результате — это всегда только то, что реально задал
 * человек (что пришло на входе), sibling-скидка используется исключительно как
 * fallback при расчёте итоговой цены и никогда не записывается в manual-поле —
 * иначе после любого репрайсинга sibling- и manual-скидки перестают различаться.
 */
export function repriceChild(input: RepriceChildInput): RepriceChildResult {
  const basePrice = Math.max(0, input.basePrice);
  const hasFixedFinalPrice = input.fixedFinalPrice !== undefined;
  const manualPercent = hasFixedFinalPrice ? 0 : roundToStep(input.manualDiscountPercent || 0, 0, 100, 5);
  const siblingPercent = input.siblingDiscountPercent || 0;
  const effectivePercent = manualPercent || siblingPercent;
  const percentAmount = Math.round(basePrice * effectivePercent / 100);
  const maxManualAmount = Math.max(0, basePrice - percentAmount);
  const manualAmount = hasFixedFinalPrice
    ? Math.max(0, maxManualAmount - Math.max(0, Math.min(maxManualAmount, Number(input.fixedFinalPrice))))
    : roundToStep(input.manualDiscountAmount || 0, 0, maxManualAmount, 100);
  const finalPrice = Math.max(0, basePrice - percentAmount - manualAmount);
  return { basePrice, manualDiscountPercent: manualPercent, manualDiscountAmount: manualAmount, finalPrice };
}

type StoredChildPrice = Pick<Child, 'basePrice' | 'siblingDiscountPercent' | 'manualDiscountPercent' | 'manualDiscountAmount' | 'finalPrice'>;

export function supportsTeacherPrice(input: Pick<Child, 'schoolCode' | 'branchCode' | 'branchShort'>): boolean {
  return input.schoolCode === 'TENSAY'
    || String(input.branchCode || '').toUpperCase() === 'TIS'
    || String(input.branchShort || '').toUpperCase() === 'TIS';
}

export function isTeacherPriced(input: StoredChildPrice): boolean {
  const expected = repriceChild({
    basePrice: Number(input.basePrice || 0),
    siblingDiscountPercent: Number(input.siblingDiscountPercent || 0),
    manualDiscountPercent: 0,
    manualDiscountAmount: 0,
    fixedFinalPrice: TEACHER_MONTHLY_PRICE,
  });
  return Number(input.manualDiscountPercent || 0) === 0
    && Number(input.manualDiscountAmount || 0) === expected.manualDiscountAmount
    && Number(input.finalPrice || 0) === expected.finalPrice;
}

/** Applies an edit to a child and recalculates the displayed price immediately. */
export function applyChildPricingPatch(child: Child, patch: Partial<Child>): Child {
  const next: Child = { ...child, ...patch };
  const manualPercentChanged = 'manualDiscountPercent' in patch;
  const manualAmountChanged = 'manualDiscountAmount' in patch;
  const teacherWasActive = Boolean(child.teacherPrice ?? isTeacherPriced(child));
  const requestedTeacherPrice = 'teacherPrice' in patch
    ? Boolean(patch.teacherPrice)
    : (manualPercentChanged || manualAmountChanged) ? false : teacherWasActive;
  const teacherPrice = requestedTeacherPrice && supportsTeacherPrice(next);

  if ('teacherPrice' in patch) {
    next.manualDiscountPercent = 0;
    next.manualDiscountAmount = 0;
  } else if (teacherWasActive && manualPercentChanged) {
    next.manualDiscountAmount = 0;
  } else if (teacherWasActive && manualAmountChanged) {
    next.manualDiscountPercent = 0;
  } else if (teacherWasActive && !teacherPrice) {
    next.manualDiscountPercent = 0;
    next.manualDiscountAmount = 0;
  }

  const shouldReprice = teacherPrice !== teacherWasActive
    || 'schoolCode' in patch
    || 'zone' in patch
    || 'vehicleType' in patch
    || 'basePrice' in patch
    || manualPercentChanged
    || manualAmountChanged;
  if (!shouldReprice) return { ...next, teacherPrice };

  const tariffChanged = 'schoolCode' in patch || 'zone' in patch || 'vehicleType' in patch;
  const basePrice = tariffChanged
    ? getPriceByZone(next.schoolCode, next.zone, next.vehicleType)
    : Math.max(0, Number(next.basePrice || 0));
  const repriced = repriceChild({
    basePrice,
    siblingDiscountPercent: Number(next.siblingDiscountPercent || 0),
    manualDiscountPercent: Number(next.manualDiscountPercent || 0),
    manualDiscountAmount: Number(next.manualDiscountAmount || 0),
    fixedFinalPrice: teacherPrice ? TEACHER_MONTHLY_PRICE : undefined,
  });
  return { ...next, ...repriced, teacherPrice };
}

/** Returns only fields changed in the edit form, so unrelated route logic cannot overwrite pricing. */
export function changedChildPatch(original: Child, draft: Child): Partial<Child> {
  const patch: Partial<Child> = {};
  (Object.keys(draft) as Array<keyof Child>).forEach(key => {
    if (original[key] !== draft[key]) (patch as Record<keyof Child, unknown>)[key] = draft[key];
  });
  return patch;
}

// ─── ФОРМАТИРОВАНИЕ ──────────────────────────────────────────────────────────

export function money(n: number): string {
  return n.toLocaleString('ru-RU') + ' сом';
}
