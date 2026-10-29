import { useMemo } from 'react';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import { KpiChip, SchoolAvatar } from '../../core/dashboard/DashboardUI';
import { money } from '../../utils/pricing';
import { KPI_COLORS } from '../families/ManagerOverview';
import { ForecastChildRow } from './summaryForecast';

const EMPTY = '—';

export interface SummarySchoolKpi {
  countLabel: string;
  count: string;
  revenue: number;
  /** null — не считается (нет ставок водителям). */
  cogs: number | null;
  tax: number;
  grossProfit: number | null;
}

interface Props {
  label: string;
  logo?: string;
  kpi: SummarySchoolKpi;
  rows: ForecastChildRow[];
  onOpenChild: (familyId: string, childId: string) => void;
}

/** «Сводка → Прогноз» → школа: дети в трансферах нужного типа и их начисления за выбранный месяц. */
export default function SummarySchoolView({ label, logo, kpi, rows, onOpenChild }: Props) {
  const columns = useMemo((): ColumnDef<ForecastChildRow>[] => [
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
        <KpiChip icon={null} label={kpi.countLabel} value={kpi.count} color={KPI_COLORS.childrenCount} />
        <KpiChip icon={null} label="Revenue" value={money(kpi.revenue)} color={KPI_COLORS.charged} />
        <KpiChip icon={null} label="COGS" value={kpi.cogs === null ? EMPTY : money(kpi.cogs)} color="#B45309" />
        <KpiChip icon={null} label="Tax 4%" value={money(kpi.tax)} color="#64748B" />
        <KpiChip icon={null} label="Gross Profit" value={kpi.grossProfit === null ? EMPTY : money(kpi.grossProfit)} color={kpi.grossProfit !== null && kpi.grossProfit < 0 ? 'var(--danger)' : KPI_COLORS.paid} />
      </div>
      <DataTable<ForecastChildRow>
        columns={columns}
        data={rows}
        rowKey="childId"
        storageKey="summary_school_children_v1"
        emptyText="В этой школе нет детей в трансферах этого типа"
        canManageProperties={false}
        onRowClick={row => onOpenChild(row.familyId, row.childId)}
        onRowOpen={row => onOpenChild(row.familyId, row.childId)}
      />
    </div>
  );
}
