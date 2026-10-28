import TaskButton from '../modules/tasks/TaskButton';
import { TRANSFER_NUMBER_VALUES } from '../modules/families/constants';
import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useFamiliesTable } from '../hooks/useCrmQueries';
import { FamilyListRow, updateV2Child, updateV2ChildRoute } from '../services/crmV2Service';
import { VehicleType } from '../types';
import { QK, queryClient } from '../services/queryClient';
import { money } from '../utils/pricing';
import { formatName } from '../utils/format';
import { schoolLabel } from './data';
import { CHILD_STATUS_OPTIONS, ErrorBox, InfoRow, PhoneRow, SelectField, Sheet, Skeletons, StatusBadge, TransferBadge } from './ui';

const TRANSFER_NUMBERS = TRANSFER_NUMBER_VALUES;
const STOP_NUMBERS = Array.from({ length: 30 }, (_, index) => String(index + 1));

/** Номера для выбора: 1–30 плюс текущий, если он больше. */
function numberOptions(values: string[], current: string | null, emptyLabel: string, prefix: string) {
  const list = current && !values.includes(current) ? [...values, current] : values;
  return [{ value: '', label: emptyLabel }, ...list.map(value => ({ value, label: `${prefix}${value}` }))];
}

function patchRow(childId: string, patch: Partial<FamilyListRow>) {
  // Показываем изменение сразу, не дожидаясь перезагрузки всей таблицы.
  queryClient.setQueryData<FamilyListRow[]>(QK.familiesTable, (current: FamilyListRow[] | undefined) => current?.map((row: FamilyListRow) => (
    row.rowId === childId ? { ...row, ...patch } : row
  )));
}

export default function FamilySheet({ familyId, onClose, canEditStatus, showFinance, userName }: {
  familyId: string;
  onClose: () => void;
  canEditStatus: boolean;
  showFinance: boolean;
  userName?: string;
}) {
  const { data, isLoading } = useFamiliesTable();
  const rows = (data ?? []).filter(row => row.familyId === familyId);
  const family = rows[0];
  const children = rows.filter(row => !row.rowId.endsWith('_empty'));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const changeStatus = async (childId: string, childName: string, status: string) => {
    if (status === 'rejected' && !window.confirm(`Перевести «${childName}» в «Отказ»?`)) return;
    setSavingId(childId);
    setError('');
    try {
      // Статус пересчитывает семейную скидку и может создать начисление при посадке.
      await updateV2Child(childId, { status });
      patchRow(childId, { status });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сменить статус');
    } finally {
      setSavingId(null);
    }
  };

  /** Перенос в другой трансфер — как в полной версии: база пересчитывает цену под тип машины. */
  const changeTransfer = async (child: FamilyListRow, transfer: string) => {
    setSavingId(child.rowId);
    setError('');
    try {
      await updateV2ChildRoute({
        child: {
          id: child.rowId,
          familyId: child.familyId,
          childName: child.childName,
          class: child.childClass,
          selfExitAllowed: false,
          schoolCode: child.schoolCode as never,
          schoolId: child.schoolId ?? undefined,
          branchId: child.branchId ?? undefined,
          zone: child.zone as never,
          vehicleType: child.vehicleType as VehicleType,
        },
        vehicleType: child.vehicleType as VehicleType,
        transferNumber: transfer ? Number(transfer) : undefined,
        stopNumber: child.stopNumber ? Number(child.stopNumber) : undefined,
        timeMorning: child.timeMorning ?? undefined,
        source: 'transfer_move',
        actorName: userName,
      });
      patchRow(child.rowId, { transferNumber: transfer || null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сменить трансфер');
    } finally {
      setSavingId(null);
    }
  };

  const changeStop = async (child: FamilyListRow, stop: string) => {
    setSavingId(child.rowId);
    setError('');
    try {
      await updateV2Child(child.rowId, { stop_order: stop ? Number(stop) : null });
      patchRow(child.rowId, { stopNumber: stop || null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сменить остановку');
    } finally {
      setSavingId(null);
    }
  };

  // Ориентируемся на детей: в заголовке их имена.
  const title = children.map(child => (/[\p{L}]/u.test(child.childName) ? formatName(child.childName) : '')).filter(Boolean).join(', ')
    || (family ? formatName(family.parentName) : '') || 'Семья';
  const mapUrl = family?.latitude && family?.longitude
    ? `https://yandex.ru/maps/?rtext=~${family.latitude},${family.longitude}&rtt=auto`
    : family?.streetAddress
      ? `https://yandex.ru/maps/?text=${encodeURIComponent(`Бишкек, ${family.streetAddress}`)}`
      : '';

  return (
    <Sheet title={title} onClose={onClose} full>
      {isLoading && !family ? <Skeletons count={3} /> : !family ? (
        <div className="m-empty">Семья не найдена</div>
      ) : (
        <>
          <TaskButton target={{type:'family',id:familyId,label:family.parentName}} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="m-info">
            <InfoRow label="Родитель" value={family.parentName} />
            <PhoneRow label="Телефон" phone={family.phone} />
            <PhoneRow label="Второй телефон" phone={family.secondPhone} />
            {family.contactName && <InfoRow label="Контактное лицо" value={family.contactName} />}
            <PhoneRow label="Телефон контакта" phone={family.contactPhone} />
          </div>

          <div className="m-info">
            <InfoRow
              label="Адрес"
              value={family.streetAddress}
              action={mapUrl ? (
                <a className="m-icon-btn" href={mapUrl} target="_blank" rel="noreferrer" aria-label="Открыть маршрут">
                  <MapPin size={18} />
                </a>
              ) : undefined}
            />
            <InfoRow label="Зона и расстояние" value={[family.zone, family.distanceKm ? `${family.distanceKm} км` : ''].filter(Boolean).join(' · ')} />
          </div>

          {showFinance && (
            <div className="m-kpis">
              <div className="m-kpi">
                <div className="m-kpi-value" style={{ color: family.debtAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>{money(family.debtAmount)}</div>
                <div className="m-kpi-label">Долг</div>
              </div>
              <div className="m-kpi">
                <div className="m-kpi-value">{money(family.balance)}</div>
                <div className="m-kpi-label">Баланс</div>
              </div>
              <div className="m-kpi">
                <div className="m-kpi-value">{money(family.totalCharged)}</div>
                <div className="m-kpi-label">Начислено</div>
              </div>
              <div className="m-kpi">
                <div className="m-kpi-value">{money(family.totalPaid)}</div>
                <div className="m-kpi-label">Оплачено</div>
              </div>
            </div>
          )}

          <div className="m-section-title">Дети · {children.length}</div>
          {children.map(child => (
            <div key={child.rowId} className="m-card">
              <div className="m-card-row">
                <div className="m-card-main">
                  <div className="m-card-title">{formatName(child.childName) || 'Без имени'}</div>
                  <TaskButton compact target={{type:'child',id:child.rowId,label:child.childName,familyId}} />
                  <div className="m-card-sub">
                    {[schoolLabel(child.branchFilter), child.childClass ? `${child.childClass} класс` : '', child.vehicleLabel].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <StatusBadge status={child.status} />
              </div>
              <div className="m-card-meta">
                <TransferBadge number={child.transferNumber} vehicleType={child.vehicleType} />
                {child.stopNumber && <span className="m-badge">Остановка {child.stopNumber}</span>}
                {child.timeMorning && <span className="m-badge">Утро {child.timeMorning.slice(0, 5)}</span>}
                {showFinance && child.monthlyPrice > 0 && <span className="m-badge">{money(child.monthlyPrice)}/мес</span>}
              </div>
              {canEditStatus && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <div className="m-selects">
                    <SelectField
                      label="Трансфер"
                      value={child.transferNumber ?? ''}
                      disabled={savingId === child.rowId}
                      onChange={transfer => changeTransfer(child, transfer)}
                      options={numberOptions(TRANSFER_NUMBERS, child.transferNumber, 'Без трансфера', '№')}
                    />
                    <SelectField
                      label="Остановка"
                      value={child.stopNumber ?? ''}
                      disabled={savingId === child.rowId}
                      onChange={stop => changeStop(child, stop)}
                      options={numberOptions(STOP_NUMBERS, child.stopNumber, 'Не указана', '')}
                    />
                  </div>
                  <SelectField
                    label={savingId === child.rowId ? 'Сохраняю…' : 'Статус'}
                    value={child.status}
                    disabled={savingId === child.rowId}
                    onChange={status => changeStatus(child.rowId, formatName(child.childName), status)}
                    options={CHILD_STATUS_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
                  />
                </div>
              )}
            </div>
          ))}
          <div className="m-note">Адрес, время, оплаты и скидки меняются в полной версии на компьютере.</div>
        </>
      )}
    </Sheet>
  );
}
