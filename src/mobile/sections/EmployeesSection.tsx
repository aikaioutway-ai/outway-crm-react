import React, { useMemo, useState } from 'react';
import { useEmployees } from '../../hooks/useCrmQueries';
import { AuthenticatedUser } from '../../services/employeeService';
import { Employee, EmployeeRole, UserRole } from '../../types';
import { formatName, formatPhone, phoneMatchesQuery } from '../../utils/format';
import { schoolLabel } from '../data';
import { Screen, useNavPosition } from '../nav';
import { Badge, CallButton, Chips, Empty, ErrorBox, formatDate, InfoRow, PhoneRow, SearchField, Sheet, Skeletons, useIncremental } from '../ui';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ', gen_director: 'Ген. директор', director: 'Директор', manager: 'Менеджер', cashier: 'Кассир',
  logist: 'Логист', b2b_manager: 'Менеджер B2B', b2b_logist: 'Логист B2B', senior_logist: 'Нач. логистики', driver: 'Водитель',
};

const DEPARTMENTS: { value: string; label: string; roles: string[] }[] = [
  { value: 'logistics', label: 'Логистика', roles: ['logist', 'senior_logist', 'b2b_logist', 'driver'] },
  { value: 'service', label: 'Клиентский сервис', roles: ['manager', 'b2b_manager', 'director'] },
  { value: 'finance', label: 'Финансы', roles: ['cashier', 'gen_director'] },
  { value: 'admin', label: 'Админ', roles: ['admin'] },
];

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: 'Активен', bg: '#DCFCE7', color: '#166534' },
  inactive: { label: 'Неактивен', bg: '#ECEFF3', color: '#52606F' },
  dismissed: { label: 'Уволен', bg: '#FEE2E2', color: '#991B1B' },
};

/** Как в полной версии: директор видит менеджеров, нач. логистики — свой отдел. */
function restrictedRolesFor(viewerRole: UserRole): EmployeeRole[] | null {
  if (viewerRole === 'director') return ['manager'];
  if (viewerRole === 'senior_logist') return ['logist', 'b2b_manager', 'b2b_logist', 'cashier'];
  return null;
}

function schoolsText(keys: string[]): string {
  if (!keys.length || keys.some(key => key.toUpperCase() === 'ALL')) return 'Все школы';
  return keys.map(schoolLabel).join(', ');
}

function employeeMatches(employee: Employee, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (phoneMatchesQuery(q, employee.phone1, employee.phone2)) return true;
  const needle = q.toLowerCase();
  return [employee.fullName, employee.position, employee.login, ROLE_LABEL[employee.role]]
    .some(value => String(value ?? '').toLowerCase().includes(needle));
}

function EmployeeCard({ employee, onClick }: { employee: Employee; onClick: () => void }) {
  const status = STATUS[employee.status] ?? STATUS.active;
  return (
    <div className="m-card" role="button" tabIndex={0} onClick={onClick} onKeyDown={event => { if (event.key === 'Enter') onClick(); }}>
      <div className="m-card-row">
        <div className="m-card-main">
          <div className="m-card-title">{formatName(employee.fullName) || employee.login}</div>
          <div className="m-card-sub">{[employee.position || ROLE_LABEL[employee.role], formatPhone(employee.phone1)].filter(Boolean).join(' · ')}</div>
        </div>
        <CallButton phone={employee.phone1} />
      </div>
      <div className="m-card-meta">
        <Badge tone={status}>{status.label}</Badge>
        <Badge>{ROLE_LABEL[employee.role] ?? employee.role}</Badge>
        <Badge>{schoolsText(employee.schoolKeys)}</Badge>
      </div>
    </div>
  );
}

function EmployeeList({ rows, onOpen }: { rows: Employee[]; onOpen: (employee: Employee) => void }) {
  const [visible, sentinelRef] = useIncremental(rows);
  if (!rows.length) return <Empty>Сотрудников не найдено</Empty>;
  return (
    <div className="m-list">
      {visible.map(employee => <EmployeeCard key={employee.id} employee={employee} onClick={() => onOpen(employee)} />)}
      <div ref={sentinelRef} className="m-more" />
    </div>
  );
}

export default function EmployeesSection({ user, onBack }: { user: AuthenticatedUser; onBack?: () => void }) {
  const nav = useNavPosition();
  const { data, isLoading, error } = useEmployees();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('all');
  const restricted = restrictedRolesFor(user.role);

  const scoped = useMemo(
    () => (data ?? []).filter(employee => !restricted || restricted.includes(employee.role)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, user.role],
  );
  const visible = useMemo(() => {
    const dept = DEPARTMENTS.find(item => item.value === department);
    return scoped
      .filter(employee => (!dept || dept.roles.includes(employee.role)) && employeeMatches(employee, query))
      .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.fullName.localeCompare(b.fullName, 'ru'));
  }, [scoped, department, query]);

  const opened = nav.sheet?.kind === 'employee'
    ? scoped.find(employee => employee.id === (nav.sheet as { employeeId: string }).employeeId)
    : undefined;

  return (
    <>
      <Screen pageKey="employees:home" title="Сотрудники" subtitle={`${scoped.filter(employee => employee.status === 'active').length} активных`} onBack={onBack}>
        <SearchField value={query} onChange={setQuery} placeholder="Имя, должность или телефон" />
        <Chips
          value={department}
          onChange={setDepartment}
          options={[
            { value: 'all', label: 'Все', count: scoped.length },
            ...DEPARTMENTS
              .map(item => ({ value: item.value, label: item.label, count: scoped.filter(employee => item.roles.includes(employee.role)).length }))
              .filter(item => item.count > 0),
          ]}
        />
        {error && <ErrorBox>Не удалось загрузить сотрудников</ErrorBox>}
        {isLoading && !data ? <Skeletons /> : (
          <EmployeeList rows={visible} onOpen={employee => nav.push({ kind: 'employee', employeeId: employee.id, sheet: true })} />
        )}
        <div className="m-note">Добавление сотрудников, документы и авансы — в полной версии на компьютере.</div>
      </Screen>
      {opened && (
        <Sheet title={formatName(opened.fullName) || opened.login} onClose={nav.back}>
          <div className="m-info">
            <PhoneRow label="Телефон" phone={opened.phone1} />
            <PhoneRow label="Второй телефон" phone={opened.phone2} />
          </div>
          <div className="m-info">
            <InfoRow label="Должность" value={opened.position} />
            <InfoRow label="Роль" value={ROLE_LABEL[opened.role] ?? opened.role} />
            <InfoRow label="Статус" value={(STATUS[opened.status] ?? STATUS.active).label} />
            <InfoRow label="Школы" value={schoolsText(opened.schoolKeys)} />
            <InfoRow label="Логин" value={opened.login} />
            {opened.startDate && <InfoRow label="Работает с" value={formatDate(opened.startDate)} />}
            {opened.address && <InfoRow label="Адрес" value={opened.address} />}
            {opened.comment && <InfoRow label="Комментарий" value={opened.comment} />}
          </div>
        </Sheet>
      )}
    </>
  );
}
