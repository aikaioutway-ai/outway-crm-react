import { Employee, EmployeeRole, EmployeeStatus, UserRole } from '../types';

const STORAGE_KEY = 'outway_employees_v1';

const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: 'emp-admin',
    fullName: 'Администратор',
    login: 'admin',
    role: 'admin',
    position: 'Управляющий',
    phone1: '',
    phone2: '',
    address: '',
    schoolKeys: ['ALL'],
    status: 'active',
    startDate: new Date().toISOString().slice(0, 10),
    comment: 'Первичный доступ',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

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
}

export function fetchEmployees(): Employee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_EMPLOYEES));
      return DEFAULT_EMPLOYEES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_EMPLOYEES;
  } catch {
    return DEFAULT_EMPLOYEES;
  }
}

export async function authenticateEmployee(login: string, password: string): Promise<AuthenticatedUser | null> {
  const normalizedLogin = login.trim();
  const normalizedPassword = password.trim();
  if (!normalizedLogin || !normalizedPassword) return null;

  const employee = fetchEmployees().find(item => item.login === normalizedLogin);
  if (!employee || employee.status !== 'active' || employee.role === 'driver') return null;

  const passwordHash = await hashPassword(normalizedPassword);
  const isDefaultAdmin = employee.id === 'emp-admin' && !employee.passwordHash && normalizedPassword === 'admin';
  if (!isDefaultAdmin && employee.passwordHash !== passwordHash) return null;

  return {
    id: employee.id,
    name: employee.fullName,
    login: employee.login,
    role: employee.role,
  };
}

export async function saveEmployee(draft: EmployeeDraft): Promise<Employee[]> {
  const employees = fetchEmployees();
  const now = new Date().toISOString();
  const passwordHash = draft.password ? await hashPassword(draft.password) : undefined;
  const normalized: Employee = {
    id: draft.id ?? `emp-${Date.now()}`,
    fullName: draft.fullName.trim(),
    login: draft.login.trim(),
    passwordHash: passwordHash ?? employees.find(item => item.id === draft.id)?.passwordHash,
    role: draft.role,
    position: draft.position.trim(),
    phone1: draft.phone1.trim(),
    phone2: draft.phone2?.trim(),
    address: draft.address?.trim(),
    schoolKeys: draft.schoolKeys.length ? draft.schoolKeys : ['ALL'],
    status: draft.status,
    startDate: draft.startDate,
    comment: draft.comment?.trim(),
    createdAt: employees.find(item => item.id === draft.id)?.createdAt ?? now,
    updatedAt: now,
  };
  const next = employees.some(item => item.id === normalized.id)
    ? employees.map(item => item.id === normalized.id ? normalized : item)
    : [normalized, ...employees];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteEmployee(id: string): Employee[] {
  const next = fetchEmployees().filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

async function hashPassword(password: string): Promise<string> {
  const value = password.trim();
  if (!value) return '';
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const hash = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(value)));
}
