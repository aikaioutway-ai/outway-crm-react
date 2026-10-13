import React, { useMemo, useState } from 'react';
import { useDriversTable, useFamiliesTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed } from '../../modules/families/constants';
import { AuthenticatedUser } from '../../services/employeeService';
import { FamilyListRow } from '../../services/crmV2Service';
import { ChildList, SchoolCard } from '../cards';
import { byChildName, groupBySchool, rowMatches, schoolByKey, schoolsFor } from '../data';
import FamilySheet from '../FamilySheet';
import { Screen, useNavPosition } from '../nav';
import { buildExportList, ExportSheet, rowsForTransfer, SchoolScreen, TransferScreen } from '../transfers';
import { ErrorBox, Kpi, SearchField, Skeletons } from '../ui';

export default function ManagerSection({ user }: { user: AuthenticatedUser }) {
  const nav = useNavPosition();
  const { data, isLoading, error } = useFamiliesTable();
  const drivers = useDriversTable();
  const rows = useMemo(
    () => (data ?? []).filter(row => !row.rowId.endsWith('_empty') && isSchoolAllowed(row.branchFilter, user.schoolKeys)),
    [data, user.schoolKeys],
  );
  const bySchool = useMemo(() => groupBySchool(rows), [rows]);
  const [query, setQuery] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');

  const page = nav.page;
  const schoolKey = page?.kind === 'school' || page?.kind === 'transfer' ? page.schoolKey : null;
  const schoolRows = useMemo(() => (schoolKey ? bySchool.get(schoolKey) ?? [] : []), [bySchool, schoolKey]);
  const transferKey = page?.kind === 'transfer' ? page.transfer : null;
  const transferRows = useMemo(() => (transferKey ? rowsForTransfer(schoolRows, transferKey) : []), [schoolRows, transferKey]);
  const searchResults = useMemo(
    () => (query.trim() ? rows.filter(row => rowMatches(row, query)).sort(byChildName) : []),
    [rows, query],
  );
  const driverRows = useMemo(() => drivers.data ?? [], [drivers.data]);
  const schoolLabel = schoolKey ? schoolByKey(schoolKey)?.label ?? schoolKey : '';
  const exportList = useMemo(
    () => (transferKey ? buildExportList(schoolLabel, transferKey, transferRows, driverRows) : null),
    [schoolLabel, transferKey, transferRows, driverRows],
  );

  const openFamily = (row: FamilyListRow) => nav.push({ kind: 'family', familyId: row.familyId, sheet: true });
  const sheet = nav.sheet?.kind === 'family' ? (
    <FamilySheet familyId={nav.sheet.familyId} onClose={nav.back} canEditStatus={user.role !== 'cashier'} showFinance />
  ) : nav.sheet?.kind === 'export' && exportList ? (
    <ExportSheet list={exportList} onClose={nav.back} />
  ) : null;

  if (page?.kind === 'transfer') {
    return (
      <>
        <TransferScreen
          mode="manager"
          schoolKey={page.schoolKey}
          schoolLabel={schoolLabel}
          transfer={page.transfer}
          rows={transferRows}
          drivers={driverRows}
          onOpenFamily={openFamily}
          onExport={() => nav.push({ kind: 'export', sheet: true })}
          onBack={nav.back}
        />
        {sheet}
      </>
    );
  }

  if (page?.kind === 'school') {
    return (
      <>
        <SchoolScreen
          mode="manager"
          schoolKey={page.schoolKey}
          schoolLabel={schoolLabel}
          rows={schoolRows}
          drivers={driverRows}
          query={schoolQuery}
          onQueryChange={setSchoolQuery}
          onOpenTransfer={transfer => nav.push({ kind: 'transfer', schoolKey: page.schoolKey, transfer })}
          onOpenFamily={openFamily}
          onBack={nav.back}
        />
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
                  onClick={() => { setSchoolQuery(''); nav.push({ kind: 'school', schoolKey: school.key }); }}
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
