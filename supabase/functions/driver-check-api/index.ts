import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  canCorrectDriverMarks,
  canManageDriverLinks,
  allowedBranchIds,
  bishkekToday,
  BranchRow,
  isUuid,
  isValidToken,
  LOGISTICS_VIEW_ROLES,
  monthDateBounds,
  resolveSchoolTab,
  roundOfIsoDate,
  sortChildrenForDriver,
} from './helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH_SIZE = 40;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session',
};

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

async function verifySession(token: string): Promise<{ sub: string } | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SUPABASE_SERVICE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  if (!await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart))) {
    return null;
  }
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  if (!payload?.sub || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { sub: String(payload.sub) };
}

async function requireEmployee(db: ReturnType<typeof createClient>, request: Request) {
  let session: { sub: string } | null;
  try {
    session = await verifySession(request.headers.get('x-employee-session') ?? '');
  } catch {
    session = null;
  }
  if (!session) throw new UserError('Сессия недействительна или истекла', 401);

  const { data: employee, error } = await db
    .from('v2_employees')
    .select('id,full_name,role,status,school_keys')
    .eq('id', session.sub)
    .maybeSingle();
  if (error) throw error;
  if (!employee || employee.status !== 'active' || !LOGISTICS_VIEW_ROLES.has(employee.role)) {
    throw new UserError('Нет доступа к сверке логистики', 403);
  }
  return employee as { id: string; full_name: string; role: string; status: string; school_keys: string[] | null };
}

async function findTransferByToken(db: ReturnType<typeof createClient>, rawToken: unknown) {
  if (!isValidToken(rawToken)) {
    throw new UserError('Ссылка недействительна. Попросите новую у логиста.', 404);
  }
  const token = rawToken.trim().toLowerCase();
  const { data: transfer, error } = await db
    .from('v2_transfers')
    .select('id, branch_id, driver_id, transfer_number, vehicle_type, status')
    .eq('driver_link_token', token)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!transfer) {
    throw new UserError('Ссылка устарела или трансфер неактивен. Попросите новую ссылку у логиста.', 404);
  }
  return transfer as {
    id: string;
    branch_id: string | null;
    driver_id: string | null;
    transfer_number: number;
    vehicle_type: string;
    status: string;
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    const action = String(body?.action ?? '');
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const today = bishkekToday();

    // 1. Страница водителя: список детей своего трансфера и отметки за сегодня.
    if (action === 'driver_get') {
      const transfer = await findTransferByToken(db, body.token);

      const [branchRes, driverRes, childrenRes, marksRes, submissionRes] = await Promise.all([
        transfer.branch_id
          ? db.from('v2_school_branches').select('id,code,short_name,name').eq('id', transfer.branch_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        transfer.driver_id
          ? db.from('v2_drivers').select('id,full_name').eq('id', transfer.driver_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        db
          .from('v2_children')
          .select('id,child_name,address,stop_order,status')
          .eq('transfer_id', transfer.id)
          .neq('status', 'rejected'),
        db
          .from('v2_driver_check_marks')
          .select('child_id,present,marked_at')
          .eq('transfer_id', transfer.id)
          .eq('check_date', today),
        db
          .from('v2_driver_check_submissions')
          .select('submitted_at')
          .eq('transfer_id', transfer.id)
          .eq('check_date', today)
          .maybeSingle(),
      ]);

      if (branchRes.error) throw branchRes.error;
      if (driverRes.error) throw driverRes.error;
      if (childrenRes.error) throw childrenRes.error;
      if (marksRes.error) throw marksRes.error;
      if (submissionRes.error) throw submissionRes.error;

      const school = resolveSchoolTab(branchRes.data as BranchRow | null);
      const markByChild = new Map(
        (marksRes.data ?? []).map(row => [String(row.child_id), { present: Boolean(row.present), markedAt: row.marked_at as string }]),
      );
      const sorted = sortChildrenForDriver(
        (childrenRes.data ?? []).map(row => ({
          id: String(row.id),
          child_name: String(row.child_name ?? ''),
          address: String(row.address ?? ''),
          stop_order: row.stop_order === null || row.stop_order === undefined ? null : Number(row.stop_order),
        })),
      );

      return response({
        ok: true,
        date: today,
        transfer: {
          id: transfer.id,
          transferNumber: transfer.transfer_number,
          schoolLabel: school.label,
          driverName: driverRes.data?.full_name ? String(driverRes.data.full_name) : '',
        },
        submittedAt: submissionRes.data?.submitted_at ?? null,
        children: sorted.map(child => {
          const mark = markByChild.get(child.id);
          return {
            id: child.id,
            childName: child.child_name,
            address: child.address,
            stopOrder: child.stop_order,
            present: mark?.present ?? false,
            markedAt: mark?.markedAt ?? null,
          };
        }),
      });
    }

    // 2. Водитель сохраняет всю сверку целиком одной кнопкой «Сохранить».
    if (action === 'driver_save') {
      const transfer = await findTransferByToken(db, body.token);
      const rawMarks = Array.isArray(body.marks) ? body.marks : [];
      const markedAt = new Date().toISOString();

      const { data: children, error: childrenError } = await db
        .from('v2_children')
        .select('id')
        .eq('transfer_id', transfer.id)
        .neq('status', 'rejected');
      if (childrenError) throw childrenError;

      const validChildIds = new Set((children ?? []).map(c => String(c.id)));
      const rowsToUpsert = rawMarks
        .filter((item: { childId?: unknown; present?: unknown }) => item && isUuid(item.childId) && validChildIds.has(String(item.childId)))
        .map((item: { childId: string; present?: unknown }) => ({
          transfer_id: transfer.id,
          child_id: String(item.childId),
          check_date: today,
          present: Boolean(item.present),
          marked_at: markedAt,
        }));

      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await db
          .from('v2_driver_check_marks')
          .upsert(rowsToUpsert, { onConflict: 'transfer_id,child_id,check_date' });
        if (upsertError) throw upsertError;
      }

      await db
        .from('v2_driver_check_submissions')
        .upsert(
          {
            transfer_id: transfer.id,
            check_date: today,
            submitted_at: markedAt,
          },
          { onConflict: 'transfer_id,check_date' },
        );

      return response({ ok: true, date: today, savedCount: rowsToUpsert.length, savedAt: markedAt });
    }

    // 3. Водитель ставит или снимает галочку на ребёнке за сегодня (одиночный toggle).
    if (action === 'driver_toggle') {
      const transfer = await findTransferByToken(db, body.token);
      if (!isUuid(body.childId)) throw new UserError('Ребёнок не найден');
      const present = Boolean(body.present);

      const { data: child, error: childError } = await db
        .from('v2_children')
        .select('id')
        .eq('id', body.childId)
        .eq('transfer_id', transfer.id)
        .neq('status', 'rejected')
        .maybeSingle();
      if (childError) throw childError;
      if (!child) throw new UserError('Ребёнок не относится к этому трансферу', 404);

      const markedAt = new Date().toISOString();
      const { error: upsertError } = await db
        .from('v2_driver_check_marks')
        .upsert(
          {
            transfer_id: transfer.id,
            child_id: child.id,
            check_date: today,
            present,
            marked_at: markedAt,
          },
          { onConflict: 'transfer_id,child_id,check_date' },
        );
      if (upsertError) throw upsertError;

      return response({ ok: true, date: today, childId: child.id, present, markedAt });
    }

    // 3. Водитель нажал «Отправить в WhatsApp» — фиксируем время отправки.
    if (action === 'driver_submit') {
      const transfer = await findTransferByToken(db, body.token);
      const submittedAt = new Date().toISOString();
      const { error: submitError } = await db
        .from('v2_driver_check_submissions')
        .upsert(
          {
            transfer_id: transfer.id,
            check_date: today,
            submitted_at: submittedAt,
          },
          { onConflict: 'transfer_id,check_date' },
        );
      if (submitError) throw submitError;

      return response({ ok: true, date: today, submittedAt });
    }

    // Ниже — только действия для авторизованных сотрудников логистики CRM.
    const employee = await requireEmployee(db, request);
    const { data: branchesData, error: branchError } = await db
      .from('v2_school_branches')
      .select('id,code,short_name,name');
    if (branchError) throw branchError;
    const branches = (branchesData ?? []) as BranchRow[];
    const branchById = new Map(branches.map(branch => [branch.id, branch]));
    const scope = allowedBranchIds(employee, branches);

    // 4. Вкладка «Сверка» в CRM (Логистика): 4 сверки за выбранный месяц + ссылки трансферов.
    if (action === 'crm_month') {
      const year = Number.parseInt(String(body.year ?? ''), 10);
      const month = Number.parseInt(String(body.month ?? ''), 10);
      if (!Number.isFinite(year) || year < 2024 || year > 2035 || !Number.isFinite(month) || month < 1 || month > 12) {
        throw new UserError('Некорректный период');
      }
      const { start, end } = monthDateBounds(year, month);
      const requestedSchool = String(body.schoolKey ?? '').trim().toUpperCase();

      let targetBranchIds: string[] | null = scope;
      if (requestedSchool && requestedSchool !== 'ALL') {
        const schoolBranches = branches
          .filter(branch => resolveSchoolTab(branch).key.toUpperCase() === requestedSchool)
          .map(branch => branch.id);
        targetBranchIds = scope === null
          ? schoolBranches
          : schoolBranches.filter(id => scope.includes(id));
      }

      if (targetBranchIds !== null && targetBranchIds.length === 0) {
        return response({ ok: true, year, month, today, currentRound: roundOfIsoDate(today), transfers: [], marksByChild: {} });
      }

      let transfersQuery = db
        .from('v2_transfers')
        .select('id,branch_id,driver_id,transfer_number,vehicle_type,driver_link_token,is_test,status')
        .eq('status', 'active')
        .eq('is_test', false);
      if (targetBranchIds !== null) {
        transfersQuery = transfersQuery.in('branch_id', targetBranchIds);
      }
      const { data: transfersData, error: transfersError } = await transfersQuery;
      if (transfersError) throw transfersError;

      const transfers = (transfersData ?? []) as Array<{
        id: string;
        branch_id: string | null;
        driver_id: string | null;
        transfer_number: number;
        vehicle_type: string;
        driver_link_token: string;
      }>;

      if (!transfers.length) {
        return response({ ok: true, year, month, today, currentRound: roundOfIsoDate(today), transfers: [], marksByChild: {} });
      }

      const transferIds = transfers.map(item => item.id);
      const driverIds = Array.from(new Set(transfers.map(item => item.driver_id).filter((id): id is string => Boolean(id))));

      const markRows: Array<{
        transfer_id: string;
        child_id: string;
        check_date: string;
        present: boolean;
        marked_at: string;
      }> = [];
      const submissionRows: Array<{
        transfer_id: string;
        check_date: string;
        submitted_at: string;
      }> = [];

      const batchPromises: Promise<void>[] = [];
      for (let i = 0; i < transferIds.length; i += BATCH_SIZE) {
        const chunk = transferIds.slice(i, i + BATCH_SIZE);
        batchPromises.push((async () => {
          // Пагинация по 1000 строк на случай активного месяца с большим числом отметок.
          let from = 0;
          while (true) {
            const { data: chunkMarks, error: marksError } = await db
              .from('v2_driver_check_marks')
              .select('transfer_id,child_id,check_date,present,marked_at')
              .in('transfer_id', chunk)
              .gte('check_date', start)
              .lte('check_date', end)
              .range(from, from + 999);
            if (marksError) throw marksError;
            const rows = (chunkMarks ?? []) as typeof markRows;
            markRows.push(...rows);
            if (rows.length < 1000) break;
            from += 1000;
          }

          const { data: chunkSubs, error: subsError } = await db
            .from('v2_driver_check_submissions')
            .select('transfer_id,check_date,submitted_at')
            .in('transfer_id', chunk)
            .gte('check_date', start)
            .lte('check_date', end)
            .limit(1000);
          if (subsError) throw subsError;
          submissionRows.push(...(chunkSubs ?? []) as typeof submissionRows);
        })());
      }

      const driverMap = new Map<string, { full_name: string; phone: string }>();
      if (driverIds.length > 0) {
        const { data: driversData, error: driversError } = await db
          .from('v2_drivers')
          .select('id,full_name,phone')
          .in('id', driverIds);
        if (driversError) throw driversError;
        for (const driver of driversData ?? []) {
          driverMap.set(String(driver.id), {
            full_name: String(driver.full_name ?? ''),
            phone: String(driver.phone ?? ''),
          });
        }
      }

      await Promise.all(batchPromises);

      // Для каждого трансфера фиксируем, какие сверки 1..4 реально проводились водителем.
      const roundsByTransfer = new Map<string, Partial<Record<1 | 2 | 3 | 4, { checked: boolean; lastAt: string | null }>>>();
      const touchTransferRound = (transferId: string, round: 1 | 2 | 3 | 4, at: string) => {
        const entry = roundsByTransfer.get(transferId) ?? {};
        const prev = entry[round];
        if (!prev || !prev.lastAt || at > prev.lastAt) {
          entry[round] = { checked: true, lastAt: at };
        }
        roundsByTransfer.set(transferId, entry);
      };

      // Для каждого ребёнка в каждой сверке 1..4 берём самую свежую отметку внутри этой сверки.
      const marksByChild: Record<
        string,
        Partial<Record<1 | 2 | 3 | 4, { present: boolean; checkDate: string; markedAt: string }>>
      > = {};

      for (const mark of markRows) {
        const round = roundOfIsoDate(mark.check_date);
        if (mark.present) {
          touchTransferRound(mark.transfer_id, round, mark.marked_at);
        }
        const childEntry = marksByChild[mark.child_id] ?? {};
        const prev = childEntry[round];
        if (!prev || mark.check_date > prev.checkDate || (mark.check_date === prev.checkDate && mark.marked_at >= prev.markedAt)) {
          childEntry[round] = {
            present: Boolean(mark.present),
            checkDate: mark.check_date,
            markedAt: mark.marked_at,
          };
        }
        marksByChild[mark.child_id] = childEntry;
      }

      for (const sub of submissionRows) {
        const round = roundOfIsoDate(sub.check_date);
        touchTransferRound(sub.transfer_id, round, sub.submitted_at);
      }

      const linksAllowed = canManageDriverLinks(employee.role);
      const resultTransfers = transfers
        .map(transfer => {
          const school = resolveSchoolTab(transfer.branch_id ? branchById.get(transfer.branch_id) : null);
          const driver = transfer.driver_id ? driverMap.get(transfer.driver_id) : undefined;
          return {
            transferId: transfer.id,
            schoolKey: school.key,
            schoolLabel: school.label,
            branchId: transfer.branch_id,
            transferNumber: transfer.transfer_number,
            vehicleType: transfer.vehicle_type,
            driverId: transfer.driver_id,
            driverName: driver?.full_name ?? '',
            driverPhone: driver?.phone ?? '',
            driverLinkToken: linksAllowed ? transfer.driver_link_token : '',
            rounds: roundsByTransfer.get(transfer.id) ?? {},
          };
        })
        .sort((a, b) => a.schoolLabel.localeCompare(b.schoolLabel, 'ru') || a.transferNumber - b.transferNumber);

      return response({
        ok: true,
        year,
        month,
        today,
        currentRound: roundOfIsoDate(today),
        transfers: resultTransfers,
        marksByChild,
      });
    }

    // 5. Обновить секретную ссылку трансфера (если сменился водитель — старая перестанет открываться).
    if (action === 'crm_correct_mark') {
      if (!canCorrectDriverMarks(employee.id, employee.role)) {
        throw new UserError('Исправлять сверку могут только владелец и начальник логистики', 403);
      }
      if (!isUuid(body.transferId) || !isUuid(body.childId) || (body.present !== null && typeof body.present !== 'boolean')) {
        throw new UserError('Некорректная отметка');
      }
      const year = Number(body.year);
      const month = Number(body.month);
      const round = Number(body.round);
      if (!Number.isInteger(year) || year < 2024 || year > 2035 || !Number.isInteger(month) || month < 1 || month > 12 || ![1,2,3,4].includes(round)) {
        throw new UserError('Некорректный период');
      }
      const { data: child, error: childError } = await db.from('v2_children').select('id,branch_id,transfer_id').eq('id', body.childId).maybeSingle();
      if (childError) throw childError;
      if (!child || child.transfer_id !== body.transferId || (scope !== null && !scope.includes(String(child.branch_id)))) {
        throw new UserError('Ребёнок не найден в доступном трансфере', 403);
      }
      const startDay = [1,8,15,22][round - 1];
      const lastDay = round === 4 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : startDay + 6;
      const prefix = `${year}-${String(month).padStart(2, '0')}-`;
      const start = prefix + String(startDay).padStart(2, '0');
      const end = prefix + String(lastDay).padStart(2, '0');
      if (body.present === null) {
        const { error: resetError } = await db.from('v2_driver_check_marks').delete()
          .eq('transfer_id', body.transferId).eq('child_id', body.childId)
          .gte('check_date', start).lte('check_date', end);
        if (resetError) throw resetError;
        return response({ ok: true });
      }
      const { data: marks, error: markError } = await db.from('v2_driver_check_marks').select('check_date')
        .eq('transfer_id', body.transferId).eq('child_id', body.childId).gte('check_date', start).lte('check_date', end)
        .order('check_date', { ascending: false }).limit(1);
      if (markError) throw markError;
      const { data: submissions, error: submissionError } = await db.from('v2_driver_check_submissions').select('check_date')
        .eq('transfer_id', body.transferId).gte('check_date', start).lte('check_date', end)
        .order('check_date', { ascending: false }).limit(1);
      if (submissionError) throw submissionError;
      const checkDate = marks?.[0]?.check_date ?? submissions?.[0]?.check_date ?? start;
      const { error: saveError } = await db.from('v2_driver_check_marks').upsert({
        transfer_id: body.transferId, child_id: body.childId, check_date: checkDate,
        present: body.present, marked_at: new Date().toISOString(),
      }, { onConflict: 'transfer_id,child_id,check_date' });
      if (saveError) throw saveError;
      return response({ ok: true });
    }

    if (action === 'crm_rotate_token') {
      if (!canManageDriverLinks(employee.role)) throw new UserError('Нет доступа к ссылкам водителей', 403);
      if (!isUuid(body.transferId)) throw new UserError('Трансфер не найден');
      const { data: transfer, error: findError } = await db
        .from('v2_transfers')
        .select('id,branch_id')
        .eq('id', body.transferId)
        .maybeSingle();
      if (findError) throw findError;
      if (!transfer) throw new UserError('Трансфер не найден', 404);
      if (scope !== null && (!transfer.branch_id || !scope.includes(String(transfer.branch_id)))) {
        throw new UserError('Нет доступа к этому трансферу', 403);
      }

      const nextToken = crypto.randomUUID().replaceAll('-', '');
      const { error: updateError } = await db
        .from('v2_transfers')
        .update({ driver_link_token: nextToken })
        .eq('id', transfer.id);
      if (updateError) throw updateError;

      return response({ ok: true, transferId: transfer.id, driverLinkToken: nextToken });
    }

    throw new UserError('Неизвестное действие');
  } catch (error) {
    if (error instanceof UserError) {
      return response({ ok: false, error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : 'Ошибка сервера';
    return response({ ok: false, error: message }, 500);
  }
});
