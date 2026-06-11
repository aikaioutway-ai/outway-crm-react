// supabase/functions/sync-google-sheets/index.ts
// Синхронизация новых заявок из Google Таблицы → Supabase
//
// Деплой: supabase functions deploy sync-google-sheets
// Cron (каждые 30 минут): "*/30 * * * *"
//   supabase functions schedule sync-google-sheets --cron "*/30 * * * *"
//
// Переменные окружения (задать в Supabase Dashboard → Settings → Edge Functions):
//   GOOGLE_SHEET_ID      — ID таблицы из URL
//   GOOGLE_API_KEY       — API ключ Google (или GOOGLE_SERVICE_ACCOUNT_JSON для сервисного аккаунта)
//
// Как получить GOOGLE_API_KEY:
//   1. console.cloud.google.com → APIs → Google Sheets API → включить
//   2. Credentials → Create API Key
//   3. Таблицу открыть всем (Поделиться → Все у кого есть ссылка → Просмотр)
//
// Формат Google Таблицы (первая строка — заголовки):
//   A: parent_name  B: phone  C: phone_telegram  D: school_code  E: zone
//   F: vehicle_type G: full_address  H: distance_km  I: child_name
//   J: child_class  K: comment  L: status (оставить пустым — будет 'new')

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHEET_ID = Deno.env.get('GOOGLE_SHEET_ID')!;
const API_KEY  = Deno.env.get('GOOGLE_API_KEY')!;

// Диапазон — лист "Заявки", строки 2+ (без заголовка)
const SHEET_RANGE = 'Заявки!A2:M';

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

// Нормализация кода школы (на случай если пишут по-разному)
function normalizeSchool(raw: string): string {
  const s = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    'ТЕНСАЙ': 'TENSAY', 'TENSAI': 'TENSAY',
    'ГЕНИЙ':  'GENIUS', 'ЭДИСОН': 'EDISON',
    'ЭРУДИТ': 'ERUDIT', 'ИНДИГО': 'INDIGO',
    'НОВАЯ':  'NOVA',   'БИИМ':   'BILIM',
  };
  return map[s] ?? s;
}

// Нормализация типа ТС
function normalizeVehicle(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (['минивэн', 'minivan', 'мини-вэн'].includes(s)) return 'minivan';
  if (['седан', 'sedan', 'car'].includes(s)) return 'sedan';
  return 'microbus';
}

// Нормализация зоны (A/B/C или 1/2/3)
function normalizeZone(raw: string): number {
  const s = raw.trim().toUpperCase();
  if (s === 'A' || s === '1') return 1;
  if (s === 'B' || s === '2') return 2;
  if (s === 'C' || s === '3') return 3;
  return 1;
}

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
      { ok: false, error: 'GOOGLE_SHEET_ID или GOOGLE_API_KEY не заданы в переменных окружения' },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Загружаем данные из Google Sheets ──────────────────────────────────────
  const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}?key=${API_KEY}`;
  const sheetRes = await fetch(sheetUrl);
  if (!sheetRes.ok) {
    const errText = await sheetRes.text();
    return Response.json({ ok: false, error: `Google Sheets ошибка: ${errText}` }, { status: 500 });
  }
  const sheetData = await sheetRes.json();
  const rows: string[][] = sheetData.values ?? [];

  if (!rows.length) {
    return Response.json({ ok: true, message: 'Таблица пустая или нет данных', imported: 0 });
  }

  // ── Существующие телефоны (чтобы не дублировать) ───────────────────────────
  const { data: existing } = await supabase
    .from('families')
    .select('phone, school_code');

  const existingKeys = new Set(
    (existing ?? []).map((f: any) => `${f.phone}__${f.school_code}`)
  );

  let imported = 0;
  let skipped  = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Пропускаем пустые строки
    if (!row[0] && !row[1]) continue;

    try {
      const parentName = row[0]?.trim() ?? '';
      const phone      = row[1]?.trim().replace(/\s/g, '') ?? '';
      const telegram   = row[2]?.trim() ?? '';
      const schoolRaw  = row[3]?.trim() ?? '';
      const zoneRaw    = row[4]?.trim() ?? '1';
      const vehicleRaw = row[5]?.trim() ?? 'microbus';
      const address    = row[6]?.trim() ?? '';
      const distKm     = parseFloat(row[7]?.trim() ?? '0') || null;
      const childName  = row[8]?.trim() ?? '';
      const childClass = row[9]?.trim() ?? '';
      const comment    = row[10]?.trim() ?? '';
      // Колонка M (индекс 12) — флаг "уже импортировано" (можно добавить в таблицу)
      const alreadyImported = row[12]?.trim() === '✓';

      if (!phone || !parentName || !schoolRaw) {
        errors.push(`Строка ${i + 2}: пропущены обязательные поля`);
        continue;
      }

      if (alreadyImported) {
        skipped++;
        continue;
      }

      const schoolCode  = normalizeSchool(schoolRaw);
      const vehicleType = normalizeVehicle(vehicleRaw);
      const zone        = normalizeZone(zoneRaw);
      const key         = `${phone}__${schoolCode}`;

      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      const price = getPriceByZone(schoolCode, zone, vehicleType);

      // ── Создаём семью ──────────────────────────────────────────────────────
      const { data: newFamily, error: famErr } = await supabase
        .from('families')
        .insert({
          parent_name:    parentName,
          phone,
          phone_telegram: telegram || null,
          school_code:    schoolCode,
          zone,
          vehicle_type:   vehicleType,
          full_address:   address,
          distance_km:    distKm,
          monthly_price:  price,
          comment:        comment || null,
          status:         'new',
        })
        .select('id')
        .single();

      if (famErr || !newFamily) {
        errors.push(`Строка ${i + 2}: ${famErr?.message ?? 'неизвестная ошибка'}`);
        continue;
      }

      const familyId = newFamily.id;
      existingKeys.add(key);

      // ── Создаём ребёнка (если указан) ──────────────────────────────────────
      if (childName) {
        await supabase.from('children').insert({
          family_id:         familyId,
          child_name:        childName,
          class:             childClass || null,
          school_code:       schoolCode,
          zone,
          vehicle_type:      vehicleType,
          self_exit_allowed: false,
        });
      }

      // ── Создаём начисления (депозит + сентябрь) ────────────────────────────
      const basePayment = {
        family_id:         familyId,
        school_code:       schoolCode,
        amount:            price,
        manager_amount:    0,
        manager_date:      null,
        has_receipt:       false,
        accountant_status: 'Не оплачено',
        fact_amount:       0,
        fact_date:         null,
        is_frozen:         false,
        comment:           '',
      };

      await supabase.from('payments').insert([
        { ...basePayment, period_key: 'deposit', month: 0, year: 2026 },
        { ...basePayment, period_key: '9',       month: 9, year: 2026 },
      ]);

      // ── Помечаем строку как импортированную (колонка M) ────────────────────
      // Это опционально — нужен OAuth токен для записи. Пока просто считаем по флагу.

      imported++;
    } catch (e: any) {
      errors.push(`Строка ${i + 2}: ${e.message}`);
    }
  }

  return Response.json({
    ok: true,
    message: `Синхронизация завершена`,
    imported,
    skipped,
    errors: errors.length ? errors : undefined,
  });
});
