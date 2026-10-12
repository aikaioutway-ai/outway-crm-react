import React, { useEffect, useMemo, useState } from 'react';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { clearV2TransferVehicleType, updateV2TransferVehicleType } from '../../services/crmV2Service';
import { VehicleType } from '../../types';

interface LogisticsSchoolTransferDashboardProps {
  schoolKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

const TRANSFERS_PER_PAGE = 15;

const VEHICLE_MENU_OPTIONS: { value: VehicleType | 'unassigned'; label: string }[] = [
  { value: 'unassigned', label: 'Не назначен' },
  { value: 'microbus', label: 'Микроавтобус' },
  { value: 'minivan', label: 'Минивэн' },
  { value: 'sedan', label: 'Седан' },
];

export const VEHICLE_COLOR: Record<string, string> = {
  microbus: '#2DD4BF',
  minivan: '#10B981',
  sedan: '#687C54',
};

function vehicleShort(vehicleType?: string): string {
  if (vehicleType === 'microbus') return 'МКР';
  if (vehicleType === 'minivan') return 'MINI';
  if (vehicleType === 'sedan') return 'CAR';
  return '';
}

export default function LogisticsSchoolTransferDashboard({ schoolKey, rightReserveWidth = 0, selectedKey = '', onSelect }: LogisticsSchoolTransferDashboardProps) {
  const { data: rows, refetch } = useFamiliesTable(false);
  const [vehicleMenu, setVehicleMenu] = useState<{
    x: number;
    y: number;
    transferNumber: string;
    targets: Array<{ branchId: string; schoolId: string | null }>;
  } | null>(null);
  const [savingVehicleType, setSavingVehicleType] = useState(false);
  const [vehicleTypeOverrides, setVehicleTypeOverrides] = useState<Record<string, VehicleType | ''>>({});
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [schoolKey]);

  useEffect(() => {
    if (!vehicleMenu) return;
    const close = () => setVehicleMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [vehicleMenu]);

  const allSchoolRows = useMemo(() => (
    (rows ?? []).filter(row => row.branchFilter === schoolKey)
  ), [rows, schoolKey]);
  const schoolRows = useMemo(() => allSchoolRows.filter(row => row.status !== 'rejected'), [allSchoolRows]);

  const applyVehicleType = async (value: VehicleType | 'unassigned') => {
    if (!vehicleMenu || vehicleMenu.targets.length === 0) { setVehicleMenu(null); return; }
    const menu = vehicleMenu;
    const overrideKey = menu.transferNumber;
    const nextVehicleType = value === 'unassigned' ? '' : value;
    const previousOverride = vehicleTypeOverrides[overrideKey];
    setVehicleTypeOverrides(current => ({ ...current, [overrideKey]: nextVehicleType }));
    setSavingVehicleType(true);
    try {
      for (const target of menu.targets) {
        if (value === 'unassigned') {
          await clearV2TransferVehicleType({ branchId: target.branchId, transferNumber: Number(menu.transferNumber) });
        } else {
          await updateV2TransferVehicleType({
            schoolId: target.schoolId,
            branchId: target.branchId,
            transferNumber: Number(menu.transferNumber),
            vehicleType: value,
            source: 'logistics',
          });
        }
      }
      await refetch();
      setVehicleTypeOverrides(current => {
        const next = { ...current };
        delete next[overrideKey];
        return next;
      });
    } catch (error) {
      setVehicleTypeOverrides(current => {
        const next = { ...current };
        if (previousOverride === undefined) delete next[overrideKey];
        else next[overrideKey] = previousOverride;
        return next;
      });
      window.alert(error instanceof Error ? error.message : 'Не удалось изменить тип транспорта');
    } finally {
      setSavingVehicleType(false);
      setVehicleMenu(null);
    }
  };

  if (!rows) return null;

  const maxTransferNumber = schoolRows.reduce((max, row) => {
    const number = Number(row.transferNumber);
    return Number.isInteger(number) && number > max ? number : max;
  }, 0);
  const pageCount = Math.max(1, Math.ceil(maxTransferNumber / TRANSFERS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const firstNumber = currentPage * TRANSFERS_PER_PAGE + 1;
  const lastNumber = firstNumber + TRANSFERS_PER_PAGE - 1;
  const countOutsidePage = (before: boolean) => schoolRows.filter(row => {
    const number = Number(row.transferNumber);
    return Number.isInteger(number) && number > 0 && (before ? number < firstNumber : number > lastNumber);
  }).length;
  const hiddenBefore = countOutsidePage(true);
  const hiddenAfter = countOutsidePage(false);

  const transferCells = Array.from({ length: TRANSFERS_PER_PAGE }, (_, i) => {
    const number = String(firstNumber + i);
    const transferRows = schoolRows.filter(row => row.transferNumber === number);
    const branchId = transferRows[0]?.branchId ?? allSchoolRows[0]?.branchId ?? null;
    const targets = Array.from(new Map(
      transferRows
        .filter(row => Boolean(row.branchId))
        .map(row => [row.branchId!, { branchId: row.branchId!, schoolId: row.schoolId ?? null }]),
    ).values());
    if (targets.length === 0 && branchId) {
      targets.push({ branchId, schoolId: transferRows[0]?.schoolId ?? allSchoolRows[0]?.schoolId ?? null });
    }
    const savedVehicleType = transferRows.find(row => row.vehicleType === 'microbus')?.vehicleType
      ?? transferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
      ?? transferRows.find(row => row.vehicleType === 'sedan')?.vehicleType;
    return {
      filterKey: number,
      label: `#${number}`,
      count: transferRows.length,
      vehicleType: Object.prototype.hasOwnProperty.call(vehicleTypeOverrides, number)
        ? vehicleTypeOverrides[number]
        : savedVehicleType,
      branchId,
      schoolId: transferRows[0]?.schoolId ?? allSchoolRows[0]?.schoolId ?? null,
      targets,
    };
  });

  const noTransferCount = schoolRows.filter(row => !row.transferNumber).length;
  const rejectedCount = allSchoolRows.filter(row => row.status === 'rejected').length;
  const fixedCells = [
    { filterKey: 'empty', label: '—', count: noTransferCount, vehicleType: '' },
    { filterKey: 'rejected', label: '×', count: rejectedCount, vehicleType: '', color: '#64748B' },
    { filterKey: '', label: '≡', count: schoolRows.length, vehicleType: '' },
  ];

  type BarCell = typeof transferCells[number] | typeof fixedCells[number];

  const renderCell = (cell: BarCell) => {
      const active = cell.count > 0;
      const isSelected = selectedKey === cell.filterKey;
      const activeColor = 'color' in cell && cell.color
        ? cell.color
        : cell.vehicleType
          ? (VEHICLE_COLOR[cell.vehicleType] ?? '#2DD4BF')
          : '#2DD4BF';
      return (
        <button
          className="dock-hover-card dock-hover-card--compact"
          key={cell.filterKey || 'all'}
          onClick={() => onSelect?.(isSelected ? '' : cell.filterKey)}
          onContextMenu={event => {
            if (!/^\d+$/.test(cell.filterKey)) return;
            event.preventDefault();
            event.stopPropagation();
            setVehicleMenu({
              x: event.clientX,
              y: event.clientY,
              transferNumber: cell.filterKey,
              targets: 'targets' in cell ? cell.targets : [],
            });
          }}
          title={active ? `Учеников: ${cell.count}${/^\d+$/.test(cell.filterKey) ? ' · ПКМ — сменить тип транспорта' : ''}` : undefined}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            padding: '8px 4px',
            borderRadius: 12,
            background: isSelected
              ? activeColor
              : active
                ? '#fff'
                : 'repeating-linear-gradient(-45deg, #F5FAFB 0, #F5FAFB 6px, #E7EFF2 6px, #E7EFF2 8px)',
            border: `1px solid ${isSelected || active ? activeColor : '#E1E8EA'}`,
            boxShadow: isSelected ? `0 0 10px ${activeColor}99` : 'none',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2' }}>
            {active ? cell.count : ''}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2' }}>
            {cell.label}{cell.vehicleType ? ` ${vehicleShort(cell.vehicleType)}` : ''}
          </span>
        </button>
      );
  };

  const renderPageArrow = (direction: -1 | 1) => {
    const disabled = direction < 0 ? currentPage === 0 : currentPage >= pageCount - 1;
    const hidden = direction < 0 ? hiddenBefore : hiddenAfter;
    const color = disabled ? '#C7D0D6' : hidden > 0 ? '#2DD4BF' : '#626C8B';
    return (
      <button
        className="dock-hover-card dock-hover-card--compact"
        disabled={disabled}
        onClick={() => setPage(currentPage + direction)}
        title={disabled ? undefined : direction < 0
          ? `Трансферы ${firstNumber - TRANSFERS_PER_PAGE}–${firstNumber - 1}`
          : `Трансферы ${lastNumber + 1}–${lastNumber + TRANSFERS_PER_PAGE}${hidden > 0 ? ` · учеников дальше: ${hidden}` : ''}`}
        style={{
          flex: '0 0 26px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: '8px 0',
          borderRadius: 12,
          background: '#fff',
          border: `1px solid ${disabled ? '#E1E8EA' : color}`,
          color,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{direction < 0 ? '‹' : '›'}</span>
        {!disabled && hidden > 0 && <span style={{ fontSize: 10, fontWeight: 800 }}>{hidden}</span>}
      </button>
    );
  };

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      flexShrink: 0,
      padding: '10px 0 0',
      paddingRight: rightReserveWidth,
      transition: 'padding-right .18s ease',
    }}>
      {pageCount > 1 && renderPageArrow(-1)}
      {transferCells.map(renderCell)}
      {pageCount > 1 && renderPageArrow(1)}
      {fixedCells.map(renderCell)}
      {vehicleMenu && (
        <div
          onClick={event => event.stopPropagation()}
          style={{
            position: 'fixed',
            left: vehicleMenu.x,
            top: vehicleMenu.y,
            zIndex: 1600,
            width: 176,
            padding: 8,
            border: '1px solid #D4E3E7',
            borderRadius: 14,
            background: '#fff',
            boxShadow: '0 18px 44px rgba(20, 35, 48, 0.18)',
          }}
        >
          <div style={{ padding: '2px 6px 8px', fontSize: 12, fontWeight: 900, color: '#17222F', borderBottom: '1px solid #EEF3F5', marginBottom: 6 }}>
            Трансфер №{vehicleMenu.transferNumber} · тип транспорта
          </div>
          {vehicleMenu.targets.length === 0 ? (
            <div style={{ padding: '4px 6px', fontSize: 11, color: '#94A3B8' }}>Нет данных о филиале</div>
          ) : (
            <div style={{ display: 'grid', gap: 3 }}>
              {VEHICLE_MENU_OPTIONS.map(option => (
                <button
                  key={option.value}
                  disabled={savingVehicleType}
                  onClick={() => void applyVehicleType(option.value)}
                  style={{
                    textAlign: 'left',
                    padding: '7px 9px',
                    borderRadius: 9,
                    border: '1px solid transparent',
                    background: '#F5FAFB',
                    color: option.value === 'unassigned' ? '#626C8B' : (VEHICLE_COLOR[option.value] ?? '#17222F'),
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: savingVehicleType ? 'default' : 'pointer',
                    opacity: savingVehicleType ? 0.6 : 1,
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
