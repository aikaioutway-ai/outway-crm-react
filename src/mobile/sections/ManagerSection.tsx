import React, { useMemo, useState } from 'react';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed } from '../../modules/families/constants';
import { AuthenticatedUser } from '../../services/employeeService';
import { FamilyListRow } from '../../services/crmV2Service';
import { ChildList, SchoolCard } from '../cards';
import { byChildName, groupBySchool, rowMatches, schoolByKey, schoolsFor } from '../data';
import FamilySheet from '../FamilySheet';
import { Screen, useNavPosition } from '../nav';
import { ErrorBox, Kpi, SearchField, SelectField, Skeletons } from '../ui';

type ManagerFilter = 'all' | 'new' | 'waiting' | 'boarded' | 'paused' | 'rejected' | 'debtors';

const FILTERS: { value: ManagerFilter; label: string; test: (row: FamilyListRow) => boolean }[] = [
  { value: 'all', label: 'Все в работе', test: row => row.status !== 'rejected' },
  { value: 'new', label: 'Новые', test: row => row.status === 'new' },
  { value: 'waiting', label: 'Ожидание', test: row => row.status === 'waiting' },
  { value: 'boarded', label: 'Посажены', test: row => row.status === 'boarded' },
  { value: 'paused', label: 'Пауза', test: row => row.status === 'paused' },
  { value: 'rejected', label: 'Отказ', test: row => row.status === 'rejected' },
  { value: 'debtors', label: 'Должники', test: row => row.childDebtAmount > 0 },
];

export default function ManagerSection({ user }: { user: AuthenticatedUser }) {
  const nav = useNavPosition();
  const { data, isLoading, error } = useFamiliesTable();
  const rows = useMemo(
    () => (data ?? []).filter(row => !row.rowId.endsWith('_empty') && isSchoolAllowed(row.branchFilter, user.schoolKeys)),
    [data, user.schoolKeys],
  );
  const bySchool = useMemo(() => groupBySchool(rows), [rows]);
  const [query, setQuery] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [filter, setFilter] = useState<ManagerFilter>('all');

  const page = nav.page;
  const schoolKey = page?.kind === 'school' ? page.schoolKey : null;
  const schoolRows = useMemo(() => (schoolKey ? bySchool.get(schoolKey) ?? [] : []), [bySchool, schoolKey]);
  const visible = useMemo(() => {
    const activeFilter = FILTERS.find(item => item.value === filter) ?? FILTERS[0];
    return schoolRows.filter(row => activeFilter.test(row) && rowMatches(row, schoolQuery)).sort(byChildName);
  }, [schoolRows, filter, schoolQuery]);
  const searchResults = useMemo(
    () => (query.trim() ? rows.filter(row => rowMatches(row, query)).sort(byChildName) : []),
    [rows, query],
  );

  const openFamily = (row: FamilyListRow) => nav.push({ kind: 'family', familyId: row.familyId, sheet: true });
  const canEditStatus = user.role !== 'cashier';

  const sheet = nav.sheet?.kind === 'family' ? (
    <FamilySheet familyId={nav.sheet.familyId} onClose={nav.back} canEditStatus={canEditStatus} showFinance />
  ) : null;

  if (page?.kind === 'school') {
    const school = schoolByKey(page.schoolKey);
    return (
      <>
        <Screen
          pageKey={`manager:${page.schoolKey}`}
          title={school?.label ?? page.schoolKey}
          subtitle={`Менеджер · ${schoolRows.filter(row => row.status !== 'rejected').length} детей`}
          onBack={nav.back}
        >
          <SearchField value={schoolQuery} onChange={setSchoolQuery} placeholder="Ребёнок, родитель или телефон" />
          <SelectField
            label="Статус"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map(item => ({ value: item.value, label: item.label, count: schoolRows.filter(item.test).length }))}
          />
          <ChildList rows={visible} onOpen={openFamily} emptyText="Никого не найдено" showDebt />
        </Screen>
        {sheet}
      </>
    );
  }

  const activeRows = rows.filter(row => row.status !== 'rejected');
  const schools = schoolsFor(user.schoolKeys)
    .map(school => ({ school, list: bySchool.get(school.key) ?? [] }))
    .filter(item => item.list.length > 0);

  return (
    <>
      <Screen pageKey="manager:home" title="Менеджер" subtitle={user.name}>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск по всем школам: имя или телефон" />
        {error && <ErrorBox>Не удалось загрузить данные. Проверьте интернет и обновите страницу.</ErrorBox>}
        {isLoading && !data ? <Skeletons /> : query.trim() ? (
          <ChildList rows={searchResults} onOpen={openFamily} emptyText="Ничего не найдено" showSchool showDebt />
        ) : (
          <>
            <div className="m-kpis">
              <Kpi label="Детей в работе" value={activeRows.length} color="#7C3AED" />
              <Kpi label="Новые заявки" value={rows.filter(row => row.status === 'new').length} color="#2563EB" />
              <Kpi label="Посажены" value={rows.filter(row => row.status === 'boarded').length} color="#16A34A" />
              <Kpi label="Отказ" value={rows.filter(row => row.status === 'rejected').length} color="#64748B" />
            </div>
            <div className="m-section-title">Школы</div>
            <div className="m-list">
              {schools.map(({ school, list }) => (
                <SchoolCard
                  key={school.key}
                  school={school}
                  onClick={() => { setSchoolQuery(''); setFilter('all'); nav.push({ kind: 'school', schoolKey: school.key }); }}
                  stats={[
                    { label: 'детей', value: list.filter(row => row.status !== 'rejected').length, color: '#7C3AED' },
                    { label: 'новых', value: list.filter(row => row.status === 'new').length, color: '#2563EB' },
                    { label: 'посажено', value: list.filter(row => row.status === 'boarded').length, color: '#16A34A' },
                  ]}
                />
              ))}
            </div>
          </>
        )}
      </Screen>
      {sheet}
    </>
  );
}
