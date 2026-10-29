import { CashierView } from './CashierViewTabs';
import React, { useMemo } from 'react';
import { PaymentTableRow } from '../../services/crmV2Service';
import { usePaymentsTable } from '../../hooks/useCrmQueries';
import { money } from '../../utils/pricing';
import { CASHIER_PERIODS, SCHOOL_TABS } from './constants';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';

interface CashierSchoolKpiStripProps {
  schoolKey: string;
  view?: CashierView;
  periodKey: string;
  /** Фишка трансфера: '' — все, номер, 'empty' — без трансфера. */
  selectedKey?: string;
  rightReserveWidth?: number;
}

const COLORS = {
  school: '#378ADD',
  payments: 'var(--text-2)',
  pendingCount: '#7C3AED',
  pendingAmount: '#2563EB',
  confirmed: 'var(--success)',
  qr: '#1D6FA4',
  cash: '#15803D',
};

function paymentDate(row: PaymentTableRow): Date | null {
  const raw = row.actualPaymentDate || row.paymentDate || row.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesPeriod(row: PaymentTableRow, periodKey: string): boolean {
  if (periodKey === 'ALL') return true;
  const period = CASHIER_PERIODS.find(item => item.key === periodKey);
  const date = paymentDate(row);
  if (!period || !date) return false;
  return date.getMonth() + 1 === period.month && date.getFullYear() === period.year;
}

function isPending(row: PaymentTableRow): boolean {
  const status = String(row.status ?? '').toLowerCase();
  return status === 'pending' || status.includes('провер');
}

function isConfirmed(row: PaymentTableRow): boolean {
  const status = String(row.status ?? '').toLowerCase();
  return status === 'paid' || status === 'confirmed' || status.includes('оплач') || status.includes('подтверж');
}

function isQr(row: PaymentTableRow): boolean {
  const method = String(row.paymentMethod ?? '').toLowerCase();
  return method === 'transfer' || method === 'card' || method.includes('qr') || method.includes('безнал');
}

function isCash(row: PaymentTableRow): boolean {
  const method = String(row.paymentMethod ?? 'cash').toLowerCase();
  return method === 'cash' || method.includes('нал');
}

function rowMatchesSchool(row: PaymentTableRow, schoolKey: string): boolean {
  const tab = SCHOOL_TABS.find(item => item.key === schoolKey);
  if (!tab) return false;
  const branch = row.branchShort.toLowerCase();
  return branch === tab.key.toLowerCase() || branch === tab.label.toLowerCase();
}

export default function CashierSchoolKpiStrip({ view = 'pending', schoolKey, periodKey, rightReserveWidth = 0, selectedKey = '' }: CashierSchoolKpiStripProps) {
  const { data: rows = null } = usePaymentsTable();

  const school = SCHOOL_TABS.find(item => item.key === schoolKey);
  const stats = useMemo(() => {
    const schoolRows = (rows ?? []).filter(row => rowMatchesSchool(row, schoolKey) && matchesPeriod(row, periodKey)
      && (!selectedKey || (selectedKey === 'empty' ? !row.transferNumber : row.transferNumber === selectedKey)));
    const pendingRows = schoolRows.filter(isPending);
    const confirmedRows = schoolRows.filter(isConfirmed);
    const paymentRows = schoolRows.filter(row => isPending(row) || isConfirmed(row));
    const activeRows = (view === 'pending' ? pendingRows : confirmedRows).filter(row => !String(row.status ?? '').toLowerCase().includes('отклон') && String(row.status ?? '').toLowerCase() !== 'rejected');
    return {
      paymentsAmount: paymentRows.reduce((sum, row) => sum + row.amount, 0),
      pendingCount: pendingRows.length,
      pendingAmount: pendingRows.reduce((sum, row) => sum + row.amount, 0),
      confirmedAmount: confirmedRows.reduce((sum, row) => sum + row.amount, 0),
      qrAmount: activeRows.filter(isQr).reduce((sum, row) => sum + row.amount, 0),
      cashAmount: activeRows.filter(isCash).reduce((sum, row) => sum + row.amount, 0),
    };
  }, [periodKey, rows, schoolKey, selectedKey, view]);

  if (!school || rows === null) return null;

  const metrics = view === 'pending' ? [
    { label: 'К-во на проверке', value: String(stats.pendingCount), color: COLORS.pendingCount },
    { label: 'Сумма на проверке', value: money(stats.pendingAmount), color: COLORS.pendingAmount },
  ] : [
    { label: 'Подтверждено', value: money(stats.confirmedAmount), color: COLORS.confirmed },
  ];
  metrics.push({ label: 'QR', value: money(stats.qrAmount), color: COLORS.qr }, { label: 'Наличные', value: money(stats.cashAmount), color: COLORS.cash });
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length + 1}, minmax(0, 1fr))`, gap: 12, padding: '10px 0 0', paddingRight: rightReserveWidth }}>
    <KpiChip iconBackground="transparent" icon={<SchoolAvatar logo={school.logo} label={school.label} color={COLORS.school} size={38} radius={11} />} label="Школа" value={school.label} color={COLORS.school} />
    {metrics.map(metric => <KpiChip key={metric.label} icon={null} label={metric.label} value={metric.value} color={metric.color} />)}
  </div>;
}
