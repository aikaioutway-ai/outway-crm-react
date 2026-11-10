import React from 'react';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { useEmployees } from '../../hooks/useCrmQueries';
import type { Employee } from '../../types';

const LOGIST_ROLES = new Set(['logist', 'senior_logist']);

// «Эркинбекова Аяна» → «Аяна»: в узкой плашке хватает имени, полное ФИО — в подсказке.
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

/**
 * Кто ведёт школу: сотрудник закреплён за школой, если её код явно стоит в его списке школ.
 * «ALL» (руководители, старший логист) не считается — иначе у каждой школы были бы все.
 */
export function schoolStaff(employees: Employee[], schoolKey: string) {
  const assigned = employees.filter(employee => employee.status === 'active' && employee.schoolKeys.includes(schoolKey));
  return {
    logists: assigned.filter(employee => LOGIST_ROLES.has(employee.role)),
    managers: assigned.filter(employee => employee.role === 'manager'),
  };
}

export function schoolStaffLine(employees: Employee[], schoolKey: string): { text: string; title: string } | null {
  const { logists, managers } = schoolStaff(employees, schoolKey);
  if (!logists.length && !managers.length) return null;
  const part = (label: string, people: Employee[], full: boolean) => people.length
    ? `${label} ${people.map(person => full ? person.fullName : shortName(person.fullName)).join(', ')}`
    : `${label} —`;
  return {
    text: [part('Л:', logists, false), part('М:', managers, false)].join(' · '),
    title: [part('Логист:', logists, true), part('Менеджер:', managers, true)].join('\n'),
  };
}

/** Плашка «Школа» во вкладках внутри школы: логотип, название и кто её логист и менеджер. */
export default function SchoolKpiChip({ schoolKey, label, logo, color, small = false }: { schoolKey: string; label: string; logo?: string; color: string; small?: boolean }) {
  const { data: employees } = useEmployees();
  const staff = employees ? schoolStaffLine(employees, schoolKey) : null;
  return (
    <KpiChip
      iconBackground="transparent"
      icon={small ? <SchoolAvatar logo={logo} label={label} color={color} /> : <SchoolAvatar logo={logo} label={label} color={color} size={38} radius={11} fontSize={12} />}
      label={staff?.text ?? 'Школа'}
      labelTitle={staff?.title}
      value={label}
      color={color}
    />
  );
}
