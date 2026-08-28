import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PayrollSubjectType, setV2PayrollApprovalStatus, upsertV2PayrollEntries, upsertV2PayrollEntry, V2DriverTableRow, V2PayrollEntry } from '../../services/crmV2Service';
import { useDriverAdvancesForPeriod, useDriversTable, useEmployees, usePayrollApproval, usePayrollEntriesForPeriod, usePayrollPaymentsForPeriod } from '../../hooks/useCrmQueries';
import { queryClient, QK } from '../../services/queryClient';
import { UserRole } from '../../types';
import { SCHOOL_TABS } from '../families/constants';
import { PAYROLL_OFFICE_KEY, PayrollSchoolTab, TimesheetPayrollSummary } from './timesheetTypes';
import { canEditTimesheet, isPayrollApprover } from './payrollApproval';
import SalaryPaymentModal from './SalaryPaymentModal';
import { SalaryPaymentSubject, SalaryRecipientOption, salaryRemainingAmount } from './salaryPayment';

interface DriverRow {
  driverId: string;
  fullName: string;
  phone: string;
  transfers: string;   // "1, 3, 7"
  days: number;
  rate: number;
  bonusAmount: number;
  penaltyAmount: number;
  accrued: number;    // days * rate
  advanceAmount: number;
  salaryAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

interface Props {
  schoolKey: string;
  globalDays: number;
  globalRate: number;
  vehicleType?: 'microbus' | 'minivan' | 'sedan';
  transferFilter?: string;
  periodMonth: number;
  periodYear: number;
  onSummaryChange?: (summary: TimesheetPayrollSummary) => void;
  payrollView?: PayrollSchoolTab;
  search?: string;
  userRole?: UserRole;
  userName?: string;
  sessionToken?: string;
}

const COL_STYLE: React.CSSProperties = {
  padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap',
};
const HEAD_STYLE: React.CSSProperties = {
  ...COL_STYLE,
  fontSize: 11, fontWeight: 700, color: '#7A859D',
  textTransform: 'uppercase', letterSpacing: 0.4,
  background: '#F8FAFC', borderBottom: '1px solid #EEF2F6',
  userSelect: 'none',
};
const CELL_STYLE: React.CSSProperties = {
  ...COL_STYLE, color: '#17222F', borderBottom: '1px solid #F1F5F9',
};

type RowOverride = Partial<{ days: number; rate: number; accruedAmount: number; bonusAmount: number; penaltyAmount: number; salaryAmount: number }>;

function formatAmount(value: number): string {
  return value === 0 ? '—' : value.toLocaleString('ru-RU');
}

function driverMatchesTransfer(driver: V2DriverTableRow, transferNumber: string): boolean {
  return driver.transferNumbers
    .split(',')
    .map(item => item.replace(/[^\d]/g, ''))
    .filter(Boolean)
    .includes(transferNumber);
}

export default function TimesheetTable({ schoolKey, globalDays, globalRate, vehicleType, transferFilter = '', periodMonth, periodYear, onSummaryChange, payrollView = 'timesheet', search = '', userRole, userName, sessionToken }: Props) {
  const isOffice = schoolKey === PAYROLL_OFFICE_KEY;
  const isTimesheetView = payrollView === 'timesheet';
  const isAdvanceView = payrollView === 'advance';
  const isSalaryView = payrollView === 'salary';

  const { data: allDrivers = [], isLoading: driversLoading } = useDriversTable();
  const { data: allEmployees = [], isLoading: employeesLoading } = useEmployees();
  const { data: entries = [] } = usePayrollEntriesForPeriod(periodMonth, periodYear);
  const { data: rawAdvances = [] } = useDriverAdvancesForPeriod(periodMonth, periodYear);
  const { data: payrollPayments = [] } = usePayrollPaymentsForPeriod(periodMonth, periodYear);
  const { data: approval = null } = usePayrollApproval(schoolKey, periodMonth, periodYear, sessionToken);
  const loading = driversLoading || employeesLoading;
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [selectedSalaryIds, setSelectedSalaryIds] = useState<Set<string>>(new Set());
  const [paymentSubjects, setPaymentSubjects] = useState<SalaryPaymentSubject[] | null>(null);
  const approvalStatus = approval?.status ?? 'draft';
  const timesheetEditable = approvalStatus === 'draft' || approvalStatus === 'rejected';
  const salaryEditable = approvalStatus === 'approved';
  const approver = isPayrollApprover(userRole, userName);
  const timesheetCanEdit = canEditTimesheet(approvalStatus, userRole, userName);

  const entryBySubject = useMemo(() => {
    const map: Record<string, V2PayrollEntry> = {};
    entries.forEach(entry => { map[entry.subjectId] = entry; });
    return map;
  }, [entries]);

  const advanceByDriver = useMemo(() => {
    if (isOffice) return {} as Record<string, number>;
    const next: Record<string, number> = {};
    rawAdvances.forEach(advance => {
      next[advance.driverId] = (next[advance.driverId] ?? 0) + advance.amount;
    });
    return next;
  }, [isOffice, rawAdvances]);

  const handleEntryChange = useCallback((subjectId: string, subjectType: PayrollSubjectType, patch: RowOverride) => {
    const list = queryClient.getQueryData<V2PayrollEntry[]>(QK.payrollEntries(periodMonth, periodYear)) ?? [];
    const existing = list.find(entry => entry.subjectId === subjectId && entry.subjectType === subjectType);
    const baseDays = existing?.days ?? globalDays;
    const baseRate = existing?.rate ?? globalRate;
    const baseBonus = existing?.bonusAmount ?? 0;
    const basePenalty = existing?.penaltyAmount ?? 0;
    const next: V2PayrollEntry = {
      id: existing?.id ?? subjectId,
      subjectId,
      subjectType,
      periodMonth,
      periodYear,
      days: baseDays,
      rate: baseRate,
      bonusAmount: baseBonus,
      penaltyAmount: basePenalty,
      accruedAmount: existing?.accruedAmount ?? Math.max(0, baseDays * baseRate + baseBonus - basePenalty),
      salaryAmount: existing?.salaryAmount ?? 0,
      approvalStatus: existing?.approvalStatus ?? 'draft',
      approvedByName: existing?.approvedByName ?? '',
      approvedAt: existing?.approvedAt ?? '',
      rejectionComment: existing?.rejectionComment ?? '',
      updatedAt: existing?.updatedAt ?? '',
      ...patch,
    };
    queryClient.setQueryData<V2PayrollEntry[]>(
      QK.payrollEntries(periodMonth, periodYear),
      existing
        ? list.map(entry => entry.subjectId === subjectId && entry.subjectType === subjectType ? next : entry)
        : [...list, next],
    );
    upsertV2PayrollEntry({
      subjectId,
      subjectType,
      periodMonth,
      periodYear,
      days: next.days,
      rate: next.rate,
      bonusAmount: next.bonusAmount,
      penaltyAmount: next.penaltyAmount,
      accruedAmount: next.accruedAmount ?? Math.max(0, next.days * next.rate + next.bonusAmount - next.penaltyAmount),
      salaryAmount: next.salaryAmount,
    }).catch(() => {});
  }, [globalDays, globalRate, periodMonth, periodYear]);

  // Фильтрация водителей по школе
  const schoolTab = SCHOOL_TABS.find(t => t.key === schoolKey);
  const filteredDrivers = useMemo(() => {
    if (isOffice) return [];
    let result = allDrivers;
    if (schoolTab && schoolTab.key !== 'ALL') {
      result = result.filter(d =>
        d.branchCodes.some(c => schoolTab.codes.includes(c)) ||
        (schoolTab.branches.length > 0 && d.branchNames.some(n => schoolTab.branches.includes(n)))
      );
    }
    if (vehicleType) {
      result = result.filter(d => d.vehicleType === vehicleType);
    }
    if (transferFilter === 'empty') {
      result = result.filter(d => d.transferCount === 0);
    } else if (transferFilter) {
      result = result.filter(d => driverMatchesTransfer(d, transferFilter));
    }
    return result;
  }, [allDrivers, isOffice, schoolTab, transferFilter, vehicleType]);

  const filteredEmployees = useMemo(() => (
    isOffice
      ? allEmployees.filter(employee => employee.status === 'active' && employee.role !== 'driver')
      : []
  ), [allEmployees, isOffice]);

  const rows: DriverRow[] = useMemo(() => {
    if (isOffice) {
      return filteredEmployees.map(employee => {
        const entry = entryBySubject[employee.id];
        const days = entry?.days ?? globalDays;
        const rate = entry?.rate ?? globalRate;
        const salaryAmount = entry?.salaryAmount ?? 0;
        const bonusAmount = entry?.bonusAmount ?? 0;
        const penaltyAmount = entry?.penaltyAmount ?? 0;
        const accrued = entry?.accruedAmount ?? Math.max(0, days * rate + bonusAmount - penaltyAmount);
        return {
          driverId: employee.id,
          fullName: employee.fullName,
          phone: employee.phone1 || '',
          transfers: employee.position || 'Офис',
          days,
          rate,
          bonusAmount,
          penaltyAmount,
          accrued,
          advanceAmount: 0,
          salaryAmount,
          paidAmount: salaryAmount,
          remainingAmount: salaryRemainingAmount(accrued, 0, salaryAmount),
        };
      });
    }
    return filteredDrivers.map(d => {
      const entry  = entryBySubject[d.driverId];
      const days   = entry?.days ?? globalDays;
      const rate   = entry?.rate ?? globalRate;
      const advanceAmount = advanceByDriver[d.driverId] ?? 0;
      const salaryAmount = entry?.salaryAmount ?? 0;
      const bonusAmount = entry?.bonusAmount ?? 0;
      const penaltyAmount = entry?.penaltyAmount ?? 0;
      const accrued = entry?.accruedAmount ?? Math.max(0, days * rate + bonusAmount - penaltyAmount);
      const paidAmount = advanceAmount + salaryAmount;
      return {
        driverId: d.driverId,
        fullName: d.fullName,
        phone: d.phone || '',
        transfers: d.transferNumbers || '—',
        days,
        rate,
        bonusAmount,
        penaltyAmount,
        accrued,
        advanceAmount,
        salaryAmount,
        paidAmount,
        remainingAmount: salaryRemainingAmount(accrued, advanceAmount, salaryAmount),
      };
    });
  }, [advanceByDriver, filteredDrivers, filteredEmployees, isOffice, entryBySubject, globalDays, globalRate]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/\s+/g, '');
    if (!query) return rows;
    return rows.filter(row => [row.fullName, row.phone, row.transfers]
      .some(value => String(value ?? '').toLowerCase().replace(/\s+/g, '').includes(query)));
  }, [rows, search]);

  useEffect(() => {
    setSelectedSalaryIds(new Set());
    setPaymentSubjects(null);
  }, [isSalaryView, periodMonth, periodYear, schoolKey]);

  const recipients = useMemo<SalaryRecipientOption[]>(() => {
    const byId = new Map<string, SalaryRecipientOption>();
    allDrivers
      .filter(driver => driver.status !== 'inactive')
      .forEach(driver => byId.set(driver.driverId, { id: driver.driverId, name: driver.fullName }));
    allEmployees
      .filter(employee => employee.status === 'active')
      .forEach(employee => byId.set(employee.id, { id: employee.id, name: employee.fullName }));
    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  }, [allDrivers, allEmployees]);

  const selectedSalaryRows = useMemo(
    () => rows.filter(row => selectedSalaryIds.has(row.driverId) && row.remainingAmount > 0),
    [rows, selectedSalaryIds],
  );

  const toPaymentSubject = useCallback((row: DriverRow): SalaryPaymentSubject => ({
    subjectId: row.driverId,
    subjectType: isOffice ? 'employee' : 'driver',
    name: row.fullName,
    remainingAmount: row.remainingAmount,
  }), [isOffice]);

  const payableVisibleRows = useMemo(() => visibleRows.filter(row => row.remainingAmount > 0), [visibleRows]);
  const allVisibleSalarySelected = payableVisibleRows.length > 0
    && payableVisibleRows.every(row => selectedSalaryIds.has(row.driverId));

  const toggleAllVisibleSalary = useCallback(() => {
    setSelectedSalaryIds(current => {
      const next = new Set(current);
      if (payableVisibleRows.every(row => next.has(row.driverId))) {
        payableVisibleRows.forEach(row => next.delete(row.driverId));
      } else {
        payableVisibleRows.forEach(row => next.add(row.driverId));
      }
      return next;
    });
  }, [payableVisibleRows]);

  const toggleSalaryRow = useCallback((driverId: string) => {
    setSelectedSalaryIds(current => {
      const next = new Set(current);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  }, []);

  const setOv = useCallback((driverId: string, patch: RowOverride) => {
    if ((isSalaryView && !salaryEditable) || (!isSalaryView && !timesheetCanEdit)) return;
    handleEntryChange(driverId, isOffice ? 'employee' : 'driver', patch);
  }, [handleEntryChange, isOffice, isSalaryView, salaryEditable, timesheetCanEdit]);

  const setCalculatedOv = useCallback((row: DriverRow, patch: Pick<RowOverride, 'days' | 'rate' | 'bonusAmount' | 'penaltyAmount'>) => {
    const days = patch.days ?? row.days;
    const rate = patch.rate ?? row.rate;
    const bonusAmount = patch.bonusAmount ?? row.bonusAmount;
    const penaltyAmount = patch.penaltyAmount ?? row.penaltyAmount;
    setOv(row.driverId, {
      ...patch,
      accruedAmount: Math.max(0, days * rate + bonusAmount - penaltyAmount),
    });
  }, [setOv]);

  const applyToAll = useCallback(async () => {
    if (!timesheetCanEdit || bulkBusy || rows.length === 0) return;
    setBulkBusy(true);
    setApprovalError('');
    try {
      await upsertV2PayrollEntries(rows.map(row => ({
        subjectId: row.driverId,
        subjectType: isOffice ? 'employee' : 'driver',
        periodMonth,
        periodYear,
        days: globalDays,
        rate: globalRate,
        accruedAmount: Math.max(0, globalDays * globalRate + row.bonusAmount - row.penaltyAmount),
        bonusAmount: row.bonusAmount,
        penaltyAmount: row.penaltyAmount,
        salaryAmount: row.salaryAmount,
      })));
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'Не удалось применить начисление ко всем');
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, globalDays, globalRate, isOffice, periodMonth, periodYear, rows, timesheetCanEdit]);

  const totalAccrued = rows.reduce((s, r) => s + r.accrued, 0);
  const totalBonus = rows.reduce((s, r) => s + r.bonusAmount, 0);
  const totalPenalty = rows.reduce((s, r) => s + r.penaltyAmount, 0);
  const totalAdvance = rows.reduce((s, r) => s + r.advanceAmount, 0);
  const totalSalary = rows.reduce((s, r) => s + r.salaryAmount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remainingAmount, 0);
  const totalAdvanceRemaining = totalAccrued - totalAdvance;
  const totalPending = approvalStatus === 'pending' ? totalAccrued : 0;
  const totalApproved = approvalStatus === 'approved' ? totalAccrued : 0;
  const allSubjects = useMemo(() => rows.map(row => ({
    subjectId: row.driverId,
    subjectType: (isOffice ? 'employee' : 'driver') as PayrollSubjectType,
  })), [isOffice, rows]);

  const visibleColumnCount = isTimesheetView ? 8 : isAdvanceView ? 6 : 8;
  const footerLeadSpan = isTimesheetView ? 5 : 3;

  useEffect(() => {
    onSummaryChange?.({
      accruedAmount: totalAccrued,
      pendingAmount: totalPending,
      approvedAmount: totalApproved,
      advanceAmount: totalAdvance,
      salaryAmount: totalSalary,
      paidAmount: totalPaid,
      remainingAmount: totalRemaining,
    });
  }, [approvalStatus, onSummaryChange, totalAccrued, totalAdvance, totalApproved, totalPending, totalSalary, totalPaid, totalRemaining]);

  const changeApprovalStatus = async (status: 'pending' | 'approved' | 'rejected') => {
    let rejectionComment = '';
    if (status === 'pending' && !window.confirm('Отправить табель на согласование? После отправки кассир не сможет его редактировать.')) return;
    if (status === 'rejected') rejectionComment = window.prompt('Причина возврата на доработку:', '')?.trim() ?? '';
    setApprovalBusy(true);
    setApprovalError('');
    try {
      if (status === 'pending' || status === 'approved') {
        await Promise.all(rows.map(row => upsertV2PayrollEntry({
          subjectId: row.driverId,
          subjectType: isOffice ? 'employee' : 'driver',
          periodMonth,
          periodYear,
          days: row.days,
          rate: row.rate,
          bonusAmount: row.bonusAmount,
          penaltyAmount: row.penaltyAmount,
          accruedAmount: row.accrued,
        })));
      }
      const updated = await setV2PayrollApprovalStatus({
        schoolKey,
        periodMonth,
        periodYear,
        status,
        rejectionComment,
        subjects: allSubjects,
      }, sessionToken);
      queryClient.setQueryData(QK.payrollApproval(schoolKey, periodMonth, periodYear), updated);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'Не удалось изменить статус табеля');
    } finally {
      setApprovalBusy(false);
    }
  };

  const approvalLabel = approvalStatus === 'approved'
    ? `Утверждено${approval?.approvedByName ? `: ${approval.approvedByName}` : ''}`
    : approvalStatus === 'pending'
      ? 'На согласовании'
      : approvalStatus === 'rejected'
        ? `Возвращено на доработку${approval?.rejectionComment ? `: ${approval.rejectionComment}` : ''}`
        : 'Черновик';

  return (
    <div style={{ alignSelf: 'flex-start', width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ minHeight: 42, padding: '7px 12px', borderRadius: 12, background: approvalStatus === 'approved' ? '#ECFDF3' : approvalStatus === 'pending' ? '#FFF8E7' : approvalStatus === 'rejected' ? '#FFF1F1' : '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 850, color: approvalStatus === 'approved' ? '#15803D' : approvalStatus === 'rejected' ? '#B42318' : '#475569' }}>{approvalLabel}</div>
          {approvalError && <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: '#B42318' }}>{approvalError}</div>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {isTimesheetView && timesheetEditable && (
            <button disabled={approvalBusy || rows.length === 0} onClick={() => changeApprovalStatus('pending')} style={{ height: 30, padding: '0 12px', border: 0, borderRadius: 9, background: '#31A4A5', color: '#fff', fontSize: 11, fontWeight: 850, cursor: approvalBusy ? 'default' : 'pointer', opacity: approvalBusy || rows.length === 0 ? .55 : 1 }}>
              Отправить на согласование
            </button>
          )}
          {isTimesheetView && approvalStatus === 'pending' && approver && (
            <button disabled={approvalBusy || rows.length === 0} onClick={() => changeApprovalStatus('approved')} style={{ height: 30, padding: '0 14px', border: 0, borderRadius: 9, background: '#15803D', color: '#fff', fontSize: 11, fontWeight: 850, cursor: approvalBusy ? 'default' : 'pointer', opacity: approvalBusy || rows.length === 0 ? .55 : 1 }}>
              Утвердить
            </button>
          )}
        </div>
      </div>

      {isSalaryView && approvalStatus !== 'approved' ? (
        <div style={{ padding: '48px 20px', borderRadius: 12, background: '#fff', border: '1px solid #EEF2F6', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 850, color: '#17222F' }}>Зарплата ещё не утверждена</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#7A859D' }}>Цифры появятся после подписи Мамазировой Айгерим или Есенали Кайрата.</div>
        </div>
      ) : (
      <div style={{ width: '100%', overflow: 'auto', borderRadius: 12, background: '#fff', border: '1px solid #EEF2F6', position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', zIndex: 1, fontSize: 13, color: '#9AABB0' }}>
          Загрузка...
        </div>
      )}
      {isTimesheetView && timesheetCanEdit && visibleRows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <button
            onClick={applyToAll}
            disabled={bulkBusy}
            title="Проставить текущие дни и ставку всем в списке"
            style={{
              padding: '5px 10px', border: '1px solid #A7F3D0', borderRadius: 8,
              background: '#F0FDFA', color: '#0C7A74', fontSize: 12, fontWeight: 700,
              cursor: bulkBusy ? 'default' : 'pointer', opacity: bulkBusy ? .6 : 1,
            }}
          >
            {bulkBusy ? 'Применение…' : 'Применить ко всем'}
          </button>
        </div>
      )}
      {isSalaryView && salaryEditable && visibleRows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>
            {selectedSalaryRows.length > 0 ? `Выбрано: ${selectedSalaryRows.length}` : 'Выберите сотрудников для массовой выдачи'}
          </span>
          <button
            onClick={() => setPaymentSubjects(selectedSalaryRows.map(toPaymentSubject))}
            disabled={selectedSalaryRows.length === 0}
            style={{ padding: '6px 12px', border: 0, borderRadius: 8, background: '#158A87', color: '#fff', fontSize: 12, fontWeight: 800, cursor: selectedSalaryRows.length ? 'pointer' : 'default', opacity: selectedSalaryRows.length ? 1 : .5 }}
          >
            Выдать выбранным
          </button>
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr>
            <th style={{ ...HEAD_STYLE, textAlign: 'left' }}>
              {isSalaryView ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <input type="checkbox" aria-label="Выбрать всех с остатком" checked={allVisibleSalarySelected} onChange={toggleAllVisibleSalary} disabled={payableVisibleRows.length === 0} />
                  #
                </span>
              ) : '#'}
            </th>
            <th style={{ ...HEAD_STYLE, textAlign: 'left' }}>Имя</th>
            <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>{isOffice ? 'Должность' : 'Трансфер'}</th>
            {isTimesheetView && <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>К-во дней</th>}
            {isTimesheetView && <th style={{ ...HEAD_STYLE, textAlign: 'center' }}>Ставка</th>}
            {isTimesheetView && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Премия</th>}
            {isTimesheetView && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Штраф</th>}
            <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Начислено</th>
            {(isAdvanceView || isSalaryView) && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Авансы</th>}
            {isSalaryView && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Зарплата</th>}
            {isSalaryView && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Оплачено</th>}
            {!isTimesheetView && <th style={{ ...HEAD_STYLE, textAlign: 'right' }}>Остаток</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={visibleColumnCount} style={{ ...CELL_STYLE, textAlign: 'center', color: '#9AABB0', padding: '32px 0' }}>
                {loading ? '' : search ? 'Ничего не найдено' : !schoolKey ? 'Выберите школу' : isOffice ? 'Нет сотрудников' : 'Нет водителей'}
              </td>
            </tr>
          )}
          {visibleRows.map((row, idx) => (
            <tr key={row.driverId} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFBFC' }}>
              <td style={{ ...CELL_STYLE, color: '#9AABB0', width: 54 }}>
                {isSalaryView && (
                  <input
                    type="checkbox"
                    aria-label={`Выбрать ${row.fullName}`}
                    checked={selectedSalaryIds.has(row.driverId)}
                    onChange={() => toggleSalaryRow(row.driverId)}
                    disabled={row.remainingAmount <= 0}
                    style={{ marginRight: 7 }}
                  />
                )}
                {idx + 1}
              </td>
              <td style={{ ...CELL_STYLE, fontWeight: 600 }}>{row.fullName}</td>
              <td style={{ ...CELL_STYLE, textAlign: 'center', color: '#5A9FE8' }}>{row.transfers}</td>
              {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                <SelectInput
                  value={row.days}
                  options={[0, ...Array.from({ length: 15 }, (_, i) => i + 1)]}
                  onChange={v => setCalculatedOv(row, { days: v })}
                  disabled={!timesheetCanEdit}
                />
              </td>}
              {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                <SelectInput
                  value={row.rate}
                  options={Array.from({ length: 11 }, (_, i) => 3500 + i * 100)}
                  onChange={v => setCalculatedOv(row, { rate: v })}
                  disabled={!timesheetCanEdit}
                />
              </td>}
              {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
                <NumInput value={row.bonusAmount} min={0} onChange={v => setCalculatedOv(row, { bonusAmount: v })} color="#15803D" clearOnEdit disabled={!timesheetCanEdit} />
              </td>}
              {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
                <NumInput value={row.penaltyAmount} min={0} onChange={v => setCalculatedOv(row, { penaltyAmount: v })} color="#B42318" clearOnEdit disabled={!timesheetCanEdit} />
              </td>}
              <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 600, color: '#0C7A74' }}>
                {isTimesheetView ? (
                  <NumInput value={row.accrued} min={0} onChange={v => setOv(row.driverId, { accruedAmount: v })} color="#0C7A74" clearOnEdit disabled={!timesheetCanEdit} />
                ) : row.accrued.toLocaleString('ru-RU')}
              </td>
              {(isAdvanceView || isSalaryView) && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: row.advanceAmount > 0 ? '#B45309' : '#9AABB0' }}>
                {formatAmount(row.advanceAmount)}
              </td>}
              {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
                <button
                  onClick={() => setPaymentSubjects([toPaymentSubject(row)])}
                  title="Открыть выдачу и историю зарплаты"
                  style={{ minWidth: 70, padding: '4px 8px', border: '1px solid #CDE8E7', borderRadius: 7, background: '#F0FDFA', color: '#0C7A74', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  {row.salaryAmount > 0 ? `${row.salaryAmount.toLocaleString('ru-RU')} сом` : 'Выдать'}
                </button>
              </td>}
              {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 800, color: row.paidAmount > 0 ? '#15803D' : '#9AABB0' }}>
                {formatAmount(row.paidAmount)}
              </td>}
              {!isTimesheetView && <td style={{
                ...CELL_STYLE,
                textAlign: 'right',
                fontWeight: 800,
                color: (isAdvanceView ? row.accrued - row.advanceAmount : row.remainingAmount) > 0 ? '#EF4444' : '#15803D',
              }}>
                {(isAdvanceView ? row.accrued - row.advanceAmount : row.remainingAmount).toLocaleString('ru-RU')}
              </td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#F0FDFA', borderTop: '2px solid #A7F3D0' }}>
            <td colSpan={footerLeadSpan} style={{ ...CELL_STYLE, fontWeight: 700, color: '#0C7A74' }}>Итого</td>
            {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#15803D' }}>{formatAmount(totalBonus)}</td>}
            {isTimesheetView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#B42318' }}>{formatAmount(totalPenalty)}</td>}
            <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#0C7A74' }}>{totalAccrued.toLocaleString('ru-RU')}</td>
            {(isAdvanceView || isSalaryView) && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#B45309' }}>{formatAmount(totalAdvance)}</td>}
            {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 700, color: '#1D6FA4' }}>{formatAmount(totalSalary)}</td>}
            {isSalaryView && <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 800, color: '#15803D' }}>{formatAmount(totalPaid)}</td>}
            {!isTimesheetView && <td style={{
              ...CELL_STYLE,
              textAlign: 'right',
              fontWeight: 800,
              color: (isAdvanceView ? totalAdvanceRemaining : totalRemaining) > 0 ? '#EF4444' : '#15803D',
            }}>{(isAdvanceView ? totalAdvanceRemaining : totalRemaining).toLocaleString('ru-RU')}</td>}
          </tr>
        </tfoot>
      </table>
      </div>
      )}
      {paymentSubjects && (
        <SalaryPaymentModal
          subjects={paymentSubjects}
          payments={payrollPayments}
          recipients={recipients}
          periodMonth={periodMonth}
          periodYear={periodYear}
          paidByName={userName}
          onClose={() => setPaymentSubjects(null)}
          onSaved={() => setSelectedSalaryIds(new Set())}
        />
      )}
    </div>
  );
}

// Селект для дней (1–15) и ставки (3500–4500)
function SelectInput({ value, options, onChange, disabled = false }: {
  value: number; options: number[]; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        padding: '2px 4px', border: '1px solid #D5E2E8', borderRadius: 6,
        fontSize: 12, fontWeight: 600, color: '#17222F', background: '#F1F5F9',
        cursor: disabled ? 'default' : 'pointer', outline: 'none', textAlign: 'center', opacity: disabled ? .72 : 1,
      }}
    >
      {options.map(o => <option key={o} value={o}>{o.toLocaleString('ru-RU')}</option>)}
    </select>
  );
}

// Инпут для штрафа/премии — при редактировании поле пустое
function NumInput({ value, min = 0, onChange, color, clearOnEdit = false, disabled = false }: {
  value: number; min?: number;
  onChange: (v: number) => void; color?: string; clearOnEdit?: boolean; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw]         = useState('');

  if (!editing) return (
    <span
      onClick={() => { if (!disabled) { setEditing(true); setRaw(String(value)); } }}
      style={{
        cursor: disabled ? 'default' : 'text', display: 'inline-block', minWidth: 40, padding: '2px 6px',
        borderRadius: 6, background: value === 0 ? '#F1F5F9' : 'transparent',
        fontSize: 12, fontWeight: 600,
        color: value === 0 ? '#9AABB0' : (color ?? '#17222F'), textAlign: 'center',
      }}
    >{value === 0 ? '—' : value.toLocaleString('ru-RU')}</span>
  );

  return (
    <input
      autoFocus
      type="number" value={raw}
      onFocus={event => { if (clearOnEdit) event.currentTarget.select(); }}
      placeholder="0"
      onChange={e => setRaw(e.target.value)}
      onBlur={() => {
        const v = Math.max(min, Number(raw) || 0);
        onChange(isNaN(v) ? 0 : v);
        setEditing(false);
      }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
      style={{
        width: 64, padding: '2px 4px', border: '1px solid #0C7A74', borderRadius: 6,
        fontSize: 12, fontWeight: 600, textAlign: 'center', outline: 'none',
        color: color ?? '#17222F',
      }}
    />
  );
}
