import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Family, FamilyPayment, UserRole, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import {
  SCHOOL_TABS, ZONE_COLOR, VT_LABEL
} from './constants';
import { clearV2TransferVehicleType, deleteV2Family, fetchV2Branches, fetchV2DriversTable, fetchV2FamiliesTable, fetchV2Family, fetchV2TransfersDashboard, updateV2Child, updateV2ChildRoute, updateV2Family, updateV2TransferVehicleType, V2BranchOption, V2DriverTableRow, V2TransferDashboardRow } from '../../services/crmV2Service';
import InlineFamilyCard from './InlineFamilyCard';
import NewFamilyModal from './NewFamilyModal';
import NewDriverModal from '../drivers/NewDriverModal';
import BankStatementPage from '../finance/BankStatementPage';
import { confirmFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import NotionSelect from '../../core/selects/NotionSelect';
import '../../core/tables/DataTable.css';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, Plus, X } from 'lucide-react';
import { formatClassName, formatName, formatPhone } from '../../utils/format';

interface ChildRow {
  rowId: string;
  familyId: string;
  familyIndex: number;
  isFirstChild: boolean;
  childName: string;
  childClass: string;
  parentName: string;
  phone: string;
  secondPhone: string;
  contactName: string;
  contactPhone: string;
  schoolId: string | null;
  branchId: string | null;
  schoolCode: string;
  branchName: string;
  branchShort: string;
  branchFilter: string;
  streetAddress: string;
  distanceKm: number | null;
  zone: string;
  vehicleType: string;
  vehicleLabel: string;
  monthlyPrice: number;
  status: string;
  paymentStatus: string;
  transferNumber: string | null;
  driverId: string | null;
  stopNumber: string | null;
  timeMorning: string | null;
  selfExitAllowed: boolean;
  latitude: number | null;
  longitude: number | null;
  discountAmount: number;
  totalCharged: number;
  totalPaid: number;
  pendingPayment: number;
  pendingPaymentId: string | null;
  pendingPaymentAmount: number;
  pendingPaymentDate: string | null;
  pendingActualPaymentDate: string | null;
  pendingPaymentType: string | null;
  pendingPaymentComment: string;
  debtAmount: number;
  balance: number;
}

type FamiliesMode = 'requests' | 'payments' | 'cashier' | 'logistics';

interface FamiliesPageProps {
  mode?: FamiliesMode;
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
  dashboardMode?: 'logistics' | 'drivers';
}

interface ModeFilters {
  activeTab: string;
  quickTransfer: string;
  quickChildStatus: string;
  quickPaymentStatus: string;
}

const MODE_LABEL: Record<FamiliesMode, string> = {
  requests: 'Заявки',
  payments: 'Оплаты',
  cashier: 'Кассир',
  logistics: 'Логистика',
};

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'Все оплаты' },
  { value: 'no_charges', label: 'Нет начислений' },
  { value: 'debt', label: 'Долг' },
  { value: 'partial', label: 'Частично' },
  { value: 'paid', label: 'Оплачено' },
];
const TRANSFER_OPTIONS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: `№ ${i + 1}` }));
const TRANSFER_BAR_OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));
const STOP_OPTIONS = Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

const COLUMNS: ColumnDef<ChildRow>[] = [
  {
    key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 160, editable: true,
    render: (val, row) => row.isFirstChild
      ? <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{val}</span>
      : <span style={{ fontSize: 11, color: 'var(--text-2)', paddingLeft: 8 }}>└ #{row.familyId.slice(-4)}</span>,
    getValue: (row) => row.parentName,
  },
  {
    key: 'phone', label: 'Телефон', type: 'text', category: 'Клиент', width: 125, editable: true,
    render: (val, row) => row.isFirstChild
      ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{val}</span>
      : null,
  },
  {
    key: 'childName', label: 'Ребёнок', type: 'text', category: 'Клиент', width: 160, editable: true,
    render: (val) => <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'childClass', label: 'Класс', type: 'text', category: 'Клиент', width: 65, editable: true,
    render: (val) => <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{val ? `${val} кл.` : '—'}</span>,
  },
  {
    key: 'secondPhone', label: 'Второй телефон', type: 'text', category: 'Клиент', width: 125, editable: true, visible: false,
    render: (val, row) => row.isFirstChild ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{val || '—'}</span> : null,
  },
  {
    key: 'contactName', label: 'Доп. контакт', type: 'text', category: 'Клиент', width: 135, editable: true, visible: false,
    render: (val, row) => row.isFirstChild ? <span style={{ fontSize: 12, color: 'var(--text)' }}>{val || '—'}</span> : null,
  },
  {
    key: 'contactPhone', label: 'Телефон доп.', type: 'text', category: 'Клиент', width: 125, editable: true, visible: false,
    render: (val, row) => row.isFirstChild ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{val || '—'}</span> : null,
  },
  {
    key: 'branchShort', label: 'Школа', type: 'select', category: 'Клиент', width: 80, filterable: false, sortable: false,
    render: (val, row) => (
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
        {val}
        {['Asylkech Girls School', 'AsylKech Girls School'].includes(row.branchName) && (
          <span style={{ fontSize: 10, color: 'var(--text-2)', marginLeft: 3 }}>_A</span>
        )}
      </span>
    ),
    getValue: (row) => row.branchShort,
  },
  {
    key: 'streetAddress', label: 'Адрес', type: 'text', category: 'Адрес', width: 230, editable: true,
    render: (val, row) => row.isFirstChild
      ? <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{val || '—'}</span>
      : <span style={{ color: 'var(--text-2)', fontSize: 12 }}>—</span>,
    getValue: (row) => row.streetAddress,
  },
  {
    key: 'distanceKm', label: 'Км', type: 'number', category: 'Адрес', width: 60, editable: true,
    render: (val, row) => row.isFirstChild && val
      ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{val}</span>
      : null,
  },
  {
    key: 'zone', label: 'Зона', type: 'select', category: 'Адрес', width: 65, editable: true,
    editOptions: [
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
      { value: 'C', label: 'C' },
    ],
    render: (val) => val ? (
      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: ZONE_COLOR[val]?.bg, color: ZONE_COLOR[val]?.color }}>
        {val}
      </span>
    ) : null,
  },
  {
    key: 'vehicleLabel', label: 'Транспорт', type: 'select', category: 'Маршрут', width: 120, editable: true, filterable: false, sortable: false,
    editOptions: [
      { value: 'microbus', label: 'Микроавтобус' },
      { value: 'minivan', label: 'Минивэн' },
      { value: 'sedan', label: 'Седан' },
    ],
    render: (val, row) => (
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
        {(VT_LABEL[row.vehicleType] ?? row.vehicleType)}{row.transferNumber ? ` №${row.transferNumber}` : ''}
      </span>
    ),
    getValue: (row) => row.vehicleType,
  },
  {
    key: 'transferNumber', label: '№ Трансфера', type: 'select', category: 'Маршрут', width: 100, editable: true,
    editOptions: [{ value: '', label: '—' }, ...TRANSFER_OPTIONS],
    render: (val) => <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{val ? `№${val}` : '—'}</span>,
  },
  {
    key: 'stopNumber', label: 'Остановка', type: 'select', category: 'Маршрут', width: 95, editable: true,
    editOptions: [{ value: '', label: '—' }, ...STOP_OPTIONS],
    render: (val) => <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'timeMorning', label: 'Время утро', type: 'text', category: 'Маршрут', width: 95, editable: true,
    render: (val) => <span style={{ fontSize: 12, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'monthlyPrice', label: 'Сумма/мес', type: 'currency', category: 'Финансы', width: 110,
    render: (val) => <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{money(val)}</span>,
  },
  { key: 'discountAmount', label: 'Скидка', type: 'currency', category: 'Финансы', width: 95, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'debtAmount', label: 'Долг', type: 'currency', category: 'Финансы', width: 95, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'balance', label: 'Баланс', type: 'currency', category: 'Финансы', width: 95, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'totalCharged', label: 'Общ. начисл.', type: 'currency', category: 'Финансы', width: 110, visible: false, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'totalPaid', label: 'Платежи', type: 'currency', category: 'Финансы', width: 110, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'pendingPayment', label: 'На проверке', type: 'currency', category: 'Финансы', width: 105, visible: false, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'schoolCode',     label: 'Код школы',   type: 'text',   category: 'Система',  width: 90,  visible: false, filterable: false, sortable: false, showInProperties: false },
  { key: 'branchName',     label: 'Филиал',       type: 'text',   category: 'Система',  width: 160, visible: false, filterable: false, sortable: false, showInProperties: false },
  { key: 'vehicleType',    label: 'Тип ТС',       type: 'select', category: 'Система', width: 100, visible: false, filterable: false, sortable: false, showInProperties: false },
  { key: 'familyId',       label: 'ID семьи',     type: 'text',   category: 'Система', width: 120, visible: false, filterable: true,  sortable: false, showInProperties: true },
];

const DRIVER_COLUMNS: ColumnDef<V2DriverTableRow>[] = [
  {
    key: 'fullName',
    label: 'Водитель',
    type: 'text',
    category: 'Водитель',
    width: 190,
    render: value => <span style={{ fontWeight: 850, color: '#17222F' }}>{value || '—'}</span>,
  },
  { key: 'phone', label: 'Телефон', type: 'text', category: 'Водитель', width: 125 },
  { key: 'secondPhone', label: 'Доп. телефон', type: 'text', category: 'Водитель', width: 125, visible: false },
  {
    key: 'status',
    label: 'Статус',
    type: 'select',
    category: 'Водитель',
    width: 105,
    render: value => (
      <span style={{
        display: 'inline-flex',
        padding: '3px 8px',
        borderRadius: 7,
        background: value === 'active' ? '#E8F5E9' : '#ECEFF3',
        color: value === 'active' ? '#1B5E20' : '#52606F',
        fontSize: 11,
        fontWeight: 850,
      }}>
        {value === 'active' ? 'Активен' : value || '—'}
      </span>
    ),
  },
  { key: 'branchShorts', label: 'Школа', type: 'text', category: 'Маршрут', width: 110, getValue: row => row.branchShorts.join(', ') },
  { key: 'transferNumbers', label: 'Трансфер', type: 'text', category: 'Маршрут', width: 140 },
  {
    key: 'vehicleLabel',
    label: 'Тип ТС',
    type: 'select',
    category: 'Авто',
    width: 125,
    render: value => <span style={{ fontWeight: 800, color: '#17222F' }}>{value || '—'}</span>,
  },
  { key: 'plateNumber', label: 'Гос. номер', type: 'text', category: 'Авто', width: 105 },
  { key: 'brand', label: 'Марка', type: 'text', category: 'Авто', width: 105, visible: false },
  { key: 'model', label: 'Модель', type: 'text', category: 'Авто', width: 105, visible: false },
  { key: 'seats', label: 'Мест', type: 'number', category: 'Авто', width: 70, visible: false },
  { key: 'childrenCount', label: 'Дети', type: 'number', category: 'Работа', width: 75 },
  { key: 'transferCount', label: 'К-во трансферов', type: 'number', category: 'Работа', width: 115, visible: false },
  { key: 'address', label: 'Адрес', type: 'text', category: 'Водитель', width: 220, visible: false },
  { key: 'comment', label: 'Комментарий', type: 'text', category: 'Водитель', width: 220, visible: false },
];

let familiesRowsCache: ChildRow[] | null = null;

function normalizeRows(rows: ChildRow[]): ChildRow[] {
  return rows.map(row => ({
    ...row,
    parentName: formatName(row.parentName),
    phone: formatPhone(row.phone),
    childClass: formatClassName(row.childClass),
    vehicleLabel: VT_LABEL[row.vehicleType] ?? row.vehicleType,
  }));
}

function compactMoney(value: number): string {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}м`;
  if (Math.abs(amount) >= 10000) return `${Math.round(amount / 1000)}к`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}к`;
  return Math.round(amount).toLocaleString('ru-RU');
}

function uniqueFamilyRows(rows: ChildRow[]): ChildRow[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (seen.has(row.familyId)) return false;
    seen.add(row.familyId);
    return true;
  });
}

function logisticsWorkRows(rows: ChildRow[]): ChildRow[] {
  return rows.filter(row => row.status !== 'rejected');
}

function averageChildrenByVehicle(rows: ChildRow[], vehicleType: string): number {
  const vehicleRows = rows.filter(row => row.vehicleType === vehicleType && row.transferNumber);
  const transfers = new Set(vehicleRows.map(row => `${row.branchFilter}:${row.transferNumber}`));
  return transfers.size ? vehicleRows.length / transfers.size : 0;
}

function averageMicrobusByBranch(rows: ChildRow[], branchKey: string): number {
  const branchRows = rows.filter(row => row.branchFilter === branchKey && row.vehicleType === 'microbus' && row.transferNumber);
  const transfers = new Set(branchRows.map(row => row.transferNumber));
  return transfers.size ? branchRows.length / transfers.size : 0;
}

const LOGISTICS_CHART_COLORS = [
  '#EF7168', '#C9C9C7', '#DD7FA9', '#C79B7D', '#74BE92',
  '#E49A55', '#5A9FE8', '#B77BDA', '#E1709B', '#88A8D8',
];

type LogisticsDashboardItem = { key: string; label: string; value: number; color: string };
type LogisticsTransferDashboardItem = LogisticsDashboardItem & { group: string; count: number; vehicleType?: string };
type LogisticsDashboardMetric = 'average' | 'count' | 'debtSum' | 'debtorsCount' | 'chargedSum' | 'paidSum' | 'balanceSum' | 'pendingSum';
type LogisticsVehicleFilter = 'all' | VehicleType;
type TransferCardData = {
  transfer: V2TransferDashboardRow;
  driver?: V2DriverTableRow;
  childrenCount: number;
  history: {
    driverName: string;
    phone: string;
    startDate: string;
    endDate: string;
    status: string;
  }[];
};
type DriverCardTab = 'main' | 'finance';
type DriverFinanceRow = {
  month: string;
  days: number;
  rate: number;
  fines: number;
  penalties: number;
  accrued: number;
  advances: number;
  paid: number;
  balance: number;
};

const DRIVER_FINANCE_MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const LOGISTICS_DASHBOARD_METRICS: { key: LogisticsDashboardMetric; label: string; money?: boolean }[] = [
  { key: 'average', label: 'Средний' },
  { key: 'count', label: 'К-во' },
  { key: 'pendingSum', label: 'На проверке' },
  { key: 'debtSum', label: 'Долг', money: true },
  { key: 'debtorsCount', label: 'Должники' },
  { key: 'chargedSum', label: 'Начислено', money: true },
  { key: 'paidSum', label: 'Оплачено', money: true },
  { key: 'balanceSum', label: 'Баланс', money: true },
];

const METRICS_BY_ROLE: Record<string, LogisticsDashboardMetric[]> = {
  admin:        ['average', 'count', 'pendingSum', 'debtSum', 'debtorsCount', 'chargedSum', 'paidSum', 'balanceSum'],
  gen_director: ['average', 'count', 'pendingSum', 'debtSum', 'debtorsCount', 'chargedSum', 'paidSum', 'balanceSum'],
  director:     ['average', 'count', 'pendingSum', 'debtSum', 'debtorsCount', 'chargedSum', 'paidSum', 'balanceSum'],
  manager:  ['count', 'pendingSum', 'debtSum', 'debtorsCount', 'chargedSum', 'paidSum', 'balanceSum'],
  cashier:  ['pendingSum', 'debtSum', 'debtorsCount'],
  logist:   ['average', 'count'],
};
const LOGISTICS_VEHICLE_FILTERS: { key: LogisticsVehicleFilter; label: string }[] = [
  { key: 'all', label: 'Все ТС' },
  { key: 'microbus', label: 'Микроавтобус' },
  { key: 'minivan', label: 'Минивэн' },
  { key: 'sedan', label: 'Седан' },
];

function logisticsTransferCountColor(count: number): string {
  if (count <= 0) return '#C9D4D6';
  if (count < 16) return '#EF7168';
  if (count === 16) return '#E49A55';
  if (count === 17) return '#74BE92';
  return '#31A4A5';
}

function logisticsVehicleTypeLineColor(vehicleType?: string): string | null {
  if (vehicleType === 'minivan') return '#74BE92';
  if (vehicleType === 'sedan') return '#E49A55';
  return null;
}

function vehicleTypeShortLabel(vehicleType?: string): string {
  if (vehicleType === 'microbus') return 'BUS';
  if (vehicleType === 'minivan') return 'MINI';
  if (vehicleType === 'sedan') return 'CAR';
  return '';
}

function formatDateShort(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ru-RU');
}

const logisticsDashboardStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '224px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
  minHeight: 340,
  padding: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  overflow: 'visible',
};

const logisticsDashboardSideStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  justifyItems: 'center',
  gap: 4,
  padding: '12px 12px 14px',
  minHeight: '100%',
  background: '#fff',
  border: '1px solid #D4E3E7',
  borderRadius: 10,
};

const logisticsDashboardMainStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gap: 14,
  minWidth: 0,
  minHeight: '100%',
  padding: '30px 42px 14px 14px',
  background: '#fff',
  border: '1px solid #D4E3E7',
  borderRadius: 10,
};

const logisticsCollapsedStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 34,
  padding: '5px 8px 5px 12px',
  background: '#fff',
  border: '1px solid #D4E3E7',
  borderRadius: 10,
};

const logisticsCollapsedDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: '#31A4A5',
  flexShrink: 0,
};

const logisticsGaugeTitleStyle: React.CSSProperties = {
  justifySelf: 'start',
  marginLeft: 6,
  fontSize: 12,
  fontWeight: 850,
  color: '#17222F',
};

const logisticsGaugeValueStyle: React.CSSProperties = {
  position: 'absolute',
  fontSize: 24,
  fontWeight: 900,
  color: '#17222F',
};

const logisticsBarsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(58px, 1fr))',
  alignItems: 'end',
  gap: 8,
  minWidth: 0,
  overflow: 'hidden',
  padding: '22px 0 2px',
  borderBottom: '1px solid #E5ECEF',
  scrollbarWidth: 'none',
};

const logisticsBarItemStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: '98px 24px',
  justifyItems: 'center',
  alignItems: 'end',
  minWidth: 0,
  border: 0,
  background: 'transparent',
  padding: 0,
};

const logisticsBarValueStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: -22,
  transform: 'translateX(-50%)',
  fontSize: 13,
  fontWeight: 850,
  color: '#41547A',
  whiteSpace: 'nowrap',
};

const logisticsBarTrackStyle: React.CSSProperties = {
  height: 98,
  display: 'flex',
  alignItems: 'end',
  justifyContent: 'center',
};

const logisticsBarStyle: React.CSSProperties = {
  width: 18,
  borderRadius: '5px 5px 0 0',
  position: 'relative',
};

const logisticsBarLabelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 72,
  paddingTop: 6,
  fontSize: 12,
  fontWeight: 750,
  color: '#626C8B',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

function LogisticsMicrobusDashboard({
  items,
  collapsed,
  onToggle,
  selectedKey,
  onSelect,
  metric,
  onMetricChange,
  metricOptions,
  vehicleFilter,
  onVehicleFilterChange,
  summaryItems,
  primaryValue,
  detailItems = [],
  activeDetailKey,
  onDetailSelect,
  onDetailContextMenu,
  detailValueMode = 'count',
  showMetricFilter = true,
}: {
  items: LogisticsDashboardItem[];
  collapsed: boolean;
  onToggle: () => void;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  metric: LogisticsDashboardMetric;
  onMetricChange: (metric: LogisticsDashboardMetric) => void;
  metricOptions: { key: LogisticsDashboardMetric; label: string; money?: boolean }[];
  vehicleFilter: LogisticsVehicleFilter;
  onVehicleFilterChange: (filter: LogisticsVehicleFilter) => void;
  summaryItems?: { label: string; value: string }[];
  primaryValue?: number;
  detailItems?: LogisticsTransferDashboardItem[];
  activeDetailKey?: string;
  onDetailSelect?: (item: LogisticsTransferDashboardItem) => void;
  onDetailContextMenu?: (event: React.MouseEvent, item: LogisticsTransferDashboardItem) => void;
  detailValueMode?: 'count' | 'vehicleType';
  showMetricFilter?: boolean;
}) {
  const maxValue = Math.max(20, ...items.map(item => Math.max(0, item.value)));
  const maxDetailValue = Math.max(1, ...detailItems.map(item => item.count));
  const compactDetailBars = detailValueMode === 'vehicleType';
  const selectedMetric = metricOptions.find(item => item.key === metric) ?? metricOptions[0] ?? LOGISTICS_DASHBOARD_METRICS[0];
  const averageGaugeValue = items.length
    ? items.reduce((sum, item) => sum + item.value, 0) / items.length
    : 0;
  const selectedGaugeItem = selectedKey ? items.find(item => item.key === selectedKey) : undefined;
  const gaugeValue = primaryValue ?? selectedGaugeItem?.value ?? averageGaugeValue;
  const radius = 38;
  const stroke = 11;
  const circumference = 2 * Math.PI * radius;
  const gap = 4;
  const totalValue = items.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
  let offset = 0;

  if (collapsed) {
    return (
      <div style={logisticsCollapsedStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={logisticsCollapsedDotStyle} />
          <span style={{ fontSize: 12, fontWeight: 850, color: '#17222F' }}>{selectedMetric.label}</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#31A4A5' }}>
            {selectedMetric.money ? compactMoney(gaugeValue) : gaugeValue.toFixed(metric === 'average' ? 2 : 0)}
          </span>
        </div>
        <button
          onClick={onToggle}
          title="Показать дашборд"
          style={{
            width: 28,
            height: 24,
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            color: '#626C8B',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ChevronDown size={15} />
        </button>
      </div>
    );
  }

  return (
    <div style={logisticsDashboardStyle}>
      <div style={logisticsDashboardSideStyle}>
        <div style={{ ...logisticsGaugeTitleStyle, width: showMetricFilter ? 182 : 92, display: 'grid', gridTemplateColumns: showMetricFilter ? 'minmax(82px, 1fr) minmax(92px, 1fr)' : 'minmax(92px, 1fr)', gap: 8 }}>
          {showMetricFilter && (
            <NotionSelect
              value={metric}
              options={metricOptions.map(option => ({ value: option.key, label: option.label }))}
              onChange={value => onMetricChange(value as LogisticsDashboardMetric)}
              variant="inline"
              panelWidth={220}
            />
          )}
          <NotionSelect
            value={vehicleFilter}
            options={LOGISTICS_VEHICLE_FILTERS.map(option => ({ value: option.key, label: option.label }))}
            onChange={value => onVehicleFilterChange(value as LogisticsVehicleFilter)}
            variant="inline"
            panelWidth={210}
          />
        </div>
        <div style={{ position: 'relative', width: 112, height: 112, display: 'grid', placeItems: 'center' }}>
          <svg width="112" height="112" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="56" cy="56" r={radius} fill="none" stroke="#EEF2F5" strokeWidth={stroke} />
            {items.map(item => {
              const dash = Math.max(1, (Math.max(0, item.value) / totalValue) * circumference - gap);
              const node = (
                <circle
                  key={item.key}
                  cx="56"
                  cy="56"
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash + gap;
              return node;
            })}
          </svg>
          <div style={{ ...logisticsGaugeValueStyle, fontSize: selectedMetric.money ? 20 : 24 }}>
            {selectedMetric.money ? compactMoney(gaugeValue) : gaugeValue.toFixed(metric === 'average' ? 2 : 0)}
          </div>
        </div>
        {summaryItems?.length ? (
          <div style={{
            width: 136,
            display: 'grid',
            gap: 7,
            justifySelf: 'center',
            marginTop: 6,
          }}>
            {summaryItems.map(item => (
              <div key={item.label} style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                minWidth: 0,
                fontSize: 12,
                lineHeight: 1.25,
                color: '#626C8B',
              }}>
                <span style={{ fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                <span style={{ fontWeight: 850, color: '#17222F', whiteSpace: 'nowrap' }}>{item.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={logisticsDashboardMainStyle}>
        <button
          onClick={onToggle}
          title="Скрыть дашборд"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 31,
            height: 28,
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            color: '#626C8B',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ChevronUp size={15} />
        </button>
        <div style={{
          ...logisticsBarsStyle,
          gridTemplateColumns: `repeat(${items.length || 1}, minmax(44px, 1fr))`,
          borderBottom: 0,
          overflow: 'visible',
        }}>
          {items.map(item => {
            const height = Math.max(8, Math.round((Math.max(0, item.value) / maxValue) * 94));
            const active = selectedKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect?.(item.key)}
                style={{
                  ...logisticsBarItemStyle,
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: active ? 1 : 0,
                  marginTop: active ? -56 : 0,
                  marginBottom: active ? -3 : 0,
                  padding: active ? '56px 4px 3px' : 0,
                  border: '1px solid transparent',
                  borderRadius: active ? '0 0 8px 8px' : 0,
                  background: active ? 'var(--active-bg)' : 'transparent',
                  boxShadow: active ? 'inset 0 -4px 0 #31A4A5' : 'none',
                }}
              >
                <div style={logisticsBarTrackStyle}>
                  <div style={{ ...logisticsBarStyle, height, background: item.color }}>
                    <span style={logisticsBarValueStyle}>
                      {selectedMetric.money ? compactMoney(item.value) : item.value.toFixed(metric === 'average' ? 1 : 0)}
                    </span>
                  </div>
                </div>
                <div style={{ ...logisticsBarLabelStyle, color: active ? '#17222F' : '#626C8B', fontWeight: active ? 900 : 700 }}>
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div style={{
            ...logisticsBarsStyle,
            gridTemplateColumns: compactDetailBars
              ? `repeat(${detailItems.length || 1}, minmax(26px, 34px))`
              : `repeat(${detailItems.length || 1}, minmax(30px, 1fr))`,
            gap: compactDetailBars ? 8 : 12,
            justifyContent: compactDetailBars ? 'space-between' : 'stretch',
            paddingTop: 26,
            borderBottom: 0,
            overflow: 'visible',
          }}>
            {detailItems.length ? detailItems.map(item => {
              const height = Math.max(8, Math.round((item.count / maxDetailValue) * 78));
                const isEmpty = item.count <= 0;
                const isStatus = item.key === 'all' || item.key === 'new' || item.key === 'rejected';
                const isActive = activeDetailKey === item.key;
                const vehicleLineColor = logisticsVehicleTypeLineColor(item.vehicleType);
                const vehicleLabel = vehicleTypeShortLabel(item.vehicleType);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onDetailSelect?.(item)}
                    onContextMenu={(event) => {
                      if (!item.key.startsWith('transfer-')) return;
                      onDetailContextMenu?.(event, item);
                    }}
                    title={item.label}
                  style={{
                    ...logisticsBarItemStyle,
                    gridTemplateRows: '82px 22px',
                    opacity: isActive ? 1 : isEmpty ? 0.66 : 1,
                    cursor: 'pointer',
                    position: 'relative',
                    zIndex: isActive ? 1 : 0,
                    marginTop: isActive ? -20 : 0,
                    marginBottom: isActive ? -20 : 0,
                    padding: isActive ? (compactDetailBars ? '20px 2px 20px' : '20px 4px 20px') : 0,
                    border: '1px solid transparent',
                    borderRadius: isActive ? '8px 8px 0 0' : 0,
                    background: isActive ? 'var(--active-bg)' : 'transparent',
                    boxShadow: isActive ? 'inset 0 4px 0 #31A4A5' : 'none',
                  }}
                >
                  <div style={{ ...logisticsBarTrackStyle, height: 82 }}>
                    <div
                      style={{
                        ...logisticsBarStyle,
                        height,
                        background: isEmpty
                          ? 'repeating-linear-gradient(-45deg, #EDF3F5 0, #EDF3F5 5px, #D9E5E8 5px, #D9E5E8 7px)'
                          : item.color,
                        width: 16,
                      }}
                    >
                      <span style={{
                        ...logisticsBarValueStyle,
                        color: isEmpty ? '#9AA7AE' : '#626C8B',
                      }}>
                        {detailValueMode === 'vehicleType' ? vehicleLabel || '—' : item.count}
                      </span>
                    </div>
                  </div>
                  <div style={{
                    ...logisticsBarLabelStyle,
                    maxWidth: isStatus ? 48 : 34,
                    fontSize: isStatus ? 10 : 12,
                    color: isActive ? '#17222F' : isEmpty ? '#9AA7AE' : '#626C8B',
                    fontWeight: isActive ? 900 : 700,
                  }}>
                    <span style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1,
                      minWidth: 12,
                      lineHeight: 1,
                    }}>
                      <span>{item.label}</span>
                      {detailValueMode !== 'vehicleType' && vehicleLabel && (
                        <span style={{
                          color: vehicleLineColor ?? '#31A4A5',
                          fontSize: 9,
                          fontWeight: 900,
                          lineHeight: 1,
                        }}>
                          {vehicleLabel}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            }) : (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#626C8B', paddingBottom: 16 }}>
                По этой школе пока нет трансферов
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TRANSFER_TONE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  microbus: { bg: '#D7EEEE', border: '#AAD4D4', text: '#237F81', dot: '#31A4A5' },
  minivan: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', dot: '#10B981' },
  sedan: { bg: '#F2F5E9', border: '#DCE8C6', text: '#687C54', dot: '#687C54' },
  empty: { bg: '#F5FAFB', border: '#D4E3E7', text: '#626C8B', dot: '#AAB5AE' },
};

const TRANSFER_TABS = [
  ...TRANSFER_BAR_OPTIONS.map(transfer => ({ key: transfer, label: transfer })),
];
const VEHICLE_TYPE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'microbus', label: 'Микроавтобус' },
  { value: 'minivan', label: 'Минивэн' },
  { value: 'sedan', label: 'Седан' },
];
const TRANSFER_TYPE_MENU_OPTIONS: { value: VehicleType | 'unassigned'; label: string }[] = [
  { value: 'unassigned', label: 'Не назначен' },
  ...VEHICLE_TYPE_OPTIONS,
];
const DEFAULT_ACTIVE_TAB = SCHOOL_TABS.find(t => t.key !== 'ALL')?.key ?? 'TIS';

const DEFAULT_MODE_FILTERS: ModeFilters = {
  activeTab: DEFAULT_ACTIVE_TAB,
  quickTransfer: '',
  quickChildStatus: '',
  quickPaymentStatus: '',
};
const DEFAULT_MODE_COLLAPSED: Record<FamiliesMode, boolean> = {
  requests: false,
  payments: false,
  cashier: false,
  logistics: false,
};
const DEFAULT_MODE_SIDEBAR_COLLAPSED: Record<FamiliesMode, boolean> = {
  requests: true,
  payments: true,
  cashier: true,
  logistics: true,
};

export default function FamiliesPage({ mode = 'requests', userRole = 'admin', userName = 'CRM', allowedSchools, dashboardMode = 'logistics' as 'logistics' | 'drivers' }: FamiliesPageProps) {
  const [rows, setRows]           = useState<ChildRow[]>(() => familiesRowsCache ?? []);
  const [dashboardTransfers, setDashboardTransfers] = useState<V2TransferDashboardRow[]>([]);
  const [driverRows, setDriverRows] = useState<V2DriverTableRow[]>([]);
  const [loading, setLoading]     = useState(() => !familiesRowsCache);
  const [search, setSearch]       = useState('');
  const roleDefaultChildStatus = userRole === 'cashier' ? '' : 'new';
  const [filtersByMode, setFiltersByMode] = useState<Record<FamiliesMode, ModeFilters>>({
    requests: { ...DEFAULT_MODE_FILTERS, quickChildStatus: roleDefaultChildStatus },
    payments: { ...DEFAULT_MODE_FILTERS, quickChildStatus: roleDefaultChildStatus },
    cashier:  { ...DEFAULT_MODE_FILTERS, activeTab: 'ALL' },
    logistics: { ...DEFAULT_MODE_FILTERS, quickChildStatus: roleDefaultChildStatus },
  });
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily]     = useState<Family | null>(null);
  const [expandedInitialTab, setExpandedInitialTab] = useState<'overview' | 'finance'>('overview');
  const [showNewFamily, setShowNewFamily]       = useState(false);
  const [showNewDriver, setShowNewDriver]       = useState(false);
  const [showBankStatement, setShowBankStatement] = useState(false);
  const [driverBranches, setDriverBranches]     = useState<V2BranchOption[]>([]);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [logisticsDashboardCollapsedByMode, setLogisticsDashboardCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_COLLAPSED });
  const [tableBarsCollapsedByMode, setTableBarsCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_COLLAPSED });
  const [schoolsBarCollapsedByMode, setSchoolsBarCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_SIDEBAR_COLLAPSED });
  const [dashboardSchoolByMode, setDashboardSchoolByMode] = useState<Partial<Record<FamiliesMode, string>>>({});
  const [dashboardMetricByMode, setDashboardMetricByMode] = useState<Partial<Record<FamiliesMode, LogisticsDashboardMetric>>>({});
  const [dashboardVehicleFilterByMode, setDashboardVehicleFilterByMode] = useState<Partial<Record<FamiliesMode, LogisticsVehicleFilter>>>({});
  const [transferCardNumber, setTransferCardNumber] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedDriverTab, setSelectedDriverTab] = useState<DriverCardTab>('main');
  const [transferTypeMenu, setTransferTypeMenu] = useState<{
    x: number;
    y: number;
    transferNumber: string;
  } | null>(null);

  const modeFilters = filtersByMode[mode] ?? DEFAULT_MODE_FILTERS;
  const { activeTab, quickTransfer, quickChildStatus, quickPaymentStatus } = modeFilters;
  const logisticsDashboardCollapsed = logisticsDashboardCollapsedByMode[mode] ?? false;
  const tableBarsCollapsed = tableBarsCollapsedByMode[mode] ?? false;
  const schoolsBarCollapsed = schoolsBarCollapsedByMode[mode] ?? true;
  const schoolsSidebarCollapsed = dashboardMode === 'drivers' || schoolsBarCollapsed;
  const dashboardSchoolKey = dashboardSchoolByMode[mode] ?? '';
  const DEFAULT_METRIC_BY_MODE: Record<FamiliesMode, LogisticsDashboardMetric> = {
    requests: 'count',
    payments: 'debtorsCount',
    cashier: 'pendingSum',
    logistics: 'average',
  };
  const dashboardMetric = dashboardMetricByMode[mode] ?? DEFAULT_METRIC_BY_MODE[mode];
  const dashboardVehicleFilter = dashboardVehicleFilterByMode[mode] ?? 'all';
  const setModeFilter = (patch: Partial<ModeFilters>) => {
    setFiltersByMode(prev => ({
      ...prev,
      [mode]: {
        ...(prev[mode] ?? DEFAULT_MODE_FILTERS),
        ...patch,
      },
    }));
  };
  const setLogisticsDashboardCollapsed = (next: boolean | ((current: boolean) => boolean)) => {
    setLogisticsDashboardCollapsedByMode(prev => ({
      ...prev,
      [mode]: typeof next === 'function' ? next(prev[mode] ?? false) : next,
    }));
  };
  const setTableBarsCollapsed = (next: boolean | ((current: boolean) => boolean)) => {
    setTableBarsCollapsedByMode(prev => ({
      ...prev,
      [mode]: typeof next === 'function' ? next(prev[mode] ?? false) : next,
    }));
  };
  const setSchoolsBarCollapsed = (next: boolean | ((current: boolean) => boolean)) => {
    setSchoolsBarCollapsedByMode(prev => ({
      ...prev,
      [mode]: typeof next === 'function' ? next(prev[mode] ?? true) : next,
    }));
  };
  const setDashboardSchoolKey = (key: string) => {
    setDashboardSchoolByMode(prev => ({
      ...prev,
      [mode]: key,
    }));
  };
  const setDashboardMetric = (metric: LogisticsDashboardMetric) => {
    setDashboardMetricByMode(prev => ({
      ...prev,
      [mode]: metric,
    }));
  };
  const setDashboardVehicleFilter = (filter: LogisticsVehicleFilter) => {
    setDashboardVehicleFilterByMode(prev => ({
      ...prev,
      [mode]: filter,
    }));
  };

  useEffect(() => {
    load(!familiesRowsCache);
  }, []);

  useEffect(() => {
    if (dashboardMode !== 'drivers') return;
    void fetchV2Branches()
      .then(setDriverBranches)
      .catch(error => console.error('Branches load failed', error));
  }, [dashboardMode]);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const [families, transfers, drivers] = await Promise.all([
        fetchV2FamiliesTable(),
        fetchV2TransfersDashboard().catch(() => []),
        fetchV2DriversTable().catch(() => []),
      ]);
      const result = normalizeRows(families);
      familiesRowsCache = result;
      setRows(result);
      setDashboardTransfers(transfers);
      setDriverRows(drivers);
    } catch (error) {
      console.error('Families load failed', error);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function toggleExpandedFamily(key: React.Key | null, row?: ChildRow, initialTab: 'overview' | 'finance' = 'overview') {
    if (!key || !row) {
      setExpandedFamilyId(null);
      setExpandedFamily(null);
      setExpandedInitialTab('overview');
      return;
    }
    const familyId = String(key);
    if (expandedFamilyId === familyId && expandedInitialTab === initialTab) {
      setExpandedFamilyId(null);
      setExpandedFamily(null);
      setExpandedInitialTab('overview');
      return;
    }
    setExpandedInitialTab(initialTab);
    setExpandedFamilyId(familyId);
    const family = await fetchV2Family(familyId);
    if (family) setExpandedFamily(family);
  }

  async function handleCellSave(row: ChildRow, key: string, value: any): Promise<boolean> {
    try {
      if (['parentName', 'phone', 'secondPhone', 'contactName', 'contactPhone'].includes(key)) {
        const family = await fetchV2Family(row.familyId);
        if (!family) return false;
        const nextValue = key === 'parentName' || key === 'contactName'
          ? formatName(String(value))
          : formatPhone(String(value));
        const patch: Family = {
          ...family,
          parentName: key === 'parentName' ? nextValue : family.parentName,
          phone: key === 'phone' ? nextValue : family.phone,
          secondPhone: key === 'secondPhone' ? nextValue : family.secondPhone,
          contactName: key === 'contactName' ? nextValue : family.contactName,
          contactPhone: key === 'contactPhone' ? nextValue : family.contactPhone,
        };
        await updateV2Family(row.familyId, patch);
        setRows(prev => {
          const next = prev.map(item => (
            item.familyId === row.familyId ? { ...item, [key]: nextValue } : item
          ));
          familiesRowsCache = next;
          return next;
        });
      } else {
        const updates: Record<string, unknown> = {};
        const rowPatch: Partial<ChildRow> = {};
        if (key === 'childName') {
          updates.child_name = formatName(String(value));
          rowPatch.childName = updates.child_name as string;
        }
        if (key === 'childClass') updates.class_name = formatClassName(value);
        if (key === 'streetAddress') updates.address = String(value);
        if (key === 'distanceKm') updates.distance_km = value === '' ? null : Number(value);
        if (key === 'zone') updates.zone = value;
        if (key === 'vehicleLabel') updates.vehicle_type = value;
        if (key === 'stopNumber') updates.stop_order = value === '' ? null : Number(value);
        if (key === 'timeMorning') updates.time_morning = value || null;

        if (key === 'branchShort') {
          const branch = driverBranches.find(b => b.id === value);
          if (!branch) return false;
          updates.branch_id = branch.id;
          updates.school_id = branch.schoolId;
          updates.status = 'new';
          rowPatch.branchId = branch.id;
          rowPatch.branchShort = branch.shortName || branch.code;
          rowPatch.branchName = branch.name;
          rowPatch.status = 'new';
        }

        if (key === 'childClass') rowPatch.childClass = formatClassName(value);
        if (key === 'streetAddress') rowPatch.streetAddress = String(value);
        if (key === 'distanceKm') rowPatch.distanceKm = value === '' ? null : Number(value);
        if (key === 'zone') rowPatch.zone = value;
        if (key === 'vehicleLabel') {
          rowPatch.vehicleType = value;
          rowPatch.vehicleLabel = VT_LABEL[value as VehicleType] ?? value;
        }
        if (key === 'stopNumber') rowPatch.stopNumber = value || null;
        if (key === 'timeMorning') rowPatch.timeMorning = value || null;

        if (key === 'zone' || key === 'vehicleLabel') {
          const nextZone = (key === 'zone' ? value : row.zone) as Zone;
          const nextVehicle = (key === 'vehicleLabel' ? value : row.vehicleType) as VehicleType;
          const base = getPriceByZone(row.schoolCode as any, nextZone, nextVehicle);
          updates.base_price = base;
          updates.final_price = base;
          rowPatch.monthlyPrice = base;
        }

        if (key === 'transferNumber') {
          await updateV2ChildRoute({
            child: {
              id: row.rowId,
              familyId: row.familyId,
              childName: row.childName,
              class: row.childClass,
              selfExitAllowed: false,
              schoolCode: row.schoolCode as any,
              schoolId: row.schoolId ?? undefined,
              branchId: row.branchId ?? undefined,
              zone: row.zone as any,
              vehicleType: row.vehicleType as VehicleType,
            },
            vehicleType: row.vehicleType as VehicleType,
            transferNumber: value ? Number(value) : undefined,
            stopNumber: row.stopNumber ? Number(row.stopNumber) : undefined,
            timeMorning: row.timeMorning ?? undefined,
          });
          rowPatch.transferNumber = value || null;
        } else {
          await updateV2Child(row.rowId, updates);
        }
        setRows(prev => {
          const next = prev.map(item => (
            item.rowId === row.rowId ? { ...item, ...rowPatch } : item
          ));
          familiesRowsCache = next;
          return next;
        });
      }
      void load(false);
      if (expandedFamilyId === row.familyId) {
        void fetchV2Family(row.familyId).then(family => {
          if (family) setExpandedFamily(family ?? null);
        });
      }
      return true;
    } catch (error) {
      console.error('Cell save failed', { row, key, value, error });
      return false;
    }
  }

  async function savePendingActualDate(row: ChildRow, actualDate: string) {
    if (!row.pendingPaymentId) return;
    try {
      await updateFamilyPayment(row.pendingPaymentId, { actualPaymentDate: actualDate });
      setRows(prev => {
        const next = prev.map(item => (
          item.pendingPaymentId === row.pendingPaymentId ? { ...item, pendingActualPaymentDate: actualDate || null } : item
        ));
        familiesRowsCache = next;
        return next;
      });
    } catch (error) {
      console.error('Actual payment date save failed', error);
      alert('Не удалось сохранить дату поступления');
    }
  }

  async function confirmPendingPayment(row: ChildRow) {
    if (!row.pendingPaymentId) return;
    if (!row.pendingActualPaymentDate) {
      alert('Сначала укажите дату поступления');
      return;
    }
    const payment: FamilyPayment = {
      id: row.pendingPaymentId,
      familyId: row.familyId,
      amount: row.pendingPaymentAmount || row.pendingPayment,
      paymentType: (row.pendingPaymentType ?? 'cash') as any,
      paymentDate: row.pendingPaymentDate ?? row.pendingActualPaymentDate,
      actualPaymentDate: row.pendingActualPaymentDate,
      status: 'На проверке',
      comment: row.pendingPaymentComment ?? '',
      createdAt: '',
    };
    setConfirmingPaymentId(row.pendingPaymentId);
    try {
      await confirmFamilyPayment({
        payment,
        charges: [],
        confirmedBy: userName,
        actualPaymentDate: row.pendingActualPaymentDate,
      });
      await load(false);
    } catch (error) {
      console.error('Payment confirm failed', error);
      alert('Не удалось подтвердить платёж');
    } finally {
      setConfirmingPaymentId(null);
    }
  }

  async function rejectPendingPayment(row: ChildRow) {
    if (!row.pendingPaymentId) return;
    if (!window.confirm('Отклонить платёж?')) return;
    setConfirmingPaymentId(row.pendingPaymentId);
    try {
      await updateFamilyPayment(row.pendingPaymentId, { status: 'Отклонено' });
      await load(false);
    } catch (error) {
      console.error('Payment reject failed', error);
      alert('Не удалось отклонить платёж');
    } finally {
      setConfirmingPaymentId(null);
    }
  }

  async function changeDashboardTransferVehicleType(vehicleType: VehicleType | 'unassigned') {
    if (!transferTypeMenu) return;
    if (!selectedDashboardSchool || selectedDashboardSchool.key === 'ALL') {
      alert('Сначала выберите конкретную школу');
      setTransferTypeMenu(null);
      return;
    }
    const savedTransfer = dashboardTransfers.find(item =>
      item.transferNumber === transferTypeMenu.transferNumber
      && (
        item.branchCode === selectedDashboardSchool.key
        || item.branchShort === selectedDashboardSchool.label
        || item.branchId === dashboardSchoolRows.find(row => row.branchId)?.branchId
      )
    );
    const sampleRow = dashboardSchoolRows.find(row => row.branchId);
    const branchId = sampleRow?.branchId ?? savedTransfer?.branchId;
    const schoolId = sampleRow?.schoolId ?? savedTransfer?.schoolId;
    if (!branchId) {
      alert('Не удалось определить филиал школы для трансфера');
      setTransferTypeMenu(null);
      return;
    }
    try {
      if (vehicleType === 'unassigned') {
        await clearV2TransferVehicleType({
          branchId,
          transferNumber: Number(transferTypeMenu.transferNumber),
        });
        setDashboardTransfers(prev => prev.filter(item => !(
          item.branchId === branchId && item.transferNumber === transferTypeMenu.transferNumber
        )));
        setTransferTypeMenu(null);
        void load(false);
        return;
      }

      await updateV2TransferVehicleType({
        schoolId,
        branchId,
        transferNumber: Number(transferTypeMenu.transferNumber),
        vehicleType,
      });
      setDashboardTransfers(prev => prev.map(item => (
        item.branchId === branchId && item.transferNumber === transferTypeMenu.transferNumber
          ? { ...item, vehicleType }
          : item
      )));
      setRows(prev => {
        const next = prev.map(row => (
          row.branchId === branchId
          && row.transferNumber === transferTypeMenu.transferNumber
          && row.status !== 'rejected'
            ? { ...row, vehicleType, vehicleLabel: VT_LABEL[vehicleType] ?? vehicleType }
            : row
        ));
        familiesRowsCache = next;
        return next;
      });
      setTransferTypeMenu(null);
      void load(false);
    } catch (error) {
      console.error('Transfer vehicle type update failed', error);
      alert('Не удалось изменить тип транспорта трансфера');
      setTransferTypeMenu(null);
    }
  }

  const canManageProperties = userRole === 'admin';
  const canDeleteFamily = ['admin', 'gen_director', 'director'].includes(userRole ?? '');
  const modeRows = useMemo(() => (
    mode === 'logistics' ? logisticsWorkRows(rows) : rows
  ), [mode, rows]);

  // Если у сотрудника ограниченный доступ — фильтруем по его школам
  const hasSchoolRestriction = allowedSchools && allowedSchools.length > 0 && !allowedSchools.includes('ALL');

  // Проверяем доступна ли вкладка сотруднику (сравнение без учёта регистра)
  const isTabAllowed = useCallback((tabKey: string) => {
    if (!hasSchoolRestriction) return true;
    if (tabKey === 'ALL') return true;
    return allowedSchools!.some(k => k.toLowerCase() === tabKey.toLowerCase());
  }, [allowedSchools, hasSchoolRestriction]);

  const rowMatchesSchoolTab = useCallback((row: ChildRow, tabItem: typeof SCHOOL_TABS[number]) => {
    if (tabItem.key === 'ALL') return !hasSchoolRestriction || allowedSchools!.some(k => isTabAllowed(k));
    if (!isTabAllowed(tabItem.key)) return false;
    if (row.branchFilter === tabItem.key) return true;
    if (tabItem.branches.length > 0) return tabItem.branches.includes(row.branchName);
    if (tabItem.codes.length > 0) return tabItem.codes.includes(row.schoolCode);
    return false;
  }, [allowedSchools, hasSchoolRestriction, isTabAllowed]);

  const dashboardStatsForRows = useCallback((sourceRows: ChildRow[]) => {
    const actualRows = logisticsWorkRows(sourceRows);
    const workRows = dashboardVehicleFilter === 'all'
      ? actualRows
      : actualRows.filter(row => row.vehicleType === dashboardVehicleFilter);
    const transferRows = workRows.filter(row => row.transferNumber);
    const allTransfers = new Set(transferRows.map(row => row.transferNumber));
    const averageRows = transferRows;
    const averageTransfers = allTransfers;
    const familyRows = uniqueFamilyRows(workRows);
    const debtRows = familyRows.filter(row => row.debtAmount > 0);
    const pendingFamilyRows = uniqueFamilyRows(workRows.filter(row => row.pendingPayment > 0));
    return {
      transferCount: allTransfers.size,
      studentCount: workRows.length,
      average: averageTransfers.size ? averageRows.length / averageTransfers.size : 0,
      chargedSum: workRows.reduce((sum, row) => sum + Number(row.totalCharged || 0), 0),
      paidSum: workRows.reduce((sum, row) => sum + Number(row.totalPaid || 0), 0),
      balanceSum: workRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
      debtorsCount: debtRows.length,
      debtSum: debtRows.reduce((sum, row) => sum + Number(row.debtAmount || 0), 0),
      pendingSum: pendingFamilyRows.length,
    };
  }, [dashboardVehicleFilter]);
  const dashboardMetricValue = useCallback((stats: ReturnType<typeof dashboardStatsForRows>) => {
    if (dashboardMetric === 'count') return stats.studentCount;
    if (dashboardMetric === 'debtSum') return stats.debtSum;
    if (dashboardMetric === 'debtorsCount') return stats.debtorsCount;
    if (dashboardMetric === 'chargedSum') return stats.chargedSum;
    if (dashboardMetric === 'paidSum') return stats.paidSum;
    if (dashboardMetric === 'balanceSum') return stats.balanceSum;
    if (dashboardMetric === 'pendingSum') return stats.pendingSum;
    return stats.average;
  }, [dashboardMetric]);

  const { branchMetric, branchStats } = useMemo(() => {
    const metric: Record<string, { value: number; label: string; alert?: boolean }> = {};
    const stats: Record<string, { newCount: number; totalCount: number; average: string; debtorsCount: number; debtSum: number }> = {};
    const workRows = logisticsWorkRows(rows);

    SCHOOL_TABS.forEach(tabItem => {
      const branchRows = tabItem.key === 'ALL'
        ? rows
        : rows.filter(row => rowMatchesSchoolTab(row, tabItem));
      const actualBranchRows = logisticsWorkRows(branchRows);
      const familyRows = uniqueFamilyRows(actualBranchRows);
      const debtRows = familyRows.filter(row => row.debtAmount > 0);
      const avg = tabItem.key === 'ALL'
        ? averageChildrenByVehicle(workRows, 'microbus')
        : averageMicrobusByBranch(workRows, tabItem.key);

      stats[tabItem.key] = {
        newCount: branchRows.filter(row => row.status === 'new').length,
        totalCount: actualBranchRows.length,
        average: avg ? avg.toFixed(1) : '0',
        debtorsCount: debtRows.length,
        debtSum: debtRows.reduce((sum, row) => sum + row.debtAmount, 0),
      };

      if (mode === 'requests') {
        const count = branchRows.filter(row => row.status === 'new').length;
        metric[tabItem.key] = { value: count, label: String(count), alert: count > 0 };
      } else if (mode === 'payments') {
        const debt = uniqueFamilyRows(branchRows.filter(row => row.debtAmount > 0)).reduce((sum, row) => sum + row.debtAmount, 0);
        metric[tabItem.key] = { value: debt, label: compactMoney(debt), alert: debt > 0 };
      } else if (mode === 'cashier') {
        const pendingRows = uniqueFamilyRows(branchRows.filter(row => row.pendingPayment > 0));
        metric[tabItem.key] = { value: pendingRows.length, label: String(pendingRows.length), alert: pendingRows.length > 0 };
      } else {
        metric[tabItem.key] = { value: avg, label: avg ? avg.toFixed(1) : '0' };
      }
    });

    return { branchMetric: metric, branchStats: stats };
  }, [mode, rowMatchesSchoolTab, rows]);

  const tab = useMemo(() => SCHOOL_TABS.find(t => t.key === activeTab), [activeTab]);
  const matchesSchool = useCallback((r: ChildRow) => {
    if (!tab) return true;
    return rowMatchesSchoolTab(r, tab);
  }, [rowMatchesSchoolTab, tab]);
  const matchesSearch = useCallback((r: ChildRow) => {
    if (search) {
      const q = search.toLowerCase().replace(/\s+/g, '');
      const haystack = Object.values(r)
        .map(value => String(value ?? '').toLowerCase())
        .join(' ')
        .replace(/\s+/g, '');
      if (!haystack.includes(q)) return false;
    }
    return true;
  }, [search]);
  const transferMetric = useMemo(() => {
    const metric: Record<string, { value: number; label: string; alert?: boolean }> = {};

    TRANSFER_BAR_OPTIONS.forEach(transfer => {
      const transferRows = rows.filter(row => row.transferNumber === transfer && matchesSchool(row) && matchesSearch(row));
      if (mode === 'payments') {
        const debt = uniqueFamilyRows(transferRows.filter(row => row.debtAmount > 0)).reduce((sum, row) => sum + row.debtAmount, 0);
        metric[transfer] = { value: debt, label: compactMoney(debt), alert: debt > 0 };
      } else if (mode === 'cashier') {
        const pendingRows = uniqueFamilyRows(transferRows.filter(row => row.pendingPayment > 0));
        metric[transfer] = { value: pendingRows.length, label: String(pendingRows.length), alert: pendingRows.length > 0 };
      } else {
        const count = logisticsWorkRows(transferRows).length;
        metric[transfer] = { value: count, label: String(count), alert: count > 0 };
      }
    });

    const emptyRows = rows.filter(row => !row.transferNumber && matchesSchool(row) && matchesSearch(row));
    if (mode === 'logistics') {
      const workRows = logisticsWorkRows(emptyRows);
      metric.empty = { value: workRows.length, label: String(workRows.length), alert: workRows.length > 0 };
    } else if (mode === 'payments') {
      const debt = uniqueFamilyRows(emptyRows.filter(row => row.debtAmount > 0)).reduce((sum, row) => sum + row.debtAmount, 0);
      metric.empty = { value: debt, label: compactMoney(debt), alert: debt > 0 };
    } else if (mode === 'cashier') {
      const pendingRows = uniqueFamilyRows(emptyRows.filter(row => row.pendingPayment > 0));
      metric.empty = { value: pendingRows.length, label: String(pendingRows.length), alert: pendingRows.length > 0 };
    } else {
      const count = emptyRows.length;
      metric.empty = { value: count, label: String(count), alert: count > 0 };
    }
    return metric;
  }, [matchesSchool, matchesSearch, mode, rows]);

  const filtered = useMemo(() => modeRows.filter(r => {
    if (!matchesSchool(r)) return false;
    if (!matchesSearch(r)) return false;
    if (mode === 'cashier' && r.pendingPayment <= 0) return false;
    if (quickTransfer === 'empty' && r.transferNumber) return false;
    if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
    if (quickChildStatus === 'transfered' && !r.transferNumber) return false;
    if (quickChildStatus && quickChildStatus !== 'transfered' && r.status !== quickChildStatus) return false;
    if (quickPaymentStatus && r.paymentStatus !== quickPaymentStatus) return false;
    return true;
  }), [matchesSchool, matchesSearch, mode, modeRows, quickChildStatus, quickPaymentStatus, quickTransfer]);

  const transferVehicleType = useCallback((transfer: string) => {
    if (!transfer || transfer === 'empty') return 'empty';
    const transferRows = rows.filter(row => row.transferNumber === transfer && matchesSchool(row) && matchesSearch(row));
    return transferRows.find(row => row.vehicleType === 'microbus')?.vehicleType
      ?? transferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
      ?? transferRows.find(row => row.vehicleType === 'sedan')?.vehicleType
      ?? 'empty';
  }, [matchesSchool, matchesSearch, rows]);

  const transferVehicleTone = useCallback((transfer: string) => {
    const vehicleType = transferVehicleType(transfer);
    return TRANSFER_TONE[vehicleType] ?? TRANSFER_TONE.empty;
  }, [transferVehicleType]);
  const quickStatusItems = useMemo(() => [
    {
      key: 'new',
      label: '?',
      title: 'Новые',
      count: rows.filter(row => row.status === 'new' && matchesSchool(row) && matchesSearch(row)).length,
      tone: '#31A4A5',
    },
    {
      key: 'rejected',
      label: '×',
      title: 'Отказ',
      count: rows.filter(row => row.status === 'rejected' && matchesSchool(row) && matchesSearch(row)).length,
      tone: '#64748B',
    },
  ], [matchesSchool, matchesSearch, rows]);
  const schoolButtonItems = SCHOOL_TABS;
  const selectedSchoolLabel = tab?.label ?? 'Все';
  const selectedTransferLabel = quickChildStatus === 'new'
    ? 'Новые'
    : quickChildStatus === 'rejected'
      ? 'Отказ'
      : quickTransfer === 'empty'
        ? 'Без трансфера'
        : quickTransfer
          ? `Трансфер ${quickTransfer}`
          : 'Все трансферы';
  const logisticsAvgItems = useMemo(() => schoolButtonItems
    .map((item, index) => {
      const itemRows = item.key === 'ALL' ? rows : rows.filter(row => rowMatchesSchoolTab(row, item));
      const value = dashboardMode === 'drivers'
        ? new Set(logisticsWorkRows(itemRows).map(row => row.driverId).filter(Boolean)).size
        : dashboardMetricValue(dashboardStatsForRows(itemRows));
      return {
        key: item.key,
        label: item.key === 'ALL' ? '≡' : item.label,
        value,
        color: LOGISTICS_CHART_COLORS[index % LOGISTICS_CHART_COLORS.length],
      };
    }), [dashboardMetricValue, dashboardMode, dashboardStatsForRows, rowMatchesSchoolTab, rows, schoolButtonItems]);
  const selectedDashboardSchool = schoolButtonItems.find(item => item.key === dashboardSchoolKey)
    ?? schoolButtonItems.find(item => item.key === activeTab)
    ?? schoolButtonItems[0];
  const dashboardSchoolRows = useMemo(() => (
    selectedDashboardSchool
      ? rows.filter(row => rowMatchesSchoolTab(row, selectedDashboardSchool))
      : []
  ), [rowMatchesSchoolTab, rows, selectedDashboardSchool]);
  const dashboardWorkRows = logisticsWorkRows(dashboardSchoolRows);
  const dashboardVehicleRows = dashboardVehicleFilter === 'all'
    ? dashboardWorkRows
    : dashboardWorkRows.filter(row => row.vehicleType === dashboardVehicleFilter);
  const dashboardTransferItems: LogisticsTransferDashboardItem[] = selectedDashboardSchool
    ? [
        ...TRANSFER_BAR_OPTIONS.map(transfer => {
          const transferRows = dashboardVehicleRows.filter(row => row.transferNumber === transfer);
          const originalTransferRows = dashboardWorkRows.filter(row => row.transferNumber === transfer);
          const count = transferRows.length;
          const savedTransfer = dashboardTransfers.find(item =>
            item.transferNumber === transfer
            && selectedDashboardSchool
            && (
              selectedDashboardSchool.key === 'ALL'
              || item.branchId === originalTransferRows.find(row => row.branchId)?.branchId
              || item.branchCode === selectedDashboardSchool.key
              || item.branchShort === selectedDashboardSchool.label
            )
          );
          const vehicleType = savedTransfer?.vehicleType
            ?? originalTransferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
            ?? originalTransferRows.find(row => row.vehicleType === 'sedan')?.vehicleType
            ?? originalTransferRows.find(row => row.vehicleType === 'microbus')?.vehicleType;
          const driverMode = dashboardMode === 'drivers';
          return {
            key: `transfer-${transfer}`,
            label: `#${transfer}`,
            group: 'Трансферы',
            value: driverMode && vehicleType ? 1 : count,
            count: driverMode && vehicleType ? 1 : count,
            color: driverMode && vehicleType ? (logisticsVehicleTypeLineColor(vehicleType) ?? '#31A4A5') : logisticsTransferCountColor(count),
            vehicleType,
          };
        }),
        ...(dashboardMode === 'drivers' ? [] : [{
          key: 'new',
          label: '?',
          group: 'Статус',
          value: dashboardVehicleRows.filter(row => row.status === 'new').length,
          count: dashboardVehicleRows.filter(row => row.status === 'new').length,
          color: '#5A9FE8',
        },
        {
          key: 'rejected',
          label: 'X',
          group: 'Статус',
          value: dashboardSchoolRows.filter(row => row.status === 'rejected').length,
          count: dashboardSchoolRows.filter(row => row.status === 'rejected').length,
          color: '#EF7168',
        }]),
      ]
    : [];
  const activeDashboardDetailKey = quickChildStatus === 'new' || quickChildStatus === 'rejected'
    ? quickChildStatus
    : quickTransfer
      ? `transfer-${quickTransfer}`
      : 'all';
  const dashboardSummaryRows = (() => {
    if (quickChildStatus === 'new') return dashboardSchoolRows.filter(row => row.status === 'new');
    if (quickChildStatus === 'rejected') return dashboardSchoolRows.filter(row => row.status === 'rejected');
    if (quickTransfer === 'empty') return dashboardSchoolRows.filter(row => !row.transferNumber);
    if (quickTransfer) return dashboardSchoolRows.filter(row => row.transferNumber === quickTransfer);
    return dashboardSchoolRows;
  })();
  const dashboardSummaryStats = dashboardStatsForRows(dashboardSummaryRows);
  const allowedMetrics = METRICS_BY_ROLE[userRole] ?? METRICS_BY_ROLE.admin;
  const visibleDashboardMetrics = LOGISTICS_DASHBOARD_METRICS.filter(m => allowedMetrics.includes(m.key));
  const dashboardMetricOptions = dashboardMode === 'drivers'
    ? [{ key: 'count' as LogisticsDashboardMetric, label: 'Водители' }]
    : visibleDashboardMetrics;
  const dashboardDisplayMetric = dashboardMode === 'drivers'
    ? 'count' as LogisticsDashboardMetric
    : (allowedMetrics.includes(dashboardMetric) ? dashboardMetric : allowedMetrics[0]);
  const dashboardPrimaryValue = dashboardMode === 'drivers'
    ? new Set(logisticsWorkRows(dashboardSummaryRows).map(row => row.driverId).filter(Boolean)).size
    : dashboardMetricValue(dashboardSummaryStats);
  const dashboardSummaryItems = [
    ...(dashboardMode === 'drivers' ? (() => {
      const selectedTransfers = dashboardTransfers.filter(item =>
        selectedDashboardSchool?.key === 'ALL'
        || item.branchCode === selectedDashboardSchool?.key
        || item.branchShort === selectedDashboardSchool?.label
        || dashboardSchoolRows.some(row => row.branchId === item.branchId)
      );
      return [
        { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
        { label: 'Микроавтобус', value: String(selectedTransfers.filter(item => item.vehicleType === 'microbus').length) },
        { label: 'Минивэн', value: String(selectedTransfers.filter(item => item.vehicleType === 'minivan').length) },
        { label: 'Седан', value: String(selectedTransfers.filter(item => item.vehicleType === 'sedan').length) },
      ];
    })() : [
      { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
      { label: 'К-во трансфер', value: String(dashboardSummaryStats.transferCount) },
      { label: 'К-во учеников', value: String(dashboardSummaryStats.studentCount) },
      ...(allowedMetrics.includes('average') ? [{ label: 'Средний', value: dashboardSummaryStats.average.toFixed(1) }] : []),
      ...(allowedMetrics.includes('pendingSum') ? [{ label: 'На проверке', value: String(dashboardSummaryStats.pendingSum) }] : []),
      ...(allowedMetrics.includes('chargedSum') ? [{ label: 'Начислено', value: compactMoney(dashboardSummaryStats.chargedSum) }] : []),
      ...(allowedMetrics.includes('debtorsCount') ? [{ label: 'Должники', value: String(dashboardSummaryStats.debtorsCount) }] : []),
      ...(allowedMetrics.includes('debtSum') ? [{ label: 'Долг', value: compactMoney(dashboardSummaryStats.debtSum) }] : []),
    ]),
  ];
  const filteredDriverRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return driverRows.filter(row => {
      const schoolMatch = !selectedDashboardSchool
        || selectedDashboardSchool.key === 'ALL'
        || row.branchCodes.includes(selectedDashboardSchool.key)
        || row.branchShorts.includes(selectedDashboardSchool.label)
        || row.branchNames.includes(selectedDashboardSchool.label)
        || dashboardSchoolRows.some(schoolRow => row.branchIds.includes(String(schoolRow.branchId ?? '')));
      if (!schoolMatch) return false;
      if (dashboardVehicleFilter !== 'all' && row.vehicleType !== dashboardVehicleFilter) return false;
      if (!q) return true;
      return [
        row.fullName,
        row.phone,
        row.secondPhone,
        row.status,
        row.vehicleLabel,
        row.plateNumber,
        row.brand,
        row.model,
        row.transferNumbers,
        row.branchShorts.join(' '),
        row.address,
        row.comment,
      ].some(value => String(value ?? '').toLowerCase().includes(q));
    });
  }, [dashboardSchoolRows, dashboardVehicleFilter, driverRows, search, selectedDashboardSchool]);
  const selectedDriver = selectedDriverId
    ? driverRows.find(row => row.driverId === selectedDriverId) ?? null
    : null;
  const selectedDriverChildren = useMemo(() => (
    selectedDriverId
      ? rows
          .filter(row => row.driverId === selectedDriverId && row.status !== 'rejected' && row.childName)
          .sort((a, b) => Number(a.stopNumber ?? 999) - Number(b.stopNumber ?? 999))
      : []
  ), [rows, selectedDriverId]);
  const selectedDriverFinanceRows = useMemo<DriverFinanceRow[]>(() => (
    DRIVER_FINANCE_MONTHS.map(month => ({
      month,
      days: 0,
      rate: 0,
      fines: 0,
      penalties: 0,
      accrued: 0,
      advances: 0,
      paid: 0,
      balance: 0,
    }))
  ), []);
  const selectedDriverFinanceTotals = useMemo(() => (
    selectedDriverFinanceRows.reduce((totals, row) => ({
      days: totals.days + row.days,
      rate: totals.rate + row.rate,
      fines: totals.fines + row.fines,
      penalties: totals.penalties + row.penalties,
      accrued: totals.accrued + row.accrued,
      advances: totals.advances + row.advances,
      paid: totals.paid + row.paid,
      balance: totals.balance + row.balance,
    }), {
      days: 0,
      rate: 0,
      fines: 0,
      penalties: 0,
      accrued: 0,
      advances: 0,
      paid: 0,
      balance: 0,
    })
  ), [selectedDriverFinanceRows]);
  const selectedTransferVehicleType = transferTypeMenu
    ? dashboardTransfers.find(item =>
        item.transferNumber === transferTypeMenu.transferNumber
        && selectedDashboardSchool
        && (
          item.branchCode === selectedDashboardSchool.key
          || item.branchShort === selectedDashboardSchool.label
          || item.branchId === dashboardSchoolRows.find(row => row.branchId)?.branchId
        )
      )?.vehicleType
      ?? dashboardWorkRows.find(row => row.transferNumber === transferTypeMenu.transferNumber && row.vehicleType === 'minivan')?.vehicleType
      ?? dashboardWorkRows.find(row => row.transferNumber === transferTypeMenu.transferNumber && row.vehicleType === 'sedan')?.vehicleType
      ?? dashboardWorkRows.find(row => row.transferNumber === transferTypeMenu.transferNumber && row.vehicleType === 'microbus')?.vehicleType
    : undefined;
  const selectedTransferCard = useMemo<TransferCardData | null>(() => {
    if (!transferCardNumber || !selectedDashboardSchool) return null;
    const relatedRows = dashboardSchoolRows.filter(row => row.transferNumber === transferCardNumber && row.status !== 'rejected');
    const schoolTransfer = dashboardTransfers.find(item =>
      item.transferNumber === transferCardNumber
      && (
        selectedDashboardSchool.key === 'ALL'
        || item.branchCode === selectedDashboardSchool.key
        || item.branchShort === selectedDashboardSchool.label
        || relatedRows.some(row => row.branchId === item.branchId)
      )
    );
    const fallbackTransfer = dashboardTransfers.find(item => item.transferNumber === transferCardNumber);
    const sampleRow = relatedRows[0];
    const transfer: V2TransferDashboardRow = schoolTransfer ?? fallbackTransfer ?? {
      id: `transfer-${selectedDashboardSchool.key}-${transferCardNumber}`,
      schoolId: sampleRow?.schoolId ?? null,
      branchId: sampleRow?.branchId ?? null,
      branchCode: sampleRow?.schoolCode ?? selectedDashboardSchool.key,
      branchShort: sampleRow?.branchShort ?? selectedDashboardSchool.label,
      branchName: sampleRow?.branchName ?? selectedDashboardSchool.label,
      transferNumber: transferCardNumber,
      vehicleType: (sampleRow?.vehicleType || 'microbus') as VehicleType,
      driverId: sampleRow?.driverId ?? null,
      createdAt: '',
      updatedAt: '',
    };
    const driver = transfer.driverId
      ? driverRows.find(item => item.driverId === transfer.driverId)
      : undefined;
    const history = driver
      ? [{
          driverName: driver.fullName || 'Без имени',
          phone: driver.phone || '-',
          startDate: formatDateShort(transfer.createdAt),
          endDate: '-',
          status: 'Действует',
        }]
      : [];

    return {
      transfer,
      driver,
      childrenCount: relatedRows.length,
      history,
    };
  }, [dashboardSchoolRows, dashboardTransfers, driverRows, selectedDashboardSchool, transferCardNumber]);
  const tableQuickSelectStyle: React.CSSProperties = {
    height: 26,
    minWidth: 124,
    padding: '0 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: '#fff',
    color: 'var(--text)',
    fontSize: 12,
    fontWeight: 600,
    outline: 'none',
  };
  const getSchoolSwitchFilters = useCallback((schoolKey: string): Partial<ModeFilters> => {
    if (userRole === 'manager' || userRole === 'logist') {
      return { activeTab: schoolKey, quickChildStatus: 'new', quickTransfer: '' };
    }
    if (mode === 'cashier') {
      const tab = SCHOOL_TABS.find(t => t.key === schoolKey);
      const schoolRows = tab ? rows.filter(r => rowMatchesSchoolTab(r, tab)) : rows;
      const counts: Record<string, number> = {};
      uniqueFamilyRows(schoolRows.filter(r => r.pendingPayment > 0)).forEach(r => {
        if (r.transferNumber) counts[r.transferNumber] = (counts[r.transferNumber] || 0) + 1;
      });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return { activeTab: schoolKey, quickTransfer: best?.[0] ?? '', quickChildStatus: '' };
    }
    return { activeTab: schoolKey, quickChildStatus: '', quickTransfer: '' };
  }, [mode, rows, rowMatchesSchoolTab, userRole]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tableColumns: ColumnDef<ChildRow>[] = useMemo(() => [
    {
      key: 'openCard',
      label: 'Оплата',
      type: 'text',
      category: 'Действия',
      width: 80,
      sortable: false,
      filterable: false,
      showInProperties: true,
      render: (_value, row) => (
        row.isFirstChild ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleExpandedFamily(row.familyId, row, 'finance');
            }}
            style={{
              height: 22,
              padding: '0 9px',
              border: '1px solid #D4E3E7',
              borderRadius: 6,
              background: '#fff',
              color: '#237F81',
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Оплата
          </button>
        ) : null
      ),
      getValue: () => '',
    },
    {
      key: 'pendingPaymentReviewAmount',
      label: 'Сумма платежа',
      type: 'currency',
      category: 'Кассир',
      width: 125,
      visible: mode === 'cashier',
      render: (_value, row) => row.isFirstChild && row.pendingPaymentId ? (
        <span style={{ fontSize: 13, fontWeight: 800, color: '#065F46' }}>
          {money(row.pendingPaymentAmount || row.pendingPayment)}
        </span>
      ) : <span style={{ color: 'var(--text-2)' }}>—</span>,
      getValue: (row) => row.pendingPaymentAmount || row.pendingPayment || 0,
    },
    {
      key: 'pendingActualPaymentDate',
      label: 'Дата поступления',
      type: 'date',
      category: 'Кассир',
      width: 135,
      visible: mode === 'cashier',
      render: (_value, row) => row.isFirstChild && row.pendingPaymentId ? (
        <input
          type="date"
          value={row.pendingActualPaymentDate ?? ''}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => savePendingActualDate(row, event.target.value)}
          style={{
            width: 118,
            height: 26,
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '0 6px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            background: '#fff',
          }}
        />
      ) : <span style={{ color: 'var(--text-2)' }}>—</span>,
      getValue: (row) => row.pendingActualPaymentDate ?? '',
    },
    {
      key: 'confirmPayment',
      label: 'Подтверждение',
      type: 'text',
      category: 'Кассир',
      width: 220,
      visible: mode === 'cashier',
      render: (_value, row) => {
        const disabled = !row.isFirstChild || !row.pendingPaymentId || confirmingPaymentId === row.pendingPaymentId;
        if (!row.isFirstChild || !row.pendingPaymentId) return <span style={{ color: 'var(--text-2)' }}>—</span>;
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                confirmPendingPayment(row);
              }}
              style={{
                height: 26,
                padding: '0 10px',
                border: 'none',
                borderRadius: 6,
                background: disabled ? '#CBD5E1' : '#10B981',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                cursor: disabled ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {confirmingPaymentId === row.pendingPaymentId ? '...' : 'Подтвердить'}
            </button>
            <button
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                rejectPendingPayment(row);
              }}
              style={{
                height: 26,
                padding: '0 10px',
                border: 'none',
                borderRadius: 6,
                background: disabled ? '#CBD5E1' : '#FEE2E2',
                color: disabled ? '#fff' : '#991B1B',
                fontSize: 11,
                fontWeight: 800,
                cursor: disabled ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Отклонить
            </button>
          </div>
        );
      },
      getValue: (row) => row.pendingPaymentId ? 'На проверке' : '',
    },
    ...COLUMNS.map(col => {
      if (col.key !== 'branchShort') return col;
      const canEditSchool = ['admin', 'gen_director', 'director'].includes(userRole ?? '');
      if (!canEditSchool) return col;
      return {
        ...col,
        editable: true,
        options: driverBranches.map(b => ({ value: b.id, label: b.shortName || b.code })),
        getValue: (row: ChildRow) => row.branchId ?? '',
      };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [userRole, driverBranches]);

  return (
    <div style={{ height: '100%', overflow: 'hidden', background: 'var(--active-bg)', borderRadius: 22, display: 'flex' }}>

      {/* ── ОСНОВНОЙ КОНТЕНТ ── */}
      <div
        className="no-scrollbar"
        onClick={() => {
          if (!schoolsBarCollapsed) setSchoolsBarCollapsed(true);
          if (transferTypeMenu) setTransferTypeMenu(null);
        }}
        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 8px 8px', minHeight: '100%', overflowY: 'auto', overflowX: 'hidden' }}
      >

        {dashboardMode !== 'drivers' && <LogisticsMicrobusDashboard
          items={logisticsAvgItems}
          collapsed={logisticsDashboardCollapsed}
          onToggle={() => setLogisticsDashboardCollapsed(value => !value)}
          selectedKey={selectedDashboardSchool?.key}
          onSelect={(key) => {
            if (key === 'ALL') return;
            setDashboardSchoolKey(key);
            setModeFilter(getSchoolSwitchFilters(key));
            setLogisticsDashboardCollapsed(false);
          }}
          metric={dashboardDisplayMetric}
          onMetricChange={setDashboardMetric}
          metricOptions={dashboardMetricOptions}
          vehicleFilter={dashboardVehicleFilter}
          onVehicleFilterChange={setDashboardVehicleFilter}
          summaryItems={dashboardSummaryItems}
          primaryValue={dashboardPrimaryValue}
          detailItems={dashboardTransferItems}
          detailValueMode={'count'}
          showMetricFilter={true}
          activeDetailKey={activeDashboardDetailKey}
          onDetailSelect={(item) => {
            if (item.key === 'all') {
              setModeFilter({ quickTransfer: '', quickChildStatus: '' });
              return;
            }
            if (item.key === 'new' || item.key === 'rejected') {
              setModeFilter({ quickChildStatus: item.key, quickTransfer: '' });
              return;
            }
            if (item.key.startsWith('transfer-')) {
              const transferNumber = item.key.replace('transfer-', '');
              setModeFilter({ quickTransfer: transferNumber, quickChildStatus: '' });
            }
          }}
          onDetailContextMenu={(event, item) => {
            event.preventDefault();
            event.stopPropagation();
            const transferNumber = item.key.replace('transfer-', '');
            setTransferTypeMenu({
              x: event.clientX,
              y: event.clientY,
              transferNumber,
            });
          }}
        />}

        {/* ── ТАБЛИЦА ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'visible', minWidth: 0 }}>
          {dashboardMode !== 'drivers' && !tableBarsCollapsed ? (
          <div className="no-scrollbar" style={{
            position: 'relative',
            top: 'auto',
            zIndex: 35,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 4,
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '4px 8px 0',
            marginBottom: -1,
            background: '#F5FAFB',
            border: '1px solid #D4E3E7',
            borderBottom: 'none',
            borderRadius: '10px 10px 0 0',
            scrollbarWidth: 'none',
            flexShrink: 0,
          }}>
            <span style={{
              height: 31,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 10px',
              borderRadius: '8px 8px 0 0',
              background: '#fff',
              color: '#17222F',
              fontSize: 13,
              fontWeight: 850,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              <span style={{ color: '#31A4A5', fontWeight: 900 }}>{MODE_LABEL[mode]}</span>
              <span style={{ color: '#C8D8DC' }}>·</span>
              {selectedSchoolLabel}
              <span style={{ color: '#C8D8DC' }}>·</span>
              {selectedTransferLabel}
            </span>
            <div style={{ width: 54, flexShrink: 0 }} />
            {TRANSFER_TABS.map(tabItem => {
              const isActive = quickTransfer === tabItem.key && quickChildStatus === '';
              const metric = tabItem.key ? transferMetric[tabItem.key] : { value: filtered.length, label: String(filtered.length), alert: filtered.length > 0 };
              const vehicleType = transferVehicleType(tabItem.key);
              const vehicleLabel = vehicleTypeShortLabel(vehicleType);
              const tone = transferVehicleTone(tabItem.key);
              const isActual = Boolean(metric?.value);
              return (
                <button
                  key={tabItem.key || 'all'}
                  onClick={() => setModeFilter({ quickTransfer: tabItem.key, quickChildStatus: '' })}
                  title={tabItem.label}
                  style={{
                    height: 34,
                    minWidth: tabItem.key === 'empty' ? 94 : tabItem.key === '' ? 46 : 36,
                    padding: tabItem.key === 'empty' ? '0 10px' : '3px 8px 2px',
                    border: '1px solid transparent',
                    borderBottomColor: 'transparent',
                    borderRadius: '8px 8px 0 0',
                    background: isActive
                      ? '#fff'
                      : isActual
                        ? '#F5FAFB'
                        : 'repeating-linear-gradient(-45deg, #F5FAFB 0, #F5FAFB 6px, #E7EFF2 6px, #E7EFF2 8px)',
                    color: isActive ? '#17222F' : isActual ? '#626C8B' : '#9AA7AE',
                    fontSize: 12,
                    fontWeight: isActive ? 800 : isActual ? 650 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    boxShadow: 'none',
                    opacity: isActive || isActual ? 1 : 0.78,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ lineHeight: 1, fontWeight: 850 }}>#{tabItem.label}</span>
                  <span style={{
                    minHeight: 8,
                    color: isActual ? tone.dot : '#AEBAB7',
                    fontSize: 7,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}>
                    {vehicleLabel || ' '}
                  </span>
                </button>
              );
            })}
            <div style={{ width: 54, height: 22, flexShrink: 0 }} />
            {quickStatusItems.map(item => {
              const isActive = quickChildStatus === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setModeFilter({ quickChildStatus: isActive ? '' : item.key, quickTransfer: '' })}
                  title={item.title}
                  style={{
                    width: 31,
                    height: 31,
                    border: '1px solid transparent',
                    borderBottomColor: 'transparent',
                    borderRadius: '8px 8px 0 0',
                    background: isActive ? '#fff' : '#F5FAFB',
                    color: isActive ? item.tone : '#626C8B',
                    fontSize: item.key === 'rejected' ? 17 : 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: item.count > 0 ? item.tone : '#B7C3C0',
                    opacity: item.count > 0 ? 0.95 : 0.55,
                  }} />
                  {item.label}
                </button>
              );
            })}
            <button
              onClick={() => setModeFilter({ quickTransfer: '', quickChildStatus: '' })}
              style={{
                height: 31,
                width: 31,
                padding: 0,
                border: '1px solid transparent',
                borderBottomColor: 'transparent',
                borderRadius: '8px 8px 0 0',
                background: quickTransfer === '' && quickChildStatus === '' ? '#fff' : '#F5FAFB',
                color: quickTransfer === '' && quickChildStatus === '' ? '#17222F' : '#626C8B',
                fontSize: 15,
                fontWeight: 750,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              ≡
            </button>
            <div style={{ flex: 1, minWidth: 8 }} />
            <button
              onClick={() => setTableBarsCollapsed(true)}
              title="Скрыть панели"
              style={{
                width: 31,
                height: 31,
                border: '1px solid transparent',
                borderRadius: '8px 8px 0 0',
                background: '#F5FAFB',
                color: '#626C8B',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ChevronUp size={15} />
            </button>
          </div>
          ) : dashboardMode !== 'drivers' ? (
            <div style={{
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '0 8px',
              background: '#F5FAFB',
              border: '1px solid #D4E3E7',
              borderBottom: 'none',
              borderRadius: '10px 10px 0 0',
              flexShrink: 0,
            }}>
              <span style={{
                height: 18,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '0 8px',
                borderRadius: 8,
                background: '#fff',
                color: '#17222F',
                fontSize: 12,
                fontWeight: 850,
                whiteSpace: 'nowrap',
              }}>
                <span style={{ color: '#31A4A5' }}>{MODE_LABEL[mode]}</span>
                <span style={{ color: '#D4E3E7' }}>·</span>
                {selectedSchoolLabel}
                <span style={{ color: '#D4E3E7' }}>·</span>
                {selectedTransferLabel}
              </span>
              <button
                onClick={() => setTableBarsCollapsed(false)}
                title="Показать панели"
                style={{
                  width: 22,
                  height: 18,
                  border: 'none',
                  borderRadius: 8,
                  background: 'transparent',
                  color: '#626C8B',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <ChevronDown size={15} />
              </button>
            </div>
          ) : null}
          {dashboardMode === 'drivers' ? (
            <DataTable<V2DriverTableRow>
              key="drivers_table"
              columns={DRIVER_COLUMNS}
              data={filteredDriverRows}
              rowKey="rowId"
              storageKey="drivers_table_by_school"
              loading={loading}
              emptyText="Водители не найдены"
              canManageProperties={canManageProperties}
              onRowOpen={(row) => {
                setSelectedDriverTab('main');
                setSelectedDriverId(row.driverId);
              }}
              hideToolbar={false}
              toolbarExtra={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
                    <Search size={14} style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-2)',
                      pointerEvents: 'none',
                    }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="ФИО, телефон, трансфер, авто..."
                      style={{
                        width: '100%',
                        height: 26,
                        padding: '0 10px 0 30px',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        fontSize: 12,
                        fontWeight: 600,
                        background: '#fff',
                        outline: 'none',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </div>
              )}
              toolbarRightExtra={(
                <button
                  onClick={() => setShowNewDriver(true)}
                  title="Новый водитель"
                  style={{
                    width: 30,
                    height: 30,
                    border: 'none',
                    borderRadius: 10,
                    background: '#31A4A5',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={16} />
                </button>
              )}
            />
          ) : (
            <DataTable<ChildRow>
              key={`families_table_${mode}`}
              columns={tableColumns}
              data={filtered}
              rowKey="rowId"
              storageKey={`families_table_${mode}`}
              loading={loading}
              emptyText="Заявок не найдено"
              canManageProperties={canManageProperties}
              onRowOpen={(row) => toggleExpandedFamily(row.familyId, row, 'overview')}
              onRowDelete={canDeleteFamily ? async (row) => {
                if (!window.confirm(`Удалить семью "${row.parentName}" со всеми детьми и данными? Это необратимо.`)) return;
                try {
                  await deleteV2Family(row.familyId);
                  setRows(prev => {
                    const next = prev.filter(r => r.familyId !== row.familyId);
                    familiesRowsCache = next;
                    return next;
                  });
                } catch (e: any) {
                  window.alert('Не удалось удалить: ' + (e?.message ?? String(e)));
                }
              } : undefined}
              onRowEdit={(row) => console.log('edit', row.rowId)}
              onCellSave={handleCellSave}
              hideToolbar={tableBarsCollapsed}
              toolbarExtra={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
                    <Search size={14} style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-2)',
                      pointerEvents: 'none',
                    }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Имя, телефон, ребёнок, адрес..."
                      style={{
                        width: '100%',
                        height: 26,
                        padding: '0 10px 0 30px',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        fontSize: 12,
                        fontWeight: 600,
                        background: '#fff',
                        outline: 'none',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                  <select value={quickPaymentStatus} onChange={e => setModeFilter({ quickPaymentStatus: e.target.value })} style={tableQuickSelectStyle}>
                    {PAYMENT_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {mode === 'cashier' && (
                    <button
                      onClick={() => setShowBankStatement(true)}
                      style={{
                        height: 26,
                        padding: '0 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        background: '#fff',
                        color: 'var(--text)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        flexShrink: 0,
                      }}
                    >
                      Выписка
                    </button>
                  )}
                </div>
              )}
              toolbarRightExtra={(
                <button
                  onClick={() => setShowNewFamily(true)}
                  title="Новая заявка"
                  style={{
                    width: 30,
                    height: 30,
                    border: 'none',
                    borderRadius: 10,
                    background: '#31A4A5',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Plus size={16} />
                </button>
              )}
            />
          )}
        </div>
      </div>

      <aside style={{
        width: schoolsSidebarCollapsed ? 58 : 260,
        height: '100%',
        background: '#fff',
        borderRadius: '22px 0 0 22px',
        marginLeft: 10,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .18s ease',
      }}
      onClick={event => event.stopPropagation()}>
        <div style={{
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: schoolsSidebarCollapsed ? 'center' : 'space-between',
          gap: 6,
          padding: schoolsSidebarCollapsed ? '0 8px' : '0 10px 0 12px',
          borderBottom: '1px solid var(--border)',
          color: '#626C8B',
          fontSize: 12,
          fontWeight: 850,
          textTransform: 'uppercase',
        }}>
          {!schoolsSidebarCollapsed && <span>Школы</span>}
          <button
            onClick={() => {
              if (dashboardMode !== 'drivers') setSchoolsBarCollapsed(value => !value);
            }}
            title={dashboardMode === 'drivers' ? 'Школы' : schoolsSidebarCollapsed ? 'Показать школы' : 'Скрыть школы'}
            style={{
              width: 28,
              height: 28,
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: '#F5FAFB',
              color: '#626C8B',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: dashboardMode === 'drivers' ? 'default' : 'pointer',
              flexShrink: 0,
            }}
          >
            {schoolsSidebarCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
        <nav style={{ flex: 1, padding: schoolsSidebarCollapsed ? '7px 0 7px 0' : '7px 8px 7px 0', overflow: 'visible' }}>
          {schoolButtonItems.filter(t => t.key !== 'ALL' || !schoolsSidebarCollapsed).map(t => {
            const isActive = activeTab === t.key;
            const allowed = isTabAllowed(t.key);
            const metric = branchMetric[t.key] ?? { value: 0, label: '0' };
            const hasBadge = Boolean(metric.alert);
            const stats = branchStats[t.key] ?? { newCount: 0, totalCount: 0, average: '0', debtorsCount: 0, debtSum: 0 };
            return (
              <button
                key={t.key}
                onClick={() => {
                  if (!allowed) return;
                  setModeFilter(getSchoolSwitchFilters(t.key));
                  setDashboardSchoolKey(t.key);
                  if (mode === 'logistics') {
                    setLogisticsDashboardCollapsed(false);
                  }
                }}
                title={t.label}
                style={{
                  width: isActive ? (schoolsSidebarCollapsed ? 'calc(100% + 8px)' : 'calc(100% + 10px)') : '100%',
                  minHeight: 34,
                  display: 'flex',
                  alignItems: schoolsSidebarCollapsed ? 'center' : 'stretch',
                  justifyContent: schoolsSidebarCollapsed ? 'center' : 'flex-start',
                  gap: 5,
                  padding: schoolsSidebarCollapsed ? '8px 0' : '8px 8px 8px 10px',
                  marginLeft: isActive ? (schoolsSidebarCollapsed ? -8 : -10) : 0,
                  marginBottom: 1,
                  border: '1px solid transparent',
                  borderRadius: isActive ? '0 16px 16px 0' : 14,
                  background: isActive ? 'var(--active-bg)' : 'transparent',
                  color: isActive ? '#17222F' : allowed ? '#626C8B' : '#C0C0C8',
                  fontSize: schoolsSidebarCollapsed ? 9 : 10,
                  fontWeight: isActive ? 800 : 650,
                  cursor: allowed ? 'pointer' : 'default',
                  opacity: allowed ? 1 : 0.45,
                  boxShadow: isActive ? 'inset -4px 0 0 #31A4A5' : 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {schoolsSidebarCollapsed ? (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: hasBadge ? '#EF4444' : '#159A6A',
                        flexShrink: 0,
                      }} />
                      <span style={{ width: 42, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }}>{t.label}</span>
                    </span>
                    <span style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: stats.debtSum > 0 ? '#EF4444' : '#626C8B',
                      fontSize: 10,
                      fontWeight: 650,
                      lineHeight: 1.12,
                    }}>
                      Все: {stats.totalCount} · Новые: {stats.newCount} · Долг: {stats.debtorsCount}/{compactMoney(stats.debtSum)}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {selectedDriver && (
        <div
          onClick={() => setSelectedDriverId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(23, 34, 47, 0.20)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <section
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(1040px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 48px)',
              overflow: 'hidden',
              borderRadius: 18,
              background: '#fff',
              boxShadow: '0 24px 60px rgba(30, 56, 75, 0.22)',
              border: '1px solid #D4E3E7',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <header style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              padding: '18px 20px 14px',
              borderBottom: '1px solid #E5EEF1',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#17222F', lineHeight: 1.15 }}>
                  {selectedDriver.fullName || 'Водитель'}
                </div>
                <div style={{ marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap', color: '#626C8B', fontSize: 13, fontWeight: 750 }}>
                  <span>{selectedDriver.phone || 'номер не указан'}</span>
                  <span>ID: {selectedDriver.driverId.slice(0, 8)}</span>
                  <span>{selectedDriver.status === 'active' ? 'Активен' : selectedDriver.status || 'Статус не указан'}</span>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', color: '#17222F', fontSize: 13, fontWeight: 800 }}>
                  <span>Наш долг: {money(selectedDriverFinanceTotals.balance)}</span>
                  <span>Не хватает документов: данные не заведены</span>
                  <span>Просрочены: нет данных</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDriverId(null)}
                title="Закрыть"
                style={{
                  width: 36,
                  height: 36,
                  border: '1px solid #D4E3E7',
                  borderRadius: 12,
                  background: '#fff',
                  color: '#626C8B',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={18} />
              </button>
            </header>

            <div style={{
              height: 48,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 18px',
              borderBottom: '1px solid #E5EEF1',
              background: '#fff',
            }}>
              {[
                { key: 'main' as DriverCardTab, label: 'Основная' },
                { key: 'finance' as DriverCardTab, label: 'Финансы' },
              ].map(tabItem => {
                const active = selectedDriverTab === tabItem.key;
                return (
                  <button
                    key={tabItem.key}
                    onClick={() => setSelectedDriverTab(tabItem.key)}
                    style={{
                      height: 30,
                      padding: '0 12px',
                      border: `1px solid ${active ? '#31A4A5' : '#DDE9EC'}`,
                      borderRadius: 10,
                      background: active ? '#DFF4F4' : '#fff',
                      color: active ? '#237F81' : '#52606F',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {tabItem.label}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: 18, overflowY: 'auto', background: '#F5FAFB' }}>
              {selectedDriverTab === 'main' ? (
              <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
                gap: 12,
                marginBottom: 12,
              }}>
                <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#17222F', marginBottom: 10 }}>Школа / трансфер</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 8, columnGap: 12, fontSize: 13 }}>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Школа</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.branchShorts.join(', ') || '-'}</span>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Трансфер</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.transferNumbers || '-'}</span>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Тип ТС</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.vehicleLabel || '-'}</span>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Авто</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>
                      {[selectedDriver.brand, selectedDriver.model, selectedDriver.plateNumber].filter(Boolean).join(' · ') || '-'}
                    </span>
                  </div>
                </section>

                <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#17222F', marginBottom: 10 }}>Контакты / адрес</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 8, columnGap: 12, fontSize: 13 }}>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Телефон</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.phone || '-'}</span>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Доп. контакт</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.secondPhone || '-'}</span>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Адрес</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.address || '-'}</span>
                  </div>
                </section>
              </div>

              <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', overflow: 'hidden' }}>
                <div style={{
                  height: 42,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 14px',
                  borderBottom: '1px solid #E5EEF1',
                  fontSize: 13,
                  fontWeight: 900,
                  color: '#17222F',
                }}>
                  Дети ({selectedDriverChildren.length})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Ост.', 'ФИО', 'Адрес', 'Телефон', 'Утро', 'Самовыход', 'Координаты'].map(label => (
                          <th key={label} style={{
                            height: 36,
                            padding: '0 10px',
                            borderBottom: '1px solid #E5EEF1',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 900,
                            color: '#7A859D',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDriverChildren.length ? selectedDriverChildren.map((child, index) => {
                        const coords = child.latitude != null && child.longitude != null
                          ? `${child.latitude.toFixed(6)}, ${child.longitude.toFixed(6)}`
                          : '-';
                        return (
                          <tr key={child.rowId}>
                            {[
                              child.stopNumber || '-',
                              child.childName || '-',
                              child.streetAddress || '-',
                              child.phone || child.contactPhone || '-',
                              child.timeMorning || '-',
                              child.selfExitAllowed ? 'Да' : 'Нет',
                              coords,
                            ].map((value, cellIndex) => (
                              <td key={cellIndex} style={{
                                height: 42,
                                padding: '0 10px',
                                borderBottom: index === selectedDriverChildren.length - 1 ? 'none' : '1px solid #EEF4F6',
                                fontSize: 13,
                                fontWeight: cellIndex === 1 ? 850 : 650,
                                color: '#17222F',
                                whiteSpace: 'nowrap',
                                maxWidth: cellIndex === 2 ? 260 : undefined,
                                overflow: cellIndex === 2 ? 'hidden' : undefined,
                                textOverflow: cellIndex === 2 ? 'ellipsis' : undefined,
                              }}>
                                {value}
                              </td>
                            ))}
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={7} style={{
                            height: 58,
                            padding: '0 14px',
                            color: '#7A859D',
                            fontSize: 13,
                            fontWeight: 700,
                          }}>
                            Детей по этому водителю нет
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              </>
              ) : (
                <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', overflow: 'hidden' }}>
                  <div style={{
                    height: 42,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    borderBottom: '1px solid #E5EEF1',
                    fontSize: 13,
                    fontWeight: 900,
                    color: '#17222F',
                  }}>
                    Финансы
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Месяц', 'К-во дней', 'Ставка', 'Штрафы', 'Пеня', 'Начислено', 'Авансы', 'Оплачено', 'Остаток'].map(label => (
                            <th key={label} style={{
                              height: 36,
                              padding: '0 10px',
                              borderBottom: '1px solid #E5EEF1',
                              textAlign: label === 'Месяц' ? 'left' : 'right',
                              fontSize: 11,
                              fontWeight: 900,
                              color: '#7A859D',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                            }}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDriverFinanceRows.map((row, index) => (
                          <tr key={row.month}>
                            {[
                              row.month,
                              row.days,
                              money(row.rate),
                              money(row.fines),
                              money(row.penalties),
                              money(row.accrued),
                              money(row.advances),
                              money(row.paid),
                              money(row.balance),
                            ].map((value, cellIndex) => (
                              <td key={cellIndex} style={{
                                height: 40,
                                padding: '0 10px',
                                borderBottom: index === selectedDriverFinanceRows.length - 1 ? 'none' : '1px solid #EEF4F6',
                                textAlign: cellIndex === 0 ? 'left' : 'right',
                                fontSize: 13,
                                fontWeight: cellIndex === 0 ? 850 : 650,
                                color: '#17222F',
                                whiteSpace: 'nowrap',
                              }}>
                                {value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          {[
                            'Итого',
                            selectedDriverFinanceTotals.days,
                            money(selectedDriverFinanceTotals.rate),
                            money(selectedDriverFinanceTotals.fines),
                            money(selectedDriverFinanceTotals.penalties),
                            money(selectedDriverFinanceTotals.accrued),
                            money(selectedDriverFinanceTotals.advances),
                            money(selectedDriverFinanceTotals.paid),
                            money(selectedDriverFinanceTotals.balance),
                          ].map((value, cellIndex) => (
                            <td key={cellIndex} style={{
                              height: 44,
                              padding: '0 10px',
                              borderTop: '1px solid #DDE9EC',
                              background: '#F8FCFC',
                              textAlign: cellIndex === 0 ? 'left' : 'right',
                              fontSize: 13,
                              fontWeight: 900,
                              color: cellIndex === 8 && selectedDriverFinanceTotals.balance > 0 ? '#B42318' : '#17222F',
                              whiteSpace: 'nowrap',
                            }}>
                              {value}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedTransferCard && (
        <div
          onClick={() => setTransferCardNumber(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(23, 34, 47, 0.18)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <section
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(720px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 48px)',
              overflow: 'hidden',
              borderRadius: 18,
              background: '#fff',
              boxShadow: '0 24px 60px rgba(30, 56, 75, 0.22)',
              border: '1px solid #D4E3E7',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <header style={{
              minHeight: 72,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '16px 18px',
              borderBottom: '1px solid #E5EEF1',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#17222F' }}>
                  Трансфер №{selectedTransferCard.transfer.transferNumber}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 750, color: '#626C8B' }}>
                  {selectedTransferCard.transfer.branchShort || selectedTransferCard.transfer.branchName || selectedDashboardSchool?.label || 'Школа'} · {VT_LABEL[selectedTransferCard.transfer.vehicleType] ?? selectedTransferCard.transfer.vehicleType}
                </div>
              </div>
              <button
                onClick={() => setTransferCardNumber(null)}
                title="Закрыть"
                style={{
                  width: 36,
                  height: 36,
                  border: '1px solid #D4E3E7',
                  borderRadius: 12,
                  background: '#fff',
                  color: '#626C8B',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={18} />
              </button>
            </header>

            <div style={{ padding: 18, overflowY: 'auto', background: '#F5FAFB' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 10,
                marginBottom: 14,
              }}>
                {[
                  { label: 'Водитель', value: selectedTransferCard.driver?.fullName || 'Не назначен' },
                  { label: 'Телефон', value: selectedTransferCard.driver?.phone || '-' },
                  { label: 'Дети', value: String(selectedTransferCard.childrenCount) },
                  { label: 'Статус', value: selectedTransferCard.driver ? 'Активный' : 'Ожидание' },
                ].map(item => (
                  <div key={item.label} style={{
                    minHeight: 66,
                    border: '1px solid #DDE9EC',
                    borderRadius: 10,
                    background: '#fff',
                    padding: '10px 12px',
                    minWidth: 0,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 850, color: '#7A859D', textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ marginTop: 7, fontSize: 14, fontWeight: 900, color: '#17222F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                border: '1px solid #DDE9EC',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
              }}>
                <div style={{
                  height: 42,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 14px',
                  borderBottom: '1px solid #E5EEF1',
                  fontSize: 13,
                  fontWeight: 900,
                  color: '#17222F',
                }}>
                  История водителей
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr>
                        {['Водитель', 'Телефон', 'Начало', 'Конец', 'Статус'].map(label => (
                          <th key={label} style={{
                            height: 36,
                            padding: '0 12px',
                            borderBottom: '1px solid #E5EEF1',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 900,
                            color: '#7A859D',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransferCard.history.length ? selectedTransferCard.history.map((entry, index) => (
                        <tr key={`${entry.driverName}-${index}`}>
                          {[entry.driverName, entry.phone, entry.startDate, entry.endDate, entry.status].map((value, cellIndex) => (
                            <td key={cellIndex} style={{
                              height: 42,
                              padding: '0 12px',
                              borderBottom: index === selectedTransferCard.history.length - 1 ? 'none' : '1px solid #EEF4F6',
                              fontSize: 13,
                              fontWeight: cellIndex === 0 ? 850 : 650,
                              color: cellIndex === 4 ? '#237F81' : '#17222F',
                              whiteSpace: 'nowrap',
                            }}>
                              {value || '-'}
                            </td>
                          ))}
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} style={{
                            height: 58,
                            padding: '0 14px',
                            color: '#7A859D',
                            fontSize: 13,
                            fontWeight: 700,
                          }}>
                            Водитель не назначен
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {showNewFamily && (
        <NewFamilyModal
          onClose={() => setShowNewFamily(false)}
          
        />
      )}

      {showBankStatement && (
        <>
          <div
            onClick={() => setShowBankStatement(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 800 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(1100px, calc(100vw - 32px))',
            height: 'min(88vh, 900px)',
            background: '#fff',
            borderRadius: 18,
            zIndex: 801,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(23,34,47,0.22)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Выписка</span>
              <button
                onClick={() => setShowBankStatement(false)}
                style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 10, background: '#F5FAFB', color: 'var(--text-2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <BankStatementPage userName={userName} />
            </div>
          </div>
        </>
      )}

      {showNewDriver && (
        <NewDriverModal
          branches={driverBranches}
          initialBranchKey={selectedDashboardSchool?.key}
          onClose={() => setShowNewDriver(false)}
          onCreated={(driverId) => {
            setShowNewDriver(false);
            void load(false).then(() => setSelectedDriverId(driverId));
          }}
        />
      )}

      {transferTypeMenu && (
        <div
          onClick={event => event.stopPropagation()}
          style={{
            position: 'fixed',
            left: transferTypeMenu.x,
            top: transferTypeMenu.y,
            zIndex: 1600,
            width: 188,
            padding: 8,
            border: '1px solid #D4E3E7',
            borderRadius: 14,
            background: '#fff',
            boxShadow: '0 18px 44px rgba(20, 35, 48, 0.18)',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '4px 6px 9px',
            borderBottom: '1px solid #EEF3F5',
            marginBottom: 6,
          }}>
            <span style={{
              color: '#17222F',
              fontSize: 12,
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}>
              Трансфер №{transferTypeMenu.transferNumber}
            </span>
            <span style={{
              height: 20,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 7px',
              borderRadius: 999,
              background: '#F5FAFB',
              color: '#626C8B',
              fontSize: 9,
              fontWeight: 850,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              Фильтр
            </span>
          </div>
          <div style={{
            padding: '1px 6px 6px',
            color: '#626C8B',
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 0,
          }}>
            Тип транспорта
          </div>
          <div style={{ display: 'grid', gap: 3 }}>
            {TRANSFER_TYPE_MENU_OPTIONS.map(option => {
              const active = option.value === 'unassigned'
                ? !selectedTransferVehicleType
                : selectedTransferVehicleType === option.value;
              const tone = option.value === 'unassigned'
                ? TRANSFER_TONE.empty
                : TRANSFER_TONE[option.value] ?? TRANSFER_TONE.empty;
              return (
                <button
                  key={option.value}
                  onClick={() => changeDashboardTransferVehicleType(option.value)}
                  style={{
                    width: '100%',
                    minHeight: 34,
                    border: `1px solid ${active ? tone.border : 'transparent'}`,
                    borderRadius: 10,
                    background: active ? tone.bg : '#fff',
                    color: active ? tone.text : '#17222F',
                    display: 'grid',
                    gridTemplateColumns: '14px minmax(0, 1fr) 18px',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 8px',
                    fontSize: 12,
                    fontWeight: active ? 900 : 750,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: tone.dot,
                    justifySelf: 'center',
                    opacity: active ? 1 : 0.72,
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {option.label}
                  </span>
                  <span style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? '#fff' : 'transparent',
                    color: active ? tone.text : 'transparent',
                  }}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {expandedFamilyId && (
        <div
          onClick={() => { setExpandedFamilyId(null); setExpandedFamily(null); setExpandedInitialTab('overview'); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(8, 11, 11, 0.34)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div onClick={event => event.stopPropagation()} style={{ width: 'min(1240px, calc(100vw - 36px))' }}>
            {expandedFamily ? (
              <InlineFamilyCard
                family={expandedFamily}
                userRole={userRole}
                userName={userName}
                initialTab={expandedInitialTab}
                onUpdated={() => load(false)}
                onClose={() => { setExpandedFamilyId(null); setExpandedFamily(null); setExpandedInitialTab('overview'); }}
              />
            ) : (
              <div style={{
                width: 'min(420px, calc(100vw - 48px))',
                padding: 22,
                borderRadius: 14,
                background: '#fff',
                boxShadow: '0 24px 60px rgba(8,11,11,0.18)',
                color: 'var(--text-2)',
                fontSize: 13,
                fontWeight: 700,
                textAlign: 'center',
              }}>
                Загрузка...
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}


