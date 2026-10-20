import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ROLES = new Set(['admin', 'gen_director', 'cashier']);
const PERSONAL_DETAILS_ROLES = new Set(['admin', 'gen_director']);
const ALLOWED_CATEGORIES = new Set(['school', 'office', 'logistics', 'extra_trip', 'personal']);
const ALLOWED_METHODS = new Set(['cash', 'cashless']);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-employee-session',
};

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifySession(token: string): Promise<{ sub: string; role: string } | null> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(signaturePart), new TextEncoder().encode(payloadPart));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  if (!payload?.sub || !payload?.role || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return { sub: String(payload.sub), role: String(payload.role) };
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function expensePayload(rawExpense: unknown, createdBy?: string) {
  const expense = (rawExpense && typeof rawExpense === 'object' ? rawExpense : {}) as Record<string, unknown>;
  const name = String(expense.name ?? '').trim();
  const category = String(expense.category ?? '');
  const subcategory = String(expense.subcategory ?? '').trim();
  const unitPrice = Number(expense.unitPrice);
  const quantity = Number(expense.quantity);
  const expenseDate = expense.expenseDate;
  const paymentMethod = String(expense.paymentMethod ?? '');
  if (!name || !subcategory || !ALLOWED_CATEGORIES.has(category) || !ALLOWED_METHODS.has(paymentMethod) || !validDate(expenseDate) || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const schoolSalary = category === 'school' && subcategory === 'ЗП';
  const officeSalary = category === 'office' && subcategory === 'ЗП';
  const departmentKey = String(expense.departmentKey ?? '').trim();
  if (officeSalary && !['logistics', 'service', 'finance', 'admin'].includes(departmentKey)) return null;
  const schoolKey = String(expense.schoolKey ?? '').trim();
  const salaryPeriodKey = String(expense.salaryPeriodKey ?? '').trim();
  if ((schoolSalary || officeSalary) && ((schoolSalary && !schoolKey) || !/^\d{4}-(09|10|11|12|01|02|03|04|05)-[12]$/.test(salaryPeriodKey))) return null;
  const driverId = String(expense.driverId ?? '').trim();
  const employeeId = String(expense.employeeId ?? '').trim();
  const transferId = String(expense.transferId ?? '').trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ([driverId, transferId].some(id => id && !uuid.test(id))) return null;
  if ((driverId && !schoolSalary) || (employeeId && !officeSalary) || (transferId && !driverId)) return null;
  return {
    driver_id: schoolSalary ? driverId || null : null,
    employee_id: officeSalary ? employeeId || null : null,
    transfer_id: schoolSalary ? transferId || null : null,
    school_key: schoolSalary ? schoolKey : null,
    salary_period_key: schoolSalary || officeSalary ? salaryPeriodKey : null,
    department_key: officeSalary ? departmentKey : null,
    name,
    category,
    subcategory,
    unit_price: unitPrice,
    quantity,
    amount: Math.round(unitPrice * quantity * 100) / 100,
    expense_date: expenseDate,
    payment_method: paymentMethod,
    payment_order_number: String(expense.paymentOrderNumber ?? '').trim() || null,
    comment: String(expense.comment ?? '').trim() || null,
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const session = await verifySession(req.headers.get('x-employee-session') ?? '');
    if (!session) return response({ ok: false, error: 'Сессия недействительна или истекла' }, 401);

    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    if (body.action === 'listDriverPayments') {
      const roles = new Set(['admin','gen_director','director','cashier','logist','senior_logist','b2b_logist']);
      if (!roles.has(session.role)) return response({ ok: false, error: 'Нет доступа к выплатам водителей' }, 403);
      const driverId=String(body.driverId??'');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverId)) return response({ok:false,error:'Выберите водителя'},400);
      const readRows=async(table:'v2_expenses'|'v2_driver_advances')=>{
        const rows:Record<string,unknown>[]=[];
        for(let start=0;;start+=1000){
          let query=supabase.from(table).select('*').eq('driver_id',driverId);
          if(table==='v2_expenses')query=query.eq('category','school').eq('subcategory','ЗП');
          const {data,error}=await query.order(table==='v2_expenses'?'expense_date':'date',{ascending:false}).order('id',{ascending:false}).range(start,start+999);
          if(error)throw error;
          rows.push(...(data??[]));
          if((data?.length??0)<1000)return rows;
        }
      };
      const [salaries,advances]=await Promise.all([readRows('v2_expenses'),readRows('v2_driver_advances')]);
      return response({ok:true,salaries,advances});
    }
    if (!ALLOWED_ROLES.has(session.role)) return response({ ok: false, error: 'Нет доступа к расходам' }, 403);
    if (body.action === 'paymentCapabilities') return response({ ok: true, recipientDetails: true });
    if (body.action === 'listSalary') {
      const { data, error } = await supabase.from('v2_expenses').select('*').in('category', ['school', 'office']).eq('subcategory', 'ЗП').order('expense_date', { ascending: false });
      if (error) throw error;
      return response({ ok: true, rows: data ?? [] });
    }
    if (body.action === 'list') {
      if (!validDate(body.periodStart) || !validDate(body.periodEnd)) return response({ ok: false, error: 'Некорректный период' }, 400);
      const { data, error } = await supabase.from('v2_expenses').select('*')
        .gte('expense_date', body.periodStart).lte('expense_date', body.periodEnd)
        .order('expense_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (PERSONAL_DETAILS_ROLES.has(session.role)) return response({ ok: true, rows });
      const publicRows = rows.filter(row => row.category !== 'personal');
      const personalTotal = rows
        .filter(row => row.category === 'personal')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      if (personalTotal > 0) publicRows.push({
        id: 'personal-summary',
        name: 'Личный расход',
        category: 'personal',
        subcategory: '',
        unit_price: personalTotal,
        quantity: 1,
        amount: personalTotal,
        expense_date: body.periodEnd,
        payment_method: 'cashless',
        comment: null,
        created_by: null,
        created_at: '',
      });
      return response({ ok: true, rows: publicRows });
    }
    if (body.action === 'create' || body.action === 'update') {
      const incoming = expensePayload(body.expense);
      if (incoming?.driver_id) {
        const { data, error } = await supabase.from('v2_transfers').select('id').eq('id', incoming.transfer_id).eq('driver_id', incoming.driver_id).maybeSingle();
        if (error) throw error;
        if (!data) return response({ ok: false, error: 'Выберите трансфер выбранного водителя' }, 400);
      }
      if (incoming?.employee_id) {
        const { data, error } = await supabase.from('v2_employees').select('role').eq('id', incoming.employee_id).maybeSingle();
        if (error) throw error;
        const departments: Record<string,string[]> = {logistics:['logist','senior_logist','b2b_logist','driver'], service:['manager','b2b_manager','director'],finance:['cashier','gen_director'],admin:['admin']};
        if (!data || data.role === 'driver' || !departments[incoming.department_key ?? '']?.includes(data.role)) return response({ ok: false, error: 'Сотрудник не относится к выбранному отделу' }, 400);
      }
      if (body.action === 'create' && incoming?.subcategory === 'ЗП' && !incoming.driver_id && !incoming.employee_id) return response({ ok: false, error: 'Выберите получателя зарплаты' }, 400);
    }
    if (body.action === 'create') {
      const expense = expensePayload(body.expense, session.sub);
      if (!expense) {
        return response({ ok: false, error: 'Проверьте обязательные поля расхода' }, 400);
      }
      if (expense.category === 'personal' && !PERSONAL_DETAILS_ROLES.has(session.role)) {
        return response({ ok: false, error: 'Нет доступа к личным расходам' }, 403);
      }
      const { data, error } = await supabase.from('v2_expenses').insert(expense).select('*').single();
      if (error) throw error;
      return response({ ok: true, row: data });
    }
    if (body.action === 'update') {
      const expenseId = String(body.expenseId ?? '');
      const expense = expensePayload(body.expense);
      if (!expenseId || !expense) return response({ ok: false, error: 'Проверьте обязательные поля расхода' }, 400);
      if (expense.category === 'personal' && !PERSONAL_DETAILS_ROLES.has(session.role)) {
        return response({ ok: false, error: 'Нет доступа к личным расходам' }, 403);
      }
      let updateQuery = supabase.from('v2_expenses').update(expense).eq('id', expenseId);
      if (!PERSONAL_DETAILS_ROLES.has(session.role)) updateQuery = updateQuery.neq('category', 'personal');
      const { data, error } = await updateQuery.select('*').maybeSingle();
      if (error) throw error;
      if (!data) return response({ ok: false, error: 'Расход не найден' }, 404);
      return response({ ok: true, row: data });
    }
    if (body.action === 'delete') {
      const expenseId = String(body.expenseId ?? '');
      if (!expenseId) return response({ ok: false, error: 'Не указан расход' }, 400);
      let deleteQuery = supabase.from('v2_expenses').delete().eq('id', expenseId);
      if (!PERSONAL_DETAILS_ROLES.has(session.role)) deleteQuery = deleteQuery.neq('category', 'personal');
      const { data, error } = await deleteQuery.select('id').maybeSingle();
      if (error) throw error;
      if (!data) return response({ ok: false, error: 'Расход не найден' }, 404);
      return response({ ok: true });
    }
    return response({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Ошибка сервера' }, 500);
  }
});
