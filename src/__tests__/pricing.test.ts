import { getPriceByZone, getChildPrice, getFamilyPrice, getZoneByDistance, calcPenalty, money } from '../utils/pricing';

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

  test('AES зона A = 5500', () => {
    expect(getPriceByZone('AES', 'A', 'microbus')).toBe(5500);
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
    // kid1 = 5000 (первый), kid2 = 6000 * 0.95 = 5700 (второй)
    expect(getFamilyPrice([kid1, kid2])).toBe(10700);
  });
});

// ─── calcPenalty ──────────────────────────────────────────────────────────────

describe('calcPenalty', () => {
  const amount = 6000;
  const dueDate = new Date(2026, 5, 1); // 1 июня 2026

  test('до 5-го числа — пеня 0', () => {
    const today = new Date(2026, 5, 4); // 4 июня
    expect(calcPenalty(amount, dueDate, today)).toBe(0);
  });

  test('5-е число — пеня ещё 0', () => {
    const today = new Date(2026, 5, 5); // 5 июня
    expect(calcPenalty(amount, dueDate, today)).toBe(0);
  });

  test('6-е число — 1 день просрочки = 100 сом', () => {
    const today = new Date(2026, 5, 6); // 6 июня
    expect(calcPenalty(amount, dueDate, today)).toBe(100);
  });

  test('9 дней просрочки = 900 сом (макс 15% от 6000)', () => {
    const today = new Date(2026, 5, 14); // 14 июня = 9 дней после 5-го → 900 сом = макс
    expect(calcPenalty(amount, dueDate, today)).toBe(900);
  });

  test('максимум пени = 15% от суммы = 900 сом для 6000', () => {
    const today = new Date(2026, 8, 1); // далеко в будущем
    expect(calcPenalty(amount, dueDate, today)).toBe(900); // 6000 * 0.15
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
