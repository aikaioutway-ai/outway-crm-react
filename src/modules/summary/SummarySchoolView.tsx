import { useMemo } from 'react';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { money } from '../../utils/pricing';
import { KPI_COLORS } from '../families/ManagerOverview';
import { LightChildRow, REVENUE_TAX_RATE } from './summaryForecast';

const EMPTY = '—';

interface Props {
  label: string;
  logo?: string;
  cars: number;
  rows: LightChildRow[];
  onOpenChild: (familyId: string, childId: string) => void;
}

/** «Сводка 2.0» → школа: дети в минивэнах и седанах и их начисления за выбранный месяц. */
export default function SummarySchoolView({ label, logo, cars, rows, onOpenChild }: Props) {
  const revenue = rows.reduce((sum, row) => sum + row.charged, 0);
  const tax = Math.round(revenue * REVENUE_TAX_RATE);

  const columns = useMemo((): ColumnDef<LightChildRow>[] => [
    { key: 'childName', label: 'Ребёнок', type: 'text', width: 220, render: (value, row) => (
      <span style={{ fontWeight: 600 }} title={row.parentName ? `Родитель: ${row.parentName}` : undefined}>{value || EMPTY}</span>
    ) },
    { key: 'charged', label: 'Начисление', type: 'currency', width: 130, render: value => money(Number(value)) },
    { key: 'driverPay', label: 'Оплата водителю', type: 'currency', width: 140, getValue: () => EMPTY, render: () => EMPTY },
    { key: 'tax', label: 'Налог 4%', type: 'currency', width: 110, render: value => money(Number(value)) },
    { key: 'rest', label: 'Остаток', type: 'currency', width: 120, getValue: () => EMPTY, render: () => EMPTY },
  ], []);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, flexShrink: 0 }}>
        <KpiChip iconBackground="transparent" icon={<SchoolAvatar logo={logo} label={label} color="#64748B" size={38} radius={11} fontSize={12} />} label="School" value={label} color="#64748B" />
        <KpiChip icon={null} label="Cars · Passengers" value={`${cars} · ${rows.length}`} color={KPI_COLORS.childrenCount} />
        <KpiChip icon={null} label="Revenue" value={money(revenue)} color={KPI_COLORS.charged} />
        <KpiChip icon={null} label="COGS" value={EMPTY} color="#B45309" />
        <KpiChip icon={null} label="Tax 4%" value={money(tax)} color="#64748B" />
        <KpiChip icon={null} label="Gross Profit" value={EMPTY} color={KPI_COLORS.paid} />
      </div>
      <DataTable<LightChildRow>
        columns={columns}
        data={rows}
        rowKey="childId"
        storageKey="summary_light_school_v1"
        emptyText="В этой школе нет детей в минивэнах и седанах"
        canManageProperties={false}
        onRowClick={row => onOpenChild(row.familyId, row.childId)}
        onRowOpen={row => onOpenChild(row.familyId, row.childId)}
      />
    </div>
  );
}
