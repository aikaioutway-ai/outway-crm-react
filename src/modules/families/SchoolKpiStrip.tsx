import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Inbox, Landmark, Receipt, Users, Wallet } from 'lucide-react';
import { fetchV2FamiliesTable, FamilyListRow } from '../../services/crmV2Service';
import { computeSchoolStats, KpiChip, KPI_COLORS } from './ManagerOverview';
import { money } from '../../utils/pricing';

interface SchoolKpiStripProps {
  schoolKey: string;
}

export default function SchoolKpiStrip({ schoolKey }: SchoolKpiStripProps) {
  const [rows, setRows] = useState<FamilyListRow[] | null>(null);

  useEffect(() => {
    fetchV2FamiliesTable()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return null;

  const stat = computeSchoolStats(rows).find(s => s.key === schoolKey);
  if (!stat) return null;

  return (
    <div style={{ display: 'flex', gap: 12, flexShrink: 0, padding: '10px 0 0' }}>
      <KpiChip
        icon={<span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{stat.label.slice(0, 2).toUpperCase()}</span>}
        label="Школа"
        value={stat.label}
        color={stat.color}
      />
      <KpiChip icon={<Users size={18} color="#fff" />} label="К-во всех детей" value={String(stat.childrenCount)} color={KPI_COLORS.childrenCount} />
      <KpiChip icon={<Inbox size={18} color="#fff" />} label="Новые заявки" value={String(stat.newRequests)} color={KPI_COLORS.newRequests} />
      <KpiChip icon={<Receipt size={18} color="#fff" />} label="Начислено" value={money(stat.charged)} color={KPI_COLORS.charged} />
      <KpiChip icon={<CheckCircle2 size={18} color="#fff" />} label="Оплачено" value={money(stat.paid)} color={KPI_COLORS.paid} />
      <KpiChip icon={<Clock size={18} color="#fff" />} label="На проверке · к-во" value={String(stat.pendingCount)} color={KPI_COLORS.pendingCount} />
      <KpiChip icon={<Clock size={18} color="#fff" />} label="На проверке · сумма" value={money(stat.pendingSum)} color={KPI_COLORS.pendingSum} />
      <KpiChip icon={<Landmark size={18} color="#fff" />} label="Сумма долга" value={money(stat.debtSum)} color={KPI_COLORS.debtSum} />
      <KpiChip icon={<Wallet size={18} color="#fff" />} label="Баланс" value={stat.balance.toLocaleString('ru-RU')} color={KPI_COLORS.balance} />
    </div>
  );
}
