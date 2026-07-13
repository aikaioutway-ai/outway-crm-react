import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, ChevronRight, ReceiptText, WalletCards } from 'lucide-react';
import { fetchV2DriversTable, getCachedV2DriversTable, V2DriverTableRow } from '../../services/crmV2Service';
import { KpiChip, SchoolAvatar } from '../families/ManagerOverview';
import { money } from '../../utils/pricing';
import { computePayrollStats, PAYROLL_COLORS, PayrollMoneySummary } from './payrollStats';

interface PayrollSchoolKpiStripProps {
  schoolKey: string;
  rightReserveWidth?: number;
  summaryBySchool?: Record<string, PayrollMoneySummary>;
  leadingContent?: React.ReactNode;
}

export default function PayrollSchoolKpiStrip({ schoolKey, rightReserveWidth = 78, summaryBySchool = {}, leadingContent }: PayrollSchoolKpiStripProps) {
  const [rows, setRows] = useState<V2DriverTableRow[] | null>(() => getCachedV2DriversTable());

  useEffect(() => {
    let cancelled = false;
    fetchV2DriversTable()
      .then(next => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setRows(prev => prev ?? []); });
    return () => { cancelled = true; };
  }, []);

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

  const cards = (
    <>
      <KpiChip
        icon={<SchoolAvatar logo={stat.logo} label={stat.label} color={stat.color} size={38} radius={11} fontSize={12} />}
        label="Школа"
        value={stat.label}
        color={stat.color}
      />
      <KpiChip icon={<ReceiptText size={18} color="#fff" />} label="Начислено" value={money(stat.accruedAmount)} color={PAYROLL_COLORS.accruedAmount} />
      <KpiChip icon={<WalletCards size={18} color="#fff" />} label="Авансы" value={money(stat.advanceAmount)} color={PAYROLL_COLORS.advanceAmount} />
      <KpiChip icon={<Banknote size={18} color="#fff" />} label="Зарплата" value={money(stat.salaryAmount)} color={PAYROLL_COLORS.salaryAmount} />
      <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Оплачено" value={money(stat.paidAmount)} color={PAYROLL_COLORS.paidAmount} />
      <KpiChip icon={<ChevronRight size={18} color="#fff" />} label="Остаток" value={money(stat.remainingAmount)} color={PAYROLL_COLORS.remainingAmount} />
    </>
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: leadingContent ? 'minmax(340px, 1.18fr) repeat(3, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))',
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
