import React, { useMemo } from 'react';
import { Banknote, CheckCircle2, ChevronRight, Clock3, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react';
import { useDriversTable, usePayrollApproval } from '../../hooks/useCrmQueries';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { money } from '../../utils/pricing';
import { computePayrollStats, PAYROLL_COLORS, PayrollMoneySummary } from './payrollStats';
import { PayrollSchoolTab } from '../expenses/timesheetTypes';

interface PayrollSchoolKpiStripProps {
  schoolKey: string;
  periodMonth: number;
  periodYear: number;
  sessionToken?: string;
  view: PayrollSchoolTab;
  rightReserveWidth?: number;
  summaryBySchool?: Record<string, PayrollMoneySummary>;
  leadingContent?: React.ReactNode;
}

export default function PayrollSchoolKpiStrip({ schoolKey, periodMonth, periodYear, sessionToken, view, rightReserveWidth = 0, summaryBySchool = {}, leadingContent }: PayrollSchoolKpiStripProps) {
  const { data: approval } = usePayrollApproval(schoolKey, periodMonth, periodYear, sessionToken);
  const awaitingApproval = view === 'salary' && approval?.status !== 'approved';
  const { data: rows = null } = useDriversTable();

  const stat = useMemo(() => (
    rows ? computePayrollStats(rows, summaryBySchool).find(item => item.key === schoolKey) : undefined
  ), [rows, schoolKey, summaryBySchool]);

  if (rows === null || !stat) {
    return leadingContent ? (
      <div style={{ padding: '10px 0 0', paddingRight: rightReserveWidth, transition: 'padding-right .18s ease' }}>
        {leadingContent}
      </div>
    ) : null;
  }

  const commonCards = (
    <>
      <KpiChip
        icon={<SchoolAvatar logo={stat.logo} label={stat.label} color={stat.color} size={38} radius={11} fontSize={12} />}
        iconBackground="transparent"
        label="Школа"
        value={stat.label}
        color={stat.color}
      />
      <KpiChip icon={null} label={awaitingApproval ? "Ожидает утверждения" : "Начислено"} value={money(stat.accruedAmount)} color={awaitingApproval ? "#8896A5" : PAYROLL_COLORS.accruedAmount} />
    </>
  );

  const cards = view === 'timesheet' ? (
    <>
      {commonCards}
      <KpiChip icon={null} label="На согласовании" value={money(summaryBySchool[schoolKey]?.pendingAmount ?? 0)} color="#B45309" />
      <KpiChip icon={null} label="Утверждено" value={money(summaryBySchool[schoolKey]?.approvedAmount ?? 0)} color="#15803D" />
    </>
  ) : (
    <>
      {commonCards}
      <KpiChip icon={null} label="Авансы" value={money(stat.advanceAmount)} color={PAYROLL_COLORS.advanceAmount} />
      <KpiChip icon={null} label="Зарплата" value={money(stat.salaryAmount)} color={PAYROLL_COLORS.salaryAmount} />
      <KpiChip icon={null} label="Оплачено" value={money(stat.paidAmount)} color={PAYROLL_COLORS.paidAmount} />
      <KpiChip icon={null} label="Остаток" value={money(stat.remainingAmount)} color={awaitingApproval ? "#8896A5" : PAYROLL_COLORS.remainingAmount} />
    </>
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: leadingContent
        ? `minmax(340px, 1.18fr) repeat(${view === 'timesheet' ? 2 : 3}, minmax(0, 1fr))`
        : `repeat(${view === 'timesheet' ? 4 : 6}, minmax(0, 1fr))`,
      gap: 12,
      flexShrink: 0,
      padding: '10px 0 0',
      paddingRight: rightReserveWidth,
      transition: 'padding-right .18s ease',
      alignItems: 'stretch',
    }}>
      {leadingContent && (
        <div style={{ gridRow: 'span 2', minWidth: 0 }}>
          {leadingContent}
        </div>
      )}
      {cards}
    </div>
  );
}
