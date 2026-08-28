import { supabase } from './supabase';
import { Employee, EmployeeRole, EmployeeStatus, UserRole } from '../types';

export interface EmployeeDraft {
  id?: string;
  fullName: string;
  login: string;
  password?: string;
  role: EmployeeRole;
  position: string;
  phone1: string;
  phone2?: string;
  address?: string;
  schoolKeys: string[];
  status: EmployeeStatus;
  startDate?: string;
  comment?: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  schoolKeys: string[];
  position?: string;
  sessionToken?: string;
}

export type EmployeeDocumentType = 'passport' | 'contract';

export interface EmployeeDocument {
  id?: string;
  employeeId?: string;
  type: EmployeeDocumentType;
  title: string;
  number: string;
  issuedAt: string;
  expiresAt: string;
  required: boolean;
  scanUrl: string;
  scanFile?: File | null;
}

export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  amount: number;
  date: string;
  comment: string;
  createdAt: string;
}

export function createDefaultEmployeeDocuments(): EmployeeDocument[] {
  return [
    { type: 'passport', title: 'Паспорт', number: '', issuedAt: '', expiresAt: '', required: true, scanUrl: '', scanFile: null },
    { type: 'contract', title: 'Договор', number: '', issuedAt: '', expiresAt: '', required: true, scanUrl: '', scanFile: null },
  ];
}

// ─── МАППИНГ ────────────────────────────────────────────────────────────────

const EMPLOYEE_COLUMNS = 'id, full_name, login, role, position, phone1, phone2, address, school_keys, status, start_date, comment, created_at, updated_at';

function mapRow(row: any): Employee {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    login: String(row.login),
    role: row.role as EmployeeRole,
    position: String(row.position ?? ''),
    phone1: String(row.phone1 ?? ''),
    phone2: row.phone2 ?? undefined,
    address: row.address ?? undefined,
    schoolKeys: Array.isArray(row.school_keys) ? row.school_keys : ['ALL'],
    status: row.status as EmployeeStatus,
    startDate: row.start_date ?? undefined,
    comment: row.comment ?? undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// ─── SHA-256 ────────────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const value = password.trim();
  if (!value) return '';
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const hash = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return btoa(unescape(encodeURIComponent(value)));
}

// ─── ЧТЕНИЕ ─────────────────────────────────────────────────────────────────
// Пароли (password_hash) намеренно не выбираются здесь и не читаются анонимным
// ключом с сервера (см. supabase/v2_employee_password_hardening.sql) — сверка
// пароля происходит только внутри edge-функции employee-login под service-role.

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('v2_employees')
    .select(EMPLOYEE_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const { data, error } = await supabase.from('v2_employees').select(EMPLOYEE_COLUMNS).eq('id', id).single();
  if (error || !data) return null;
  return mapRow(data);
}

// ─── АВТОРИЗАЦИЯ ────────────────────────────────────────────────────────────
// Логин и сверка пароля выполняются на сервере (edge-функция employee-login,
// service-role ключ) — браузер никогда не видит password_hash сотрудников.

export async function authenticateEmployee(
  login: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const normalizedLogin = login.trim();
  const normalizedPassword = password.trim();
  if (!normalizedLogin || !normalizedPassword) return null;

  const { data, error } = await supabase.functions.invoke('employee-login', {
    body: { login: normalizedLogin, password: normalizedPassword },
  });

  if (error || !data?.ok) return null;
  return data.user as AuthenticatedUser;
}

// ─── СОЗДАНИЕ / ОБНОВЛЕНИЕ ──────────────────────────────────────────────────

export async function saveEmployee(draft: EmployeeDraft): Promise<Employee[]> {
  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    full_name: draft.fullName.trim(),
    login: draft.login.trim(),
    role: draft.role,
    position: draft.position.trim(),
    phone1: draft.phone1.trim(),
    phone2: draft.phone2?.trim() || null,
    address: draft.address?.trim() || null,
    school_keys: draft.schoolKeys.length ? draft.schoolKeys : ['ALL'],
    status: draft.status,
    start_date: draft.startDate || null,
    comment: draft.comment?.trim() || null,
    updated_at: now,
  };

  if (draft.password?.trim()) {
    row.password_hash = await hashPassword(draft.password.trim());
  }

  if (draft.id) {
    const { error } = await supabase.from('v2_employees').update(row).eq('id', draft.id);
    if (error) throw new Error(error.message);
  } else {
    row.id = `emp-${Date.now()}`;
    row.created_at = now;
    const { error } = await supabase.from('v2_employees').insert(row);
    if (error) throw new Error(error.message);
  }

  return fetchEmployees();
}

// ─── УДАЛЕНИЕ ───────────────────────────────────────────────────────────────

export async function deleteEmployee(id: string): Promise<Employee[]> {
  const { error } = await supabase.from('v2_employees').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return fetchEmployees();
}

function mapEmployeeDocument(row: any): EmployeeDocument {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    type: row.document_type as EmployeeDocumentType,
    title: String(row.title ?? ''),
    number: String(row.document_number ?? ''),
    issuedAt: String(row.issued_at ?? ''),
    expiresAt: String(row.expires_at ?? ''),
    required: Boolean(row.required),
    scanUrl: String(row.scan_url ?? ''),
    scanFile: null,
  };
}

export async function fetchEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data, error } = await supabase.from('v2_employee_documents').select('*').eq('employee_id', employeeId);
  if (error) throw new Error(error.message);
  const byType = new Map((data ?? []).map(row => [row.document_type, mapEmployeeDocument(row)]));
  return createDefaultEmployeeDocuments().map(document => byType.get(document.type) ?? document);
}

function safeFileName(name: string): string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'scan';
}

async function uploadEmployeeDocument(employeeId: string, document: EmployeeDocument): Promise<string> {
  if (!document.scanFile) return document.scanUrl;
  const path = `${employeeId}/${document.type}/${Date.now()}_${safeFileName(document.scanFile.name)}`;
  const { error } = await supabase.storage.from('employee-documents').upload(path, document.scanFile, { upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('employee-documents').getPublicUrl(path).data.publicUrl;
}

export async function saveEmployeeDocuments(employeeId: string, documents: EmployeeDocument[]): Promise<void> {
  const rows = await Promise.all(documents.map(async document => ({
    employee_id: employeeId,
    document_type: document.type,
    title: document.title.trim() || (document.type === 'passport' ? 'Паспорт' : 'Договор'),
    document_number: document.number.trim() || null,
    issued_at: document.issuedAt || null,
    expires_at: document.expiresAt || null,
    required: document.required,
    scan_url: (await uploadEmployeeDocument(employeeId, document)) || null,
  })));
  const { error } = await supabase.from('v2_employee_documents').upsert(rows, { onConflict: 'employee_id,document_type' });
  if (error) throw new Error(error.message);
}

function mapEmployeeAdvance(row: any): EmployeeAdvance {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    amount: Number(row.amount ?? 0),
    date: String(row.date ?? ''),
    comment: String(row.comment ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

export async function fetchEmployeeAdvances(employeeId: string): Promise<EmployeeAdvance[]> {
  const { data, error } = await supabase.from('v2_employee_advances').select('*').eq('employee_id', employeeId).order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEmployeeAdvance);
}

export async function createEmployeeAdvance(employeeId: string, amount: number, date: string, comment: string): Promise<EmployeeAdvance> {
  const { data, error } = await supabase.from('v2_employee_advances').insert({
    employee_id: employeeId,
    amount,
    date,
    comment: comment.trim() || null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return mapEmployeeAdvance(data);
}

export async function deleteEmployeeAdvance(advanceId: string): Promise<void> {
  const { error } = await supabase.from('v2_employee_advances').delete().eq('id', advanceId);
  if (error) throw new Error(error.message);
}
