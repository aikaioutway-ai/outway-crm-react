import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Inbox, Landmark, Receipt, Users, Wallet } from 'lucide-react';
import { fetchV2FamiliesTableCached, getCachedV2FamiliesTable, FamilyListRow } from '../../services/crmV2Service';
import { computeSchoolStats, KpiChip, KPI_COLORS, SchoolAvatar } from './ManagerOverview';
import { money } from '../../utils/pricing';

interface SchoolKpiStripProps {
  schoolKey: string;
  rightReserveWidth?: number;
}

export default function SchoolKpiStrip({ schoolKey, rightReserveWidth = 78 }: SchoolKpiStripProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(() => getCachedV2FamiliesTable());

  useEffect(() => {
    let cancelled = false;
    fetchV2FamiliesTableCached()
      .then(next => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setRows(prev => prev ?? []); });
    return () => { cancelled = true; };
  }, []);

  const stat = useMemo(() => (
    rows ? computeSchoolStats(rows).find(s => s.key === schoolKey) : undefined
  ), [rows, schoolKey]);

  if (rows === null || !stat) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 12, flexShrink: 0, padding: '10px 0 0', paddingRight: rightReserveWidth, transition: 'padding-right .18s ease' }}>
      <KpiChip
        icon={<SchoolAvatar logo={stat.logo} label={stat.label} color={stat.color} size={38} radius={11} fontSize={12} />}
        label="Школа"
        value={stat.label}
        color={stat.color}
      />
      <KpiChip icon={<Users size={18} color="#fff" />} label="К-во всех детей" value={String(stat.childrenCount)} color={KPI_COLORS.childrenCount} />
      <KpiChip icon={<Inbox size={18} color="#fff" />} label="Новые заявки" value={String(stat.newRequests)} color={KPI_COLORS.newRequests} />
      <KpiChip icon={<Receipt size={18} color="#fff" />} label="Начислено" value={money(stat.charged)} color={KPI_COLORS.charged} />
      <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Оплачено" value={money(stat.paid)} color={KPI_COLORS.paid} />
      <KpiChip icon={<Landmark size={18} color="#fff" />} label="Сумма долга" value={money(stat.debtSum)} color={KPI_COLORS.debtSum} />
      <KpiChip icon={<Wallet size={18} color="#fff" />} label="Баланс" value={stat.balance.toLocaleString('ru-RU')} color={KPI_COLORS.balance} />
    </div>
  );
}
