/**
 * OutWay registration webhook v2.
 *
 * Netlify does not need changes. The current site keeps sending the same
 * payload to this Apps Script URL. This script writes the request into the
 * existing Google Sheet and into the new Supabase v2_* tables.
 *
 * Required Script Properties:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY  recommended
 *   or SUPABASE_KEY            fallback if RLS/policies allow it
 * - SPREADSHEET_ID
 *
 * Optional Script Properties:
 * - FAMILY_COUNTER_KEY, default OUTWAY_FAMILY_COUNTER_V2
 */

const SPREADSHEET_ID = prop_('SPREADSHEET_ID', '1pI1oTTmqgnSEV_Al1dvWs9AXJ7mfDfiu2pRgBTXnmnw');
const FAMILY_COUNTER_KEY = prop_('FAMILY_COUNTER_KEY', 'OUTWAY_FAMILY_COUNTER_V2');
const SUPABASE_URL = prop_('SUPABASE_URL', 'https://mmcxugtxnfsafgxbpbix.supabase.co');
const SUPABASE_KEY = prop_('SUPABASE_SERVICE_ROLE_KEY', prop_('SUPABASE_KEY', ''));

const FAQ_HEADERS = ['Category', 'Question', 'Answer', 'Active'];

const HEADERS = [
  'FamilyID', 'SchoolCode', 'SchoolName', 'BranchName', 'SchoolAddress',
  'ManagerPhone', 'ParentName', 'Phone', 'PhoneTelegram', 'SecondPhone',
  'SecondPhoneTelegram', 'ContactName', 'ContactPhone', 'ContactPhoneTelegram',
  'ChildName', 'Class', 'SelfExitAllowed', 'FullAddress', 'Latitude', 'Longitude',
  'DistanceKM', 'RouteSource', 'Zone', 'VehicleType', 'VehicleLabel',
  'MonthlyPrice', 'Comment', 'CreatedAt'
];

const SCHOOL_CODE_TO_BRANCH = {
  KINGS: 'KNG',
  LIGHT: 'LA',
  BILIM: 'BKG',
  AES: 'AES',
  KAS: 'KAS',
  AES_KAS: 'AES',
  EPSILON: 'EPS',
  EPS: 'EPS',
  EDISON: 'EDI',
  EDI: 'EDI',
  ERUDIT: 'ERU',
  ERU: 'ERU',
  TENSAY: 'TIS',
  TENSAI: 'TIS',
  TIS: 'TIS',
  NOVA: 'NOVA',
  INDIGO: 'ING',
  ING: 'ING',
  ING_A: 'ING_A',
  ING_P: 'ING_P',
  ING_W: 'ING_W',
  GENIUS: 'GEN2',
  GEN2: 'GEN2',
  GENIUS4: 'GEN4',
  GEN4: 'GEN4'
};

const BRANCH_NAME_TO_CODE = {
  'Kings International School': 'KNG',
  'Light Academy': 'LA',
  'Билим Бишкек Kg': 'BKG',
  'Билим Бишкек KG': 'BKG',
  'Билим Бишкек kg': 'BKG',
  'American-European School': 'AES',
  'Kyrgyz-American School': 'KAS',
  'Эпсилон': 'EPS',
  'Epsilon': 'EPS',
  'Edison': 'EDI',
  'Эдисон': 'EDI',
  'Эрудит-ISIT': 'ERU',
  'Тенсай': 'TIS',
  'школа Тенсай': 'TIS',
  'Nova International School': 'NOVA',
  'Индиго Kids': 'ING',
  'Индиго кидс': 'ING',
  'Asylkech Girls School': 'ING_A',
  'AsylKech Girls School': 'ING_A',
  'Indigo Prime Academy': 'ING_P',
  'Indigo West': 'ING_W',
  'Гениум Чуйкова': 'GEN2',
  'Гениум — Чуйкова': 'GEN2',
  'Гениум Авангард': 'GEN4',
  'Гениум Авангард Сити': 'GEN4',
  'Гениум — Авангард': 'GEN4'
};

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  if (action === 'faq') return json_({ ok: true, faq: getFaq_() });
  if (action === 'schools') return json_({ ok: true, schools: getSchools_() });
  if (action === 'upload-v2-sheet') return json_(uploadSheetToSupabaseV2(text_(e.parameter.sheet)));
  if (action === 'upload-v2') return json_(uploadAllToSupabaseV2());
  return json_({ ok: true, service: 'OutWay Registration Platform v2' });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    validatePayload(payload);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    const newChildren = [];
    const duplicateChildren = [];

    payload.children.forEach(child => {
      if (isDuplicateV2_(child.name, payload.phone, payload.fullAddress)) {
        duplicateChildren.push(child.name);
      } else {
        newChildren.push(child);
      }
    });

    if (newChildren.length === 0) {
      lock.releaseLock();
      return json_({ ok: true, familyId: 'DUPLICATE', duplicates: duplicateChildren });
    }

    const familyId = nextFamilyId_();
    const sheet = getSchoolSheet_(payload.schoolCode);
    ensureHeaders_(sheet);
    appendToSheet_(sheet, familyId, payload, newChildren);
    lock.releaseLock();

    syncToSupabaseV2_(familyId, payload, newChildren, getSchoolSheetName_(payload.schoolCode));

    return json_({ ok: true, familyId, duplicates: duplicateChildren });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function appendToSheet_(sheet, familyId, payload, children) {
  const rows = children.map(child => [
    familyId,
    payload.schoolCode,
    payload.schoolName,
    payload.branchName,
    payload.schoolAddress,
    payload.managerPhone,
    payload.parentName,
    payload.phone,
    payload.phoneTelegram,
    payload.secondPhone,
    payload.secondPhoneTelegram,
    payload.contactName,
    payload.contactPhone,
    payload.contactPhoneTelegram,
    child.name,
    child.className,
    child.selfExitAllowed,
    payload.fullAddress,
    payload.latitude,
    payload.longitude,
    payload.distanceKm,
    payload.routeSource,
    payload.zone,
    payload.vehicleType,
    payload.vehicleLabel,
    payload.monthlyPrice,
    payload.comment,
    payload.createdAt || new Date().toISOString()
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
}

function syncToSupabaseV2_(familyId, payload, children, sourceSheet) {
  const branchCode = resolveBranchCode_(payload.schoolCode, payload.branchName);
  const branch = getBranchByCode_(branchCode);
  if (!branch) throw new Error('Branch not found in v2_school_branches: ' + branchCode);

  const createdAt = payload.createdAt || new Date().toISOString();
  const familyData = {
    id: familyId,
    parent_name: text_(payload.parentName),
    phone: normalizePhone_(payload.phone),
    phone_telegram: toBool_(payload.phoneTelegram),
    second_phone: normalizePhone_(payload.secondPhone),
    second_phone_telegram: toBool_(payload.secondPhoneTelegram),
    contact_name: text_(payload.contactName),
    contact_phone: normalizePhone_(payload.contactPhone),
    contact_phone_telegram: toBool_(payload.contactPhoneTelegram),
    comment: text_(payload.comment),
    status: 'new',
    created_at: createdAt
  };

  supabaseUpsert_('v2_families', familyData, 'id');
  ensureWalletV2_(familyId);

  const basePrice = moneyNumber_(payload.monthlyPrice);
  children.forEach((child, index) => {
    const siblingDiscount = index === 0 ? 0 : 5;
    const finalPrice = roundMoney_(basePrice * (1 - siblingDiscount / 100));
    const childData = {
      family_id: familyId,
      child_name: text_(child.name),
      class_name: text_(child.className),
      self_exit_allowed: child.selfExitAllowed === 'Да' || child.selfExitAllowed === true,
      school_id: branch.school_id,
      branch_id: branch.id,
      address: text_(payload.fullAddress),
      latitude: toFloatOrNull_(payload.latitude),
      longitude: toFloatOrNull_(payload.longitude),
      distance_km: toFloatOrNull_(payload.distanceKm),
      zone: normalizeZone_(payload.zone),
      vehicle_type: normalizeVehicle_(payload.vehicleType),
      base_price: basePrice,
      sibling_discount_percent: siblingDiscount,
      manual_discount_percent: 0,
      manual_discount_amount: 0,
      final_price: finalPrice,
      status: 'new',
      source_family_id: familyId,
      source_sheet: sourceSheet,
      created_at: createdAt
    };

    upsertChildV2_(childData);
  });

  auditV2_(familyId, 'create_application', 'family', familyId, null, {
    family_id: familyId,
    children_count: children.length,
    branch_code: branchCode
  }, 'Application accepted from Netlify form');
}

function upsertChildV2_(childData) {
  if (!childData.child_name || childData.child_name.toLowerCase() === 'нет') return;

  const query = 'v2_children'
    + '?family_id=eq.' + encodeURIComponent(childData.family_id)
    + '&child_name=eq.' + encodeURIComponent(childData.child_name)
    + '&class_name=eq.' + encodeURIComponent(childData.class_name || '')
    + '&select=id';
  const existing = supabaseGet_(query);

  if (existing.length) {
    supabasePatch_('v2_children?id=eq.' + encodeURIComponent(existing[0].id), childData);
  } else {
    supabaseInsert_('v2_children', childData);
  }
}

function ensureWalletV2_(familyId) {
  supabaseUpsert_('v2_family_wallets', {
    family_id: familyId,
    main_balance: 0,
    deposit_balance: 0
  }, 'family_id');
}

function auditV2_(actorName, action, entityType, entityId, oldValue, newValue, comment) {
  try {
    supabaseInsert_('v2_audit_log', {
      actor_name: actorName || 'Apps Script',
      action: action,
      entity_type: entityType,
      entity_id: String(entityId || ''),
      old_value: oldValue,
      new_value: newValue,
      comment: comment || null
    });
  } catch (err) {
    Logger.log('audit failed: ' + err.message);
  }
}

function isDuplicateV2_(childName, phone, fullAddress) {
  if (!childName || !phone || !fullAddress) return false;

  const normalName = text_(childName).toLowerCase();
  const normalPhone = normalizePhone_(phone);
  const normalAddress = text_(fullAddress).toLowerCase();

  const children = supabaseGet_(
    'v2_children?child_name=ilike.' + encodeURIComponent(normalName)
    + '&select=family_id,child_name,address'
  );

  for (const child of children) {
    const fams = supabaseGet_(
      'v2_families?id=eq.' + encodeURIComponent(child.family_id)
      + '&select=phone,second_phone'
    );
    if (!fams.length) continue;

    const fam = fams[0];
    const phoneMatch = normalPhone === normalizePhone_(fam.phone) || normalPhone === normalizePhone_(fam.second_phone);
    if (!phoneMatch) continue;

    const childAddress = text_(child.address).toLowerCase();
    if (childAddress === normalAddress) return true;
  }

  return false;
}

function uploadAllToSupabaseV2() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();

  let totalFamilies = 0;
  let totalChildren = 0;
  let errors = 0;
  const messages = [];

  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    const headers = data[0];
    if (!headers.includes('FamilyID')) return;

    const families = {};
    data.slice(1).forEach(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      const fid = obj.FamilyID;
      if (!fid) return;
      if (!families[fid]) families[fid] = { family: obj, children: [] };
      if (obj.ChildName && text_(obj.ChildName).toLowerCase() !== 'нет') families[fid].children.push(obj);
    });

    Object.keys(families).forEach(fid => {
      const item = families[fid];
      const family = item.family;
      const children = item.children.map(c => ({
        name: c.ChildName,
        className: c.Class,
        selfExitAllowed: c.SelfExitAllowed
      }));
      if (!children.length) return;

      const payload = {
        schoolCode: family.SchoolCode,
        schoolName: family.SchoolName || family['Школа'],
        branchName: family.BranchName,
        schoolAddress: family.SchoolAddress || family['Адрес школы'],
        managerPhone: family.ManagerPhone || family['Номер менеджера'],
        parentName: family.ParentName || family['ФИО Заказчик'],
        phone: family.Phone || family['Номер 1'],
        phoneTelegram: family.PhoneTelegram || family['Телеграм 1'],
        secondPhone: family.SecondPhone || family['Телефон 2'],
        secondPhoneTelegram: family.SecondPhoneTelegram || family['Телеграм 2'],
        contactName: family.ContactName || family['Доп.контакт'],
        contactPhone: family.ContactPhone || family['номер дк'],
        contactPhoneTelegram: family.ContactPhoneTelegram || family['Телеграм дк'],
        fullAddress: family.FullAddress || family['Адрес'],
        latitude: family.Latitude,
        longitude: family.Longitude,
        distanceKm: family.DistanceKM || family['Расстояние'],
        routeSource: family.RouteSource,
        zone: family.Zone || family['Зона'],
        vehicleType: family.VehicleType,
        vehicleLabel: family.VehicleLabel || family['Тип ТС'],
        monthlyPrice: family.MonthlyPrice || family['ЦЕНА за месяц'],
        comment: family.Comment || family['комментарии'],
        createdAt: family.CreatedAt,
        children
      };

      try {
        syncToSupabaseV2_(fid, payload, children, sheet.getName());
        totalFamilies++;
        totalChildren += children.length;
      } catch (err) {
        errors++;
        messages.push(fid + ': ' + err.message);
      }
    });
  });

  return { ok: errors === 0, families: totalFamilies, children: totalChildren, errors, messages };
}

function uploadSheetToSupabaseV2(sheetName) {
  if (!sheetName) throw new Error('Missing sheet parameter');

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, sheet: sheetName, families: 0, children: 0, errors: 0, messages: [] };

  const headers = data[0];
  if (!headers.includes('FamilyID')) return { ok: true, sheet: sheetName, skipped: true, reason: 'No FamilyID header' };

  const families = {};
  data.slice(1).forEach(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    const fid = obj.FamilyID;
    if (!fid) return;
    if (!families[fid]) families[fid] = { family: obj, children: [] };
    if (obj.ChildName && text_(obj.ChildName).toLowerCase() !== 'нет') families[fid].children.push(obj);
  });

  let totalFamilies = 0;
  let totalChildren = 0;
  let errors = 0;
  const messages = [];

  Object.keys(families).forEach(fid => {
    const item = families[fid];
    const family = item.family;
    const children = item.children.map(c => ({
      name: c.ChildName,
      className: c.Class,
      selfExitAllowed: c.SelfExitAllowed
    }));
    if (!children.length) return;

    const payload = {
      schoolCode: family.SchoolCode,
      schoolName: family.SchoolName || family['Школа'],
      branchName: family.BranchName,
      schoolAddress: family.SchoolAddress || family['Адрес школы'],
      managerPhone: family.ManagerPhone || family['Номер менеджера'],
      parentName: family.ParentName || family['ФИО Заказчик'],
      phone: family.Phone || family['Номер 1'],
      phoneTelegram: family.PhoneTelegram || family['Телеграм 1'],
      secondPhone: family.SecondPhone || family['Телефон 2'],
      secondPhoneTelegram: family.SecondPhoneTelegram || family['Телеграм 2'],
      contactName: family.ContactName || family['Доп.контакт'],
      contactPhone: family.ContactPhone || family['номер дк'],
      contactPhoneTelegram: family.ContactPhoneTelegram || family['Телеграм дк'],
      fullAddress: family.FullAddress || family['Адрес'],
      latitude: family.Latitude,
      longitude: family.Longitude,
      distanceKm: family.DistanceKM || family['Расстояние'],
      routeSource: family.RouteSource,
      zone: family.Zone || family['Зона'],
      vehicleType: family.VehicleType,
      vehicleLabel: family.VehicleLabel || family['Тип ТС'],
      monthlyPrice: family.MonthlyPrice || family['ЦЕНА за месяц'],
      comment: family.Comment || family['комментарии'],
      createdAt: family.CreatedAt,
      children
    };

    try {
      syncToSupabaseV2_(fid, payload, children, sheetName);
      totalFamilies++;
      totalChildren += children.length;
    } catch (err) {
      errors++;
      messages.push(fid + ': ' + err.message);
    }
  });

  return { ok: errors === 0, sheet: sheetName, families: totalFamilies, children: totalChildren, errors, messages };
}

function getSchools_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Schools');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  return data.slice(1)
    .filter(row => row[0])
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return {
        code: String(obj.code || ''),
        name: String(obj.name || ''),
        lat: parseFloat(obj.lat) || 0,
        lng: parseFloat(obj.lng) || 0,
        address: String(obj.address || ''),
        manager: String(obj.manager || ''),
        zone1_price: parseInt(obj.zone1_price, 10) || 0,
        zone2_price: parseInt(obj.zone2_price, 10) || 0,
        zone3_price: parseInt(obj.zone3_price, 10) || 0,
        access_key: String(obj.access_key || ''),
        active: obj.active === true || String(obj.active).toUpperCase() === 'TRUE' || String(obj.active) === 'ИСТИНА'
      };
    })
    .filter(s => s.active);
}

function getFaq_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('FAQ');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, FAQ_HEADERS.length).getValues();
  return values
    .map(row => ({
      category: row[0],
      question: row[1],
      answer: row[2],
      active: String(row[3]).toLowerCase() === 'true' || row[3] === true || String(row[3]) === 'ИСТИНА'
    }))
    .filter(item => item.active);
}

function getBranchByCode_(code) {
  const rows = supabaseGet_(
    'v2_school_branches?code=eq.' + encodeURIComponent(code)
    + '&select=id,school_id,code,name,short_name'
  );
  return rows[0] || null;
}

function resolveBranchCode_(schoolCode, branchName) {
  const branch = text_(branchName);
  if (BRANCH_NAME_TO_CODE[branch]) return BRANCH_NAME_TO_CODE[branch];

  const school = text_(schoolCode).toUpperCase();
  if (SCHOOL_CODE_TO_BRANCH[school]) return SCHOOL_CODE_TO_BRANCH[school];

  return school;
}

function getSchoolSheet_(schoolCode) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const name = getSchoolSheetName_(schoolCode);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getSchoolSheetName_(schoolCode) {
  const code = text_(schoolCode).toUpperCase();
  if (code === 'TENSAY') return 'TENSAI';
  if (code === 'EPSILON') return 'EPS';
  return code || 'UNKNOWN';
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (!HEADERS.every((h, i) => existing[i] === h)) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function validatePayload(payload) {
  const required = ['schoolCode', 'parentName', 'phone', 'fullAddress', 'latitude', 'longitude', 'distanceKm', 'zone', 'monthlyPrice'];
  required.forEach(key => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      throw new Error('Missing field: ' + key);
    }
  });
  if (!Array.isArray(payload.children) || payload.children.length === 0) {
    throw new Error('At least one child is required');
  }
}

function supabaseGet_(path) {
  return supabaseRequest_(path, 'GET');
}

function supabaseInsert_(table, data) {
  return supabaseRequest_(table, 'POST', data);
}

function supabasePatch_(path, data) {
  return supabaseRequest_(path, 'PATCH', data);
}

function supabaseUpsert_(table, data, conflictColumn) {
  const path = table + '?on_conflict=' + encodeURIComponent(conflictColumn);
  return supabaseRequest_(path, 'POST', data, { Prefer: 'resolution=merge-duplicates,return=representation' });
}

function supabaseRequest_(path, method, data, extraHeaders) {
  if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY');

  const options = {
    method,
    muteHttpExceptions: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      Prefer: 'return=representation',
      ...(extraHeaders || {})
    }
  };
  if (data !== undefined) options.payload = JSON.stringify(data);

  const res = UrlFetchApp.fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path, options);
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(method + ' ' + path + ' failed: ' + code + ' ' + body);
  }
  return body ? JSON.parse(body) : [];
}

function nextFamilyId_() {
  const props = PropertiesService.getScriptProperties();
  const current = Number(props.getProperty(FAMILY_COUNTER_KEY) || 0) + 1;
  props.setProperty(FAMILY_COUNTER_KEY, String(current));
  return 'FAM-' + String(current).padStart(6, '0');
}

function prop_(key, fallback) {
  const props = PropertiesService.getScriptProperties();
  const value = props.getProperty(key);
  return value || fallback;
}

function normalizePhone_(phone) {
  return text_(phone).replace(/\D/g, '');
}

function normalizeZone_(zone) {
  const value = text_(zone).toUpperCase();
  if (value === 'A' || value === 'А' || value === '1') return 'A';
  if (value === 'B' || value === 'В' || value === '2') return 'B';
  if (value === 'C' || value === 'С' || value === '3') return 'C';
  return 'A';
}

function normalizeVehicle_(vehicle) {
  const value = text_(vehicle).toLowerCase();
  if (['minivan', 'минивэн', 'мини-вэн', 'мини вэн'].indexOf(value) >= 0) return 'minivan';
  if (['sedan', 'car', 'седан'].indexOf(value) >= 0) return 'sedan';
  return 'microbus';
}

function toBool_(value) {
  return value === true || value === 'true' || value === 'TRUE' || value === 'Да' || value === 'ИСТИНА';
}

function toFloatOrNull_(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return isNaN(parsed) ? null : parsed;
}

function moneyNumber_(value) {
  const parsed = toFloatOrNull_(value);
  return parsed === null ? 0 : parsed;
}

function roundMoney_(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function text_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
