import React, { useMemo } from 'react';
import { Ban, ChevronRight } from 'lucide-react';
import { compactMoney } from '../modules/families/familiesRowHelpers';
import { FamilyListRow, V2DriverTableRow } from '../services/crmV2Service';
import { formatName } from '../utils/format';
import { money } from '../utils/pricing';
import { DebtorList, SchoolCard } from './cards';
import { Debtor, debtorsFrom, rowMatches, SchoolTab, transferSort } from './data';
import { Screen } from './nav';
import { NO_TRANSFER, transferTitle, vehicleTypeOf } from './transfers';
import { Kpi, SearchField, transferColor } from './ui';

const DEBT_COLOR = '#C2352B';

/** Ключ трансфера для долгов: дети без трансфера (в том числе отказники) — отдельной группой. */
export function debtTransferKey(row: FamilyListRow): string {
  return row.transferNumber || NO_TRANSFER;
}

export function rowsForDebtTransfer(rows: FamilyListRow[], transfer: string): FamilyListRow[] {
  return rows.filter(row => debtTransferKey(row) === transfer);
}

function sumDebt(debtors: Debtor[]): number {
  return debtors.reduce((sum, debtor) => sum + debtor.debt, 0);
}

function familiesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'семья';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'семьи';
  return 'семей';
}

function DebtKpis({ debtors }: { debtors: Debtor[] }) {
  const pending = debtors.filter(debtor => debtor.pending > 0);
  return (
    <>
      <div className="m-kpis">
        <Kpi label="Должников" value={debtors.length} color={DEBT_COLOR} />
        <Kpi label="Сумма долга" value={money(sumDebt(debtors))} color={DEBT_COLOR} />
      </div>
      {pending.length > 0 && (
        <div className="m-note">
          У {pending.length} {familiesWord(pending.length)} есть оплаты на проверке у кассира на {money(pending.reduce((sum, debtor) => sum + debtor.pending, 0))} — долг уменьшится после подтверждения.
        </div>
      )}
    </>
  );
}

/** Поиск должника по ребёнку, родителю и телефону. */
function useFoundDebtors(rows: FamilyListRow[], query: string): Debtor[] {
  return useMemo(() => {
    const q = query.trim();
    return q ? debtorsFrom(rows.filter(row => rowMatches(row, q))) : [];
  }, [rows, query]);
}

/** Главный экран «Долги»: итоги и школы с должниками. */
export function DebtsHome({ schools, rows, query, onOpenSchool, onOpenFamily }: {
  schools: { school: SchoolTab; list: FamilyListRow[] }[];
  rows: FamilyListRow[];
  query: string;
  onOpenSchool: (schoolKey: string) => void;
  onOpenFamily: (familyId: string) => void;
}) {
  const debtors = useMemo(() => debtorsFrom(rows), [rows]);
  const found = useFoundDebtors(rows, query);
  const bySchool = useMemo(
    () => schools.map(({ school, list }) => ({ school, debtors: debtorsFrom(list) })).filter(item => item.debtors.length > 0),
    [schools],
  );
  if (query.trim()) return <DebtorList debtors={found} onOpen={debtor => onOpenFamily(debtor.familyId)} emptyText="Должников не найдено" />;
  return (
    <>
      <DebtKpis debtors={debtors} />
      <div className="m-section-title">Школы</div>
      <div className="m-list">
        {bySchool.map(({ school, debtors: list }) => (
          <SchoolCard
            key={school.key}
            school={school}
            onClick={() => onOpenSchool(school.key)}
            stats={[
              { label: 'должников', value: list.length, color: DEBT_COLOR },
              { label: 'долг', value: compactMoney(sumDebt(list)), color: '#64748B' },
            ]}
          />
        ))}
      </div>
    </>
  );
}

function DebtTransferTile({ transfer, rows, drivers, onClick }: {
  transfer: string;
  rows: FamilyListRow[];
  drivers: V2DriverTableRow[];
  onClick: () => void;
}) {
  const debtors = debtorsFrom(rows);
  const none = transfer === NO_TRANSFER;
  const driverId = rows.find(row => row.driverId)?.driverId;
  const driver = driverId ? drivers.find(item => item.driverId === driverId) : undefined;
  return (
    <button type="button" className="m-card m-transfer" onClick={onClick}>
      <span className={`m-transfer-num ${none ? 'is-none' : ''}`} style={none ? undefined : { background: transferColor(vehicleTypeOf(rows)), color: '#FFFFFF' }}>
        {none ? <Ban size={20} /> : `№${transfer}`}
      </span>
      <span className="m-card-main">
        <span className="m-card-title" style={{ display: 'block' }}>
          {none ? transferTitle(transfer) : `${debtors.length} ${debtors.length === 1 ? 'должник' : debtors.length < 5 ? 'должника' : 'должников'}`}
        </span>
        <span className="m-card-sub" style={{ display: 'block' }}>
          {none ? `${debtors.length} ${familiesWord(debtors.length)}` : driver ? formatName(driver.fullName) : 'водитель не назначен'}
        </span>
      </span>
      <span className="m-debt">{compactMoney(sumDebt(debtors))}</span>
      <ChevronRight className="m-card-chevron" size={20} />
    </button>
  );
}

/** Школа: итоги по долгам и трансферы, где есть должники. */
export function DebtSchoolScreen({ schoolKey, schoolLabel, rows, drivers, query, onQueryChange, onOpenTransfer, onOpenFamily, onBack }: {
  schoolKey: string;
  schoolLabel: string;
  rows: FamilyListRow[];
  drivers: V2DriverTableRow[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpenTransfer: (transfer: string) => void;
  onOpenFamily: (familyId: string) => void;
  onBack: () => void;
}) {
  const debtRows = useMemo(() => rows.filter(row => row.debtAmount > 0), [rows]);
  const debtors = useMemo(() => debtorsFrom(debtRows), [debtRows]);
  const found = useFoundDebtors(debtRows, query);
  const transfers = useMemo(() => {
    const keys = Array.from(new Set(debtRows.map(debtTransferKey)));
    return [...keys.filter(key => key !== NO_TRANSFER).sort(transferSort), ...keys.filter(key => key === NO_TRANSFER)];
  }, [debtRows]);
  return (
    <Screen pageKey={`debts:${schoolKey}`} title={schoolLabel} subtitle="Долги" onBack={onBack}>
      <SearchField value={query} onChange={onQueryChange} placeholder="Родитель, ребёнок или телефон" />
      {query.trim() ? (
        <DebtorList debtors={found} showSchool={false} onOpen={debtor => onOpenFamily(debtor.familyId)} emptyText="Должников не найдено" />
      ) : debtors.length === 0 ? (
        <div className="m-empty">В школе нет должников</div>
      ) : (
        <>
          <DebtKpis debtors={debtors} />
          <div className="m-section-title">Трансферы</div>
          <div className="m-list">
            {transfers.map(transfer => (
              <DebtTransferTile
                key={transfer}
                transfer={transfer}
                rows={rowsForDebtTransfer(debtRows, transfer)}
                drivers={drivers}
                onClick={() => onOpenTransfer(transfer)}
              />
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}

/** Трансфер: список семей-должников. */
export function DebtTransferScreen({ schoolKey, schoolLabel, transfer, rows, onOpenFamily, onBack }: {
  schoolKey: string;
  schoolLabel: string;
  transfer: string;
  rows: FamilyListRow[];
  onOpenFamily: (familyId: string) => void;
  onBack: () => void;
}) {
  const debtors = useMemo(() => debtorsFrom(rows), [rows]);
  return (
    <Screen
      pageKey={`debts:${schoolKey}:${transfer}`}
      title={transferTitle(transfer)}
      subtitle={`${schoolLabel} · долги`}
      onBack={onBack}
    >
      <DebtKpis debtors={debtors} />
      <DebtorList debtors={debtors} showSchool={false} onOpen={debtor => onOpenFamily(debtor.familyId)} emptyText="В трансфере нет должников" />
    </Screen>
  );
}
