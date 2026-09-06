import { getPriceByZone, getChildPrice, getFamilyPrice, getSiblingDiscountPercent, getZoneByDistance, money, repriceChild } from '../utils/pricing';

// ─── getSiblingDiscountPercent ─────────────────────────────────────────────────

describe('getSiblingDiscountPercent', () => {
  test('1 ребёнок (index 0) — 0%', () => {
    expect(getSiblingDiscountPercent(0)).toBe(0);
  });

  test('2 ребёнка — второй (index 1) — 5%', () => {
    expect(getSiblingDiscountPercent(1)).toBe(5);
  });

  test('3 ребёнка — второй и третий (index 1 и 2) — 5%', () => {
    expect(getSiblingDiscountPercent(1)).toBe(5);
    expect(getSiblingDiscountPercent(2)).toBe(5);
  });

  test('уже есть 1 ребёнок + добавляется 1 — новый (index 1) получает 5%', () => {
    const existingCount = 1;
    expect(getSiblingDiscountPercent(existingCount)).toBe(5);
  });

  test('уже есть 1 ребёнок + добавляются 2 — оба новых (index 1 и 2) получают 5%', () => {
    const existingCount = 1;
    expect(getSiblingDiscountPercent(existingCount)).toBe(5);
    expect(getSiblingDiscountPercent(existingCount + 1)).toBe(5);
  });
});

// ─── getPriceByZone ───────────────────────────────────────────────────────────

describe('getPriceByZone', () => {
  test('минивэн всегда 9500 независимо от школы и зоны', () => {
    expect(getPriceByZone('LIGHT', 'A', 'minivan')).toBe(9500);
    expect(getPriceByZone('EDISON', 'C', 'minivan')).toBe(9500);
  });

  test('седан всегда 10500', () => {
    expect(getPriceByZone('AES', 'B', 'sedan')).toBe(10500);
  });

  test('LIGHT зона A = 5000', () => {
    expect(getPriceByZone('LIGHT', 'A', 'microbus')).toBe(5000);
  });

  test('LIGHT зона B = 5500', () => {
    expect(getPriceByZone('LIGHT', 'B', 'microbus')).toBe(5500);
  });

  test('LIGHT зона C = 6000', () => {
    expect(getPriceByZone('LIGHT', 'C', 'microbus')).toBe(6000);
  });

  test('AES зона A = 5600', () => {
    expect(getPriceByZone('AES', 'A', 'microbus')).toBe(5600);
  });

  test('EPSILON зона B = 6000', () => {
    expect(getPriceByZone('EPSILON', 'B', 'microbus')).toBe(6000);
  });

  test('EDISON зона A = 6500', () => {
    expect(getPriceByZone('EDISON', 'A', 'microbus')).toBe(6500);
  });

  test('EDISON зона B = 7000', () => {
    expect(getPriceByZone('EDISON', 'B', 'microbus')).toBe(7000);
  });

  test('ERUDIT зона C (нет) — возвращает зону B', () => {
    expect(getPriceByZone('ERUDIT', 'C', 'microbus')).toBe(6500);
  });

  test('TENSAY зона A = 6400', () => {
    expect(getPriceByZone('TENSAY', 'A', 'microbus')).toBe(6400);
  });
});

// ─── getZoneByDistance ────────────────────────────────────────────────────────

describe('getZoneByDistance', () => {
  test('до 3.3 км — зона A', () => {
    expect(getZoneByDistance(1)).toBe('A');
    expect(getZoneByDistance(3.3)).toBe('A');
  });

  test('3.31–6.3 км — зона B', () => {
    expect(getZoneByDistance(3.31)).toBe('B');
    expect(getZoneByDistance(6.3)).toBe('B');
  });

  test('свыше 6.3 км — зона C', () => {
    expect(getZoneByDistance(6.31)).toBe('C');
    expect(getZoneByDistance(20)).toBe('C');
  });
});

// ─── getChildPrice ────────────────────────────────────────────────────────────

describe('getChildPrice', () => {
  const kid = { schoolCode: 'EPSILON' as const, zone: 'B' as const, vehicleType: 'microbus' as const };

  test('первый ребёнок — полная цена', () => {
    expect(getChildPrice(kid, 0)).toBe(6000);
  });

  test('второй ребёнок — скидка 5%', () => {
    expect(getChildPrice(kid, 1)).toBe(5700); // 6000 * 0.95
  });

  test('третий ребёнок — тоже скидка 5%', () => {
    expect(getChildPrice(kid, 2)).toBe(5700);
  });

  test('скидка процентная', () => {
    const kidWithDiscount = { ...kid, discountType: 'percent' as const, discountValue: 10 };
    expect(getChildPrice(kidWithDiscount, 0)).toBe(5400); // 6000 - 10%
  });

  test('скидка фиксированная', () => {
    const kidWithDiscount = { ...kid, discountType: 'fixed' as const, discountValue: 500 };
    expect(getChildPrice(kidWithDiscount, 0)).toBe(5500); // 6000 - 500
  });
});

// ─── getFamilyPrice ───────────────────────────────────────────────────────────

describe('getFamilyPrice', () => {
  const kid = { schoolCode: 'EPSILON' as const, zone: 'B' as const, vehicleType: 'microbus' as const };

  test('0 детей = 0', () => {
    expect(getFamilyPrice([])).toBe(0);
  });

  test('1 ребёнок EPSILON зона B = 6000', () => {
    expect(getFamilyPrice([kid])).toBe(6000);
  });

  test('2 детей EPSILON зона B = 6000 + 5700 = 11700', () => {
    expect(getFamilyPrice([kid, kid])).toBe(11700);
  });

  test('3 детей = 6000 + 5700 + 5700 = 17400', () => {
    expect(getFamilyPrice([kid, kid, kid])).toBe(17400);
  });

  test('разные школы — у каждого своя цена', () => {
    const kid1 = { schoolCode: 'LIGHT' as const, zone: 'A' as const, vehicleType: 'microbus' as const };
    const kid2 = { schoolCode: 'AES' as const, zone: 'B' as const, vehicleType: 'microbus' as const };
    // kid1 = 5000 (первый), kid2 = 6100 * 0.95 = 5795 (второй)
    expect(getFamilyPrice([kid1, kid2])).toBe(10795);
  });
});

// ─── money ────────────────────────────────────────────────────────────────────

describe('money', () => {
  test('форматирует число в сомы', () => {
    expect(money(5000)).toBe('5 000 сом');
  });

  test('ноль', () => {
    expect(money(0)).toBe('0 сом');
  });
});

// ─── Добавление ребёнка в существующую семью (CRM, InlineFamilyCard.addDraftChild) ─

describe('добавление ребёнка в CRM — sibling discount по позиции в семье', () => {
  test('1-й ребёнок семьи: sibling 0%, final_price = base_price', () => {
    const basePrice = getPriceByZone('AES', 'B', 'microbus'); // 6100
    const siblingDiscountPercent = getSiblingDiscountPercent(0);
    const finalPrice = Math.round(basePrice * (1 - siblingDiscountPercent / 100));
    expect(siblingDiscountPercent).toBe(0);
    expect(finalPrice).toBe(basePrice);
  });

  test('2-й ребёнок семьи (уже есть 1): sibling 5%, base_price остаётся полным', () => {
    const basePrice = getPriceByZone('AES', 'B', 'microbus'); // 6100
    const existingChildrenCount = 1;
    const siblingDiscountPercent = getSiblingDiscountPercent(existingChildrenCount);
    const finalPrice = Math.round(basePrice * (1 - siblingDiscountPercent / 100));
    expect(siblingDiscountPercent).toBe(5);
    expect(basePrice).toBe(6100); // base_price — полная цена, скидка только в final_price
    expect(finalPrice).toBe(5795);
  });

  test('3-й ребёнок семьи (уже есть 2): тоже sibling 5%, base_price полный', () => {
    const basePrice = getPriceByZone('AES', 'B', 'microbus');
    const existingChildrenCount = 2;
    const siblingDiscountPercent = getSiblingDiscountPercent(existingChildrenCount);
    const finalPrice = Math.round(basePrice * (1 - siblingDiscountPercent / 100));
    expect(siblingDiscountPercent).toBe(5);
    expect(basePrice).toBe(6100);
    expect(finalPrice).toBe(5795);
  });
});

// ─── repriceChild — пересчёт при смене зоны/авто и ручной скидке ───────────────

describe('repriceChild', () => {
  test('sibling 5%, manual не задан (0) — скидка применяется как sibling, manual остаётся 0', () => {
    const result = repriceChild({ basePrice: 6000, siblingDiscountPercent: 5, manualDiscountPercent: 0, manualDiscountAmount: 0 });
    expect(result.manualDiscountPercent).toBe(0); // sibling НЕ подмешивается в manual
    expect(result.finalPrice).toBe(5700); // 6000 * 0.95, скидка применена через sibling-fallback
  });

  test('sibling 5%, manual 10% — побеждает manual, sibling не влияет на итог', () => {
    const result = repriceChild({ basePrice: 6000, siblingDiscountPercent: 5, manualDiscountPercent: 10, manualDiscountAmount: 0 });
    expect(result.manualDiscountPercent).toBe(10);
    expect(result.finalPrice).toBe(5400); // 6000 * 0.9, а не 0.95 и не суммарно 0.85
  });

  test('sibling 0%, manual 10% — применяется только ручная скидка', () => {
    const result = repriceChild({ basePrice: 6000, siblingDiscountPercent: 0, manualDiscountPercent: 10, manualDiscountAmount: 0 });
    expect(result.manualDiscountPercent).toBe(10);
    expect(result.finalPrice).toBe(5400);
  });

  test('смена зоны (новый basePrice извне) сохраняет sibling-скидку, не пишет её в manual', () => {
    const newBasePrice = getPriceByZone('AES', 'C', 'microbus'); // смена зоны A->C
    const result = repriceChild({ basePrice: newBasePrice, siblingDiscountPercent: 5, manualDiscountPercent: 0, manualDiscountAmount: 0 });
    expect(result.basePrice).toBe(newBasePrice);
    expect(result.manualDiscountPercent).toBe(0);
    expect(result.finalPrice).toBe(Math.round(newBasePrice * 0.95));
  });

  test('смена типа авто (minivan) пересчитывает base_price и сохраняет sibling-скидку отдельно от manual', () => {
    const newBasePrice = getPriceByZone('AES', 'B', 'minivan'); // 9500
    const result = repriceChild({ basePrice: newBasePrice, siblingDiscountPercent: 5, manualDiscountPercent: 0, manualDiscountAmount: 0 });
    expect(result.basePrice).toBe(9500);
    expect(result.manualDiscountPercent).toBe(0);
    expect(result.finalPrice).toBe(9025); // 9500 * 0.95
  });

  test('повторный repricing идемпотентен: manual и sibling не смешиваются даже после нескольких пересчётов подряд', () => {
    const first = repriceChild({ basePrice: 6000, siblingDiscountPercent: 5, manualDiscountPercent: 0, manualDiscountAmount: 0 });
    const second = repriceChild({ basePrice: first.basePrice, siblingDiscountPercent: 5, manualDiscountPercent: first.manualDiscountPercent, manualDiscountAmount: first.manualDiscountAmount });
    const third = repriceChild({ basePrice: second.basePrice, siblingDiscountPercent: 5, manualDiscountPercent: second.manualDiscountPercent, manualDiscountAmount: second.manualDiscountAmount });
    expect(third.manualDiscountPercent).toBe(0); // sibling так и не "просочился" в manual за 3 прохода
    expect(third.finalPrice).toBe(5700);
  });

  test('ручная скидка в сомах (manualDiscountAmount) применяется поверх процентной и не ломает sibling', () => {
    const result = repriceChild({ basePrice: 6000, siblingDiscountPercent: 5, manualDiscountPercent: 0, manualDiscountAmount: 300 });
    expect(result.manualDiscountPercent).toBe(0);
    expect(result.manualDiscountAmount).toBe(300);
    expect(result.finalPrice).toBe(5400); // 6000 - 5% (300) - 300 = 5400
  });
});
