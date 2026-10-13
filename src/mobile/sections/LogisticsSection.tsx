import React, { useMemo, useState } from 'react';
import { useDriversTable, useFamiliesTable } from '../../hooks/useCrmQueries';
import { isSchoolAllowed } from '../../modules/families/constants';
import { AuthenticatedUser } from '../../services/employeeService';
import { FamilyListRow, V2DriverTableRow } from '../../services/crmV2Service';
import { formatName, formatPhone, phoneMatchesQuery } from '../../utils/format';
import { ChildList, SchoolCard } from '../cards';
import { byChildName, groupBySchool, isLogisticsWorkRow, rowMatches, schoolByKey, schoolsFor, transferSort } from '../data';
import FamilySheet from '../FamilySheet';
import { Screen, useNavPosition } from '../nav';
import { Badge, CallButton, Chips, Empty, ErrorBox, InfoRow, Kpi, PhoneRow, SearchField, Segment, Sheet, Skeletons, useIncremental } from '../ui';

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

export default function LogisticsSection({ user }: { user: AuthenticatedUser }) {
  const nav = useNavPosition();
  const families = useFamiliesTable();
  const drivers = useDriversTable();
  const [homeTab, setHomeTab] = useState<HomeTab>('schools');
  const [query, setQuery] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [transfer, setTransfer] = useState('all');

  const rows = useMemo(
    () => (families.data ?? []).filter(row => !row.rowId.endsWith('_empty') && isLogisticsWorkRow(row) && isSchoolAllowed(row.branchFilter, user.schoolKeys)),
    [families.data, user.schoolKeys],
  );
  const bySchool = useMemo(() => groupBySchool(rows), [rows]);

  const page = nav.page;
  const schoolKey = page?.kind === 'school' ? page.schoolKey : null;
  const schoolRows = useMemo(() => (schoolKey ? bySchool.get(schoolKey) ?? [] : []), [bySchool, schoolKey]);
  const transfers = useMemo(
    () => Array.from(new Set(schoolRows.map(row => row.transferNumber).filter((value): value is string => !!value))).sort(transferSort),
    [schoolRows],
  );
  const visible = useMemo(() => schoolRows
    .filter(row => (transfer === 'all' || (transfer === 'none' ? !row.transferNumber : row.transferNumber === transfer)) && rowMatches(row, schoolQuery))
    // По трансферу, затем по остановке — как водитель едет по маршруту.
    .sort((a, b) => Number(a.transferNumber || 999) - Number(b.transferNumber || 999)
      || Number(a.stopNumber || 99) - Number(b.stopNumber || 99)
      || byChildName(a, b)),
  [schoolRows, transfer, schoolQuery]);
  const searchResults = useMemo(
    () => (query.trim() && homeTab === 'schools' ? rows.filter(row => rowMatches(row, query)).sort(byChildName) : []),
    [rows, query, homeTab],
  );
  const driverRows = useMemo(() => {
    return (drivers.data ?? [])
      .filter(driver => driverMatches(driver, query))
      .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.fullName.localeCompare(b.fullName, 'ru'));
  }, [drivers.data, query]);

  const openFamily = (row: FamilyListRow) => nav.push({ kind: 'family', familyId: row.familyId, sheet: true });
  const openedDriver = nav.sheet?.kind === 'driver' ? (drivers.data ?? []).find(driver => driver.driverId === (nav.sheet as { driverId: string }).driverId) : null;
  const sheet = nav.sheet?.kind === 'family' ? (
    <FamilySheet familyId={nav.sheet.familyId} onClose={nav.back} canEditStatus={user.role !== 'cashier'} showFinance={false} />
  ) : openedDriver ? <DriverSheet driver={openedDriver} onClose={nav.back} /> : null;

  if (page?.kind === 'school') {
    const school = schoolByKey(page.schoolKey);
    return (
      <>
        <Screen pageKey={`logistics:${page.schoolKey}`} title={school?.label ?? page.schoolKey} subtitle={`Логистика · ${schoolRows.length} детей`} onBack={nav.back}>
          <SearchField value={schoolQuery} onChange={setSchoolQuery} placeholder="Имя, телефон или адрес" />
          <Chips
            value={transfer}
            onChange={setTransfer}
            options={[
              { value: 'all', label: 'Все', count: schoolRows.length },
              { value: 'none', label: 'Без трансфера', count: schoolRows.filter(row => !row.transferNumber).length },
              ...transfers.map(number => ({ value: number, label: `№${number}`, count: schoolRows.filter(row => row.transferNumber === number).length })),
            ]}
          />
          <ChildList rows={visible} onOpen={openFamily} emptyText="Никого не найдено" showAddress />
        </Screen>
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
            <div className="m-kpis">
              <Kpi label="Детей в работе" value={rows.length} color="#7C3AED" />
              <Kpi label="Без трансфера" value={rows.filter(row => !row.transferNumber).length} color="#B45309" />
            </div>
            <div className="m-section-title">Школы</div>
            <div className="m-list">
              {schools.map(({ school, list }) => (
                <SchoolCard
                  key={school.key}
                  school={school}
                  onClick={() => { setSchoolQuery(''); setTransfer('all'); nav.push({ kind: 'school', schoolKey: school.key }); }}
                  stats={[
                    { label: 'детей', value: list.length, color: '#7C3AED' },
                    { label: 'без трансфера', value: list.filter(row => !row.transferNumber).length, color: '#B45309' },
                    { label: 'трансферов', value: new Set(list.map(row => row.transferNumber).filter(Boolean)).size, color: '#1D4ED8' },
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
