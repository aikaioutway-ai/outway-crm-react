import { supabase } from './supabase';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, isEmployeeSessionExpiredMessage } from './employeeSession';

export type CheckRound = 1 | 2 | 3 | 4;

export const CHECK_ROUNDS: ReadonlyArray<{ round: CheckRound; label: string; daysLabel: string }> = [
  { round: 1, label: 'Сверка 1', daysLabel: '1–7' },
  { round: 2, label: 'Сверка 2', daysLabel: '8–14' },
  { round: 3, label: 'Сверка 3', daysLabel: '15–21' },
  { round: 4, label: 'Сверка 4', daysLabel: '22–31' },
];

export interface DriverCheckChild {
  id: string;
  childName: string;
  address: string;
  stopOrder: number | null;
  present: boolean;
  markedAt: string | null;
}

export interface DriverCheckPayload {
  date: string;
  transfer: {
    id: string;
    transferNumber: number;
    schoolLabel: string;
    driverName: string;
  };
  submittedAt: string | null;
  children: DriverCheckChild[];
}

export interface ReconciliationTransferMeta {
  transferId: string;
  schoolKey: string;
  schoolLabel: string;
  branchId: string | null;
  transferNumber: number;
  vehicleType: string;
  driverId: string | null;
  driverName: string;
  driverPhone: string;
  driverLinkToken: string;
  rounds: Partial<Record<CheckRound, { checked: boolean; lastAt: string | null }>>;
}

export interface ChildRoundMark {
  present: boolean;
  checkDate: string;
  markedAt: string;
}

export interface ReconciliationMonthData {
  year: number;
  month: number;
  today: string;
  currentRound: CheckRound;
  transfers: ReconciliationTransferMeta[];
  marksByChild: Record<string, Partial<Record<CheckRound, ChildRoundMark>>>;
}

const TOKEN_PATTERN = /^[0-9a-f]{16,64}$/i;

export function roundOfIsoDate(isoDate: string): CheckRound {
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day) || day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

export function extractDriverCheckToken(loc?: { pathname: string; search: string }): string | null {
  const source = loc ?? (typeof window !== 'undefined' ? window.location : null);
  if (!source) return null;

  const pathMatch = source.pathname.match(/^\/driver\/([^/?#]+)/i);
  if (pathMatch?.[1] && TOKEN_PATTERN.test(pathMatch[1])) {
    return pathMatch[1].toLowerCase();
  }

  const queryToken = new URLSearchParams(source.search).get('driver')?.trim();
  if (queryToken && TOKEN_PATTERN.test(queryToken)) {
    return queryToken.toLowerCase();
  }

  return null;
}

export const DEFAULT_PRODUCTION_APP_URL = 'https://outway-crm-react.vercel.app';

function getPublicAppUrl(): string {
  if (typeof process !== 'undefined' && process.env?.VITE_PUBLIC_APP_URL) {
    return String(process.env.VITE_PUBLIC_APP_URL).trim();
  }
  return DEFAULT_PRODUCTION_APP_URL;
}

export function buildDriverCheckUrl(token: string, origin?: string): string {
  if (origin) {
    return `${origin.replace(/\/+$/, '')}/driver/${token}`;
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `${window.location.origin.replace(/\/+$/, '')}/driver/${token}`;
    }
  }
  const base = getPublicAppUrl().replace(/\/+$/, '');
  return `${base}/driver/${token}`;
}

export function formatRuDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatShortRuDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${match[3]}.${match[2]}`;
}

export function formatBishkekTime(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return '';
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Bishkek',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    return parsed.toTimeString().slice(0, 5);
  }
}

export function normalizeWhatsAppPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('0')) return `996${digits.slice(1)}`;
  if (digits.length === 9) return `996${digits}`;
  return digits;
}

export function buildWhatsAppShareUrl(text: string, phone?: string | null): string {
  const normalized = normalizeWhatsAppPhone(phone);
  const encoded = encodeURIComponent(text);
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildDriverWhatsAppText(payload: Pick<DriverCheckPayload, 'date' | 'transfer' | 'children'>): string {
  const present = payload.children.filter(child => child.present);
  const absent = payload.children.filter(child => !child.present);
  const round = roundOfIsoDate(payload.date);

  const lines: string[] = [
    `🚌 ${payload.transfer.schoolLabel} · Трансфер №${payload.transfer.transferNumber} (${formatRuDate(payload.date)} · Сверка ${round})`,
  ];

  if (present.length > 0) {
    lines.push('');
    lines.push(`✅ Есть (${present.length}):`);
    present.forEach((child, index) => {
      lines.push(`${index + 1}. ${child.childName.trim() || 'Без имени'}`);
    });
  }

  if (absent.length > 0) {
    lines.push('');
    lines.push(`❌ Нет (${absent.length}):`);
    absent.forEach((child, index) => {
      const name = child.childName.trim() || 'Без имени';
      const address = child.address.trim();
      lines.push(address ? `${index + 1}. ${name} (${address})` : `${index + 1}. ${name}`);
    });
  }

  lines.push('');
  lines.push(`Итого: ${present.length} из ${payload.children.length}`);
  return lines.join('\n');
}

export function buildDriverInviteWhatsAppText(transfer: {
  schoolLabel: string;
  transferNumber: number;
  driverLinkToken: string;
}, origin?: string): string {
  const url = buildDriverCheckUrl(transfer.driverLinkToken, origin);
  return [
    `🚌 OutWay — список детей (${transfer.schoolLabel}, Трансфер №${transfer.transferNumber})`,
    url,
    '',
    'Откройте ссылку, отметьте галочками кто катается и нажмите «Отправить в WhatsApp». Список обновляется сам.',
  ].join('\n');
}

async function callDriverCheckApi<T>(
  body: Record<string, unknown>,
  sessionToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (sessionToken) headers['x-employee-session'] = sessionToken;

  const { data, error } = await supabase.functions.invoke('driver-check-api', {
    body,
    headers,
  });

  let message = '';
  if (error) {
    message = /failed to send a request|failed to fetch/i.test(error.message)
      ? 'Нет связи с сервером сверки. Проверьте интернет или деплой функции driver-check-api.'
      : error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.clone().json();
      if (parsed?.error) message = String(parsed.error);
    } catch {
      /* ответ не JSON */
    }
  } else if (!data?.ok) {
    message = String(data?.error || 'Не удалось выполнить запрос');
  }

  if (message) {
    if (sessionToken && isEmployeeSessionExpiredMessage(message)) {
      window.dispatchEvent(new Event(EMPLOYEE_SESSION_EXPIRED_EVENT));
    }
    throw new Error(message);
  }
  return data as T;
}

export async function fetchDriverCheckList(token: string): Promise<DriverCheckPayload> {
  const res = await callDriverCheckApi<DriverCheckPayload & { ok: true }>({
    action: 'driver_get',
    token,
  });
  return {
    date: res.date,
    transfer: res.transfer,
    submittedAt: res.submittedAt,
    children: res.children,
  };
}

export async function toggleDriverCheckMark(
  token: string,
  childId: string,
  present: boolean,
): Promise<{ date: string; childId: string; present: boolean; markedAt: string }> {
  return callDriverCheckApi({
    action: 'driver_toggle',
    token,
    childId,
    present,
  });
}

export async function submitDriverCheck(token: string): Promise<{ date: string; submittedAt: string }> {
  return callDriverCheckApi({
    action: 'driver_submit',
    token,
  });
}

export async function fetchLogisticsReconciliationMonth(
  sessionToken: string | undefined,
  params: { year: number; month: number; schoolKey?: string },
): Promise<ReconciliationMonthData> {
  if (!sessionToken) throw new Error('Войдите в CRM, чтобы открыть сверку');
  const res = await callDriverCheckApi<ReconciliationMonthData & { ok: true }>(
    {
      action: 'crm_month',
      year: params.year,
      month: params.month,
      schoolKey: params.schoolKey,
    },
    sessionToken,
  );
  return {
    year: res.year,
    month: res.month,
    today: res.today,
    currentRound: res.currentRound,
    transfers: res.transfers ?? [],
    marksByChild: res.marksByChild ?? {},
  };
}

export async function rotateTransferDriverToken(
  sessionToken: string | undefined,
  transferId: string,
): Promise<{ transferId: string; driverLinkToken: string }> {
  if (!sessionToken) throw new Error('Войдите в CRM, чтобы обновить ссылку');
  return callDriverCheckApi(
    {
      action: 'crm_rotate_token',
      transferId,
    },
    sessionToken,
  );
}
