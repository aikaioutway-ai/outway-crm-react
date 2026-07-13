import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, QrCode, ReceiptText } from 'lucide-react';
import { fetchPaymentsTable, getCachedPaymentsTable, PaymentTableRow } from '../../services/crmV2Service';
import { money } from '../../utils/pricing';
import { CASHIER_PERIODS, SCHOOL_TABS } from './constants';
import { KpiChip, SchoolAvatar } from './ManagerOverview';

interface CashierSchoolKpiStripProps {
  schoolKey: string;
  periodKey: string;
  rightReserveWidth?: number;
}

const COLORS = {
  school: '#378ADD',
  payments: '#626C8B',
  pendingCount: '#B45309',
  pendingAmount: '#BA7517',
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

export default function CashierSchoolKpiStrip({ schoolKey, periodKey, rightReserveWidth = 78 }: CashierSchoolKpiStripProps) {
  const [rows, setRows] = useState<PaymentTableRow[] | null>(() => getCachedPaymentsTable());

  useEffect(() => {
    let cancelled = false;
    fetchPaymentsTable()
      .then(next => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setRows(prev => prev ?? []); });
    return () => { cancelled = true; };
  }, []);

  const school = SCHOOL_TABS.find(item => item.key === schoolKey);
  const stats = useMemo(() => {
    const schoolRows = (rows ?? []).filter(row => rowMatchesSchool(row, schoolKey) && matchesPeriod(row, periodKey));
    const pendingRows = schoolRows.filter(isPending);
    const confirmedRows = schoolRows.filter(isConfirmed);
    const paymentRows = schoolRows.filter(row => isPending(row) || isConfirmed(row));
    const activeRows = schoolRows.filter(row => !String(row.status ?? '').toLowerCase().includes('отклон') && String(row.status ?? '').toLowerCase() !== 'rejected');
    return {
      paymentsAmount: paymentRows.reduce((sum, row) => sum + row.amount, 0),
      pendingCount: pendingRows.length,
      pendingAmount: pendingRows.reduce((sum, row) => sum + row.amount, 0),
      confirmedAmount: confirmedRows.reduce((sum, row) => sum + row.amount, 0),
      qrAmount: activeRows.filter(isQr).reduce((sum, row) => sum + row.amount, 0),
      cashAmount: activeRows.filter(isCash).reduce((sum, row) => sum + row.amount, 0),
    };
  }, [periodKey, rows, schoolKey]);

  if (!school || rows === null) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 12, flexShrink: 0, padding: '10px 0 0', paddingRight: rightReserveWidth, transition: 'padding-right .18s ease' }}>
      <KpiChip
        icon={<SchoolAvatar logo={school.logo} label={school.label} color={COLORS.school} size={38} radius={11} fontSize={12} />}
        label="Школа"
        value={school.label}
        color={COLORS.school}
      />
      <KpiChip icon={<ReceiptText size={18} color="#fff" />} label="Платежи" value={money(stats.paymentsAmount)} color={COLORS.payments} />
      <KpiChip icon={<Clock3 size={18} color="#fff" />} label="К-во на проверке" value={String(stats.pendingCount)} color={COLORS.pendingCount} />
      <KpiChip icon={<ReceiptText size={18} color="#fff" />} label="Сумма на проверке" value={money(stats.pendingAmount)} color={COLORS.pendingAmount} />
      <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Подтверждено" value={money(stats.confirmedAmount)} color={COLORS.confirmed} />
      <KpiChip icon={<QrCode size={18} color="#fff" />} label="QR" value={money(stats.qrAmount)} color={COLORS.qr} />
      <KpiChip icon={<Banknote size={18} color="#fff" />} label="Наличные" value={money(stats.cashAmount)} color={COLORS.cash} />
    </div>
  );
}
