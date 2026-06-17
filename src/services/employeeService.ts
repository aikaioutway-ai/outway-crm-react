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
}

// ─── МАППИНГ ────────────────────────────────────────────────────────────────

function mapRow(row: any): Employee {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    login: String(row.login),
    passwordHash: row.password_hash ?? undefined,
    passwordPlain: row.password_plain ?? undefined,
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

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('v2_employees')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

// ─── АВТОРИЗАЦИЯ ────────────────────────────────────────────────────────────

export async function authenticateEmployee(
  login: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const normalizedLogin = login.trim();
  const normalizedPassword = password.trim();
  if (!normalizedLogin || !normalizedPassword) return null;

  const { data, error } = await supabase
    .from('v2_employees')
    .select('*')
    .eq('login', normalizedLogin)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;
  if (data.role === 'driver') return null;

  // Проверяем plain пароль (приоритет) или hash
  const plainMatch = data.password_plain && data.password_plain === normalizedPassword;
  const hashMatch = data.password_hash && data.password_hash === await hashPassword(normalizedPassword);
  const isDefaultAdmin = data.id === 'emp-admin' && !data.password_plain && !data.password_hash && normalizedPassword === 'admin';

  if (!plainMatch && !hashMatch && !isDefaultAdmin) return null;

  return {
    id: data.id,
    name: data.full_name,
    login: data.login,
    role: data.role as UserRole,
    schoolKeys: Array.isArray(data.school_keys) ? data.school_keys : ['ALL'],
  };
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
    row.password_plain = draft.password.trim();
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
