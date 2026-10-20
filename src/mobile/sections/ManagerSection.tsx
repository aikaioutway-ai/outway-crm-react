import React, { useMemo, useState } from 'react';
import { useDriversTable, useFamiliesTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed } from '../../modules/families/constants';
import { AuthenticatedUser } from '../../services/employeeService';
import { FamilyListRow } from '../../services/crmV2Service';
import { ChildList, SchoolCard } from '../cards';
import { byChildName, debtorsFrom, groupBySchool, rowMatches, schoolByKey, schoolsFor } from '../data';
import { DebtSchoolScreen, DebtsHome, DebtTransferScreen, rowsForDebtTransfer } from '../debts';
import FamilySheet from '../FamilySheet';
import { Screen, useNavPosition } from '../nav';
import { rowsForTransfer, SchoolScreen, TransferScreen } from '../transfers';
import { ErrorBox, Kpi, SearchField, Segment, Skeletons } from '../ui';

type ManagerHomeTab = 'schools' | 'debts';
const HOME_TAB_KEY = 'outway_mobile_manager_tab';

function readHomeTab(): ManagerHomeTab {
  try { return sessionStorage.getItem(HOME_TAB_KEY) === 'debts' ? 'debts' : 'schools'; } catch { return 'schools'; }
}

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
  const [homeTab, setHomeTabState] = useState<ManagerHomeTab>(readHomeTab);
  const setHomeTab = (value: ManagerHomeTab) => {
    setHomeTabState(value);
    setQuery('');
    try { sessionStorage.setItem(HOME_TAB_KEY, value); } catch { /* приватный режим */ }
  };
  const debtorCount = useMemo(() => debtorsFrom(rows).length, [rows]);

  const page = nav.page;
  const schoolKey = page?.kind === 'school' || page?.kind === 'transfer' || page?.kind === 'debtSchool' || page?.kind === 'debtTransfer' ? page.schoolKey : null;
  const schoolRows = useMemo(() => (schoolKey ? bySchool.get(schoolKey) ?? [] : []), [bySchool, schoolKey]);
  const transferKey = page?.kind === 'transfer' ? page.transfer : null;
  const transferRows = useMemo(() => (transferKey ? rowsForTransfer(schoolRows, transferKey) : []), [schoolRows, transferKey]);
  const searchResults = useMemo(
    () => (query.trim() ? rows.filter(row => rowMatches(row, query)).sort(byChildName) : []),
    [rows, query],
  );
  const driverRows = useMemo(() => drivers.data ?? [], [drivers.data]);
  const schoolLabel = schoolKey ? schoolByKey(schoolKey)?.label ?? schoolKey : '';

  const openFamily = (row: FamilyListRow) => nav.push({ kind: 'family', familyId: row.familyId, sheet: true });
  const sheet = nav.sheet?.kind === 'family' ? (
    <FamilySheet familyId={nav.sheet.familyId} userName={user.name} onClose={nav.back} canEditStatus={user.role !== 'cashier'} showFinance />
  ) : null;

  const openFamilyId = (familyId: string) => nav.push({ kind: 'family', familyId, sheet: true });

  if (page?.kind === 'debtTransfer') {
    return (
      <>
        <DebtTransferScreen
          schoolKey={page.schoolKey}
          schoolLabel={schoolLabel}
          transfer={page.transfer}
          rows={rowsForDebtTransfer(schoolRows.filter(row => row.debtAmount > 0), page.transfer)}
          onOpenFamily={openFamilyId}
          onBack={nav.back}
        />
        {sheet}
      </>
    );
  }

  if (page?.kind === 'debtSchool') {
    return (
      <>
        <DebtSchoolScreen
          schoolKey={page.schoolKey}
          schoolLabel={schoolLabel}
          rows={schoolRows}
          drivers={driverRows}
          query={schoolQuery}
          onQueryChange={setSchoolQuery}
          onOpenTransfer={transfer => nav.push({ kind: 'debtTransfer', schoolKey: page.schoolKey, transfer })}
          onOpenFamily={openFamilyId}
          onBack={nav.back}
        />
        {sheet}
      </>
    );
  }

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
      <Screen pageKey={`manager:home:${homeTab}`} title="Менеджер" subtitle={user.name}>
        <Segment value={homeTab} onChange={setHomeTab} options={[{ value: 'schools', label: 'Школы' }, { value: 'debts', label: debtorCount ? `Долги · ${debtorCount}` : 'Долги' }]} />
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={homeTab === 'debts' ? 'Родитель, ребёнок или телефон' : 'Поиск по всем школам: имя или телефон'}
        />
        {error && <ErrorBox>Не удалось загрузить данные. Проверьте интернет и обновите страницу.</ErrorBox>}
        {isLoading && !data ? <Skeletons /> : homeTab === 'debts' ? (
          <DebtsHome
            schools={schools}
            rows={rows}
            query={query}
            onOpenSchool={key => { setSchoolQuery(''); nav.push({ kind: 'debtSchool', schoolKey: key }); }}
            onOpenFamily={openFamilyId}
          />
        ) : query.trim() ? (
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
                  progress={list.filter(row => row.status === 'boarded').length / Math.max(1, list.filter(row => row.status !== 'rejected').length)}
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
