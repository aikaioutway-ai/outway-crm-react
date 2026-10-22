import { showTaskContextMenu } from '../tasks/TaskContextMenu';
import { openTaskComposer } from '../tasks/taskTypes';
import '../../core/selects/NotionSelect.css';
import TransferCell, { transferCellColor, VEHICLE_COLOR } from '../../core/dashboard/TransferCell';
import TransferBarPages, { transferCellCount } from '../../core/dashboard/TransferBarPages';
import React, { useEffect, useMemo, useState } from 'react';
import { Check, ListTodo } from 'lucide-react';
import { isTestTransfer, setTestTransfer, TEST_TRANSFER_COLOR, useTestTransfers } from './testTransfers';
import { useFamiliesTable, useSchoolTransferNumbers } from '../../hooks/useCrmQueries';
import { clearV2TransferVehicleType, updateV2TransferVehicleType } from '../../services/crmV2Service';
import { VehicleType } from '../../types';

interface LogisticsSchoolTransferDashboardProps {
  schoolKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

const VEHICLE_MENU_OPTIONS: { value: VehicleType | 'unassigned'; label: string }[] = [
  { value: 'microbus', label: 'Микроавтобус' },
  { value: 'minivan', label: 'Минивэн' },
  { value: 'sedan', label: 'Седан' },
];



export default function LogisticsSchoolTransferDashboard({ schoolKey, rightReserveWidth = 0, selectedKey = '', onSelect }: LogisticsSchoolTransferDashboardProps) {
  const { data: rows, refetch } = useFamiliesTable();
  const schoolTransferNumbers = useSchoolTransferNumbers(schoolKey);
  const [vehicleMenu, setVehicleMenu] = useState<{
    x: number;
    y: number;
    transferNumber: string;
    targets: Array<{ branchId: string; schoolId: string | null }>;
  } | null>(null);
  const [savingVehicleType, setSavingVehicleType] = useState(false);
  const [vehicleTypeOverrides, setVehicleTypeOverrides] = useState<Record<string, VehicleType | ''>>({});
  useTestTransfers(); // перерисовка при смене тестовых отметок

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

  const transferCells = Array.from({ length: transferCellCount([...schoolRows.map(row => row.transferNumber), ...schoolTransferNumbers], selectedKey) }, (_, i) => {
    const number = String(i + 1);
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
    const test = isTestTransfer(schoolKey, number);
    return {
      filterKey: number,
      label: number,
      count: transferRows.length,
      test,
      color: test ? TEST_TRANSFER_COLOR : undefined,
      vehicleType: Object.prototype.hasOwnProperty.call(vehicleTypeOverrides, number)
        ? vehicleTypeOverrides[number]
        : savedVehicleType,
      branchId,
      schoolId: transferRows[0]?.schoolId ?? allSchoolRows[0]?.schoolId ?? null,
      targets,
    };
  });

  // Дети тестовых трансферов считаются как без трансфера.
  const noTransferCount = schoolRows.filter(row => !row.transferNumber || isTestTransfer(schoolKey, row.transferNumber)).length;
  const rejectedCount = allSchoolRows.filter(row => row.status === 'rejected').length;
  const fixedCells = [
    { filterKey: 'empty', label: '—', count: noTransferCount, vehicleType: '' },
    { filterKey: 'rejected', label: '×', count: rejectedCount, vehicleType: '', color: '#64748B' },
    { filterKey: '', label: '≡', count: schoolRows.length, vehicleType: '' },
  ];

  type BarCell = typeof transferCells[number] | typeof fixedCells[number];

  const renderCell = (cell: BarCell) => (
    <TransferCell
      key={cell.filterKey || 'all'}
      label={cell.label}
      color={transferCellColor(cell)}
      active={cell.count > 0}
      selected={selectedKey === cell.filterKey}
      value={cell.count}
      onClick={() => onSelect?.(selectedKey === cell.filterKey ? '' : cell.filterKey)}
      onContextMenu={event => {
        if (!/^\d+$/.test(cell.filterKey)) {showTaskContextMenu(event,cell.filterKey==='rejected' || cell.filterKey==='empty'?{type:'group',id:`${schoolKey}:${cell.filterKey==='rejected'?'rejected':'new'}`,schoolKey,group:cell.filterKey==='rejected'?'rejected':'new',label:cell.filterKey==='rejected'?'Отказные заявки':'Новые заявки'}:{type:'school',id:schoolKey,schoolKey,label:schoolKey});return;}
        event.preventDefault();
        event.stopPropagation();
        setVehicleMenu({
          x: event.clientX,
          y: event.clientY,
          transferNumber: cell.filterKey,
          targets: 'targets' in cell ? cell.targets : [],
        });
      }}
      title={cell.count > 0 ? `Учеников: ${cell.count}${'test' in cell && cell.test ? ' · тестовый трансфер' : ''}${/^\d+$/.test(cell.filterKey) ? ' · ПКМ — сменить тип транспорта' : ''}` : undefined}
    />
  );

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      flexShrink: 0,
      padding: '10px 0 0',
      paddingRight: rightReserveWidth,
      transition: 'padding-right .18s ease',
    }}>
      <TransferBarPages scopeKey={schoolKey} selectedKey={selectedKey} counts={transferCells.map(cell => cell.count)}>
        {transferCells.map(renderCell)}
        {fixedCells.map(renderCell)}
      </TransferBarPages>
      {vehicleMenu && (
        <div
          className="dt-ctx-menu ow-vehicle-menu"
          role="menu"
          aria-label={`Трансфер №${vehicleMenu.transferNumber}`}
          onClick={event => event.stopPropagation()}
          style={{ left: vehicleMenu.x, top: vehicleMenu.y, zIndex: 1600, width: 220 }}
        >
          <div className="dt-ctx-section">Трансфер №{vehicleMenu.transferNumber}</div>
          <button type="button" role="menuitem" className="dt-ctx-item" onClick={()=>{openTaskComposer({type:'transfer',id:'',schoolKey,transferNumber:Number(vehicleMenu.transferNumber),label:`Трансфер № ${vehicleMenu.transferNumber}`});setVehicleMenu(null);}}>
            <ListTodo size={14} aria-hidden="true" /> Поставить задачу
          </button>
          <hr className="dt-ctx-divider" />
          <div className="dt-ctx-section">Тип транспорта</div>
          {vehicleMenu.targets.length === 0 ? (
            <div className="ow-vehicle-menu-empty">Нет данных о филиале</div>
          ) : (
            VEHICLE_MENU_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                className="dt-ctx-item"
                disabled={savingVehicleType}
                onClick={() => void applyVehicleType(option.value)}
              >
                <span className="ow-vehicle-dot" style={{ background: VEHICLE_COLOR[option.value] }} aria-hidden="true" />
                {option.label}
              </button>
            ))
          )}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={isTestTransfer(schoolKey, vehicleMenu.transferNumber)}
            className="dt-ctx-item"
            title="Черновик для прикидки: базу и цены не меняет, дети считаются как новые заявки"
            onClick={() => {
              setTestTransfer(schoolKey, vehicleMenu.transferNumber, !isTestTransfer(schoolKey, vehicleMenu.transferNumber));
              setVehicleMenu(null);
            }}
          >
            <span className="ow-vehicle-dot" style={{ background: TEST_TRANSFER_COLOR }} aria-hidden="true" />
            Тестовый
            {isTestTransfer(schoolKey, vehicleMenu.transferNumber) && <Check size={14} className="ow-vehicle-check" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}
