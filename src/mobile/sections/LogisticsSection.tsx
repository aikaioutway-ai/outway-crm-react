import { isVisibleDriver } from '../../modules/drivers/driverSchoolVisibility';
import React, { useMemo, useState } from 'react';
import { Bus, Car, Route, UserPlus, Users, UserX } from 'lucide-react';
import { useDriversTable, useFamiliesTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed, SCHOOL_TIER_2_KEYS } from '../../modules/families/constants';
import { AuthenticatedUser } from '../../services/employeeService';
import { FamilyListRow, V2DriverTableRow } from '../../services/crmV2Service';
import { formatName, formatPhone, phoneMatchesQuery } from '../../utils/format';
import { ChildList, SchoolCard } from '../cards';
import { byChildName, groupBySchool, isLogisticsWorkRow, rowMatches, schoolByKey, schoolsFor } from '../data';
import { isNewUnassignedRow, transferIdentityKey } from '../../modules/families/familiesRowHelpers';
import { rowsForTransfer, SchoolScreen, TransferScreen } from '../transfers';
import FamilySheet from '../FamilySheet';
import { Screen, useNavPosition } from '../nav';
import { Badge, CallButton, Empty, ErrorBox, InfoRow, Kpi, PhoneRow, SearchField, Segment, Sheet, Skeletons, useIncremental } from '../ui';

type HomeTab = 'schools' | 'drivers';

const DRIVER_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: 'Работает', bg: '#DCFCE7', color: '#166534' },
  inactive: { label: 'Не работает', bg: '#ECEFF3', color: '#52606F' },
};

function driverMatches(driver: V2DriverTableRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (phoneMatchesQuery(q, driver.phone, driver.secondPhone)) return true;
  const needle = q.toLowerCase().replace(/\s+/g, '');
  return [driver.fullName, driver.plateNumber, driver.brand, driver.model, driver.vehicleLabel, driver.transferNumbers, driver.branchShorts.join(' ')]
    .some(value => String(value ?? '').toLowerCase().replace(/\s+/g, '').includes(needle));
}

function DriverCard({ driver, onClick }: { driver: V2DriverTableRow; onClick: () => void }) {
  const status = DRIVER_STATUS[driver.status] ?? DRIVER_STATUS.inactive;
  return (
    <div className="m-card" role="button" tabIndex={0} onClick={onClick} onKeyDown={event => { if (event.key === 'Enter') onClick(); }}>
      <div className="m-card-row">
        <div className="m-card-main">
          <div className="m-card-title">{formatName(driver.fullName) || 'Без имени'}</div>
          <div className="m-card-sub">{[driver.vehicleLabel, driver.plateNumber, formatPhone(driver.phone)].filter(Boolean).join(' · ')}</div>
        </div>
        <CallButton phone={driver.phone} />
      </div>
      <div className="m-card-meta">
        <Badge tone={status}>{status.label}</Badge>
        {driver.transferNumbers && <Badge tone={{ bg: '#E0F0FF', color: '#1D4ED8' }}>{driver.transferNumbers}</Badge>}
        {driver.branchShorts.length > 0 && <Badge>{driver.branchShorts.join(', ')}</Badge>}
        {driver.childrenCount > 0 && <Badge>{driver.childrenCount} детей</Badge>}
        {driver.hasIncompleteDocuments && <Badge tone={{ bg: '#FFF1E6', color: '#B45309' }}>Документы: не хватает {driver.missingDocumentCount}</Badge>}
      </div>
    </div>
  );
}

function DriverSheet({ driver, onClose }: { driver: V2DriverTableRow; onClose: () => void }) {
  return (
    <Sheet title={formatName(driver.fullName) || 'Водитель'} onClose={onClose}>
      <div className="m-info">
        <PhoneRow label="Телефон" phone={driver.phone} />
        <PhoneRow label="Второй телефон" phone={driver.secondPhone} />
        <InfoRow label="Статус" value={(DRIVER_STATUS[driver.status] ?? DRIVER_STATUS.inactive).label} />
      </div>
      <div className="m-info">
        <InfoRow label="Транспорт" value={[driver.vehicleLabel, driver.brand, driver.model].filter(Boolean).join(' · ')} />
        <InfoRow label="Госномер" value={driver.plateNumber} />
        <InfoRow label="Мест" value={driver.seats ?? ''} />
      </div>
      <div className="m-info">
        <InfoRow label="Трансферы" value={driver.transferNumbers || 'Не назначены'} />
        <InfoRow label="Школы" value={driver.branchShorts.join(', ')} />
        <InfoRow label="Детей" value={driver.childrenCount} />
        {driver.address && <InfoRow label="Адрес" value={driver.address} />}
        {driver.comment && <InfoRow label="Комментарий" value={driver.comment} />}
      </div>
    </Sheet>
  );
}

function DriversList({ drivers, onOpen }: { drivers: V2DriverTableRow[]; onOpen: (driver: V2DriverTableRow) => void }) {
  const [visible, sentinelRef] = useIncremental(drivers);
  if (!drivers.length) return <Empty>Водителей не найдено</Empty>;
  return (
    <div className="m-list">
      {visible.map(driver => <DriverCard key={driver.rowId} driver={driver} onClick={() => onOpen(driver)} />)}
      <div ref={sentinelRef} className="m-more" />
    </div>
  );
}

/** Те же показатели, что в полной версии: трансферы, бусы, средняя загрузка буса. */
function logisticsStats(rows: FamilyListRow[]) {
  const working = rows.filter(row => row.status !== 'rejected');
  const transfers = new Map<string, { vehicleType: string; count: number }>();
  working.forEach(row => {
    const key = transferIdentityKey(row);
    if (!key) return;
    const previous = transfers.get(key);
    transfers.set(key, { vehicleType: previous?.vehicleType ?? row.vehicleType, count: (previous?.count ?? 0) + 1 });
  });
  const list = Array.from(transfers.values());
  const buses = list.filter(item => item.vehicleType === 'microbus');
  const busChildren = buses.reduce((sum, item) => sum + item.count, 0);
  return {
    newRequests: rows.filter(isNewUnassignedRow).length,
    transferCount: list.length,
    microbusCount: buses.length,
    lightVehicleCount: list.filter(item => item.vehicleType === 'minivan' || item.vehicleType === 'sedan').length,
    microbusAverage: buses.length ? busChildren / buses.length : 0,
    unboarded: working.filter(row => !!row.transferNumber && row.status !== 'boarded').length,
  };
}

const formatAverage = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export default function LogisticsSection({ user }: { user: AuthenticatedUser }) {
  const nav = useNavPosition();
  const families = useFamiliesTable();
  const drivers = useDriversTable();
  const [homeTab, setHomeTab] = useState<HomeTab>('schools');
  const [query, setQuery] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');

  const rows = useMemo(
    () => (families.data ?? []).filter(row => !row.rowId.endsWith('_empty') && isLogisticsWorkRow(row) && isSchoolAllowed(row.branchFilter, user.schoolKeys)),
    [families.data, user.schoolKeys],
  );
  const bySchool = useMemo(() => groupBySchool(rows), [rows]);
  const driverList = useMemo(() => (drivers.data ?? []).filter(isVisibleDriver), [drivers.data]);

  const page = nav.page;
  const schoolKey = page?.kind === 'school' || page?.kind === 'transfer' ? page.schoolKey : null;
  const schoolRows = useMemo(() => (schoolKey ? bySchool.get(schoolKey) ?? [] : []), [bySchool, schoolKey]);
  const transferKey = page?.kind === 'transfer' ? page.transfer : null;
  const transferRows = useMemo(() => (transferKey ? rowsForTransfer(schoolRows, transferKey) : []), [schoolRows, transferKey]);
  const schoolLabel = schoolKey ? schoolByKey(schoolKey)?.label ?? schoolKey : '';
  const searchResults = useMemo(
    () => (query.trim() && homeTab === 'schools' ? rows.filter(row => rowMatches(row, query)).sort(byChildName) : []),
    [rows, query, homeTab],
  );
  const driverRows = useMemo(() => driverList
    .filter(driver => driverMatches(driver, query))
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.fullName.localeCompare(b.fullName, 'ru')),
  [driverList, query]);
  // Как в полной версии: итоги по школам 1.0, школы 2.0 — отдельным блоком.
  const totals = useMemo(() => logisticsStats(rows.filter(row => !SCHOOL_TIER_2_KEYS.includes(row.branchFilter))), [rows]);

  const openFamily = (row: FamilyListRow) => nav.push({ kind: 'family', familyId: row.familyId, sheet: true });
  const openedDriver = nav.sheet?.kind === 'driver' ? driverList.find(driver => driver.driverId === (nav.sheet as { driverId: string }).driverId) : null;
  const sheet = nav.sheet?.kind === 'family' ? (
    <FamilySheet familyId={nav.sheet.familyId} userName={user.name} onClose={nav.back} canEditStatus={user.role !== 'cashier'} showFinance={false} />
  ) : openedDriver ? <DriverSheet driver={openedDriver} onClose={nav.back} /> : null;

  if (page?.kind === 'transfer') {
    return (
      <>
        <TransferScreen
          mode="logistics"
          schoolKey={page.schoolKey}
          schoolLabel={schoolLabel}
          transfer={page.transfer}
          rows={transferRows}
          drivers={driverList}
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
          mode="logistics"
          schoolKey={page.schoolKey}
          schoolLabel={schoolLabel}
          rows={schoolRows}
          drivers={driverList}
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

  const schools = schoolsFor(user.schoolKeys)
    .map(school => ({ school, list: bySchool.get(school.key) ?? [] }))
    .filter(item => item.list.length > 0);
  const loading = homeTab === 'schools' ? families.isLoading && !families.data : drivers.isLoading && !drivers.data;
  const failed = homeTab === 'schools' ? families.error : drivers.error;

  return (
    <>
      <Screen pageKey={`logistics:home:${homeTab}`} title="Логистика" subtitle={user.name}>
        <Segment value={homeTab} onChange={value => { setHomeTab(value); setQuery(''); }} options={[{ value: 'schools', label: 'Школы' }, { value: 'drivers', label: 'Водители' }]} />
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={homeTab === 'schools' ? 'Поиск ребёнка: имя, телефон, адрес' : 'Водитель: имя, телефон, номер авто'}
        />
        {failed && <ErrorBox>Не удалось загрузить данные. Проверьте интернет и обновите страницу.</ErrorBox>}
        {loading ? <Skeletons /> : homeTab === 'drivers' ? (
          <DriversList drivers={driverRows} onOpen={driver => nav.push({ kind: 'driver', driverId: driver.driverId, sheet: true })} />
        ) : query.trim() ? (
          <ChildList rows={searchResults} onOpen={openFamily} emptyText="Ничего не найдено" showSchool showAddress />
        ) : (
          <>
            <div className="m-kpis m-kpis--3">
              <Kpi label="Новые заявки" value={totals.newRequests} color="#378ADD" icon={<UserPlus size={16} />} />
              <Kpi label="Трансферов" value={totals.transferCount} color="#0F766E" icon={<Route size={16} />} />
              <Kpi label="Ср. загрузка буса" value={formatAverage(totals.microbusAverage)} color="#2563EB" icon={<Users size={16} />} />
              <Kpi label="Микроавтобусы" value={totals.microbusCount} color="#1D6FA4" icon={<Bus size={16} />} />
              <Kpi label="Седан и минивэн" value={totals.lightVehicleCount} color="#15803D" icon={<Car size={16} />} />
              <Kpi label="Не посажены" value={totals.unboarded} color="#B3261E" icon={<UserX size={16} />} />
            </div>
            {[
              { title: 'Школы', items: schools.filter(item => !SCHOOL_TIER_2_KEYS.includes(item.school.key)) },
            ].filter(group => group.items.length).map(group => (
              <React.Fragment key={group.title}>
                <div className="m-section-title">{group.title}</div>
                <div className="m-list">
                  {group.items.map(({ school, list }) => {
                    const stats = logisticsStats(list);
                    return (
                      <SchoolCard
                        key={school.key}
                        school={school}
                        onClick={() => { setSchoolQuery(''); nav.push({ kind: 'school', schoolKey: school.key }); }}
                        stats={[
                          { label: 'Трансферов', value: stats.transferCount, color: '#0F766E', icon: <Route size={15} /> },
                          { label: 'Микроавтобусы', value: stats.microbusCount, color: '#1D6FA4', icon: <Bus size={15} /> },
                          { label: 'Седан и минивэн', value: stats.lightVehicleCount, color: '#15803D', icon: <Car size={15} /> },
                          { label: 'Ср. загрузка буса', value: formatAverage(stats.microbusAverage), color: '#2563EB', icon: <Users size={15} /> },
                          { label: 'Не посажены', value: stats.unboarded, color: '#B3261E', icon: <UserX size={15} /> },
                        ]}
                      />
                    );
                  })}
                </div>
              </React.Fragment>
            ))}
          </>
        )}
      </Screen>
      {sheet}
    </>
  );
}
