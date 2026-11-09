// Кто какие группы видит. Список групп CRM получает отсюда, отдельной копии на фронтенде нет.

export const LEADERS = new Set(['admin', 'gen_director', 'director']);
/** Получают уведомления о просроченных заявках. */
export const NOTIFY_ROLES = new Set(['senior_logist', 'director', 'gen_director', 'admin']);

export const DEPARTMENTS: { channel: string; title: string; roles: string[] }[] = [
  { channel: 'dept:managers', title: 'Менеджеры', roles: ['manager'] },
  { channel: 'dept:logistics', title: 'Логистика', roles: ['logist', 'senior_logist'] },
  { channel: 'dept:cashier', title: 'Касса', roles: ['cashier'] },
  { channel: 'dept:leadership', title: 'Руководство', roles: ['admin', 'gen_director', 'director'] },
  { channel: 'dept:b2b', title: 'B2B', roles: ['b2b_manager', 'b2b_logist'] },
];

export type Channel = { channel: string; title: string; readOnly: boolean };

/** Группы сотрудника по порядку: уведомления, «Все», свой отдел (руководство — все отделы). */
export function channelsFor(role: string): Channel[] {
  const result: Channel[] = [];
  if (NOTIFY_ROLES.has(role)) result.push({ channel: 'notifications', title: 'Уведомления', readOnly: true });
  result.push({ channel: 'all', title: 'Все', readOnly: false });
  for (const department of DEPARTMENTS) {
    if (LEADERS.has(role) || department.roles.includes(role)) result.push({ channel: department.channel, title: department.title, readOnly: false });
  }
  return result;
}

/** Личный канал двух сотрудников: dm:<id>:<id>, id по алфавиту — у пары всегда один канал. */
export function dmChannel(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

/** Собеседник в личном канале или null, если сотрудник в нём не участвует. */
export function dmPeer(channel: string, employeeId: string): string | null {
  const match = /^dm:([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)$/.exec(channel);
  if (!match) return null;
  if (match[1] === employeeId) return match[2];
  if (match[2] === employeeId) return match[1];
  return null;
}

const TARGET_TYPES = new Set(['general', 'school', 'transfer', 'child', 'family', 'driver', 'group']);

/** Ссылка на место в CRM (то же, что цель задачи). Лишние поля отбрасываем. */
export function cleanLink(raw: any): Record<string, unknown> | null {
  const target = raw?.target;
  if (!target || !TARGET_TYPES.has(String(target.type))) return null;
  const pick: Record<string, unknown> = { type: String(target.type), id: String(target.id ?? '').slice(0, 80), label: String(target.label ?? '').slice(0, 160) };
  for (const key of ['schoolKey', 'group', 'transferId', 'familyId', 'childId', 'driverId']) if (target[key] != null) pick[key] = String(target[key]).slice(0, 80);
  if (target.transferNumber != null && Number.isFinite(Number(target.transferNumber))) pick.transferNumber = Number(target.transferNumber);
  return { type: 'target', label: pick.label, target: pick };
}
