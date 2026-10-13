import React, { useMemo, useState } from 'react';
import { Ban, ChevronRight, Download, UserX } from 'lucide-react';
import { VT_LABEL } from '../modules/families/constants';
import { FamilyListRow, V2DriverTableRow } from '../services/crmV2Service';
import { formatName, formatPhone } from '../utils/format';
import { byChildName, rowMatches, transferSort } from './data';
import { downloadListImage, ExportList } from './exportList';
import { Screen } from './nav';
import { CallButton, Empty, ErrorBox, Kpi, SearchField, StatusBadge, TransferChip, transferColor, useIncremental } from './ui';

export type SchoolMode = 'manager' | 'logistics';

/** «Без трансфера» и «Отказ» — служебные ключи рядом с номерами трансферов. */
export const NO_TRANSFER = 'none';
export const REJECTED = 'rejected';

export function rowsForTransfer(rows: FamilyListRow[], transfer: string): FamilyListRow[] {
  if (transfer === REJECTED) return rows.filter(row => row.status === 'rejected');
  const working = rows.filter(row => row.status !== 'rejected');
  if (transfer === NO_TRANSFER) return working.filter(row => !row.transferNumber);
  return working.filter(row => row.transferNumber === transfer);
}

function isUnboarded(row: FamilyListRow): boolean {
  return !!row.transferNumber && row.status !== 'boarded' && row.status !== 'rejected';
}

/** Самый частый тип машины в трансфере: по нему цвет номера, как в основной CRM. */
export function vehicleTypeOf(rows: FamilyListRow[]): string {
  const counts = new Map<string, number>();
  rows.forEach(row => { if (row.vehicleType) counts.set(row.vehicleType, (counts.get(row.vehicleType) ?? 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function vehicleOf(rows: FamilyListRow[]): string {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const label = VT_LABEL[row.vehicleType] ?? row.vehicleLabel;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function driverOf(rows: FamilyListRow[], drivers: V2DriverTableRow[]): V2DriverTableRow | undefined {
  const driverId = rows.find(row => row.driverId)?.driverId;
  return driverId ? drivers.find(driver => driver.driverId === driverId) : undefined;
}

export function transferTitle(transfer: string): string {
  if (transfer === NO_TRANSFER) return 'Без трансфера';
  if (transfer === REJECTED) return 'Отказ';
  return `Трансфер №${transfer}`;
}

/** Ряд показателей школы: свой у менеджера и у логиста. */
function SchoolKpis({ mode, rows }: { mode: SchoolMode; rows: FamilyListRow[] }) {
  const working = rows.filter(row => row.status !== 'rejected');
  const transfers = new Set(working.map(row => row.transferNumber).filter(Boolean));
  if (mode === 'manager') {
    return (
      <div className="m-kpis">
        <Kpi label="Детей в работе" value={working.length} color="#7C3AED" />
        <Kpi label="Новые заявки" value={rows.filter(row => row.status === 'new').length} color="#2563EB" />
        <Kpi label="Посажены" value={rows.filter(row => row.status === 'boarded').length} color="#16A34A" />
        <Kpi label="Отказ" value={rows.filter(row => row.status === 'rejected').length} color="#64748B" />
      </div>
    );
  }
  return (
    <div className="m-kpis">
      <Kpi label="Трансферов" value={transfers.size} color="#1D4ED8" />
      <Kpi label="Детей в работе" value={working.length} color="#7C3AED" />
      <Kpi label="Без трансфера" value={working.filter(row => !row.transferNumber).length} color="#B45309" />
      <Kpi label="Не посажены" value={working.filter(isUnboarded).length} color="#B3261E" />
    </div>
  );
}

function TransferTile({ transfer, rows, drivers, mode, onClick }: {
  transfer: string;
  rows: FamilyListRow[];
  drivers: V2DriverTableRow[];
  mode: SchoolMode;
  onClick: () => void;
}) {
  const special = transfer === NO_TRANSFER || transfer === REJECTED;
  const driver = special ? undefined : driverOf(rows, drivers);
  const details = special ? '' : [vehicleOf(rows), driver ? formatName(driver.fullName) : 'водитель не назначен'].filter(Boolean).join(' · ');
  const unboarded = rows.filter(isUnboarded).length;
  const fresh = rows.filter(row => row.status === 'new').length;
  return (
    <button type="button" className="m-card m-transfer" onClick={onClick}>
      <span
        className={`m-transfer-num ${transfer === NO_TRANSFER ? 'is-none' : transfer === REJECTED ? 'is-rejected' : ''}`}
        style={special ? undefined : { background: transferColor(vehicleTypeOf(rows)), color: '#FFFFFF' }}
      >
        {transfer === NO_TRANSFER ? <Ban size={20} /> : transfer === REJECTED ? <UserX size={20} /> : `№${transfer}`}
      </span>
      <span className="m-card-main">
        <span className="m-card-title" style={{ display: 'block' }}>{special ? transferTitle(transfer) : `${rows.length} ${rows.length === 1 ? 'ребёнок' : rows.length < 5 ? 'ребёнка' : 'детей'}`}</span>
        <span className="m-card-sub" style={{ display: 'block' }}>
          {special ? `${rows.length} детей` : details}
        </span>
      </span>
      {!special && mode === 'logistics' && unboarded > 0 && <span className="m-badge" style={{ background: '#FBEAE9', color: '#B3261E' }}>не посаж. {unboarded}</span>}
      {!special && mode === 'manager' && fresh > 0 && <span className="m-badge" style={{ background: '#E0F2F1', color: '#0F5F5F' }}>новых {fresh}</span>}
      <ChevronRight className="m-card-chevron" size={20} />
    </button>
  );
}

/** Строка ребёнка: ФИО, ниже адрес и телефон. Логисту — ещё остановка и время, менеджеру — статус. */
function ChildRowItem({ row, mode, showTransfer, onClick }: { row: FamilyListRow; mode: SchoolMode; showTransfer: boolean; onClick: () => void }) {
  const name = /[\p{L}]/u.test(row.childName) ? formatName(row.childName) : 'Без имени';
  return (
    <button type="button" className="m-row" onClick={onClick}>
      {mode === 'logistics' && <span className="m-row-lead">{row.stopNumber || '—'}</span>}
      <span className="m-row-main">
        <span className="m-row-title">
          {showTransfer && <TransferChip number={row.transferNumber} vehicleType={row.vehicleType} />}
          {name}
        </span>
        <span className="m-row-sub">{row.streetAddress || 'адрес не указан'}</span>
        {row.phone && <span className="m-row-sub">{formatPhone(row.phone)}</span>}
      </span>
      <span className="m-row-end">
        {mode === 'logistics' && row.timeMorning && <span className="m-row-time">{row.timeMorning.slice(0, 5)}</span>}
        {(mode === 'manager' || row.status !== 'boarded') && <StatusBadge status={row.status} />}
      </span>
    </button>
  );
}

function ChildRows({ rows, mode, showTransfer = false, onOpen, emptyText }: {
  rows: FamilyListRow[];
  mode: SchoolMode;
  showTransfer?: boolean;
  onOpen: (row: FamilyListRow) => void;
  emptyText: string;
}) {
  const [visible, sentinelRef] = useIncremental(rows, 60);
  if (!rows.length) return <Empty>{emptyText}</Empty>;
  return (
    <div className="m-rows">
      {visible.map(row => <ChildRowItem key={row.rowId} row={row} mode={mode} showTransfer={showTransfer} onClick={() => onOpen(row)} />)}
      <div ref={sentinelRef} className="m-more" />
    </div>
  );
}

function sortForMode(rows: FamilyListRow[], mode: SchoolMode): FamilyListRow[] {
  if (mode === 'manager') return [...rows].sort(byChildName);
  return [...rows].sort((a, b) => Number(a.stopNumber || 99) - Number(b.stopNumber || 99) || byChildName(a, b));
}

/** Экран школы: показатели и список трансферов; при поиске — найденные дети. */
export function SchoolScreen({ mode, schoolKey, schoolLabel, rows, drivers, query, onQueryChange, onOpenTransfer, onOpenFamily, onBack }: {
  mode: SchoolMode;
  schoolKey: string;
  schoolLabel: string;
  rows: FamilyListRow[];
  drivers: V2DriverTableRow[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpenTransfer: (transfer: string) => void;
  onOpenFamily: (row: FamilyListRow) => void;
  onBack: () => void;
}) {
  const working = rows.filter(row => row.status !== 'rejected');
  const transfers = Array.from(new Set(working.map(row => row.transferNumber).filter((value): value is string => !!value))).sort(transferSort);
  const extra = mode === 'manager' ? [NO_TRANSFER, REJECTED] : [NO_TRANSFER];
  // Поиск как везде: имя, родитель, адрес и телефон в любом формате.
  const found = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return sortForMode(rows.filter(row => (mode === 'manager' || row.status !== 'rejected') && rowMatches(row, q)), mode);
  }, [rows, query, mode]);

  return (
    <Screen
      pageKey={`${mode}:${schoolKey}`}
      title={schoolLabel}
      subtitle={mode === 'manager' ? 'Менеджер' : 'Логистика'}
      onBack={onBack}
    >
      <SearchField value={query} onChange={onQueryChange} placeholder={mode === 'manager' ? 'Ребёнок, родитель или телефон' : 'Имя, телефон или адрес'} />
      {query.trim() ? (
        <ChildRows rows={found} mode={mode} showTransfer onOpen={onOpenFamily} emptyText="Никого не найдено" />
      ) : (
        <>
          <SchoolKpis mode={mode} rows={rows} />
          <div className="m-section-title">Трансферы</div>
          <div className="m-list">
            {transfers.map(number => (
              <TransferTile key={number} transfer={number} rows={rowsForTransfer(rows, number)} drivers={drivers} mode={mode} onClick={() => onOpenTransfer(number)} />
            ))}
            {extra.map(key => {
              const list = rowsForTransfer(rows, key);
              return list.length ? <TransferTile key={key} transfer={key} rows={list} drivers={drivers} mode={mode} onClick={() => onOpenTransfer(key)} /> : null;
            })}
            {!transfers.length && !extra.some(key => rowsForTransfer(rows, key).length) && <Empty>В школе пока нет детей</Empty>}
          </div>
        </>
      )}
    </Screen>
  );
}

/** Данные для «Списка для водителя». */
export function buildExportList(schoolLabel: string, transfer: string, rows: FamilyListRow[], drivers: V2DriverTableRow[]): ExportList {
  const sorted = sortForMode(rows, 'logistics');
  const driver = driverOf(rows, drivers);
  const date = new Date().toLocaleDateString('ru-RU');
  return {
    title: `${schoolLabel} · ${transferTitle(transfer)}`,
    subtitle: [date, vehicleOf(rows), driver ? `водитель ${formatName(driver.fullName)}` : '', `${rows.length} детей`].filter(Boolean).join(' · '),
    // Сначала дети по номерам остановок, потом без остановки — номер в списке один, сквозной.
    rows: sorted.map(row => ({
      name: /[\p{L}]/u.test(row.childName) ? formatName(row.childName) : 'Без имени',
      address: row.streetAddress,
      phones: [row.phone, row.secondPhone].filter(Boolean).map(phone => formatPhone(phone)),
      time: row.timeMorning ? row.timeMorning.slice(0, 5) : '',
    })),
  };
}

/** Экран трансфера: водитель, кнопка «Список для водителя» и дети по строкам. */
export function TransferScreen({ mode, schoolKey, schoolLabel, transfer, rows, drivers, onOpenFamily, onBack }: {
  mode: SchoolMode;
  schoolKey: string;
  schoolLabel: string;
  transfer: string;
  rows: FamilyListRow[];
  drivers: V2DriverTableRow[];
  onOpenFamily: (row: FamilyListRow) => void;
  onBack: () => void;
}) {
  const sorted = useMemo(() => sortForMode(rows, mode), [rows, mode]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const downloadList = async () => {
    setSaving(true);
    setError('');
    try {
      await downloadListImage(buildExportList(schoolLabel, transfer, rows, drivers));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сделать картинку');
    } finally {
      setSaving(false);
    }
  };
  const special = transfer === NO_TRANSFER || transfer === REJECTED;
  const driver = special ? undefined : driverOf(rows, drivers);
  const vehicle = vehicleOf(rows);
  return (
    <Screen
      pageKey={`${mode}:${schoolKey}:${transfer}`}
      title={special ? transferTitle(transfer) : <span className="m-title-transfer"><TransferChip number={transfer} vehicleType={vehicleTypeOf(rows)} /> Трансфер</span>}
      subtitle={[schoolLabel, special ? '' : vehicle, `${rows.length} детей`].filter(Boolean).join(' · ')}
      onBack={onBack}
    >
      {!special && (
        <div className="m-card">
          <div className="m-card-row">
            <div className="m-card-main">
              <div className="m-info-label">Водитель</div>
              <div className="m-card-title">{driver ? formatName(driver.fullName) : 'Не назначен'}</div>
              {driver && <div className="m-card-sub">{[driver.vehicleLabel || vehicle, driver.plateNumber, formatPhone(driver.phone)].filter(Boolean).join(' · ')}</div>}
            </div>
            {driver && <CallButton phone={driver.phone} />}
          </div>
        </div>
      )}
      {rows.length > 0 && transfer !== REJECTED && (
        <button type="button" className="m-btn m-btn--primary m-btn--block" disabled={saving} onClick={downloadList}>
          <Download size={18} /> {saving ? 'Готовлю картинку…' : 'Скачать список для водителя'}
        </button>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      <ChildRows rows={sorted} mode={mode} onOpen={onOpenFamily} emptyText="В трансфере нет детей" />
    </Screen>
  );
}
