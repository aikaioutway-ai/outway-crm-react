// supabase/functions/sync-google-sheets/index.ts
// Синхронизация из Google Таблицы → Supabase
//
// ЛОГИКА:
//   Один родитель может занимать несколько строк (по одной на каждого ребёнка).
//   Ключ уникальности семьи: phone + school_code
//   Алгоритм:
//     1. Сгруппировать строки таблицы по (phone + school_code) → получаем семьи с детьми
//     2. Для каждой семьи: если уже есть в Supabase — добавить только новых детей
//                          если нет — создать семью + всех детей + начисления
//
// Формат Google Таблицы (лист "Заявки", 1-я строка — заголовки):
//   A: Родитель  B: Телефон  C: Telegram  D: Школа  E: Зона  F: ТС
//   G: Адрес     H: Км       I: Ребёнок   J: Класс  K: Комментарий

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHEET_ID          = Deno.env.get('GOOGLE_SHEET_ID')!;
const API_KEY           = Deno.env.get('GOOGLE_API_KEY')!;
const SHEET_RANGE       = 'Заявки!A2:K';

// ─── Тарифы ──────────────────────────────────────────────────────────────────

const PRICE_RULES: Record<string, { zone1: number; zone2: number; zone3: number | null }> = {
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

function getPriceByZone(schoolCode: string, zone: number, vehicleType: string): number {
  if (vehicleType === 'minivan') return 9500;
  if (vehicleType === 'sedan')   return 10500;
  const rule = PRICE_RULES[schoolCode];
  if (!rule) return 0;
  if (zone === 1) return rule.zone1;
  if (zone === 2) return rule.zone2;
  return rule.zone3 ?? rule.zone2;
}

// Цена семьи с учётом скидки 5% на 2-го и далее
function getFamilyPrice(children: Array<{ school_code: string; zone: number; vehicle_type: string }>): number {
  return children.reduce((sum, kid, index) => {
    const base = getPriceByZone(kid.school_code, kid.zone, kid.vehicle_type);
    return sum + (index === 0 ? base : Math.round(base * 0.95));
  }, 0);
}

// ─── Нормализация ─────────────────────────────────────────────────────────────

function normalizeSchool(raw: string): string {
  const s = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    'ТЕНСАЙ': 'TENSAY', 'TENSAI': 'TENSAY',
    'ГЕНИЙ':  'GENIUS', 'ЭДИСОН': 'EDISON',
    'ЭРУДИТ': 'ERUDIT', 'ИНДИГО': 'INDIGO',
    'НОВАЯ':  'NOVA',   'БИЛИМ':  'BILIM',
  };
  return map[s] ?? s;
}

function normalizeVehicle(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (['минивэн', 'minivan', 'мини-вэн', 'мини вэн'].includes(s)) return 'minivan';
  if (['седан', 'sedan', 'car'].includes(s)) return 'sedan';
  return 'microbus';
}

function normalizeZone(raw: string): number {
  const s = raw.trim().toUpperCase();
  if (s === 'A' || s === 'А' || s === '1') return 1; // А — кирилица тоже
  if (s === 'B' || s === 'В' || s === '2') return 2;
  if (s === 'C' || s === 'С' || s === '3') return 3;
  return 1;
}

function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-\(\)]/g, '');
}

// ─── Структуры ───────────────────────────────────────────────────────────────

interface SheetChild {
  childName: string;
  childClass: string;
  zone: number;
  vehicleType: string;
  schoolCode: string;
}

interface SheetFamily {
  phone: string;
  schoolCode: string;
  parentName: string;
  telegram: string;
  address: string;
  distanceKm: number | null;
  comment: string;
  zone: number;         // зона семьи (по первой строке)
  vehicleType: string;  // ТС семьи (по первой строке)
  children: SheetChild[];
}

// ─── Парсинг таблицы ─────────────────────────────────────────────────────────

function parseSheetRows(rows: string[][]): Map<string, SheetFamily> {
  // Ключ: phone__schoolCode
  const families = new Map<string, SheetFamily>();

  for (const row of rows) {
    if (!row[0] && !row[1]) continue; // пустая строка

    const parentName = row[0]?.trim() ?? '';
    const phone      = normalizePhone(row[1] ?? '');
    const telegram   = row[2]?.trim() ?? '';
    const schoolCode = normalizeSchool(row[3] ?? '');
    const zone       = normalizeZone(row[4] ?? '1');
    const vehicleType = normalizeVehicle(row[5] ?? 'microbus');
    const address    = row[6]?.trim() ?? '';
    const distanceKm = parseFloat(row[7]?.trim() ?? '') || null;
    const childName  = row[8]?.trim() ?? '';
    const childClass = row[9]?.trim() ?? '';
    const comment    = row[10]?.trim() ?? '';

    if (!phone || !schoolCode) continue;

    const key = `${phone}__${schoolCode}`;

    if (!families.has(key)) {
      // Первая строка этой семьи — берём данные родителя
      families.set(key, {
        phone, schoolCode, parentName, telegram,
        address, distanceKm, comment,
        zone, vehicleType,
        children: [],
      });
    }

    // Добавляем ребёнка (если указан)
    if (childName) {
      const fam = families.get(key)!;
      // Не дублировать ребёнка если уже есть (на случай повторного запуска)
      const alreadyInSheet = fam.children.some(c => c.childName === childName);
      if (!alreadyInSheet) {
        fam.children.push({ childName, childClass, zone, vehicleType, schoolCode });
      }
    }
  }

  return families;
}

// ─── Основной обработчик ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  if (!SHEET_ID || !API_KEY) {
    return Response.json(
      { ok: false, error: 'GOOGLE_SHEET_ID или GOOGLE_API_KEY не заданы' },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Загрузить строки из Google Sheets
  const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}?key=${API_KEY}`;
  const sheetRes = await fetch(sheetUrl);
  if (!sheetRes.ok) {
    return Response.json({ ok: false, error: `Google Sheets: ${await sheetRes.text()}` }, { status: 500 });
  }
  const sheetData = await sheetRes.json();
  const rows: string[][] = sheetData.values ?? [];

  if (!rows.length) {
    return Response.json({ ok: true, message: 'Таблица пустая', imported: 0, updated: 0 });
  }

  // 2. Сгруппировать строки по семьям
  const sheetFamilies = parseSheetRows(rows);

  // 3. Загрузить существующие семьи из Supabase (phone + school_code)
  const { data: existingFamilies } = await supabase
    .from('families')
    .select('id, phone, school_code');

  const existingMap = new Map<string, string>(); // key → familyId
  for (const f of existingFamilies ?? []) {
    existingMap.set(`${f.phone}__${f.school_code}`, f.id);
  }

  // 4. Загрузить существующих детей (чтобы не дублировать)
  const existingFamilyIds = [...existingMap.values()];
  const { data: existingChildren } = existingFamilyIds.length
    ? await supabase.from('children').select('family_id, child_name').in('family_id', existingFamilyIds)
    : { data: [] };

  // Set: familyId__childName
  const existingChildKeys = new Set(
    (existingChildren ?? []).map((c: any) => `${c.family_id}__${c.child_name}`)
  );

  // 5. Обработать каждую семью
  let familiesCreated  = 0;
  let childrenAdded    = 0;
  let familiesUpdated  = 0; // добавили ребёнка к существующей семье
  const errors: string[] = [];

  for (const [key, fam] of sheetFamilies) {
    try {
      let familyId = existingMap.get(key);

      if (!familyId) {
        // ── Новая семья ────────────────────────────────────────────────────

        // Цена считается по детям (если есть), иначе по данным семьи
        const kidsForPrice = fam.children.length > 0 ? fam.children : [{
          school_code: fam.schoolCode,
          zone: fam.zone,
          vehicle_type: fam.vehicleType,
        }];
        const price = getFamilyPrice(kidsForPrice);

        const { data: newFam, error: famErr } = await supabase
          .from('families')
          .insert({
            parent_name:    fam.parentName,
            phone:          fam.phone,
            phone_telegram: fam.telegram || null,
            school_code:    fam.schoolCode,
            zone:           fam.zone,
            vehicle_type:   fam.vehicleType,
            full_address:   fam.address,
            distance_km:    fam.distanceKm,
            monthly_price:  price,
            comment:        fam.comment || null,
            status:         'new',
          })
          .select('id')
          .single();

        if (famErr || !newFam) {
          errors.push(`${fam.phone} (${fam.schoolCode}): ${famErr?.message ?? 'ошибка создания'}`);
          continue;
        }

        familyId = newFam.id;
        existingMap.set(key, familyId);
        familiesCreated++;

        // Начисления: депозит + сентябрь
        const basePayment = {
          family_id: familyId, school_code: fam.schoolCode,
          amount: price, manager_amount: 0, manager_date: null,
          has_receipt: false, accountant_status: 'Не оплачено',
          fact_amount: 0, fact_date: null, is_frozen: false, comment: '',
        };
        await supabase.from('payments').insert([
          { ...basePayment, period_key: 'deposit', month: 0, year: 2026 },
          { ...basePayment, period_key: '9',       month: 9, year: 2026 },
        ]);
      }

      // ── Добавить новых детей (и для новой семьи, и для существующей) ────────
      let addedForThisFamily = 0;

      for (const child of fam.children) {
        const childKey = `${familyId}__${child.childName}`;
        if (existingChildKeys.has(childKey)) continue; // уже есть

        await supabase.from('children').insert({
          family_id:         familyId,
          child_name:        child.childName,
          class:             child.childClass || null,
          school_code:       child.schoolCode,
          zone:              child.zone,
          vehicle_type:      child.vehicleType,
          self_exit_allowed: false,
        });

        existingChildKeys.add(childKey);
        childrenAdded++;
        addedForThisFamily++;
      }

      // Если добавили ребёнка к уже существующей семье — пересчитать цену
      if (addedForThisFamily > 0 && familiesCreated === 0) {
        familiesUpdated++;
        // Получаем всех детей семьи для пересчёта
        const { data: allKids } = await supabase
          .from('children')
          .select('school_code, zone, vehicle_type')
          .eq('family_id', familyId);

        if (allKids?.length) {
          const newPrice = getFamilyPrice(allKids);
          // Обновляем monthly_price семьи
          await supabase.from('families').update({ monthly_price: newPrice }).eq('id', familyId);
          // Пересчитываем неоплаченные платежи
          await supabase
            .from('payments')
            .update({ amount: newPrice })
            .eq('family_id', familyId)
            .not('accountant_status', 'in', '("Оплачено","Частично оплачено")')
            .eq('is_frozen', false);
        }
      }

    } catch (e: any) {
      errors.push(`${fam.phone}: ${e.message}`);
    }
  }

  return Response.json({
    ok: true,
    message: 'Синхронизация завершена',
    familiesCreated,
    familiesUpdated,
    childrenAdded,
    totalInSheet: sheetFamilies.size,
    errors: errors.length ? errors : undefined,
  });
});
