import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Family, FamilyPayment, PaymentType, UserRole, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import {
  SCHOOL_TABS, ZONE_COLOR, VT_LABEL, getBranchFilter
} from './constants';
import { CashierPaymentRow, clearV2TransferVehicleType, createDefaultV2DriverDocuments, createV2DriverAdvance, deleteV2DriverAdvance, deleteV2Family, fetchCashierPaymentsTable, fetchChargesForPeriod, fetchPageFilters, fetchPaymentsTable, fetchV2Branches, fetchV2DriverAdvances, fetchV2DriverDocuments, fetchV2DriversTable, fetchV2FamiliesTable, fetchV2FamiliesTableCached, fetchV2Family, fetchV2TransfersDashboard, PageFilterSettings, PaymentTableRow, PeriodChargeStats, savePageFilter, saveV2DriverDocuments, updateV2Child, updateV2ChildRoute, updateV2Driver, updateV2Family, updateV2TransferVehicleType, V2BranchOption, V2DriverAdvance, V2DriverDocumentInput, V2DriverTableRow, V2TransferDashboardRow } from '../../services/crmV2Service';
import { useFamiliesPage, useBranchStats } from '../../hooks/useCrmQueries';
import InlineFamilyCard from './InlineFamilyCard';
import NewFamilyModal from './NewFamilyModal';
import NewDriverModal from '../drivers/NewDriverModal';
import { DRIVER_RESERVE_KEY, isReserveDriver } from '../drivers/DriversOverview';
import { confirmFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import NotionSelect from '../../core/selects/NotionSelect';
import '../../core/tables/DataTable.css';
import { Check, ChevronDown, ChevronUp, Search, Plus, X, Save, Paperclip } from 'lucide-react';
import { formatClassName, formatName, formatPhone } from '../../utils/format';
import { ALL_PERIODS, CASHIER_PERIODS, currentCashierPeriodKey } from './constants';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH, type SchoolDockItem } from './SchoolDockSidebar';
import {
  childDebtAmount, childDebtorRows, compactMoney,
  downloadXlsxBuffer, driverDocumentExpired, driverDocumentMissing, formatDateShort, logisticsTransferCountColor,
  logisticsVehicleTypeLineColor, logisticsWorkRows, normalizeRows, paymentRowMatchesPeriod, transferVehicleSummary,
  uniqueFamilyRows, vehicleTypeShortLabel, XLSX_BRAND,
} from './familiesRowHelpers';

export interface ChildRow {
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
  paidPaymentCount: number;
  paidPaymentAmount: number;
  pendingPayment: number;
  pendingPaymentCount: number;
  pendingPaymentId: string | null;
  pendingPaymentAmount: number;
  pendingPaymentDate: string | null;
  pendingActualPaymentDate: string | null;
  pendingPaymentType: string | null;
  pendingPaymentReceiptUrl: string | null;
  pendingPaymentComment: string;
  rejectedPaymentCount: number;
  rejectedPaymentAmount: number;
  allPaymentCount: number;
  allPaymentAmount: number;
  childDebtAmount: number;
  debtAmount: number;
  balance: number;
  penaltyAmount?: number;
}

type FamiliesMode = 'requests' | 'payments' | 'charges' | 'debtors' | 'directory' | 'cashier' | 'logistics';

interface FamiliesPageProps {
  mode?: FamiliesMode;
  userRole?: UserRole;
  userName?: string;
  allowedSchools?: string[];
  settingsScope?: string;
  initialQuickFilter?: Partial<ModeFilters>;
  adminFiltersOpen?: boolean;
  onAdminFiltersClose?: () => void;
  columnsOpen?: boolean;
  onColumnsOpenChange?: (v: boolean) => void;
  hidePeriodAll?: boolean;
  hidePeriodDeposit?: boolean;
  hideTransferBars?: boolean;
  hideDashboard?: boolean;
  compactPeriodBar?: boolean;
  customLeftPanel?: React.ReactNode;
  onPeriodKeyChange?: (key: string) => void;
  onSchoolKeyChange?: (key: string) => void;
  customBarItems?: LogisticsDashboardItem[];
  customTopContent?: React.ReactNode;
  customTableContent?: React.ReactNode;
  extraSchoolDockItems?: SchoolDockItem[];
  onSchoolsSidebarWidthChange?: (width: number) => void;
  externalQuickTransfer?: string;
  externalQuickChildStatus?: string;
  externalPeriodKey?: string;
  initialOpenFamilyId?: string | null;
  onInitialFamilyOpened?: () => void;
}

interface ModeFilters {
  activeTab: string;
  quickTransfer: string;
  quickChildStatus: string;
}

const MODE_LABEL: Record<FamiliesMode, string> = {
  requests: 'Заявки',
  payments: 'Оплаты',
  charges: 'Финансы',
  debtors: 'Должники',
  directory: 'Справочник',
  cashier: 'Кассир',
  logistics: 'Логистика',
};

const TRANSFER_OPTIONS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: `№ ${i + 1}` }));
const TRANSFER_BAR_OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));
const STOP_OPTIONS = Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const PAYMENT_METHOD_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'transfer', label: 'Безналичный QR' },
];

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
  { key: 'debtAmount', label: 'Долг', type: 'currency', category: 'Финансы', width: 95, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'balance', label: 'Баланс', type: 'currency', category: 'Финансы', width: 95, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'totalCharged', label: 'Общ. начисл.', type: 'currency', category: 'Финансы', width: 110, visible: false, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'totalPaid', label: 'Платежи', type: 'currency', category: 'Финансы', width: 110, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'pendingPayment', label: 'На проверке', type: 'currency', category: 'Финансы', width: 105, visible: false, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'penaltyAmount', label: 'Пеня', type: 'currency', category: 'Финансы', width: 90, visible: false, render: (val) => <span>{money(Number(val ?? 0))}</span> },
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
const EMPTY_CHILD_ROWS: ChildRow[] = [];

const LOGISTICS_CHART_COLORS = [
  '#EF7168', '#C9C9C7', '#DD7FA9', '#C79B7D', '#74BE92',
  '#E49A55', '#5A9FE8', '#B77BDA', '#E1709B', '#88A8D8',
];

type LogisticsDashboardItem = { key: string; label: string; value: number; color: string };
type LogisticsTransferDashboardItem = LogisticsDashboardItem & { group: string; count: number; vehicleType?: string; branchId?: string | null; schoolId?: string | null };
type LogisticsDashboardMetric = 'average' | 'count' | 'debtSum' | 'debtorsCount' | 'chargedSum' | 'paidCount' | 'paidSum' | 'balanceSum' | 'pendingSum' | 'pendingAmount' | 'rejectedCount' | 'rejectedSum' | 'allPaymentsCount' | 'allPaymentsSum';
type LogisticsSummaryItem = { label: string; value: string; metric?: LogisticsDashboardMetric; neutral?: boolean };
type LogisticsVehicleFilter = 'all' | VehicleType;
type TransferCardData = {
  transfer: V2TransferDashboardRow;
  driver?: V2DriverTableRow;
  childrenCount: number;
  history: {
    driverName: string;
    startDate: string;
    endDate: string;
    status: string;
  }[];
};
type DriverCardTab = 'main' | 'documents' | 'finance' | 'advances';
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

type DriverDraft = {
  fullName: string;
  phone: string;
  secondPhone: string;
  status: string;
  address: string;
  districts: string[];
  comment: string;
  vehicleType: VehicleType | '';
  brand: string;
  model: string;
  plateNumber: string;
  seats: string;
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

const DRIVER_STATUS_OPTIONS = [
  { value: 'active', label: 'Активен' },
  { value: 'inactive', label: 'Неактивен' },
  { value: 'vacation', label: 'Ожидание' },
  { value: 'dismissed', label: 'Уволен' },
  { value: 'archive', label: 'Архив' },
];

const LOGISTICS_DASHBOARD_METRICS: { key: LogisticsDashboardMetric; label: string; money?: boolean }[] = [
  { key: 'average', label: 'Средний' },
  { key: 'count', label: 'К-во' },
  { key: 'pendingSum', label: 'На проверке' },
  { key: 'pendingAmount', label: 'На проверке сумма', money: true },
  { key: 'debtSum', label: 'Долг', money: true },
  { key: 'debtorsCount', label: 'Должники' },
  { key: 'chargedSum', label: 'Начислено', money: true },
  { key: 'paidCount', label: 'Оплаченные' },
  { key: 'paidSum', label: 'Оплачено', money: true },
  { key: 'balanceSum', label: 'Баланс', money: true },
  { key: 'rejectedCount', label: 'Отклонённые' },
  { key: 'rejectedSum', label: 'Отклонённые сумма', money: true },
  { key: 'allPaymentsCount', label: 'Все платежи' },
  { key: 'allPaymentsSum', label: 'Все платежи сумма', money: true },
];

const METRICS_BY_ROLE: Record<string, LogisticsDashboardMetric[]> = {
  admin:        ['average', 'count', 'pendingSum', 'pendingAmount', 'debtSum', 'debtorsCount', 'chargedSum', 'paidCount', 'paidSum', 'balanceSum', 'rejectedCount', 'rejectedSum', 'allPaymentsCount', 'allPaymentsSum'],
  gen_director: ['average', 'count', 'pendingSum', 'pendingAmount', 'debtSum', 'debtorsCount', 'chargedSum', 'paidCount', 'paidSum', 'balanceSum', 'rejectedCount', 'rejectedSum', 'allPaymentsCount', 'allPaymentsSum'],
  director:     ['average', 'count', 'pendingSum', 'pendingAmount', 'debtSum', 'debtorsCount', 'chargedSum', 'paidCount', 'paidSum', 'balanceSum', 'rejectedCount', 'rejectedSum', 'allPaymentsCount', 'allPaymentsSum'],
  manager:  ['count', 'pendingSum', 'pendingAmount', 'debtSum', 'debtorsCount', 'chargedSum', 'paidCount', 'paidSum', 'balanceSum', 'rejectedCount', 'rejectedSum', 'allPaymentsCount', 'allPaymentsSum'],
  cashier:  ['pendingSum', 'pendingAmount', 'debtSum', 'debtorsCount', 'rejectedCount', 'rejectedSum', 'allPaymentsCount', 'allPaymentsSum'],
  logist:   ['average', 'count'],
};
const LOGISTICS_VEHICLE_FILTERS: { key: LogisticsVehicleFilter; label: string }[] = [
  { key: 'all', label: 'Все ТС' },
  { key: 'microbus', label: 'Микроавтобус' },
  { key: 'minivan', label: 'Минивэн' },
  { key: 'sedan', label: 'Седан' },
];


const logisticsDashboardBaseStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '308px minmax(0, 1fr)',
  gap: 8,
  alignItems: 'start',
  padding: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  overflow: 'visible',
  boxSizing: 'border-box',
};

const logisticsDashboardSideStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  alignContent: 'start',
  gap: 10,
  padding: 12,
  height: '100%',
  minWidth: 0,
  background: '#FFFFFF',
  border: '1px solid #D4E3E7',
  borderRadius: 10,
  boxSizing: 'border-box',
  boxShadow: '0 10px 28px rgba(43, 72, 89, 0.06)',
};

const logisticsDashboardMainStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gap: 8,
  minWidth: 0,
  height: '100%',
  padding: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  boxSizing: 'border-box',
};

const logisticsDashboardBlockStyle: React.CSSProperties = {
  position: 'relative',
  height: 148,
  flexShrink: 0,
  padding: '0 42px 8px 10px',
  background: '#fff',
  border: '1px solid #D4E3E7',
  borderRadius: 10,
  overflow: 'hidden',
  boxSizing: 'border-box',
  boxShadow: '0 10px 28px rgba(43, 72, 89, 0.05)',
};

const logisticsTransferBlockStyle: React.CSSProperties = {
  position: 'relative',
  height: 194,
  flexShrink: 0,
  padding: '8px 10px 8px 10px',
  background: '#fff',
  border: '1px solid #D4E3E7',
  borderRadius: 10,
  overflow: 'hidden',
  boxSizing: 'border-box',
  boxShadow: '0 10px 28px rgba(43, 72, 89, 0.05)',
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

const logisticsBarsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(58px, 1fr))',
  alignItems: 'end',
  gap: 8,
  minWidth: 0,
  overflow: 'hidden',
  padding: '0 0 1px',
  borderBottom: '2px solid #31A4A5',
  scrollbarWidth: 'none',
};

const logisticsBarItemStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: '120px 20px',
  justifyItems: 'center',
  alignItems: 'end',
  minWidth: 0,
  border: 0,
  background: 'transparent',
  padding: 0,
};

const logisticsBarValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 850,
  color: '#41547A',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  lineHeight: 1,
  pointerEvents: 'none',
};

const logisticsBarTrackStyle: React.CSSProperties = {
  height: 100,
  display: 'flex',
  alignItems: 'end',
  justifyContent: 'center',
  position: 'relative',
};

const logisticsBarStyle: React.CSSProperties = {
  width: 18,
  borderRadius: '5px 5px 0 0',
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
  customLeftPanel,
  dashboardHeight,
  summaryItems,
  primaryValue,
  detailItems = [],
  activeDetailKey,
  onDetailSelect,
  onDetailDoubleClick,
  onDetailContextMenu,
  isDetailDisabled,
  detailValueMode = 'count',
  detailMoney = false,
  dashboardMainTab,
  onMainTabChange,
  showDetailBars = true,
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
  summaryItems?: LogisticsSummaryItem[];
  primaryValue?: number;
  detailItems?: LogisticsTransferDashboardItem[];
  activeDetailKey?: string;
  onDetailSelect?: (item: LogisticsTransferDashboardItem) => void;
  onDetailDoubleClick?: (event: React.MouseEvent, item: LogisticsTransferDashboardItem) => void;
  onDetailContextMenu?: (event: React.MouseEvent, item: LogisticsTransferDashboardItem) => void;
  isDetailDisabled?: (item: LogisticsTransferDashboardItem) => boolean;
  detailValueMode?: 'count' | 'vehicleType';
  detailMoney?: boolean;
  dashboardMainTab?: 'payments' | 'statement';
  onMainTabChange?: (tab: 'payments' | 'statement') => void;
  showDetailBars?: boolean;
  customLeftPanel?: React.ReactNode;
  dashboardHeight?: number;
}) {
  const maxValue = Math.max(20, ...items.filter(i => i.key !== 'ALL').map(item => Math.max(0, item.value)));
  const maxDetailValue = Math.max(1, ...detailItems.map(item => item.count));
  const compactDetailBars = detailValueMode === 'vehicleType';
  const selectedMetric = metricOptions.find(item => item.key === metric) ?? metricOptions[0] ?? LOGISTICS_DASHBOARD_METRICS[0];
  const averageGaugeValue = items.length
    ? items.reduce((sum, item) => sum + item.value, 0) / items.length
    : 0;
  const selectedGaugeItem = selectedKey ? items.find(item => item.key === selectedKey) : undefined;
  const gaugeValue = primaryValue ?? selectedGaugeItem?.value ?? averageGaugeValue;
  const schoolSummaryItem = summaryItems?.find(item => item.label === 'Школа');
  const metricSummaryItems = summaryItems?.filter(item => item.label !== 'Школа') ?? [];
  const primarySummaryItem = metricSummaryItems.find(item => item.metric === metric) ?? metricSummaryItems[0];

  const getSummaryTone = (item: LogisticsSummaryItem) => {
    const isDanger = item.label === 'Долг' || item.label === 'Должники' || item.label.startsWith('Долг') || item.label.startsWith('Отклон');
    const isWarning = !item.neutral && (item.label === 'На проверке' || item.label.startsWith('На проверке'));
    const isSuccess = item.label.startsWith('Подтверждён') || item.label.startsWith('Оплачено');
    const isAccent = item.label === 'Начислено' || item.label === 'Средний' || item.label.startsWith('Все платежи');
    if (isDanger) return { text: '#B42318', bg: '#FEF2F2', border: '#FECACA' };
    if (isWarning) return { text: '#B45309', bg: '#FFFBEB', border: '#FDE68A' };
    if (isSuccess) return { text: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' };
    if (isAccent) return { text: '#237F81', bg: '#EEF8F8', border: '#AAD4D4' };
    return { text: '#17222F', bg: '#F5FAFB', border: '#D4E3E7' };
  };

  const renderSummaryItem = (item: LogisticsSummaryItem, compact = false) => {
    const clickable = Boolean(item.metric);
    const isSelected = item.metric === metric;
    const tone = getSummaryTone(item);
    const baseStyle: React.CSSProperties = {
      width: '100%',
      minWidth: 0,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: 8,
      padding: compact ? '7px 9px' : '8px 10px',
      background: isSelected ? '#237F81' : tone.bg,
      border: isSelected ? '1px solid #237F81' : `1px solid ${tone.border}`,
      borderRadius: 8,
      color: isSelected ? '#FFFFFF' : '#17222F',
      textAlign: 'left',
      boxShadow: isSelected ? '0 8px 18px rgba(35, 127, 129, 0.18)' : 'none',
    };
    const content = (
      <>
        <span style={{ minWidth: 0, fontSize: 12, fontWeight: 760, color: isSelected ? 'rgba(255,255,255,.86)' : '#626C8B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.label}
        </span>
        <span style={{ minWidth: 0, maxWidth: 122, justifySelf: 'end', fontSize: compact ? 13 : 14, fontWeight: 900, color: isSelected ? '#FFFFFF' : tone.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.value}
        </span>
      </>
    );
    if (!clickable) return <div key={item.label} style={baseStyle}>{content}</div>;
    return (
      <button
        key={item.label}
        type="button"
        onClick={() => item.metric && onMetricChange(item.metric)}
        style={{ ...baseStyle, cursor: 'pointer' }}
      >
        {content}
      </button>
    );
  };
  const findSummaryItem = (label: string) => metricSummaryItems.find(item => item.label === label);
  const paymentSummaryGroups = [
    { label: 'Платежи', sum: findSummaryItem('Все платежи сумма'), count: findSummaryItem('Все платежи к-во') },
    { label: 'На проверке', sum: findSummaryItem('На проверке сумма'), count: findSummaryItem('На проверке к-во') },
    { label: 'Подтверждённые', sum: findSummaryItem('Подтверждённые сумма'), count: findSummaryItem('Подтверждённые к-во') },
    { label: 'Отклонённые', sum: findSummaryItem('Отклонённые сумма'), count: findSummaryItem('Отклонённые к-во') },
  ];
  const hasPaymentSummaryGroups = paymentSummaryGroups.every(group => group.sum && group.count);
  const financeSummaryGroups = [
    { label: 'Начислено', sum: findSummaryItem('Начислено сумма') },
    { label: 'Оплачено', sum: findSummaryItem('Оплачено'), count: findSummaryItem('Оплачено к-во') },
    { label: 'Долг', sum: findSummaryItem('Долг сумма'), count: findSummaryItem('Долг к-во') },
  ];
  const balanceSummaryItem = findSummaryItem('Баланс');
  const hasFinanceSummaryGroups = financeSummaryGroups.every(group => group.sum && (group.label === 'Начислено' || group.count)) && Boolean(balanceSummaryItem);
  const cashierMethodGroups = [
    { label: 'Наличные', sum: findSummaryItem('Наличные сумма'), count: findSummaryItem('Наличные к-во') },
    { label: 'QR', sum: findSummaryItem('QR сумма'), count: findSummaryItem('QR к-во') },
  ];
  const cashierReceiptItems = [findSummaryItem('С чеком'), findSummaryItem('Без чека')].filter(Boolean) as LogisticsSummaryItem[];
  const hasCashierMethodGroups = cashierMethodGroups.every(group => group.sum && group.count);

  const metricGroupGridColumns = 'minmax(88px, 1fr) minmax(0, 78px) minmax(0, 62px)';

  const renderMetricGroupHeader = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: metricGroupGridColumns,
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
      padding: '0 0 1px',
    }}>
      <span />
      <span style={{ minWidth: 0, fontSize: 10, lineHeight: 1, fontWeight: 900, color: '#7A859D', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Сумма
      </span>
      <span style={{ minWidth: 0, fontSize: 10, lineHeight: 1, fontWeight: 900, color: '#7A859D', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        К-во
      </span>
    </div>
  );

  const renderPaymentSummaryButton = (item: LogisticsSummaryItem | undefined) => {
    if (!item) return null;
    const clickable = Boolean(item.metric);
    const isSelected = item.metric === metric;
    const tone = getSummaryTone(item);
    return (
      <button
        key={item.label}
        type="button"
        onClick={() => item.metric && onMetricChange(item.metric)}
        disabled={!clickable}
        style={{
          minWidth: 0,
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 7px',
          border: isSelected ? '1px solid #237F81' : `1px solid ${tone.border}`,
          borderRadius: 8,
          background: isSelected ? '#237F81' : tone.bg,
          color: isSelected ? '#FFFFFF' : tone.text,
          cursor: clickable ? 'pointer' : 'default',
          textAlign: 'left',
          boxShadow: isSelected ? '0 8px 18px rgba(35, 127, 129, 0.18)' : 'none',
        }}
      >
        <span style={{ minWidth: 0, fontSize: 14, lineHeight: 1, fontWeight: 950, color: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.value}
        </span>
      </button>
    );
  };

  const renderLargeBalance = (item: LogisticsSummaryItem | undefined) => {
    if (!item) return null;
    const clickable = Boolean(item.metric);
    const isSelected = item.metric === metric;
    return (
      <button
        type="button"
        onClick={() => item.metric && onMetricChange(item.metric)}
        disabled={!clickable}
        style={{
          width: '100%',
          minWidth: 0,
          display: 'grid',
          gap: 3,
          padding: '12px 12px 11px',
          border: isSelected ? '1px solid #237F81' : '1px solid #AAD4D4',
          borderRadius: 8,
          background: isSelected ? '#237F81' : '#EEF8F8',
          color: isSelected ? '#FFFFFF' : '#17222F',
          textAlign: 'left',
          cursor: clickable ? 'pointer' : 'default',
          boxShadow: isSelected ? '0 8px 18px rgba(35, 127, 129, 0.18)' : 'none',
        }}
      >
        <span style={{ minWidth: 0, fontSize: 12, fontWeight: 850, color: isSelected ? 'rgba(255,255,255,.84)' : '#237F81', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Баланс
        </span>
        <span style={{ minWidth: 0, fontSize: 27, lineHeight: 1, fontWeight: 950, color: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.value}
        </span>
      </button>
    );
  };
  const resolvedDashboardHeight = dashboardHeight ?? (showDetailBars
    ? (hasPaymentSummaryGroups && hasCashierMethodGroups ? 430 : 350)
    : 148);
  const dashboardTopBlockHeight = showDetailBars
    ? Math.max(148, resolvedDashboardHeight - 202)
    : resolvedDashboardHeight;

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
    <div style={{
      ...logisticsDashboardBaseStyle,
      ...(customLeftPanel
        ? { minHeight: resolvedDashboardHeight, flexShrink: 0, alignItems: 'stretch' }
        : { height: resolvedDashboardHeight, minHeight: resolvedDashboardHeight, flexShrink: 0 }),
    }}>
      <div style={logisticsDashboardSideStyle}>
        {customLeftPanel ? customLeftPanel : summaryItems?.length ? (
          <>
            <div style={{ width: '100%', minWidth: 0, display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 850, color: '#7A859D', textTransform: 'uppercase', letterSpacing: 0 }}>
                {schoolSummaryItem ? 'Школа' : 'Сводка'}
              </span>
              <span style={{ minWidth: 0, fontSize: 18, lineHeight: 1.15, fontWeight: 900, color: '#17222F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {schoolSummaryItem?.value ?? selectedMetric.label}
              </span>
            </div>

            {primarySummaryItem && (
              <button
                type="button"
                onClick={() => primarySummaryItem.metric && onMetricChange(primarySummaryItem.metric)}
                disabled={!primarySummaryItem.metric}
                style={{
                  width: '100%',
                  minWidth: 0,
                  display: 'grid',
                  gap: 3,
                  padding: '12px 12px 11px',
                  border: '1px solid #AAD4D4',
                  borderRadius: 8,
                  background: '#EEF8F8',
                  textAlign: 'left',
                  cursor: primarySummaryItem.metric ? 'pointer' : 'default',
                }}
              >
                <span style={{ minWidth: 0, fontSize: 12, fontWeight: 800, color: '#237F81', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {primarySummaryItem.label}
                </span>
                <span style={{ minWidth: 0, fontSize: 27, lineHeight: 1, fontWeight: 950, color: '#17222F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {primarySummaryItem.value}
                </span>
              </button>
            )}

            {hasPaymentSummaryGroups ? (
              <div style={{ width: '100%', minWidth: 0, display: 'grid', gap: 6, alignContent: 'start' }}>
                {renderMetricGroupHeader()}
                {paymentSummaryGroups.map(group => (
                  <div
                    key={group.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: metricGroupGridColumns,
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ minWidth: 0, fontSize: 12, fontWeight: 900, color: '#626C8B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {group.label}
                    </span>
                    <span style={{ gridColumn: group.count ? undefined : 'span 2', minWidth: 0 }}>
                      {renderPaymentSummaryButton(group.sum)}
                    </span>
                    {group.count ? renderPaymentSummaryButton(group.count) : null}
                  </div>
                ))}
                {hasCashierMethodGroups && cashierMethodGroups.map(group => (
                  <div
                    key={group.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: metricGroupGridColumns,
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ minWidth: 0, fontSize: 12, fontWeight: 900, color: '#626C8B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {group.label}
                    </span>
                    <span style={{ gridColumn: group.count ? undefined : 'span 2', minWidth: 0 }}>
                      {renderPaymentSummaryButton(group.sum)}
                    </span>
                    {group.count ? renderPaymentSummaryButton(group.count) : null}
                  </div>
                ))}
              </div>
            ) : hasFinanceSummaryGroups ? (
              <div style={{ width: '100%', minWidth: 0, display: 'grid', gap: 6, alignContent: 'start' }}>
                {renderMetricGroupHeader()}
                {financeSummaryGroups.map(group => (
                  <div
                    key={group.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: metricGroupGridColumns,
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ minWidth: 0, fontSize: 12, fontWeight: 900, color: '#626C8B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {group.label}
                    </span>
                    {renderPaymentSummaryButton(group.sum)}
                    {renderPaymentSummaryButton(group.count)}
                  </div>
                ))}
                {renderLargeBalance(balanceSummaryItem)}
              </div>
            ) : hasCashierMethodGroups ? (
              <div style={{ width: '100%', minWidth: 0, display: 'grid', gap: 6, alignContent: 'start' }}>
                {renderMetricGroupHeader()}
                {cashierMethodGroups.map(group => (
                  <div
                    key={group.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: metricGroupGridColumns,
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ minWidth: 0, fontSize: 12, fontWeight: 900, color: '#626C8B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {group.label}
                    </span>
                    {renderPaymentSummaryButton(group.sum)}
                    {renderPaymentSummaryButton(group.count)}
                  </div>
                ))}
                {cashierReceiptItems.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, minWidth: 0, paddingTop: 2 }}>
                    {cashierReceiptItems.map(item => renderSummaryItem(item, true))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                width: '100%',
                minWidth: 0,
                display: 'grid',
                gridTemplateColumns: metricSummaryItems.length > 4 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                gap: 6,
                alignContent: 'start',
              }}>
                {metricSummaryItems
                  .filter(item => item.label !== primarySummaryItem?.label)
                  .map(item => renderSummaryItem(item, metricSummaryItems.length > 4))}
              </div>
            )}
          </>
        ) : null}
      </div>

      <div style={{ ...logisticsDashboardMainStyle, gridTemplateRows: showDetailBars ? `${dashboardTopBlockHeight}px 194px` : customLeftPanel ? '1fr' : `${resolvedDashboardHeight}px` }}>
        <div style={{ ...logisticsDashboardBlockStyle, height: customLeftPanel ? '100%' : dashboardTopBlockHeight }}>
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
            height: '100%',
            borderBottom: 0,
            overflow: 'visible',
          }}>
            {items.map(item => {
              const height = item.value <= 0 ? 0 : Math.min(78, Math.max(8, Math.round((item.value / maxValue) * 78)));
              const active = selectedKey === item.key;
              const valueLabel = selectedMetric.money ? compactMoney(item.value) : item.value.toFixed(metric === 'average' ? 1 : 0);
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
                    marginTop: 0,
                    marginBottom: 0,
                    padding: 0,
                    border: 'none',
                    borderRadius: 0,
                    background: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  {active && (
                    <>
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -108,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'var(--active-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -99,
                          left: 0,
                          right: 0,
                          height: 2,
                          background: 'var(--active-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 20,
                          height: 3,
                          background: '#31A4A5',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: 5,
                          right: 5,
                          bottom: 1,
                          height: 18,
                          borderRadius: '7px 7px 0 0',
                          background: 'rgba(255, 255, 255, 0.36)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -90,
                          left: -18,
                          width: 18,
                          height: 18,
                          borderTopRightRadius: 18,
                          boxShadow: '9px -9px 0 9px var(--active-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -90,
                          right: -18,
                          width: 18,
                          height: 18,
                          borderTopLeftRadius: 18,
                          boxShadow: '-9px -9px 0 9px var(--active-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                    </>
                  )}
                  <div style={{ ...logisticsBarTrackStyle, zIndex: 1 }}>
                    <span style={{
                      ...logisticsBarValueStyle,
                      position: 'absolute',
                      left: '50%',
                      bottom: height + 6,
                      transform: 'translateX(-50%)',
                      zIndex: 2,
                    }}>
                      {valueLabel}
                    </span>
                    <div style={{ ...logisticsBarStyle, height, background: item.color }} />
                  </div>
                  <div style={{ ...logisticsBarLabelStyle, position: 'relative', zIndex: 1, color: active ? '#17222F' : '#626C8B', fontWeight: active ? 900 : 700 }}>
                    {item.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {showDetailBars && <div style={{ ...logisticsTransferBlockStyle, display: 'grid', gap: 8, minWidth: 0 }}>
          <div style={{
            ...logisticsBarsStyle,
            gridTemplateColumns: compactDetailBars
              ? `repeat(${detailItems.length || 1}, minmax(26px, 34px))`
              : `repeat(${detailItems.length || 1}, minmax(30px, 1fr))`,
            height: '100%',
            gap: compactDetailBars ? 8 : 12,
            justifyContent: compactDetailBars ? 'space-between' : 'stretch',
            paddingTop: 8,
            borderBottom: 0,
            overflow: 'visible',
          }}>
	            {detailItems.length ? detailItems.map(item => {
	              const height = Math.max(8, Math.round((item.count / maxDetailValue) * 42));
	                const isEmpty = item.count <= 0;
	                const isStatus = item.key === 'all' || item.key === 'new' || item.key === 'rejected';
	                const isActive = activeDetailKey === item.key;
	                const isDisabled = isDetailDisabled?.(item) ?? false;
	                const vehicleLineColor = logisticsVehicleTypeLineColor(item.vehicleType);
	                const vehicleLabel = vehicleTypeShortLabel(item.vehicleType);
	                const detailValueLabel = detailValueMode === 'vehicleType' ? vehicleLabel || '—' : detailMoney ? compactMoney(item.count) : String(item.count);
	                return (
	                  <button
	                    key={item.key}
	                    type="button"
	                    aria-disabled={isDisabled}
	                    tabIndex={isDisabled ? -1 : 0}
			                    onClick={(event) => {
			                      if (isDisabled) {
			                        event.preventDefault();
			                        event.stopPropagation();
			                        return;
			                      }
			                      if (event.detail >= 2 && item.key.startsWith('transfer-')) {
			                        event.preventDefault();
			                        event.stopPropagation();
			                        onDetailDoubleClick?.(event, item);
			                        return;
			                      }
			                      onDetailSelect?.(item);
			                    }}
			                    onDoubleClick={(event) => {
			                      if (isDisabled || !item.key.startsWith('transfer-')) return;
			                      event.preventDefault();
			                      event.stopPropagation();
			                      onDetailDoubleClick?.(event, item);
			                    }}
		                    onContextMenu={(event) => {
		                      if (!item.key.startsWith('transfer-')) return;
		                      event.preventDefault();
		                      event.stopPropagation();
		                      if (isDisabled) return;
		                      if (!onDetailContextMenu) return;
		                      onDetailContextMenu?.(event, item);
		                    }}
                    title={item.label}
                  style={{
                    ...logisticsBarItemStyle,
                    gridTemplateRows: '1fr 20px',
                    alignSelf: 'stretch',
                    height: '100%',
	                    opacity: isDisabled ? 0.42 : isActive ? 1 : isEmpty ? 0.66 : 1,
	                    cursor: isDisabled ? 'default' : 'pointer',
                    position: 'relative',
                    zIndex: isActive ? 1 : 0,
                    marginTop: 0,
                    marginBottom: 0,
                    padding: 0,
                    border: 'none',
                    borderRadius: 0,
                    background: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  {isActive && (
                    <>
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -108,
                          left: -1,
                          right: -1,
                          bottom: 0,
                          borderRadius: '18px 18px 0 0',
                          background: 'var(--active-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 20,
                          height: 3,
                          background: '#31A4A5',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: 5,
                          right: 5,
                          bottom: 1,
                          height: 18,
                          borderRadius: '7px 7px 0 0',
                          background: 'rgba(255, 255, 255, 0.36)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -108,
                          left: -14,
                          width: 14,
                          height: 14,
                          borderTopRightRadius: 14,
                          boxShadow: '7px -7px 0 7px var(--active-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -108,
                          right: -14,
                          width: 14,
                          height: 14,
                          borderTopLeftRadius: 14,
                          boxShadow: '-7px -7px 0 7px var(--active-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                    </>
                  )}
                  <div style={{ ...logisticsBarTrackStyle, height: 70 }}>
                    <span style={{
                      ...logisticsBarValueStyle,
                      position: 'absolute',
                      left: '50%',
                      bottom: height + 6,
                      transform: 'translateX(-50%)',
                      zIndex: 2,
                      color: isActive ? '#41547A' : isEmpty ? '#9AA7AE' : '#626C8B',
                    }}>
                      {detailValueLabel}
                    </span>
                    <div
                      style={{
                        ...logisticsBarStyle,
                        height,
                        background: isEmpty
                          ? 'repeating-linear-gradient(-45deg, #EDF3F5 0, #EDF3F5 5px, #D9E5E8 5px, #D9E5E8 7px)'
                          : item.color,
                        width: 16,
                      }}
                    />
                  </div>
                  <div style={{
                    ...logisticsBarLabelStyle,
                    position: 'relative',
                    zIndex: 1,
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
        </div>}
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
const REQUEST_COLUMN_ORDER = [
  'parentName',
  'phone',
  'childName',
  'streetAddress',
  'zone',
  'vehicleLabel',
  'monthlyPrice',
  'transferNumber',
] as const;
const REQUEST_COLUMN_KEYS = new Set<string>(REQUEST_COLUMN_ORDER);
const REQUEST_COLUMNS: ColumnDef<ChildRow>[] = [
  ...REQUEST_COLUMN_ORDER
    .map(key => COLUMNS.find(column => column.key === key))
    .filter((column): column is ColumnDef<ChildRow> => Boolean(column)),
  ...COLUMNS.filter(column => !REQUEST_COLUMN_KEYS.has(column.key)),
];

const CHARGES_COLUMN_ORDER = ['parentName', 'phone', 'childName', 'totalCharged', 'pendingPayment', 'balance', 'debtAmount'] as const;
const CHARGES_COLUMN_KEYS = new Set<string>(CHARGES_COLUMN_ORDER);
const CHARGES_COLUMNS: ColumnDef<ChildRow>[] = [
  ...CHARGES_COLUMN_ORDER
    .map(key => {
      const col = COLUMNS.find(c => c.key === key);
      if (!col) return null;
      if (key === 'debtAmount') return {
        ...col,
        aggregateByKey: undefined,
        render: (val: any) => <span style={{ color: Number(val) > 0 ? '#C62828' : undefined, fontWeight: Number(val) > 0 ? 700 : undefined }}>{money(Number(val ?? 0))}</span>,
      };
      if (key === 'totalCharged' || key === 'pendingPayment' || key === 'balance') return {
        ...col,
        aggregateByKey: undefined,
        render: (val: any) => <span>{money(Number(val ?? 0))}</span>,
      };
      return col;
    })
    .filter((col): col is ColumnDef<ChildRow> => Boolean(col)),
  ...COLUMNS.filter(col => !CHARGES_COLUMN_KEYS.has(String(col.key))),
];
const PAYMENT_STATUS_COL: ColumnDef<ChildRow> = {
  key: 'paymentStatus',
  label: 'Статус',
  type: 'text',
  category: 'Финансы',
  width: 120,
  visible: true,
  sortable: false,
  filterable: false,
  render: (_val: any, row: ChildRow) => {
    if (row.pendingPaymentCount > 0) return <span style={{ color: '#B45309', fontWeight: 700, fontSize: 11 }}>На проверке</span>;
    if (row.rejectedPaymentCount > 0) return <span style={{ color: '#C62828', fontWeight: 700, fontSize: 11 }}>Отклонён</span>;
    if (row.paidPaymentCount > 0) return <span style={{ color: '#15803D', fontWeight: 700, fontSize: 11 }}>Подтверждён</span>;
    return <span style={{ color: '#9AA7AE', fontSize: 11 }}>—</span>;
  },
};
const PAYMENT_TYPE_COL: ColumnDef<ChildRow> = {
  key: 'pendingPaymentType',
  label: 'Вид оплаты',
  type: 'text',
  category: 'Финансы',
  width: 110,
  visible: true,
  sortable: false,
  filterable: false,
  render: (_val: any, row: ChildRow) => {
    const type = row.pendingPaymentType;
    if (!type) return <span style={{ color: '#9AA7AE', fontSize: 11 }}>—</span>;
    const lower = type.toLowerCase();
    if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 700, fontSize: 11 }}>QR</span>;
    if (lower === 'cash' || lower.includes('нал')) return <span style={{ color: '#15803D', fontWeight: 700, fontSize: 11 }}>Наличный</span>;
    return <span style={{ fontSize: 11, color: '#52606F', fontWeight: 600 }}>{type}</span>;
  },
};
function ReceiptThumb({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={e => e.stopPropagation()}
      title="Открыть чек"
      style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: '#237F81' }}
    >
      <Paperclip size={16} strokeWidth={2.5} />
    </a>
  );
}
const PAYMENT_RECEIPT_COL: ColumnDef<ChildRow> = {
  key: 'pendingPaymentReceiptUrl',
  label: 'Чек',
  type: 'text',
  category: 'Финансы',
  width: 56,
  visible: true,
  sortable: false,
  filterable: false,
  render: (_val: any, row: ChildRow) => {
    const url = row.pendingPaymentReceiptUrl;
    if (!url) return <Paperclip size={15} strokeWidth={1.5} style={{ color: '#C8D5D8' }} />;
    return <ReceiptThumb url={url} />;
  },
};
const PAYMENTS_COLUMNS: ColumnDef<ChildRow>[] = [
  COLUMNS.find(c => c.key === 'parentName')!,
  COLUMNS.find(c => c.key === 'phone')!,
  COLUMNS.find(c => c.key === 'childName')!,
  PAYMENT_STATUS_COL,
  PAYMENT_TYPE_COL,
  PAYMENT_RECEIPT_COL,
  ...COLUMNS.filter(c => !['parentName','phone','childName'].includes(String(c.key))),
];
const PAYMENTS_COLUMN_KEYS = new Set(['parentName', 'phone', 'childName', 'paymentStatus', 'pendingPaymentType', 'pendingPaymentReceiptUrl']);

const DEFAULT_ACTIVE_TAB = SCHOOL_TABS.find(t => t.key !== 'ALL')?.key ?? 'TIS';

const DEFAULT_MODE_FILTERS: ModeFilters = {
  activeTab: DEFAULT_ACTIVE_TAB,
  quickTransfer: '',
  quickChildStatus: '',
};
const DEFAULT_MODE_COLLAPSED: Record<FamiliesMode, boolean> = {
  requests: false,
  payments: false,
  charges: false,
  debtors: false,
  directory: false,
  cashier: false,
  logistics: false,
};
const DEFAULT_MODE_SIDEBAR_COLLAPSED: Record<FamiliesMode, boolean> = {
  requests: false,
  payments: false,
  charges: false,
  debtors: false,
  directory: false,
  cashier: false,
  logistics: false,
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'На проверке',
  confirmed: 'Подтверждён',
  rejected: 'Отклонён',
  draft: 'Черновик',
};
const PAYMENT_STATUS_COLOR: Record<string, { color: string }> = {
  pending:   { color: '#B45309' },
  confirmed: { color: '#15803D' },
  rejected:  { color: '#C62828' },
  draft:     { color: '#9AA7AE' },
};
const PAYMENT_TABLE_COLUMNS: ColumnDef<PaymentTableRow>[] = [
  {
    key: 'paymentNumber', label: '№', type: 'number', category: 'Платёж', width: 52,
    render: (val) => <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{val ?? '—'}</span>,
  },
  {
    key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 170,
    render: (val) => <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'phone', label: 'Телефон', type: 'text', category: 'Клиент', width: 130,
    render: (val) => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{val || '—'}</span>,
  },
  {
    key: 'childrenNames', label: 'Дети', type: 'text', category: 'Клиент', width: 200,
    render: (val) => <span style={{ fontSize: 12, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'amount', label: 'Сумма', type: 'currency', category: 'Платёж', width: 110,
    render: (val) => <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{money(Number(val ?? 0))}</span>,
  },
  {
    key: 'status', label: 'Статус', type: 'text', category: 'Платёж', width: 115, sortable: false, filterable: false,
    render: (val) => {
      const s = PAYMENT_STATUS_COLOR[String(val)] ?? { color: '#9AA7AE' };
      return <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{PAYMENT_STATUS_LABEL[String(val)] ?? val}</span>;
    },
  },
  {
    key: 'paymentMethod', label: 'Вид оплаты', type: 'select', category: 'Платёж', width: 110, sortable: false, filterable: false,
    editOptions: PAYMENT_METHOD_OPTIONS,
    render: (val) => {
      if (!val) return <span style={{ color: '#9AA7AE', fontSize: 11 }}>—</span>;
      const lower = String(val).toLowerCase();
      if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 700, fontSize: 11 }}>QR</span>;
      if (lower === 'cash' || lower.includes('нал')) return <span style={{ color: '#15803D', fontWeight: 700, fontSize: 11 }}>Наличный</span>;
      return <span style={{ fontSize: 11, color: '#52606F' }}>{val}</span>;
    },
  },
  {
    key: 'receiptUrl', label: 'Чек', type: 'text', category: 'Платёж', width: 52, sortable: false, filterable: false,
    render: (val) => {
      if (!val) return <Paperclip size={15} strokeWidth={1.5} style={{ color: '#C8D5D8' }} />;
      return <ReceiptThumb url={String(val)} />;
    },
  },
];

function rowToFamily(row: ChildRow): Family {
  return {
    id: row.familyId,
    schoolCode: row.schoolCode as any,
    branchId: row.branchId ?? undefined,
    branchCode: row.schoolCode,
    branchName: row.branchName,
    branchShort: row.branchShort,
    parentName: row.parentName,
    phone: row.phone,
    phoneTelegram: '',
    secondPhone: row.secondPhone,
    secondPhoneTelegram: false,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactPhoneTelegram: false,
    fullAddress: row.streetAddress,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    distanceKm: row.distanceKm ?? undefined,
    zone: row.zone as any,
    vehicleType: row.vehicleType as any,
    vehicleLabel: row.vehicleLabel,
    monthlyPrice: row.monthlyPrice,
    comment: '',
    createdAt: '',
    status: row.status as any,
    transferNumber: row.transferNumber ? Number(row.transferNumber) : undefined,
    stopNumber: row.stopNumber ? Number(row.stopNumber) : undefined,
  };
}

export default function FamiliesPage({ mode = 'requests', userRole = 'admin', userName = 'CRM', allowedSchools, settingsScope, initialQuickFilter, adminFiltersOpen, onAdminFiltersClose, columnsOpen, onColumnsOpenChange, hidePeriodAll = false, hidePeriodDeposit = false, hideTransferBars = false, hideDashboard = false, compactPeriodBar = false, customLeftPanel, onPeriodKeyChange, onSchoolKeyChange, customBarItems, customTopContent, customTableContent, extraSchoolDockItems = [], onSchoolsSidebarWidthChange, externalQuickTransfer, externalQuickChildStatus, externalPeriodKey, initialOpenFamilyId, onInitialFamilyOpened }: FamiliesPageProps) {
  const [rows, setRows]           = useState<ChildRow[]>(() => familiesRowsCache ?? []);
  const [financeLoaded, setFinanceLoaded] = useState(false);
  const [loadingFinanceRows, setLoadingFinanceRows] = useState(false);
  const [paymentRows, setPaymentRows] = useState<PaymentTableRow[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [cashierRows, setCashierRows] = useState<CashierPaymentRow[]>([]);
  const [loadingCashier, setLoadingCashier] = useState(false);
  const [cashierConfirmingId, setCashierConfirmingId] = useState<string | null>(null);
  const [cashierDates, setCashierDates] = useState<Record<string, string>>({});
  const [dashboardTransfers, setDashboardTransfers] = useState<V2TransferDashboardRow[]>([]);
  const [driverRows, setDriverRows] = useState<V2DriverTableRow[]>([]);
  const [loading, setLoading]     = useState(() => !familiesRowsCache);
  const [search, setSearch]       = useState('');
  const roleDefaultChildStatus = userRole === 'cashier' ? '' : 'new';
  const restrictedSchoolKey = allowedSchools && allowedSchools.length === 1 && allowedSchools[0] !== 'ALL' ? allowedSchools[0] : null;
  const [filtersByMode, setFiltersByMode] = useState<Record<FamiliesMode, ModeFilters>>({
    requests: { ...DEFAULT_MODE_FILTERS, activeTab: restrictedSchoolKey ?? DEFAULT_MODE_FILTERS.activeTab, quickChildStatus: roleDefaultChildStatus },
  payments: { ...DEFAULT_MODE_FILTERS, activeTab: restrictedSchoolKey ?? DEFAULT_MODE_FILTERS.activeTab, quickChildStatus: roleDefaultChildStatus, ...initialQuickFilter },
  charges: { ...DEFAULT_MODE_FILTERS, activeTab: restrictedSchoolKey ?? DEFAULT_MODE_FILTERS.activeTab, quickChildStatus: roleDefaultChildStatus, ...initialQuickFilter },
  debtors: { ...DEFAULT_MODE_FILTERS, activeTab: restrictedSchoolKey ?? DEFAULT_MODE_FILTERS.activeTab, quickChildStatus: roleDefaultChildStatus, ...initialQuickFilter },
  directory: { ...DEFAULT_MODE_FILTERS, activeTab: restrictedSchoolKey ?? DEFAULT_MODE_FILTERS.activeTab, ...initialQuickFilter, quickChildStatus: '' },
  cashier:  { ...DEFAULT_MODE_FILTERS, activeTab: 'ALL', ...initialQuickFilter },
  logistics: { ...DEFAULT_MODE_FILTERS, activeTab: restrictedSchoolKey ?? DEFAULT_MODE_FILTERS.activeTab, quickChildStatus: roleDefaultChildStatus },
});
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily]     = useState<Family | null>(null);
  const expandedFamilyRequestRef = useRef<string | null>(null);
  const [expandedInitialTab, setExpandedInitialTab] = useState<'overview' | 'finance'>('overview');
  const [showNewFamily, setShowNewFamily]       = useState(false);
  const [showNewDriver, setShowNewDriver]       = useState(false);
  const [driverBranches, setDriverBranches]     = useState<V2BranchOption[]>([]);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [logisticsDashboardCollapsedByMode, setLogisticsDashboardCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_COLLAPSED });
  const [tableBarsCollapsedByMode, setTableBarsCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_COLLAPSED });
  const [schoolsBarCollapsedByMode, setSchoolsBarCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_SIDEBAR_COLLAPSED });
  const [dashboardSchoolByMode, setDashboardSchoolByMode] = useState<Partial<Record<FamiliesMode, string>>>({});
  const [dashboardMetricByMode, setDashboardMetricByMode] = useState<Partial<Record<FamiliesMode, LogisticsDashboardMetric>>>({});
  const [dashboardVehicleFilterByMode, setDashboardVehicleFilterByMode] = useState<Partial<Record<FamiliesMode, LogisticsVehicleFilter>>>({});
  const [chargesPeriodKey, setChargesPeriodKey] = useState<string>('ALL');
  const [paymentsPeriodKey, setPaymentsPeriodKey] = useState<string>('ALL');
  const isPaymentsMode = mode === 'payments';
  const isCashierMode = mode === 'cashier';

  const cashierColumns = useMemo((): ColumnDef<CashierPaymentRow>[] => [
    { key: 'id', label: 'ID платежа', type: 'text', category: 'Платёж', width: 140, sortable: false, filterable: false, render: (val) => <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'normal', lineHeight: 1.4 }}>{String(val)}</span> },
    { key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 160, render: (val) => <span style={{ fontWeight: 700, fontSize: 13 }}>{val || '—'}</span> },
    { key: 'childrenNames', label: 'Дети', type: 'text', category: 'Клиент', width: 160, render: (val) => {
      const names = String(val || '').split(',').map(n => n.trim()).filter(Boolean);
      if (!names.length) return <span style={{ fontSize: 12, color: '#9AA7AE' }}>—</span>;
      return <span style={{ fontSize: 12, lineHeight: 1.5 }}>{names.map((n, i) => <React.Fragment key={i}>{n}{i < names.length - 1 && <br />}</React.Fragment>)}</span>;
    }},
    { key: 'amount', label: 'Сумма', type: 'currency', category: 'Платёж', width: 110, render: (val) => <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{money(Number(val ?? 0))}</span> },
    {
      key: 'createdAt', label: 'Дата поступления', type: 'text', category: 'Платёж', width: 160, sortable: false, filterable: false,
      render: (_val, row) => (
        <input
          type="date"
          value={cashierDates[row.id] ?? ''}
          onChange={e => { e.stopPropagation(); setCashierDates(prev => ({ ...prev, [row.id]: e.target.value })); }}
          onClick={e => e.stopPropagation()}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 7px', fontSize: 12, color: 'var(--text)', background: '#fff', width: 140 }}
        />
      ),
    },
    {
      key: 'status', label: 'Подтверждение', type: 'text', category: 'Платёж', width: 160, sortable: false, filterable: false,
      render: (_val, row) => {
        const busy = cashierConfirmingId === row.id;
        return (
          <select
            disabled={busy}
            value=""
            onClick={e => e.stopPropagation()}
            onChange={e => {
              e.stopPropagation();
              if (e.target.value === 'confirm') cashierConfirm(row, cashierDates[row.id] ?? '');
              if (e.target.value === 'reject') cashierReject(row);
              e.target.value = '';
            }}
            style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: '#fff', cursor: busy ? 'not-allowed' : 'pointer', width: '100%', opacity: busy ? 0.6 : 1 }}
          >
            <option value="" disabled>На проверке</option>
            <option value="confirm">✓ Подтвердить</option>
            <option value="reject">✕ Отклонить</option>
          </select>
        );
      },
    },
    {
      key: 'paymentMethod', label: 'Вид оплаты', type: 'select', category: 'Платёж', width: 100, sortable: false, filterable: false,
      editable: userRole === 'admin',
      editOptions: PAYMENT_METHOD_OPTIONS,
      render: (val) => {
        if (!val) return <span style={{ color: '#9AA7AE', fontSize: 11 }}>—</span>;
        const lower = String(val).toLowerCase();
        if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 700, fontSize: 11 }}>QR</span>;
        return <span style={{ color: '#15803D', fontWeight: 700, fontSize: 11 }}>Наличный</span>;
      },
    },
    {
      key: 'receiptUrl', label: 'Чек', type: 'text', category: 'Платёж', width: 52, sortable: false, filterable: false,
      render: (val) => !val ? <Paperclip size={15} strokeWidth={1.5} style={{ color: '#C8D5D8' }} /> : <ReceiptThumb url={String(val)} />,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [cashierDates, cashierConfirmingId, userRole]);
  const [periodStats, setPeriodStats] = useState<PeriodChargeStats[]>([]);
  const [, setLoadingPeriod] = useState(false);
  const [transferCardNumber, setTransferCardNumber] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedDriverTab, setSelectedDriverTab] = useState<DriverCardTab>('main');
  const [driverDraft, setDriverDraft] = useState<DriverDraft | null>(null);
  const [driverDocumentsDraft, setDriverDocumentsDraft] = useState<V2DriverDocumentInput[]>(() => createDefaultV2DriverDocuments());
  const [savingDriver, setSavingDriver] = useState(false);
  const [driverAdvances, setDriverAdvances] = useState<V2DriverAdvance[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState('');
  const [advanceComment, setAdvanceComment] = useState('');
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [dashboardMainTab, setDashboardMainTab] = useState<'payments' | 'statement'>('payments');
  const [tabDefaultFilters, setTabDefaultFilters] = useState<Record<string, { metric: LogisticsDashboardMetric; vehicleFilter: LogisticsVehicleFilter }>>({});
  const [adminFilterOpen, setAdminFilterOpen] = useState<string | null>(null);
  const [adminFilterDraft, setAdminFilterDraft] = useState<{ metric: LogisticsDashboardMetric; vehicleFilter: LogisticsVehicleFilter } | null>(null);
  const [savingPageFilter, setSavingPageFilter] = useState(false);
  const [transferTypeMenu, setTransferTypeMenu] = useState<{
    x: number;
    y: number;
    transferNumber: string;
    branchId?: string | null;
    schoolId?: string | null;
  } | null>(null);

  const modeFilters = filtersByMode[mode] ?? DEFAULT_MODE_FILTERS;
  const { activeTab, quickTransfer, quickChildStatus } = modeFilters;
  const isDriversModule = settingsScope === 'drivers';
  const isRequestsModule = mode === 'requests' && !settingsScope;
  const isPaymentsDashboardMode = mode === 'payments' || mode === 'debtors' || mode === 'charges';
  const isChargesMode = mode === 'charges';
  const isDirectoryMode = mode === 'directory';
  const logisticsDashboardCollapsed = logisticsDashboardCollapsedByMode[mode] ?? false;
  const tableBarsCollapsed = tableBarsCollapsedByMode[mode] ?? false;
  const schoolsBarCollapsed = schoolsBarCollapsedByMode[mode] ?? false;
  const schoolsSidebarCollapsed = schoolsBarCollapsed;
  const schoolsSidebarReserveWidth = schoolsSidebarCollapsed ? SCHOOL_DOCK_HIDDEN_WIDTH : SCHOOL_DOCK_WIDTH;
  const dashboardSchoolKey = dashboardSchoolByMode[mode] ?? '';
  const DEFAULT_METRIC_BY_MODE: Record<FamiliesMode, LogisticsDashboardMetric> = {
    requests: 'count',
    payments: 'paidCount',
    charges: 'chargedSum',
    debtors: 'debtorsCount',
    directory: 'count',
    cashier: 'pendingSum',
    logistics: 'average',
  };
  const dashboardMetric = dashboardMetricByMode[mode] ?? tabDefaultFilters[`${mode}:${activeTab}`]?.metric ?? tabDefaultFilters[`${mode}:ALL`]?.metric ?? DEFAULT_METRIC_BY_MODE[mode];
  const dashboardVehicleFilter = dashboardVehicleFilterByMode[mode] ?? tabDefaultFilters[`${mode}:${activeTab}`]?.vehicleFilter ?? tabDefaultFilters[`${mode}:ALL`]?.vehicleFilter ?? 'all';
  const tableStorageKey = isRequestsModule
    ? 'families_table_requests_v3'
    : isChargesMode
      ? 'families_table_charges_v2'
      : isPaymentsMode
      ? 'families_table_payments_v2'
      : settingsScope ? `families_table_${settingsScope}_${mode}` : `families_table_${mode}`;
  const moduleLabel = settingsScope === 'drivers' ? 'Водители' : MODE_LABEL[mode];
  const setModeFilter = (patch: Partial<ModeFilters>) => {
    setFiltersByMode(prev => ({
      ...prev,
      [mode]: {
        ...(prev[mode] ?? DEFAULT_MODE_FILTERS),
        ...patch,
      },
    }));
  };
  useEffect(() => {
    if (externalQuickTransfer === undefined && externalQuickChildStatus === undefined) return;
    setFiltersByMode(prev => ({
      ...prev,
      [mode]: {
        ...(prev[mode] ?? DEFAULT_MODE_FILTERS),
        quickTransfer: externalQuickTransfer ?? '',
        quickChildStatus: externalQuickChildStatus ?? '',
      },
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuickTransfer, externalQuickChildStatus]);

  useEffect(() => {
    if (externalPeriodKey === undefined) return;
    setPaymentsPeriodKey(externalPeriodKey);
  }, [externalPeriodKey]);

  useEffect(() => {
    if (!isCashierMode || externalPeriodKey !== undefined) return;
    if (CASHIER_PERIODS.some(period => period.key === paymentsPeriodKey)) return;
    setPaymentsPeriodKey(currentCashierPeriodKey());
  }, [externalPeriodKey, isCashierMode, paymentsPeriodKey]);
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
    setDashboardSchoolByMode(prev => ({ ...prev, [mode]: key }));
    onSchoolKeyChange?.(key);
  };
  const setDashboardMetric = (metric: LogisticsDashboardMetric) => {
    setDashboardMetricByMode(prev => ({ ...prev, [mode]: metric }));
  };
  const setDashboardVehicleFilter = (filter: LogisticsVehicleFilter) => {
    setDashboardVehicleFilterByMode(prev => ({
      ...prev,
      [mode]: filter,
    }));
  };

  useEffect(() => {
    // «Заявки»/«Справочник» берут данные из useFamiliesPage (постранично) —
    // полная загрузка тут не нужна и раньше приводила к двойному фетчу
    // (полный rows для сводок + отдельная страница для таблицы). Полная
    // загрузка запускается лениво, если mode позже сменится на режим,
    // которому всё ещё нужен весь rows (Кассир/Логистика/Начисления/...).
    if (isRequestsModule || mode === 'directory') return;
    load(!familiesRowsCache);
  }, [isRequestsModule, mode]);

  useEffect(() => {
    if (!restrictedSchoolKey) return;
    setFiltersByMode(prev => {
      const current = prev[mode] ?? DEFAULT_MODE_FILTERS;
      if (current.activeTab === restrictedSchoolKey && !current.quickTransfer) return prev;
      return {
        ...prev,
        [mode]: {
          ...current,
          activeTab: restrictedSchoolKey,
          quickTransfer: '',
          quickChildStatus: mode === 'directory' ? '' : current.quickChildStatus,
        },
      };
    });
    setDashboardSchoolByMode(prev => (
      prev[mode] === restrictedSchoolKey ? prev : { ...prev, [mode]: restrictedSchoolKey }
    ));
    setExpandedFamilyId(null);
    setExpandedFamily(null);
  }, [restrictedSchoolKey, mode]);

  useEffect(() => {
    const nextActiveTab = initialQuickFilter?.activeTab;
    if (!nextActiveTab) return;
    setFiltersByMode(prev => {
      const current = prev[mode] ?? DEFAULT_MODE_FILTERS;
      if (current.activeTab === nextActiveTab) return prev;
      return {
        ...prev,
        [mode]: {
          ...current,
          activeTab: nextActiveTab,
          quickTransfer: '',
          quickChildStatus: mode === 'directory' ? '' : current.quickChildStatus,
        },
      };
    });
    setDashboardSchoolByMode(prev => (
      prev[mode] === nextActiveTab ? prev : { ...prev, [mode]: nextActiveTab }
    ));
  }, [initialQuickFilter?.activeTab, mode]);

  useEffect(() => {
    if (!initialOpenFamilyId) return;
    const row = rows.find(r => r.familyId === initialOpenFamilyId);
    if (!row) return;
    setFiltersByMode(prev => ({
      ...prev,
      [mode]: { ...(prev[mode] ?? DEFAULT_MODE_FILTERS), activeTab: row.branchFilter, quickTransfer: '', quickChildStatus: '' },
    }));
    setDashboardSchoolByMode(prev => (
      prev[mode] === row.branchFilter ? prev : { ...prev, [mode]: row.branchFilter }
    ));
    toggleExpandedFamily(row.familyId, row, 'overview');
    onInitialFamilyOpened?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenFamilyId, rows]);

  useEffect(() => {
    if (mode !== 'payments') return;
    setLoadingPayments(true);
    fetchPaymentsTable()
      .then(setPaymentRows)
      .catch(console.error)
      .finally(() => setLoadingPayments(false));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'cashier') return;
    loadCashierRows();
  }, [mode]);

  function loadCashierRows() {
    setLoadingCashier(true);
    fetchCashierPaymentsTable()
      .then(setCashierRows)
      .catch(console.error)
      .finally(() => setLoadingCashier(false));
  }

  const paymentTableColumns = useMemo(() => (
    PAYMENT_TABLE_COLUMNS.map(column => (
      column.key === 'paymentMethod'
        ? { ...column, editable: userRole === 'admin' }
        : column
    ))
  ), [userRole]);

  async function handlePaymentMethodCellSave(row: PaymentTableRow | CashierPaymentRow, key: string, value: any): Promise<boolean> {
    if (userRole !== 'admin') {
      alert('Менять вид оплаты может только админ');
      return false;
    }
    if (key !== 'paymentMethod') return false;

    try {
      const paymentType = value as PaymentType;
      await updateFamilyPayment(row.id, { paymentType });
      setPaymentRows(prev => prev.map(item => (
        item.id === row.id ? { ...item, paymentMethod: paymentType } : item
      )));
      setCashierRows(prev => prev.map(item => (
        item.id === row.id ? { ...item, paymentMethod: paymentType } : item
      )));
      return true;
    } catch (error) {
      console.error('Payment method save failed', error);
      alert('Не удалось сохранить вид оплаты');
      return false;
    }
  }

  async function cashierConfirm(row: CashierPaymentRow, actualDate: string) {
    if (!actualDate) { alert('Укажите дату поступления'); return; }
    setCashierConfirmingId(row.id);
    try {
      await confirmFamilyPayment({
        payment: { id: row.id, familyId: row.familyId, amount: row.amount, paymentType: (row.paymentMethod ?? 'cash') as any, paymentDate: row.paymentDate ?? '', status: 'На проверке', createdAt: row.createdAt },
        charges: [],
        confirmedBy: userName,
        actualPaymentDate: actualDate,
      });
      loadCashierRows();
    } catch (e: any) { alert('Не удалось подтвердить: ' + (e?.message ?? '')); }
    finally { setCashierConfirmingId(null); }
  }

  async function cashierReject(row: CashierPaymentRow) {
    try {
      await updateFamilyPayment(row.id, { status: 'Отклонено' });
      loadCashierRows();
    } catch (e: any) { alert('Не удалось отклонить: ' + (e?.message ?? '')); }
  }

  useEffect(() => {
    const modes: FamiliesMode[] = ['requests', 'payments', 'debtors', 'directory', 'cashier', 'logistics'];
    Promise.all(modes.map(m => fetchPageFilters(m).catch(() => [] as PageFilterSettings[]))).then(results => {
      const map: Record<string, { metric: LogisticsDashboardMetric; vehicleFilter: LogisticsVehicleFilter }> = {};
      results.forEach((rows, i) => {
        const m = modes[i];
        rows.forEach(row => {
          map[`${m}:${row.tab_key}`] = {
            metric: row.metric as LogisticsDashboardMetric,
            vehicleFilter: row.vehicle_filter as LogisticsVehicleFilter,
          };
        });
      });
      setTabDefaultFilters(map);
    });
  }, []);

  const adminFiltersOpenRef = React.useRef(false);
  useEffect(() => {
    if (!adminFiltersOpenRef.current && adminFiltersOpen) {
      openAdminFilter(activeTab);
    }
    adminFiltersOpenRef.current = adminFiltersOpen ?? false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFiltersOpen]);

  useEffect(() => {
    if (!isDriversModule) return;
    void fetchV2Branches()
      .then(setDriverBranches)
      .catch(error => console.error('Branches load failed', error));
  }, [isDriversModule]);

  useEffect(() => {
    onSchoolsSidebarWidthChange?.(schoolsSidebarReserveWidth);
  }, [onSchoolsSidebarWidthChange, schoolsSidebarReserveWidth]);

  const FINANCE_MODES: FamiliesMode[] = ['payments', 'debtors', 'charges', 'cashier'];
  useEffect(() => {
    if (FINANCE_MODES.includes(mode)) loadFinanceRows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!isChargesMode) return;
    if (chargesPeriodKey === 'ALL') { setPeriodStats([]); return; }
    const period = ALL_PERIODS.find(p => p.key === chargesPeriodKey);
    if (!period) return;
    let cancelled = false;
    setLoadingPeriod(true);
    const isDeposit = period.key === 'deposit';
    fetchChargesForPeriod(
      isDeposit ? null : period.month,
      isDeposit ? null : period.year,
      isDeposit ? 'deposit' : null,
    ).then(stats => {
      if (!cancelled) setPeriodStats(stats);
    }).catch(console.error).finally(() => {
      if (!cancelled) setLoadingPeriod(false);
    });
    return () => { cancelled = true; };
  }, [isChargesMode, chargesPeriodKey]);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setFinanceLoaded(false);
    try {
      const shouldLoadTransportMeta = !hideDashboard || mode === 'logistics' || isDriversModule;
      const [families, transfers, drivers] = await Promise.all([
        fetchV2FamiliesTableCached(),
        shouldLoadTransportMeta ? fetchV2TransfersDashboard().catch(() => []) : Promise.resolve([]),
        shouldLoadTransportMeta ? fetchV2DriversTable().catch(() => []) : Promise.resolve([]),
      ]);
      const result = normalizeRows(families);
      familiesRowsCache = result;
      setRows(result);
      setDashboardTransfers(transfers);
      setDriverRows(drivers);
      if (FINANCE_MODES.includes(mode)) void loadFinanceRows();
    } catch (error) {
      console.error('Families load failed', error);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function loadFinanceRows() {
    if (financeLoaded || loadingFinanceRows) return;
    setLoadingFinanceRows(true);
    try {
      const families = await fetchV2FamiliesTable(true);
      const result = normalizeRows(families);
      familiesRowsCache = result;
      setRows(result);
      setFinanceLoaded(true);
    } catch (error) {
      console.error('Finance rows load failed', error);
    } finally {
      setLoadingFinanceRows(false);
    }
  }

  function openAdminFilter(tabKey: string) {
    const saved = tabDefaultFilters[`${mode}:${tabKey}`];
    setAdminFilterDraft({
      metric: saved?.metric ?? DEFAULT_METRIC_BY_MODE[mode],
      vehicleFilter: saved?.vehicleFilter ?? 'all',
    });
    setAdminFilterOpen(tabKey);
  }

  async function saveAdminFilter() {
    if (!adminFilterOpen || !adminFilterDraft) return;
    setSavingPageFilter(true);
    try {
      await savePageFilter({ mode, tab_key: adminFilterOpen, metric: adminFilterDraft.metric, vehicle_filter: adminFilterDraft.vehicleFilter });
      setTabDefaultFilters(prev => ({
        ...prev,
        [`${mode}:${adminFilterOpen}`]: { metric: adminFilterDraft.metric, vehicleFilter: adminFilterDraft.vehicleFilter },
      }));
      setAdminFilterOpen(null);
      setAdminFilterDraft(null);
      onAdminFiltersClose?.();
    } catch (e) {
      console.error('Ошибка сохранения фильтра', e);
    } finally {
      setSavingPageFilter(false);
    }
  }

  async function toggleExpandedFamily(key: React.Key | null, row?: ChildRow, initialTab: 'overview' | 'finance' = 'overview') {
    if (!key || !row) {
      expandedFamilyRequestRef.current = null;
      setExpandedFamilyId(null);
      setExpandedFamily(null);
      setExpandedInitialTab('overview');
      return;
    }
    const familyId = String(key);
    if (expandedFamilyId === familyId && expandedInitialTab === initialTab) {
      expandedFamilyRequestRef.current = null;
      setExpandedFamilyId(null);
      setExpandedFamily(null);
      setExpandedInitialTab('overview');
      return;
    }
    expandedFamilyRequestRef.current = familyId;
    setExpandedInitialTab(initialTab);
    setExpandedFamilyId(familyId);
    // Показываем карточку мгновенно из данных строки
    const preview = rowToFamily(row);
    setExpandedFamily(preview);
    // Догружаем полные данные в фоне — применяем только если пользователь
    // не успел открыть другую семью, пока шёл этот запрос
    const family = await fetchV2Family(familyId);
    if (family && expandedFamilyRequestRef.current === familyId) setExpandedFamily(family);
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
      if (expandedFamilyId === row.familyId) {
        void fetchV2Family(row.familyId).then(family => {
          if (family && expandedFamilyRequestRef.current === row.familyId) setExpandedFamily(family);
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
    if (!isDriversModule && (!selectedDashboardSchool || selectedDashboardSchool.key === 'ALL')) {
      alert('Сначала выберите конкретную школу');
      setTransferTypeMenu(null);
      return;
    }
    const menuBranchId = transferTypeMenu.branchId ?? null;
    const savedTransfer = dashboardTransfers.find(item =>
      item.transferNumber === transferTypeMenu.transferNumber
      && (menuBranchId
        ? item.branchId === menuBranchId
        : (
          !selectedDashboardSchool
          || selectedDashboardSchool.key === 'ALL'
          || item.branchCode === selectedDashboardSchool.key
          || item.branchShort === selectedDashboardSchool.label
          || item.branchId === dashboardSchoolRows.find(row => row.branchId)?.branchId
        )
      )
    );
    const sampleRow = dashboardSchoolRows.find(row =>
      row.transferNumber === transferTypeMenu.transferNumber && (!menuBranchId || row.branchId === menuBranchId)
    ) ?? dashboardSchoolRows.find(row => row.branchId === menuBranchId) ?? dashboardSchoolRows.find(row => row.branchId);
    const branchId = menuBranchId ?? sampleRow?.branchId ?? savedTransfer?.branchId;
    const schoolId = transferTypeMenu.schoolId ?? sampleRow?.schoolId ?? savedTransfer?.schoolId;
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

      const transferId = await updateV2TransferVehicleType({
        schoolId,
        branchId,
        transferNumber: Number(transferTypeMenu.transferNumber),
        vehicleType,
      });
      setDashboardTransfers(prev => {
        const exists = prev.some(item => item.branchId === branchId && item.transferNumber === transferTypeMenu.transferNumber);
        if (exists) {
          return prev.map(item => (
            item.branchId === branchId && item.transferNumber === transferTypeMenu.transferNumber
              ? { ...item, vehicleType }
              : item
          ));
        }
        return [
          ...prev,
          {
            id: transferId,
            schoolId: schoolId ?? null,
            branchId: branchId ?? null,
            branchCode: sampleRow?.branchFilter ?? selectedDashboardSchool?.key ?? '',
            branchShort: sampleRow?.branchShort ?? selectedDashboardSchool?.label ?? '',
            branchName: sampleRow?.branchName ?? selectedDashboardSchool?.label ?? '',
            transferNumber: transferTypeMenu.transferNumber,
            vehicleType,
            driverId: null,
            createdAt: '',
            updatedAt: '',
          },
        ];
      });
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
      console.error('[VehicleType change] FAILED', error);
      alert('Не удалось изменить тип транспорта трансфера');
      setTransferTypeMenu(null);
    }
  }

  // Если у сотрудника ограниченный доступ — фильтруем по его школам
  const hasSchoolRestriction = allowedSchools && allowedSchools.length > 0 && !allowedSchools.includes('ALL');

  // Проверяем доступна ли вкладка сотруднику (сравнение без учёта регистра)
  const isTabAllowed = useCallback((tabKey: string) => {
    if (!hasSchoolRestriction) return true;
    if (tabKey === 'ALL') return true;
    return allowedSchools!.some(k => k.toLowerCase() === tabKey.toLowerCase());
  }, [allowedSchools, hasSchoolRestriction]);

  const matchesSingleTab = useCallback((row: ChildRow, tabItem: typeof SCHOOL_TABS[number]) => {
    if (row.branchFilter === tabItem.key) return true;
    if (tabItem.branches.length > 0) return tabItem.branches.includes(row.branchName);
    if (tabItem.codes.length > 0) return tabItem.codes.includes(row.schoolCode);
    return false;
  }, []);

  const rowMatchesSchoolTab = useCallback((row: ChildRow, tabItem: typeof SCHOOL_TABS[number]) => {
    if (tabItem.key === 'ALL') {
      if (!hasSchoolRestriction) return true;
      // «Все школы» для ограниченного сотрудника — не «вообще все», а объединение
      // его собственных разрешённых школ (раньше тут была строка, всегда
      // возвращавшая true для любого сотрудника с непустым allowedSchools).
      return SCHOOL_TABS.some(t => (
        allowedSchools!.some(k => k.toLowerCase() === t.key.toLowerCase()) && matchesSingleTab(row, t)
      ));
    }
    if (!isTabAllowed(tabItem.key)) return false;
    return matchesSingleTab(row, tabItem);
  }, [allowedSchools, hasSchoolRestriction, isTabAllowed, matchesSingleTab]);

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
    const debtRows = childDebtorRows(workRows);
    const pendingFamilyRows = uniqueFamilyRows(workRows.filter(row => row.pendingPayment > 0));
    const paidFamilyRows = familyRows.filter(row => row.paidPaymentCount > 0 || row.paidPaymentAmount > 0 || row.totalPaid > 0);
    return {
      transferCount: allTransfers.size,
      studentCount: workRows.length,
      average: averageTransfers.size ? averageRows.length / averageTransfers.size : 0,
      chargedSum: workRows.reduce((sum, row) => sum + Number(row.totalCharged || 0), 0),
      paidCount: paidFamilyRows.reduce((sum, row) => sum + Number(row.paidPaymentCount || 0), 0),
      paidPaymentSum: paidFamilyRows.reduce((sum, row) => sum + Number(row.paidPaymentAmount || row.totalPaid || 0), 0),
      paidSum: uniqueFamilyRows(workRows).reduce((sum, row) => sum + Number(row.paidPaymentAmount || 0), 0),
      balanceSum: familyRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
      debtorsCount: debtRows.length,
      debtSum: debtRows.reduce((sum, row) => sum + childDebtAmount(row), 0),
      pendingSum: pendingFamilyRows.reduce((sum, row) => sum + Number(row.pendingPaymentCount || 0), 0),
      pendingAmount: pendingFamilyRows.reduce((sum, row) => sum + Number(row.pendingPayment || 0), 0),
      rejectedCount: uniqueFamilyRows(workRows.filter(r => r.rejectedPaymentCount > 0)).reduce((s, r) => s + r.rejectedPaymentCount, 0),
      rejectedSum: uniqueFamilyRows(workRows.filter(r => r.rejectedPaymentCount > 0)).reduce((s, r) => s + r.rejectedPaymentAmount, 0),
      allPaymentsCount: uniqueFamilyRows(workRows.filter(r => r.allPaymentCount > 0)).reduce((s, r) => s + r.allPaymentCount, 0),
      allPaymentsSum: uniqueFamilyRows(workRows.filter(r => r.allPaymentCount > 0)).reduce((s, r) => s + r.allPaymentAmount, 0),
    };
  }, [dashboardVehicleFilter]);
  const dashboardMetricValue = useCallback((stats: ReturnType<typeof dashboardStatsForRows>) => {
    if (dashboardMetric === 'count') return stats.studentCount;
    if (dashboardMetric === 'debtSum') return stats.debtSum;
    if (dashboardMetric === 'debtorsCount') return stats.debtorsCount;
    if (dashboardMetric === 'chargedSum') return stats.chargedSum;
    if (dashboardMetric === 'paidCount') return stats.paidCount;
    if (dashboardMetric === 'paidSum') return stats.paidSum;
    if (dashboardMetric === 'balanceSum') return stats.balanceSum;
    if (dashboardMetric === 'pendingSum') return stats.pendingSum;
    if (dashboardMetric === 'pendingAmount') return stats.pendingAmount;
    if (dashboardMetric === 'rejectedCount') return stats.rejectedCount;
    if (dashboardMetric === 'rejectedSum') return stats.rejectedSum;
    if (dashboardMetric === 'allPaymentsCount') return stats.allPaymentsCount;
    if (dashboardMetric === 'allPaymentsSum') return stats.allPaymentsSum;
    return stats.average;
  }, [dashboardMetric]);

  const tab = useMemo(() => SCHOOL_TABS.find(t => t.key === activeTab), [activeTab]);

  // Постраничная загрузка для «Заявки»/«Справочник» — единственных режимов,
  // переведённых на серверную пагинацию (RPC get_families_page). Остальные
  // режимы (Кассир/Логистика/Начисления/Платежи) по-прежнему грузят rows
  // целиком через load() — у них есть свои дашборды, посчитанные по полному
  // массиву, которые пагинация молча сломала бы, начни они брать данные
  // отсюда без отдельного агрегирующего запроса под каждый такой дашборд.
  const isPagedMode = isRequestsModule || isDirectoryMode;
  const branchStatsForPaging = useBranchStats();
  const [familiesPageNumber, setFamiliesPageNumber] = useState(0);
  const FAMILIES_PAGE_SIZE = 100;

  const isUnrestrictedAll = (!tab || tab.key === 'ALL') && !hasSchoolRestriction;

  const activeTabKeys = useMemo(() => {
    const allTabKeys = SCHOOL_TABS.filter(t => t.key !== 'ALL').map(t => t.key);
    const base = (!tab || tab.key === 'ALL') ? allTabKeys : [tab.key];
    if (!hasSchoolRestriction) return base;
    return base.filter(key => isTabAllowed(key));
  }, [tab, hasSchoolRestriction, isTabAllowed]);

  // Резолвим выбранную школьную вкладку (+ ограничение allowedSchools) в
  // конкретные branch_id — RPC ничего не знает про SCHOOL_TABS/BRANCH_TO_FILTER,
  // эта группировка остаётся клиентской (как и в get_branch_stats).
  const branchIdsForPage = useMemo(() => {
    if (isUnrestrictedAll) return null;
    const branches = branchStatsForPaging.data ?? [];
    const keySet = new Set(activeTabKeys);
    return branches
      .filter(b => keySet.has(getBranchFilter(b.branchName, b.branchCode)))
      .map(b => b.branchId);
  }, [isUnrestrictedAll, activeTabKeys, branchStatsForPaging.data]);

  const branchesReadyForPaging = isUnrestrictedAll || branchStatsForPaging.isSuccess;

  // quickChildStatus==='transfered' — синтетический статус (row.transferNumber
  // непусто), а не значение колонки status в базе; переводим его отдельно в
  // hasTransfer, не путая с реальными статусами ('new'/'rejected'/...).
  const pagedChildStatus = (quickChildStatus && quickChildStatus !== 'transfered') ? quickChildStatus : null;
  const pagedHasTransfer = quickTransfer === 'empty' ? false : (quickChildStatus === 'transfered' ? true : null);
  const pagedTransferNumber = quickTransfer && quickTransfer !== 'empty' && quickTransfer !== 'inactive'
    ? Number(quickTransfer) : null;

  const familiesPageQuery = useFamiliesPage({
    branchIds: branchIdsForPage,
    search: search || undefined,
    childStatus: pagedChildStatus,
    hasTransfer: pagedHasTransfer,
    transferNumber: pagedTransferNumber,
    excludeRejectedChildren: isDirectoryMode,
    page: familiesPageNumber,
    pageSize: FAMILIES_PAGE_SIZE,
  }, { enabled: isPagedMode && branchesReadyForPaging });

  useEffect(() => {
    setFamiliesPageNumber(0);
  }, [mode, activeTab, search, quickChildStatus, quickTransfer]);

  const pagedRows = familiesPageQuery.data?.rows ?? EMPTY_CHILD_ROWS;
  const pagedTotalFamilies = familiesPageQuery.data?.totalFamilies ?? 0;
  const pagedTotalChildren = familiesPageQuery.data?.totalChildren ?? 0;
  const pagedTotalWithTransfer = familiesPageQuery.data?.totalWithTransfer ?? 0;
  const pagedTotalWithoutTransfer = familiesPageQuery.data?.totalWithoutTransfer ?? 0;
  const pagedTotalPages = Math.max(1, Math.ceil(pagedTotalFamilies / FAMILIES_PAGE_SIZE));

  const modeRows = useMemo(() => {
    if (isPagedMode) return pagedRows;
    return mode === 'logistics' ? logisticsWorkRows(rows) : rows;
  }, [isPagedMode, pagedRows, mode, rows]);

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
      if (isPaymentsDashboardMode) {
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
    } else if (isPaymentsDashboardMode) {
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
  }, [isPaymentsDashboardMode, matchesSchool, matchesSearch, mode, rows]);

  // Для режима Начисление — агрегаты по выбранному периоду
  const periodStatsFiltered = useMemo(() => {
    if (!isChargesMode || chargesPeriodKey === 'ALL' || periodStats.length === 0) return null;
    const relevant = periodStats;
    return {
      charged: relevant.reduce((s, r) => s + r.charged, 0),
      paid: relevant.filter(r => r.debt === 0 && r.paid > 0).reduce((s, r) => s + r.paid, 0),
      paidCount: relevant.filter(r => r.debt === 0 && r.paid > 0).length,
      debtorsCount: relevant.filter(r => r.debt > 0).length,
      debtSum: relevant.filter(r => r.debt > 0).reduce((s, r) => s + r.debt, 0),
      paidFamilyIds: new Set(relevant.filter(r => r.debt === 0 && r.paid > 0).map(r => r.familyId)),
    };
  }, [isChargesMode, chargesPeriodKey, periodStats]);

  const filtered = useMemo(() => modeRows.filter(r => {
    if (!matchesSchool(r)) return false;
    if (!matchesSearch(r)) return false;
    if (mode === 'debtors' && childDebtAmount(r) <= 0) return false;
    if (mode === 'payments') {
      const hasPending = r.pendingPayment > 0 || r.pendingPaymentCount > 0;
      const hasPaid = r.paidPaymentCount > 0 || r.paidPaymentAmount > 0;
      const hasRejected = r.rejectedPaymentCount > 0;
      const hasAny = r.allPaymentCount > 0;
      if ((dashboardMetric === 'pendingSum' || dashboardMetric === 'pendingAmount') && !hasPending) return false;
      if ((dashboardMetric === 'paidCount' || dashboardMetric === 'paidSum') && !hasPaid) return false;
      if ((dashboardMetric === 'rejectedCount' || dashboardMetric === 'rejectedSum') && !hasRejected) return false;
      if ((dashboardMetric === 'allPaymentsCount' || dashboardMetric === 'allPaymentsSum') && !hasAny) return false;
      if (!hasAny) return false;
    }
    if (mode === 'charges') {
      if (dashboardMetric === 'count' && r.status !== 'new') return false;
      if (dashboardMetric === 'chargedSum' && Number(r.totalCharged || 0) <= 0) return false;
      if (dashboardMetric === 'paidSum' || dashboardMetric === 'paidCount') {
        if (periodStatsFiltered?.paidFamilyIds) {
          if (!periodStatsFiltered.paidFamilyIds.has(r.familyId)) return false;
        } else {
          if (childDebtAmount(r) > 0 || Number(r.totalPaid || 0) <= 0) return false;
        }
      }
      if ((dashboardMetric === 'pendingSum' || dashboardMetric === 'pendingAmount') && r.pendingPayment <= 0) return false;
      if (dashboardMetric === 'debtorsCount' || dashboardMetric === 'debtSum') {
        const periodDebt = periodStatsFiltered ? (periodStatsByFamily.get(r.familyId)?.debt ?? 0) : childDebtAmount(r);
        if (periodDebt <= 0) return false;
      }
      if (dashboardMetric === 'balanceSum' && Number(r.balance || 0) <= 0) return false;
    }
    if (mode === 'cashier' && r.pendingPayment <= 0) return false;
    if (quickTransfer === 'empty' && r.transferNumber) return false;
    if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
    if (quickChildStatus === 'transfered' && !r.transferNumber) return false;
    if (quickChildStatus && quickChildStatus !== 'transfered' && r.status !== quickChildStatus) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dashboardMetric, matchesSchool, matchesSearch, mode, modeRows, quickChildStatus, quickTransfer]);

  const filteredSorted = useMemo(() => {
    if (!isChargesMode) return filtered;
    const periodFamilyIds = chargesPeriodKey !== 'ALL' && periodStats.length > 0
      ? new Set(periodStats.map(s => s.familyId))
      : null;
    const base = periodFamilyIds
      ? filtered.filter(r => periodFamilyIds.has(r.familyId))
      : filtered;
    return [...base].sort((a, b) => childDebtAmount(b) - childDebtAmount(a));
  }, [filtered, isChargesMode, chargesPeriodKey, periodStats]);

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
  const quickStatusItems = useMemo(() => {
    const items = [
      {
        key: 'new',
        label: '?',
        title: 'Новые',
        count: rows.filter(row => row.status === 'new' && matchesSchool(row) && matchesSearch(row)).length,
        tone: '#31A4A5',
      },
    ];
    if (!isDirectoryMode) {
      items.push({
        key: 'rejected',
        label: '×',
        title: 'Отказ',
        count: rows.filter(row => row.status === 'rejected' && matchesSchool(row) && matchesSearch(row)).length,
        tone: '#64748B',
      });
    }
    return items;
  }, [isDirectoryMode, matchesSchool, matchesSearch, rows]);
  const schoolButtonItems = SCHOOL_TABS;
  const schoolSidebarFullLabel: Record<string, string> = {
    TIS: 'Тенсай',
    ERU: 'Эрудит-ISIT',
    EDi: 'Edison',
    EPS: 'Эпсилон',
    AES: 'American-European School',
    KAS: 'Kyrgyz-American School',
    GEN2: 'Гениум — Чуйкова',
    GEN4: 'Гениум — Авангард',
    NOVA: 'Nova International School',
    ING: 'Индиго Kids',
    ING_P: 'Indigo Prime Academy',
    ING_W: 'Indigo West',
    LA: 'Light Academy',
    BKG: 'Билим Бишкек KG',
    BJ: 'Билим Жолу',
    ALL: 'Все',
  };
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
  const periodStatsByFamily = useMemo(() => {
    const map = new Map<string, PeriodChargeStats>();
    periodStats.forEach(s => map.set(s.familyId, s));
    return map;
  }, [periodStats]);

  const logisticsAvgItems = useMemo(() => schoolButtonItems
    .map((item, index) => {
      const itemRows = item.key === 'ALL' ? rows : rows.filter(row => rowMatchesSchoolTab(row, item));
      let value: number;
      if (isDriversModule) {
        value = new Set(logisticsWorkRows(itemRows).map(row => row.driverId).filter(Boolean)).size;
      } else if (isRequestsModule) {
        value = itemRows.filter(row => row.status === 'new').length;
      } else if (isDirectoryMode) {
        value = logisticsWorkRows(itemRows).length;
      } else if (isChargesMode) {
        const uniqueFamilyIds = Array.from(new Set(itemRows.map(r => r.familyId)));
        if (chargesPeriodKey !== 'ALL' && periodStats.length > 0) {
          const relevant = uniqueFamilyIds.map(id => periodStatsByFamily.get(id)).filter(Boolean) as PeriodChargeStats[];
          if (dashboardMetric === 'chargedSum') {
            value = relevant.reduce((s, r) => s + r.charged, 0);
          } else if (dashboardMetric === 'paidSum') {
            value = relevant.filter(r => r.debt === 0 && r.paid > 0).reduce((s, r) => s + r.paid, 0);
          } else if (dashboardMetric === 'paidCount') {
            value = relevant.filter(r => r.debt === 0 && r.paid > 0).length;
          } else if (dashboardMetric === 'debtorsCount') {
            value = relevant.filter(r => r.debt > 0).length;
          } else if (dashboardMetric === 'debtSum') {
            value = relevant.filter(r => r.debt > 0).reduce((s, r) => s + r.debt, 0);
          } else if (dashboardMetric === 'balanceSum') {
            value = dashboardMetricValue(dashboardStatsForRows(itemRows));
          } else if (dashboardMetric === 'pendingSum') {
            value = uniqueFamilyRows(itemRows.filter(r => r.pendingPayment > 0)).reduce((s, r) => s + Number(r.pendingPaymentCount || 0), 0);
          } else if (dashboardMetric === 'pendingAmount') {
            value = uniqueFamilyRows(itemRows.filter(r => r.pendingPayment > 0)).reduce((s, r) => s + Number(r.pendingPayment || 0), 0);
          } else {
            value = dashboardMetricValue(dashboardStatsForRows(itemRows));
          }
        } else if (dashboardMetric === 'count') {
          value = uniqueFamilyRows(itemRows.filter(r => r.status === 'new')).length;
        } else if (dashboardMetric === 'paidCount') {
          value = uniqueFamilyRows(itemRows.filter(r => childDebtAmount(r) === 0 && Number(r.totalPaid || 0) > 0)).length;
        } else if (dashboardMetric === 'paidSum') {
          value = uniqueFamilyRows(itemRows.filter(r => childDebtAmount(r) === 0 && Number(r.totalPaid || 0) > 0)).reduce((s, r) => s + Number(r.totalPaid || 0), 0);
        } else if (dashboardMetric === 'debtorsCount') {
          value = uniqueFamilyRows(itemRows.filter(r => childDebtAmount(r) > 0)).length;
        } else if (dashboardMetric === 'debtSum') {
          value = uniqueFamilyRows(itemRows.filter(r => childDebtAmount(r) > 0)).reduce((s, r) => s + childDebtAmount(r), 0);
        } else {
          value = dashboardMetricValue(dashboardStatsForRows(itemRows));
        }
      } else {
        value = dashboardMetricValue(dashboardStatsForRows(itemRows));
      }
      return {
        key: item.key,
        label: item.key === 'ALL' ? 'Все' : item.label,
        value,
        color: LOGISTICS_CHART_COLORS[index % LOGISTICS_CHART_COLORS.length],
      };
    }), [chargesPeriodKey, dashboardMetric, dashboardMetricValue, dashboardStatsForRows, isChargesMode, isDirectoryMode, isDriversModule, isRequestsModule, periodStats, periodStatsByFamily, rowMatchesSchoolTab, rows, schoolButtonItems]);
  const driverReserveSchool = { key: DRIVER_RESERVE_KEY, label: 'Резерв', branches: [], codes: [] };
  const selectedDashboardSchool = isDriversModule && (dashboardSchoolKey === DRIVER_RESERVE_KEY || activeTab === DRIVER_RESERVE_KEY)
    ? driverReserveSchool
    : schoolButtonItems.find(item => item.key === dashboardSchoolKey)
      ?? schoolButtonItems.find(item => item.key === activeTab)
      ?? schoolButtonItems[0];
  const isAllDashboardSchools = selectedDashboardSchool?.key === 'ALL';
  const dashboardSchoolRows = useMemo(() => (
    selectedDashboardSchool
      ? rows.filter(row => rowMatchesSchoolTab(row, selectedDashboardSchool))
      : []
  ), [rowMatchesSchoolTab, rows, selectedDashboardSchool]);
  const dashboardWorkRows = logisticsWorkRows(dashboardSchoolRows);
  const dashboardVehicleRows = dashboardVehicleFilter === 'all'
    ? dashboardWorkRows
    : dashboardWorkRows.filter(row => row.vehicleType === dashboardVehicleFilter);
  const dashboardTransferItems: LogisticsTransferDashboardItem[] = selectedDashboardSchool && !isRequestsModule
    ? [
        ...TRANSFER_BAR_OPTIONS.map(transfer => {
          const transferRows = dashboardVehicleRows.filter(row => row.transferNumber === transfer);
          const originalTransferRows = dashboardWorkRows.filter(row => row.transferNumber === transfer);
          const count = transferRows.length;
          let metricValue: number;
          if (isChargesMode && chargesPeriodKey !== 'ALL' && periodStats.length > 0) {
            const uniqueFamilyIds = Array.from(new Set(transferRows.map(r => r.familyId)));
            const relevant = uniqueFamilyIds.map(id => periodStatsByFamily.get(id)).filter(Boolean) as PeriodChargeStats[];
            if (dashboardMetric === 'chargedSum') metricValue = relevant.reduce((s, r) => s + r.charged, 0);
            else if (dashboardMetric === 'paidSum') metricValue = relevant.filter(r => r.debt === 0 && r.paid > 0).reduce((s, r) => s + r.paid, 0);
            else if (dashboardMetric === 'paidCount') metricValue = relevant.filter(r => r.debt === 0 && r.paid > 0).length;
            else metricValue = dashboardMetricValue(dashboardStatsForRows(transferRows));
          } else {
            metricValue = isPaymentsDashboardMode
              ? dashboardMetricValue(dashboardStatsForRows(transferRows))
              : count;
          }
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
          const transferBranchId = originalTransferRows.find(row => row.branchId)?.branchId
            ?? savedTransfer?.branchId
            ?? dashboardWorkRows.find(row => row.branchId)?.branchId
            ?? null;
          const transferSchoolId = originalTransferRows.find(row => row.schoolId)?.schoolId
            ?? savedTransfer?.schoolId
            ?? dashboardWorkRows.find(row => row.schoolId)?.schoolId
            ?? null;
          const driverMode = isDriversModule;
          return {
            key: `transfer-${transfer}`,
            label: `#${transfer}`,
            group: 'Трансферы',
            value: driverMode && vehicleType ? 1 : metricValue,
            count: driverMode && vehicleType ? 1 : metricValue,
            color: driverMode && vehicleType ? (logisticsVehicleTypeLineColor(vehicleType) ?? '#31A4A5') : logisticsTransferCountColor(count),
            vehicleType,
            branchId: transferBranchId,
            schoolId: transferSchoolId,
          };
        }),
        ...(isDriversModule ? [] : [
          {
            key: 'new',
            label: '?',
            group: 'Статус',
            value: isPaymentsDashboardMode ? dashboardMetricValue(dashboardStatsForRows(dashboardVehicleRows.filter(row => row.status === 'new'))) : dashboardVehicleRows.filter(row => row.status === 'new').length,
            count: isPaymentsDashboardMode ? dashboardMetricValue(dashboardStatsForRows(dashboardVehicleRows.filter(row => row.status === 'new'))) : dashboardVehicleRows.filter(row => row.status === 'new').length,
            color: '#5A9FE8',
          },
          ...(isDirectoryMode || isChargesMode ? [] : [{
            key: 'rejected',
            label: 'X',
            group: 'Статус',
            value: isPaymentsDashboardMode ? dashboardMetricValue(dashboardStatsForRows(dashboardSchoolRows.filter(row => row.status === 'rejected'))) : dashboardSchoolRows.filter(row => row.status === 'rejected').length,
            count: isPaymentsDashboardMode ? dashboardMetricValue(dashboardStatsForRows(dashboardSchoolRows.filter(row => row.status === 'rejected'))) : dashboardSchoolRows.filter(row => row.status === 'rejected').length,
            color: '#EF7168',
          }]),
        ]),
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
  const logisticsTransferSummaryItems = useMemo(() => {
    const transferSummary = transferVehicleSummary(dashboardWorkRows);

    return [
      { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
      { label: 'К-во Трансферов', value: String(transferSummary.transferCount) },
      { label: 'К-во учеников', value: String(transferSummary.studentCount) },
      { label: 'Микроавтобус - к-во', value: String(transferSummary.microbusCount) },
      { label: 'Минивэн - к-во', value: String(transferSummary.minivanCount) },
      { label: 'Седан - к-во', value: String(transferSummary.sedanCount) },
      { label: 'Средний (микроавтобусы)', value: transferSummary.microbusAverage.toFixed(1) },
    ];
  }, [dashboardWorkRows, selectedDashboardSchool]);

  const paymentDashboardRows = selectedDashboardSchool?.key && selectedDashboardSchool.key !== 'ALL'
    ? paymentRows.filter(row => {
      const branch = row.branchShort.toLowerCase();
      return branch === selectedDashboardSchool.key.toLowerCase() || branch === selectedDashboardSchool.label.toLowerCase();
    })
    : paymentRows;
  const paymentCashRows = paymentDashboardRows.filter(row => {
    const method = String(row.paymentMethod ?? 'cash').toLowerCase();
    return method === 'cash' || method.includes('нал');
  });
  const paymentQrRows = paymentDashboardRows.filter(row => {
    const method = String(row.paymentMethod ?? '').toLowerCase();
    return method === 'transfer' || method === 'card' || method.includes('qr');
  });

  const paymentDashboardSummaryItems = [
    { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
    { label: 'Все платежи к-во', value: String(dashboardSummaryStats.allPaymentsCount), metric: 'allPaymentsCount' as LogisticsDashboardMetric },
    { label: 'Все платежи сумма', value: compactMoney(dashboardSummaryStats.allPaymentsSum), metric: 'allPaymentsSum' as LogisticsDashboardMetric },
    { label: 'На проверке к-во', value: String(dashboardSummaryStats.pendingSum), metric: 'pendingSum' as LogisticsDashboardMetric },
    { label: 'На проверке сумма', value: compactMoney(dashboardSummaryStats.pendingAmount), metric: 'pendingAmount' as LogisticsDashboardMetric },
    { label: 'Подтверждённые к-во', value: String(dashboardSummaryStats.paidCount), metric: 'paidCount' as LogisticsDashboardMetric },
    { label: 'Подтверждённые сумма', value: compactMoney(dashboardSummaryStats.paidPaymentSum), metric: 'paidSum' as LogisticsDashboardMetric },
    { label: 'Отклонённые к-во', value: String(dashboardSummaryStats.rejectedCount), metric: 'rejectedCount' as LogisticsDashboardMetric },
    { label: 'Отклонённые сумма', value: compactMoney(dashboardSummaryStats.rejectedSum), metric: 'rejectedSum' as LogisticsDashboardMetric },
    { label: 'Наличные сумма', value: compactMoney(paymentCashRows.reduce((s, r) => s + r.amount, 0)), neutral: true },
    { label: 'Наличные к-во', value: String(paymentCashRows.length), neutral: true },
    { label: 'QR сумма', value: compactMoney(paymentQrRows.reduce((s, r) => s + r.amount, 0)), neutral: true },
    { label: 'QR к-во', value: String(paymentQrRows.length), neutral: true },
  ];
  const chargesAllPaidCount = useMemo(() => {
    const uniqueFamilies = new Map<string, { debt: number; paid: number }>();
    dashboardSummaryRows.forEach(r => {
      const prev = uniqueFamilies.get(r.familyId);
      if (!prev) uniqueFamilies.set(r.familyId, { debt: childDebtAmount(r), paid: Number(r.totalPaid || 0) });
    });
    return Array.from(uniqueFamilies.values()).filter(f => f.debt === 0 && f.paid > 0).length;
  }, [dashboardSummaryRows]);
  const chargesAllPaidSum = useMemo(() => {
    const uniqueFamilies = new Map<string, { debt: number; paid: number }>();
    dashboardSummaryRows.forEach(r => {
      const prev = uniqueFamilies.get(r.familyId);
      if (!prev) uniqueFamilies.set(r.familyId, { debt: childDebtAmount(r), paid: Number(r.totalPaid || 0) });
    });
    return Array.from(uniqueFamilies.values()).filter(f => f.debt === 0 && f.paid > 0).reduce((s, f) => s + f.paid, 0);
  }, [dashboardSummaryRows]);

  const chargesDashboardSummaryItems = [
    { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
    { label: 'Начислено сумма', value: compactMoney(periodStatsFiltered?.charged ?? dashboardSummaryStats.chargedSum), metric: 'chargedSum' as LogisticsDashboardMetric },
    { label: 'Оплачено', value: compactMoney(periodStatsFiltered?.paid ?? chargesAllPaidSum), metric: 'paidSum' as LogisticsDashboardMetric },
    { label: 'Оплачено к-во', value: String(periodStatsFiltered?.paidCount ?? chargesAllPaidCount), metric: 'paidCount' as LogisticsDashboardMetric },
    { label: 'Долг к-во', value: String(periodStatsFiltered?.debtorsCount ?? dashboardSummaryStats.debtorsCount), metric: 'debtorsCount' as LogisticsDashboardMetric },
    { label: 'Долг сумма', value: compactMoney(periodStatsFiltered?.debtSum ?? dashboardSummaryStats.debtSum), metric: 'debtSum' as LogisticsDashboardMetric },
    { label: 'Баланс', value: compactMoney(dashboardSummaryStats.balanceSum), metric: 'balanceSum' as LogisticsDashboardMetric },
  ];
  const debtorsDashboardSummaryItems = [
    { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
    { label: 'Должники', value: String(dashboardSummaryStats.debtorsCount), metric: 'debtorsCount' as LogisticsDashboardMetric },
    { label: 'Долг', value: compactMoney(dashboardSummaryStats.debtSum), metric: 'debtSum' as LogisticsDashboardMetric },
  ];
  // «Справочник» переведён на серверную пагинацию (useFamiliesPage) — его
  // сводка берёт готовые агрегаты из того же RPC-ответа (total_children/
  // total_families/total_with_transfer/total_without_transfer, посчитанные
  // по ВСЕЙ отфильтрованной выборке, а не только по текущей странице),
  // а не считает по dashboardSummaryRows/rows, которые для этого режима
  // больше не грузятся целиком.
  const directoryDashboardSummaryItems = [
    { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
    { label: 'К-во', value: String(pagedTotalChildren), metric: 'count' as LogisticsDashboardMetric },
    { label: 'Семьи', value: String(pagedTotalFamilies) },
    { label: 'С трансфером', value: String(pagedTotalWithTransfer) },
    { label: 'Без трансфера', value: String(pagedTotalWithoutTransfer) },
  ];
  const allowedMetrics = METRICS_BY_ROLE[userRole] ?? METRICS_BY_ROLE.admin;
  const visibleDashboardMetrics = LOGISTICS_DASHBOARD_METRICS.filter(m => allowedMetrics.includes(m.key));
  const dashboardMetricOptions = isRequestsModule
    ? [{ key: 'count' as LogisticsDashboardMetric, label: 'Новые' }]
    : isDriversModule
    ? [{ key: 'count' as LogisticsDashboardMetric, label: 'Водители' }]
    : isDirectoryMode
    ? [{ key: 'count' as LogisticsDashboardMetric, label: 'К-во' }]
    : visibleDashboardMetrics;
  const dashboardDisplayMetric = isRequestsModule
    ? 'count' as LogisticsDashboardMetric
    : isDriversModule
    ? 'count' as LogisticsDashboardMetric
    : (allowedMetrics.includes(dashboardMetric) ? dashboardMetric : allowedMetrics[0]);
  const dashboardDisplayMetricOption = dashboardMetricOptions.find(option => option.key === dashboardDisplayMetric);
  const dashboardPrimaryValue = isRequestsModule || isDirectoryMode
    ? pagedTotalChildren
    : isDriversModule
    ? new Set(logisticsWorkRows(dashboardSummaryRows).map(row => row.driverId).filter(Boolean)).size
    : dashboardMetricValue(dashboardSummaryStats);
  const cashierDashboardRows = selectedDashboardSchool?.key && selectedDashboardSchool.key !== 'ALL'
    ? cashierRows.filter(row => {
      const branch = row.branchShort.toLowerCase();
      return branch === selectedDashboardSchool.key.toLowerCase() || branch === selectedDashboardSchool.label.toLowerCase();
    })
    : cashierRows;
  const periodCashierDashboardRows = cashierDashboardRows.filter(row => paymentRowMatchesPeriod(row, paymentsPeriodKey));
  const periodCashierCashRows = periodCashierDashboardRows.filter(row => {
    const method = String(row.paymentMethod ?? 'cash').toLowerCase();
    return method === 'cash' || method.includes('нал');
  });
  const periodCashierQrRows = periodCashierDashboardRows.filter(row => {
    const method = String(row.paymentMethod ?? '').toLowerCase();
    return method === 'transfer' || method === 'card' || method.includes('qr');
  });
  const cashierWithReceiptCount = periodCashierDashboardRows.filter(row => row.receiptUrl).length;
  const cashierWithoutReceiptCount = periodCashierDashboardRows.length - cashierWithReceiptCount;
  const dashboardSummaryItems = [
    ...(isDriversModule ? (() => {
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
    })() : isRequestsModule ? [
      { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
      { label: 'Новые', value: String(pagedTotalChildren) },
    ] : isDirectoryMode ? directoryDashboardSummaryItems : mode === 'debtors' ? debtorsDashboardSummaryItems : isChargesMode ? chargesDashboardSummaryItems : isCashierMode ? [
      { label: 'Школа', value: selectedDashboardSchool?.label ?? 'Все' },
      { label: 'На проверке', value: String(periodCashierDashboardRows.length), neutral: true },
      { label: 'Сумма', value: compactMoney(periodCashierDashboardRows.reduce((s, r) => s + r.amount, 0)), neutral: true },
      { label: 'Наличные сумма', value: compactMoney(periodCashierCashRows.reduce((s, r) => s + r.amount, 0)), neutral: true },
      { label: 'Наличные к-во', value: String(periodCashierCashRows.length), neutral: true },
      { label: 'QR сумма', value: compactMoney(periodCashierQrRows.reduce((s, r) => s + r.amount, 0)), neutral: true },
      { label: 'QR к-во', value: String(periodCashierQrRows.length), neutral: true },
      { label: 'С чеком', value: String(cashierWithReceiptCount), neutral: true },
      { label: 'Без чека', value: String(cashierWithoutReceiptCount), neutral: true },
    ] : isPaymentsDashboardMode ? paymentDashboardSummaryItems : mode === 'logistics' ? logisticsTransferSummaryItems : [
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
      const isReserveSelected = selectedDashboardSchool?.key === DRIVER_RESERVE_KEY;
      if (
        selectedDashboardSchool
        && selectedDashboardSchool.key !== 'ALL'
        && !isReserveSelected
        && isReserveDriver(row)
      ) {
        return false;
      }
      const schoolMatch = !selectedDashboardSchool
        || selectedDashboardSchool.key === 'ALL'
        || (isReserveSelected && isReserveDriver(row))
        || row.branchCodes.includes(selectedDashboardSchool.key)
        || row.branchShorts.includes(selectedDashboardSchool.label)
        || row.branchNames.includes(selectedDashboardSchool.label)
        || dashboardSchoolRows.some(schoolRow => row.branchIds.includes(String(schoolRow.branchId ?? '')));
      if (!schoolMatch) return false;
      if (dashboardVehicleFilter !== 'all' && row.vehicleType !== dashboardVehicleFilter) return false;
      if (quickTransfer === 'empty' && row.transferCount > 0) return false;
      if (quickTransfer === 'inactive' && row.status === 'active') return false;
      if (quickTransfer && quickTransfer !== 'empty' && quickTransfer !== 'inactive') {
        const transferNumbers = row.transferNumbers
          .split(',')
          .map(item => item.replace(/\D/g, ''))
          .filter(Boolean);
        if (!transferNumbers.includes(quickTransfer)) return false;
      }
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
  }, [dashboardSchoolRows, dashboardVehicleFilter, driverRows, quickTransfer, search, selectedDashboardSchool]);
  const selectedDriver = selectedDriverId
    ? driverRows.find(row => row.driverId === selectedDriverId) ?? null
    : null;
  useEffect(() => {
    if (!selectedDriver) {
      setDriverDraft(null);
      setDriverDocumentsDraft(createDefaultV2DriverDocuments());
      return;
    }
    const rawComment = selectedDriver.comment ?? '';
    const districtMatch = rawComment.match(/^Районы: ([^\n]+)/);
    const districts = districtMatch ? districtMatch[1].split(', ').map(s => s.trim()).filter(Boolean) : [];
    const comment = districtMatch ? rawComment.replace(/^Районы: [^\n]+\n?/, '') : rawComment;
    setDriverDraft({
      fullName: selectedDriver.fullName,
      phone: selectedDriver.phone,
      secondPhone: selectedDriver.secondPhone,
      status: selectedDriver.status || 'active',
      address: selectedDriver.address,
      districts,
      comment,
      vehicleType: selectedDriver.vehicleType,
      brand: selectedDriver.brand,
      model: selectedDriver.model,
      plateNumber: selectedDriver.plateNumber,
      seats: selectedDriver.seats == null ? '' : String(selectedDriver.seats),
    });
  }, [selectedDriver]);
  useEffect(() => {
    if (!selectedDriverId) return;
    let cancelled = false;
    fetchV2DriverDocuments(selectedDriverId)
      .then(documents => {
        if (!cancelled) setDriverDocumentsDraft(documents.map(({ id, driverId, ...document }) => document));
      })
      .catch(error => {
        console.error('Driver documents load failed', error);
        if (!cancelled) setDriverDocumentsDraft(createDefaultV2DriverDocuments());
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDriverId]);
  useEffect(() => {
    if (!selectedDriverId) {
      setDriverAdvances([]);
      return;
    }
    let cancelled = false;
    setLoadingAdvances(true);
    fetchV2DriverAdvances(selectedDriverId)
      .then(advances => { if (!cancelled) setDriverAdvances(advances); })
      .catch(error => { console.error('Driver advances load failed', error); })
      .finally(() => { if (!cancelled) setLoadingAdvances(false); });
    return () => { cancelled = true; };
  }, [selectedDriverId]);
  const setDriverDraftField = <K extends keyof DriverDraft>(key: K, value: DriverDraft[K]) => {
    setDriverDraft(prev => prev ? { ...prev, [key]: value } : prev);
  };
  const setDriverDocumentField = <K extends keyof V2DriverDocumentInput>(index: number, key: K, value: V2DriverDocumentInput[K]) => {
    setDriverDocumentsDraft(prev => prev.map((document, itemIndex) => (
      itemIndex === index ? { ...document, [key]: value } : document
    )));
  };
  const missingDriverDocuments = driverDocumentsDraft.filter(driverDocumentMissing).length;
  const expiredDriverDocuments = driverDocumentsDraft.filter(document => !driverDocumentMissing(document) && driverDocumentExpired(document)).length;
  const saveSelectedDriver = async () => {
    if (!selectedDriver || !driverDraft) return;
    if (!driverDraft.fullName.trim()) {
      alert('Укажите ФИО водителя');
      return;
    }
    if (!driverDraft.phone.trim()) {
      alert('Укажите телефон водителя');
      return;
    }
    setSavingDriver(true);
    try {
      await updateV2Driver(selectedDriver.driverId, {
        fullName: driverDraft.fullName,
        phone: driverDraft.phone,
        secondPhone: driverDraft.secondPhone,
        status: driverDraft.status,
        address: driverDraft.address,
        districts: driverDraft.districts,
        comment: driverDraft.comment,
        vehicleType: driverDraft.vehicleType,
        brand: driverDraft.brand,
        model: driverDraft.model,
        plateNumber: driverDraft.plateNumber,
        seats: driverDraft.seats.trim() ? Number(driverDraft.seats) : null,
      });
      await saveV2DriverDocuments(selectedDriver.driverId, driverDocumentsDraft);
      await load(false);
    } catch (error) {
      console.error('Driver save failed', error);
      alert('Не удалось сохранить водителя');
    } finally {
      setSavingDriver(false);
    }
  };
  const addDriverAdvance = async () => {
    if (!selectedDriverId) return;
    const amount = parseFloat(advanceAmount.replace(',', '.'));
    if (!amount || amount <= 0) { alert('Укажите сумму аванса'); return; }
    if (!advanceDate) { alert('Укажите дату аванса'); return; }
    setSavingAdvance(true);
    try {
      const advance = await createV2DriverAdvance(selectedDriverId, amount, advanceDate, advanceComment);
      setDriverAdvances(prev => [advance, ...prev]);
      setAdvanceAmount('');
      setAdvanceDate('');
      setAdvanceComment('');
    } catch (error) {
      console.error('Advance save failed', error);
      alert('Не удалось добавить аванс');
    } finally {
      setSavingAdvance(false);
    }
  };
  const removeDriverAdvance = async (advanceId: string) => {
    if (!window.confirm('Удалить этот аванс?')) return;
    try {
      await deleteV2DriverAdvance(advanceId);
      setDriverAdvances(prev => prev.filter(a => a.id !== advanceId));
    } catch (error) {
      console.error('Advance delete failed', error);
      alert('Не удалось удалить аванс');
    }
  };
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
        && (transferTypeMenu.branchId
          ? item.branchId === transferTypeMenu.branchId
          : (
            item.branchCode === selectedDashboardSchool.key
            || item.branchShort === selectedDashboardSchool.label
            || item.branchId === dashboardSchoolRows.find(row => row.branchId)?.branchId
          )
        )
      )?.vehicleType
      ?? dashboardWorkRows.find(row => row.transferNumber === transferTypeMenu.transferNumber && (!transferTypeMenu.branchId || row.branchId === transferTypeMenu.branchId) && row.vehicleType === 'minivan')?.vehicleType
      ?? dashboardWorkRows.find(row => row.transferNumber === transferTypeMenu.transferNumber && (!transferTypeMenu.branchId || row.branchId === transferTypeMenu.branchId) && row.vehicleType === 'sedan')?.vehicleType
      ?? dashboardWorkRows.find(row => row.transferNumber === transferTypeMenu.transferNumber && (!transferTypeMenu.branchId || row.branchId === transferTypeMenu.branchId) && row.vehicleType === 'microbus')?.vehicleType
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
    const driverOnOtherTransfer = driver
      ? !driver.transferNumbers.includes(`№${transfer.transferNumber}`) && Boolean(driver.transferNumbers)
      : false;
    const driverStatus = driver
      ? driver.status !== 'active'
        ? 'Уволен'
        : driverOnOtherTransfer
          ? `Другой трансфер (${driver.branchShorts[0] || '-'} / ${driver.transferNumbers})`
          : 'Действует'
      : '';
    const history = driver
      ? [{
          driverName: driver.fullName || 'Без имени',
          startDate: formatDateShort(transfer.createdAt),
          endDate: '-',
          status: driverStatus,
        }]
      : [];

    return {
      transfer,
      driver,
      childrenCount: relatedRows.length,
      history,
    };
  }, [dashboardSchoolRows, dashboardTransfers, driverRows, selectedDashboardSchool, transferCardNumber]);
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

  const tableColumns: ColumnDef<ChildRow>[] = useMemo(() => {
    const openCardCol: ColumnDef<ChildRow> = {
      key: 'openCard',
      label: 'Оплата',
      type: 'text',
      category: 'Действия',
      width: 80,
      visible: true,
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
    };
    const otherActionCols: ColumnDef<ChildRow>[] = [{
      key: 'cashierPaymentType',
      label: 'Вид оплаты',
      type: 'text',
      category: 'Кассир',
      width: 110,
      visible: mode === 'cashier',
      sortable: false,
      filterable: false,
      render: (_value, row) => {
        const type = row.pendingPaymentType;
        if (!row.isFirstChild || !type) return <span style={{ color: 'var(--text-2)' }}>—</span>;
        const lower = type.toLowerCase();
        if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 700, fontSize: 11 }}>QR</span>;
        if (lower === 'cash' || lower.includes('нал')) return <span style={{ color: '#15803D', fontWeight: 700, fontSize: 11 }}>Наличный</span>;
        return <span style={{ fontSize: 11, color: '#52606F', fontWeight: 600 }}>{type}</span>;
      },
      getValue: (row) => row.pendingPaymentType ?? '',
    }, {
      key: 'cashierPaymentReceipt',
      label: 'Чек',
      type: 'text',
      category: 'Кассир',
      width: 70,
      visible: mode === 'cashier',
      sortable: false,
      filterable: false,
      render: (_value, row) => {
        if (!row.isFirstChild) return null;
        const url = row.pendingPaymentReceiptUrl;
        if (!url) return <Paperclip size={15} strokeWidth={1.5} style={{ color: '#C8D5D8' }} />;
        return <ReceiptThumb url={url} />;
      },
      getValue: (row) => row.pendingPaymentReceiptUrl ?? '',
    }, {
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
    }];
    const dataCols = (isRequestsModule ? REQUEST_COLUMNS : isChargesMode ? CHARGES_COLUMNS : isPaymentsMode ? PAYMENTS_COLUMNS : COLUMNS).map(column => (
      isRequestsModule
        ? {
            ...column,
            label: column.key === 'childName'
              ? 'Ребенок'
              : column.key === 'monthlyPrice'
                ? 'Сумма'
                : column.label,
            visible: REQUEST_COLUMN_KEYS.has(String(column.key)),
          }
        : isPaymentsMode
          ? {
              ...column,
              visible: PAYMENTS_COLUMN_KEYS.has(String(column.key)),
            }
        : isChargesMode
          ? {
              ...column,
              label: column.key === 'totalCharged' ? 'Начислено' : column.label,
              visible: CHARGES_COLUMN_KEYS.has(String(column.key)),
              ...(column.key === 'totalCharged' && chargesPeriodKey !== 'ALL' ? {
                render: (_val: any, row: ChildRow) => {
                  const s = periodStatsByFamily.get(row.familyId);
                  return <span>{money(s ? s.charged : 0)}</span>;
                },
              } : {}),
              ...(column.key === 'debtAmount' && chargesPeriodKey !== 'ALL' ? {
                render: (_val: any, row: ChildRow) => {
                  const s = periodStatsByFamily.get(row.familyId);
                  const debt = s ? s.debt : 0;
                  return <span style={{ color: debt > 0 ? '#C62828' : undefined, fontWeight: debt > 0 ? 700 : undefined }}>{money(debt)}</span>;
                },
              } : {}),
            }
          : column
    ));
    return isChargesMode || isRequestsModule || isPaymentsMode
      ? [...dataCols, openCardCol]
      : [openCardCol, ...otherActionCols, ...dataCols];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChargesMode, isRequestsModule, isPaymentsMode, userRole, chargesPeriodKey, periodStatsByFamily]);

  const exportLogisticsRouteSheet = async (exportRows: ChildRow[]) => {
    const routeRows = exportRows
      .filter(row => row.status !== 'rejected')
      .slice()
      .sort((a, b) => {
        const transferDiff = Number(a.transferNumber || 999) - Number(b.transferNumber || 999);
        if (transferDiff !== 0) return transferDiff;
        const stopDiff = Number(a.stopNumber || 999) - Number(b.stopNumber || 999);
        if (stopDiff !== 0) return stopDiff;
        return a.childName.localeCompare(b.childName, 'ru');
      });

    if (!routeRows.length) {
      window.alert('Нет данных для маршрутного листа');
      return;
    }

    const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter(Boolean).map(String)));
    const schools = unique(routeRows.map(row => row.branchShort || row.branchName));
    const transfers = unique(routeRows.map(row => row.transferNumber)).sort((a, b) => Number(a) - Number(b));
    const driverIds = unique(routeRows.map(row => row.driverId));
    const transferMeta = transfers.length === 1
      ? dashboardTransfers.find(item =>
          item.transferNumber === transfers[0]
          && (schools.length !== 1 || item.branchShort === schools[0] || item.branchCode === routeRows[0]?.branchFilter)
        )
      : undefined;
    const driver = driverRows.find(item => item.driverId === (driverIds[0] || transferMeta?.driverId));
    const transferTitle = transfers.length === 1 ? `№${transfers[0]}` : transfers.length ? transfers.map(item => `№${item}`).join(', ') : 'Без трансфера';
    const schoolTitle = schools.join(', ') || '—';
    const driverTitle = driver?.fullName || '—';
    const driverContact = [driver?.phone, driver?.secondPhone].filter(Boolean).join(' / ') || '—';
    const plateNumber = driver?.plateNumber || '—';
    const vehicleTitle = driver?.vehicleLabel || routeRows.find(row => row.vehicleLabel)?.vehicleLabel || '—';
    const today = new Date().toLocaleDateString('ru-RU');
    const dayColumns = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ'];
    const safeName = `${schoolTitle}_${transferTitle}`.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');

    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OutWay CRM';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Маршрут', {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
      },
      views: [{ showGridLines: false }],
    });

    const COLS = 15; // A..O
    ws.columns = [
      { width: 7 }, { width: 26 }, { width: 34 }, { width: 30 }, { width: 10 },
      ...Array.from({ length: 10 }, () => ({ width: 7 })),
    ];

    const thin = { style: 'thin' as const, color: { argb: XLSX_BRAND.border } };
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
    const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

    // ── Banner ──────────────────────────────────────────────────────────
    ws.mergeCells(1, 1, 1, COLS);
    const banner = ws.getCell(1, 1);
    banner.value = 'OutWay  ·  Маршрутный лист';
    banner.font = { name: 'Calibri', size: 16, bold: true, color: { argb: XLSX_BRAND.white } };
    banner.alignment = { vertical: 'middle', horizontal: 'center' };
    banner.fill = fill(XLSX_BRAND.teal);
    ws.getRow(1).height = 30;

    // ── Meta info (school/transfer/date, driver/contacts/vehicle) ─────────
    const metaRow = (rowIndex: number, entries: [string, string][]) => {
      const row = ws.getRow(rowIndex);
      row.height = 20;
      entries.forEach(([label, value], i) => {
        const labelCol = i * 5 + 1;
        const labelCell = ws.getCell(rowIndex, labelCol);
        labelCell.value = label;
        labelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_BRAND.tealDark } };
        labelCell.fill = fill(XLSX_BRAND.mint);
        labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        labelCell.border = allBorders;

        ws.mergeCells(rowIndex, labelCol + 1, rowIndex, labelCol + 4);
        const valueCell = ws.getCell(rowIndex, labelCol + 1);
        valueCell.value = value;
        valueCell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_BRAND.text } };
        valueCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        for (let c = labelCol + 1; c <= labelCol + 4; c++) {
          ws.getCell(rowIndex, c).border = allBorders;
        }
      });
    };
    metaRow(2, [['Школа', schoolTitle], ['Трансфер', transferTitle], ['Дата', today]]);
    metaRow(3, [['Водитель', driverTitle], ['Контакты', driverContact], ['Авто', `${vehicleTitle} / ${plateNumber}`]]);

    ws.getRow(4).height = 8;

    // ── Table header (rows 5-6) ────────────────────────────────────────
    const HEADER_TOP = 5;
    const HEADER_BOTTOM = 6;
    const headerStyle = (cell: import('exceljs').Cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_BRAND.white } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = fill(XLSX_BRAND.teal);
      cell.border = allBorders;
    };
    const baseHeaders = ['№ остановки', 'ФИО ребёнка', 'Адрес', 'Контактные данные', 'Время утро'];
    baseHeaders.forEach((label, i) => {
      const col = i + 1;
      ws.mergeCells(HEADER_TOP, col, HEADER_BOTTOM, col);
      const cell = ws.getCell(HEADER_TOP, col);
      cell.value = label;
      headerStyle(cell);
    });
    dayColumns.forEach((day, i) => {
      const startCol = 6 + i * 2;
      ws.mergeCells(HEADER_TOP, startCol, HEADER_TOP, startCol + 1);
      const dayCell = ws.getCell(HEADER_TOP, startCol);
      dayCell.value = day;
      headerStyle(dayCell);
      headerStyle(ws.getCell(HEADER_TOP, startCol + 1));

      const morningCell = ws.getCell(HEADER_BOTTOM, startCol);
      morningCell.value = 'утро';
      headerStyle(morningCell);
      const eveningCell = ws.getCell(HEADER_BOTTOM, startCol + 1);
      eveningCell.value = 'вечер';
      headerStyle(eveningCell);
    });
    ws.getRow(HEADER_TOP).height = 18;
    ws.getRow(HEADER_BOTTOM).height = 16;

    // ── Data rows ───────────────────────────────────────────────────────
    const FIRST_DATA_ROW = HEADER_BOTTOM + 1;
    routeRows.forEach((row, index) => {
      const contacts = [
        row.parentName && `Родитель: ${row.parentName}`,
        row.phone,
        row.secondPhone,
        row.contactName && `Контакт: ${row.contactName}`,
        row.contactPhone,
      ].filter(Boolean).join(' / ');
      const rowIndex = FIRST_DATA_ROW + index;
      const excelRow = ws.getRow(rowIndex);
      const values = [row.stopNumber || index + 1, row.childName, row.streetAddress, contacts, row.timeMorning || ''];
      values.forEach((value, colOffset) => {
        excelRow.getCell(colOffset + 1).value = value;
      });

      const zebra = index % 2 === 1;
      for (let col = 1; col <= COLS; col++) {
        const cell = excelRow.getCell(col);
        cell.border = allBorders;
        if (zebra) cell.fill = fill(XLSX_BRAND.stripe);
        if (col <= 5) {
          cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_BRAND.text } };
          cell.alignment = col === 1 || col === 5
            ? { vertical: 'middle', horizontal: 'center' }
            : { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
        } else {
          cell.font = { name: 'Calibri', size: 12, color: { argb: XLSX_BRAND.textMuted } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      }
      excelRow.height = 24;
    });

    // ── Signature footer ───────────────────────────────────────────────
    const footerRow = FIRST_DATA_ROW + routeRows.length + 1;
    ws.mergeCells(footerRow, 1, footerRow, 7);
    const driverSign = ws.getCell(footerRow, 1);
    driverSign.value = 'Подпись водителя: _______________________';
    driverSign.font = { name: 'Calibri', size: 10, italic: true, color: { argb: XLSX_BRAND.textMuted } };
    driverSign.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.mergeCells(footerRow, 9, footerRow, COLS);
    const dispatcherSign = ws.getCell(footerRow, 9);
    dispatcherSign.value = 'Подпись диспетчера: _______________________';
    dispatcherSign.font = { name: 'Calibri', size: 10, italic: true, color: { argb: XLSX_BRAND.textMuted } };
    dispatcherSign.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(footerRow).height = 22;

    ws.views = [{ state: 'frozen', ySplit: HEADER_BOTTOM, showGridLines: false }];

    const buffer = await workbook.xlsx.writeBuffer();
    downloadXlsxBuffer(`Маршрутный_лист_${safeName || 'logistics'}.xlsx`, buffer as ArrayBuffer);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: customTableContent ? 'hidden' : 'visible', background: 'var(--active-bg)', borderRadius: '0 0 22px 22px', display: 'flex', padding: '0 0 10px 0' }}>

      {/* ── ОСНОВНОЙ КОНТЕНТ ── */}
      <div
        className="no-scrollbar"
        onClick={() => {
          if (!schoolsBarCollapsed) setSchoolsBarCollapsed(true);
          if (transferTypeMenu) setTransferTypeMenu(null);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '8px 0',
          position: 'relative',
          zIndex: 1,
          ...(customTableContent
            ? { minHeight: 0, overflow: 'hidden' }
            : { minHeight: '100%', overflowX: 'hidden', overflowY: 'visible' }),
        }}
      >

        {customTopContent && (
          <div style={{ flexShrink: 0 }}>
            {customTopContent}
          </div>
        )}

        {/* ── БАР ПЕРИОДОВ ── */}
        {(isChargesMode || isPaymentsMode || isCashierMode) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: compactPeriodBar ? '8px 0 4px' : '6px 8px',
            background: compactPeriodBar ? 'transparent' : '#F5FAFB',
            border: compactPeriodBar ? 'none' : '1px solid #D4E3E7',
            borderRadius: 10,
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
            width: '100%',
            boxSizing: 'border-box',
            gap: compactPeriodBar ? 10 : undefined,
          }}>
            {(() => {
              const periodKey = isChargesMode ? chargesPeriodKey : paymentsPeriodKey;
              const setPeriodKey = (key: string) => {
                if (isChargesMode) setChargesPeriodKey(key); else setPaymentsPeriodKey(key);
                if (!isChargesMode) onPeriodKeyChange?.(key);
              };
              return (
                <>
                  {(isCashierMode ? CASHIER_PERIODS : ALL_PERIODS.filter(p => !(hidePeriodDeposit && p.key === 'deposit'))).map(period => {
                    const isActive = periodKey === period.key;
                    return (
                      <button
                        key={period.key}
                        onClick={() => setPeriodKey(period.key)}
                        style={{ flex: (isCashierMode || compactPeriodBar) ? 1 : undefined, minWidth: (isCashierMode || compactPeriodBar) ? 0 : undefined, padding: isCashierMode ? '4px 8px' : '4px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 800 : 600, background: isActive ? '#2DD4BF' : '#fff', color: isActive ? '#fff' : '#374151', whiteSpace: 'nowrap', flexShrink: (isCashierMode || compactPeriodBar) ? 1 : 0, overflow: (isCashierMode || compactPeriodBar) ? 'hidden' : undefined, textOverflow: (isCashierMode || compactPeriodBar) ? 'ellipsis' : undefined, transition: 'background 0.15s' }}
                      >
                        {period.label.split(' ')[0]}
                      </button>
                    );
                  })}
                  {!hidePeriodAll && !isCashierMode && (
                  <button
                    onClick={() => setPeriodKey('ALL')}
                    style={{ padding: '4px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: periodKey === 'ALL' ? 800 : 600, background: periodKey === 'ALL' ? '#2DD4BF' : '#fff', color: periodKey === 'ALL' ? '#fff' : '#374151', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.15s' }}
                  >
                    Все
                  </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {!hideDashboard && (
        <LogisticsMicrobusDashboard
          items={customBarItems ?? logisticsAvgItems}
          collapsed={logisticsDashboardCollapsed}
          onToggle={() => setLogisticsDashboardCollapsed(value => !value)}
          selectedKey={selectedDashboardSchool?.key}
          onSelect={(key) => {
            const currentMetric = dashboardMetric;
            setDashboardSchoolKey(key);
            setModeFilter(getSchoolSwitchFilters(key));
            setLogisticsDashboardCollapsed(false);
            setDashboardMetric(currentMetric);
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
	          detailMoney={Boolean(dashboardDisplayMetricOption?.money)}
	          activeDetailKey={activeDashboardDetailKey}
	          isDetailDisabled={(item) => isAllDashboardSchools && item.key.startsWith('transfer-')}
	          onDetailDoubleClick={(event, item) => {
	            if (mode !== 'logistics' || !item.key.startsWith('transfer-')) return;
	            event.preventDefault();
	            event.stopPropagation();
	            const transferNumber = item.key.replace('transfer-', '');
	            setTransferTypeMenu({
	              x: event.clientX,
	              y: event.clientY,
	              transferNumber,
	              branchId: item.branchId,
	              schoolId: item.schoolId,
	            });
	          }}
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
              if (isDriversModule) {
                setTransferCardNumber(transferNumber);
                return;
              }
              setModeFilter({ quickTransfer: transferNumber, quickChildStatus: '' });
            }
          }}
	          dashboardMainTab={dashboardMainTab}
          onMainTabChange={setDashboardMainTab}
          showDetailBars={!isRequestsModule && !hideTransferBars}
          customLeftPanel={customLeftPanel}
          dashboardHeight={isChargesMode ? 390 : undefined}
        />
        )}

        {/* ── ТАБЛИЦА ── */}
        <div style={customTableContent
          ? { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', paddingBottom: 10 }
          : { display: 'flex', flexDirection: 'column', overflow: 'visible', minWidth: 0, paddingBottom: 10 }}>
          {mode !== 'directory' && !isCashierMode && !hideTransferBars && !customTableContent && !isDriversModule && !isRequestsModule && !tableBarsCollapsed ? (
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
              <span style={{ color: '#31A4A5', fontWeight: 900 }}>{moduleLabel}</span>
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
            <div style={{ flex: 1, minWidth: 8 }} />
            <div
              style={{
                width: 146,
                height: 34,
                paddingLeft: 10,
                background: '#F5FAFB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 6,
                flexShrink: 0,
              }}
            >
              {!isChargesMode && quickStatusItems.map(item => {
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
              {!isChargesMode && <button
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
              </button>}
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
          </div>
          ) : mode !== 'directory' && !isCashierMode && !hideTransferBars && !customTableContent && !isDriversModule && !isRequestsModule ? (
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
                <span style={{ color: '#31A4A5' }}>{moduleLabel}</span>
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
          {customTableContent ?? (isDriversModule ? (
            <DataTable<V2DriverTableRow>
              key="drivers_table"
              columns={DRIVER_COLUMNS}
              data={filteredDriverRows}
              rowKey="rowId"
              storageKey="drivers_table_by_school"
              loading={loading}
              emptyText="Водители не найдены"
              canManageProperties={false}
              onRowClick={(row) => {
                setSelectedDriverTab('main');
                setSelectedDriverId(row.driverId);
              }}
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
          ) : isCashierMode ? (
            <DataTable<CashierPaymentRow>
              key="cashier_table"
              columns={cashierColumns}
              data={cashierRows.filter(r => {
                if (!paymentRowMatchesPeriod(r, paymentsPeriodKey)) return false;
                if (tab && tab.key !== 'ALL') {
                  const bs = r.branchShort.toLowerCase();
                  if (bs !== tab.key.toLowerCase() && bs !== tab.label.toLowerCase()) return false;
                }
                if (quickTransfer === 'empty' && r.transferNumber) return false;
                if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
                if (!search) return true;
                const q = search.toLowerCase().replace(/\s+/g, '');
                return [r.parentName, r.phone, r.childrenNames, r.branchShort].some(v => v.toLowerCase().replace(/\s+/g, '').includes(q));
              })}
              rowKey="id"
              storageKey="cashier_table_v1"
              loading={loadingCashier}
              emptyText="Платежей на проверке нет"
              canManageProperties={false}
              onCellSave={userRole === 'admin' ? handlePaymentMethodCellSave : undefined}
              showProperties={columnsOpen ?? false}
              onShowPropertiesChange={v => onColumnsOpenChange?.(v)}
              onRowOpen={(row) => {
                const childRow = rows.find(r => r.familyId === row.familyId);
                if (childRow) toggleExpandedFamily(row.familyId, childRow, 'finance');
              }}
              hideToolbar={tableBarsCollapsed}
              toolbarExtra={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', pointerEvents: 'none' }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Имя, телефон, школа..."
                      style={{ width: '100%', height: 26, padding: '0 10px 0 30px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, fontWeight: 600, background: '#fff', outline: 'none', color: 'var(--text)' }}
                    />
                  </div>
                </div>
              )}
            />
          ) : isPaymentsMode ? (
            <DataTable<PaymentTableRow>
              key="payments_table"
              columns={paymentTableColumns}
              data={paymentRows.filter(r => {
                if (tab && tab.key !== 'ALL') {
                  const bs = r.branchShort.toLowerCase();
                  if (bs !== tab.key.toLowerCase() && bs !== tab.label.toLowerCase()) return false;
                }
                if (quickTransfer === 'empty' && r.transferNumber) return false;
                if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
                if (!paymentRowMatchesPeriod(r, paymentsPeriodKey)) return false;
                if (dashboardMetric === 'pendingSum' || dashboardMetric === 'pendingAmount') {
                  if (r.status !== 'pending') return false;
                }
                if (dashboardMetric === 'paidCount' || dashboardMetric === 'paidSum') {
                  if (r.status !== 'confirmed') return false;
                }
                if (dashboardMetric === 'rejectedCount' || dashboardMetric === 'rejectedSum') {
                  if (r.status !== 'rejected') return false;
                }
                if (!search) return true;
                const q = search.toLowerCase().replace(/\s+/g, '');
                return [r.parentName, r.phone, r.childrenNames].some(v => v.toLowerCase().replace(/\s+/g, '').includes(q));
              })}
              rowKey="id"
              storageKey="payments_table_v1"
              loading={loadingPayments}
              emptyText="Платежей не найдено"
              canManageProperties={false}
              onCellSave={userRole === 'admin' ? handlePaymentMethodCellSave : undefined}
              onRowOpen={(row) => {
                const childRow = rows.find(r => r.familyId === row.familyId);
                if (childRow) toggleExpandedFamily(row.familyId, childRow, 'finance');
              }}
              showProperties={columnsOpen ?? false}
              onShowPropertiesChange={v => onColumnsOpenChange?.(v)}
              hideToolbar={tableBarsCollapsed}
              toolbarExtra={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', pointerEvents: 'none' }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Имя, телефон, ребёнок..."
                      style={{ width: '100%', height: 26, padding: '0 10px 0 30px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, fontWeight: 600, background: '#fff', outline: 'none', color: 'var(--text)' }}
                    />
                  </div>
                </div>
              )}
            />
          ) : (
            <DataTable<ChildRow>
              key={`families_table_${mode}`}
              columns={tableColumns}
              data={filteredSorted}
              rowKey="rowId"
              storageKey={tableStorageKey}
              loading={isPagedMode ? familiesPageQuery.isPending : loading}
              emptyText="Заявок не найдено"
              canManageProperties={false}
              showProperties={columnsOpen ?? false}
              onShowPropertiesChange={v => onColumnsOpenChange?.(v)}
              onRowOpen={(row) => toggleExpandedFamily(row.familyId, row, 'overview')}
              onRowDelete={userRole === 'admin' ? async (row) => { if (!window.confirm(`Удалить семью "${row.parentName}" со всеми детьми и данными? Это необратимо.`)) return; try { await deleteV2Family(row.familyId); setRows(prev => { const next = prev.filter(r => r.familyId !== row.familyId); familiesRowsCache = next; return next; }); } catch (e: any) { window.alert('Не удалось удалить: ' + (e?.message ?? String(e))); } } : undefined}
              onCellSave={handleCellSave}
              onExport={mode === 'logistics' ? exportLogisticsRouteSheet : undefined}
              hideToolbar={tableBarsCollapsed}
              toolbarExtra={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', pointerEvents: 'none' }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Имя, телефон, ребёнок, адрес..."
                      style={{ width: '100%', height: 26, padding: '0 10px 0 30px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, fontWeight: 600, background: '#fff', outline: 'none', color: 'var(--text)' }}
                    />
                  </div>
                  {isPagedMode && pagedTotalFamilies > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>
                      <button
                        onClick={() => setFamiliesPageNumber(p => Math.max(0, p - 1))}
                        disabled={familiesPageNumber === 0}
                        style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', cursor: familiesPageNumber === 0 ? 'default' : 'pointer', opacity: familiesPageNumber === 0 ? 0.4 : 1 }}
                      >‹</button>
                      <span>
                        семьи {familiesPageNumber * FAMILIES_PAGE_SIZE + 1}–{Math.min((familiesPageNumber + 1) * FAMILIES_PAGE_SIZE, pagedTotalFamilies)} из {pagedTotalFamilies}
                      </span>
                      <button
                        onClick={() => setFamiliesPageNumber(p => Math.min(pagedTotalPages - 1, p + 1))}
                        disabled={familiesPageNumber >= pagedTotalPages - 1}
                        style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', cursor: familiesPageNumber >= pagedTotalPages - 1 ? 'default' : 'pointer', opacity: familiesPageNumber >= pagedTotalPages - 1 ? 0.4 : 1 }}
                      >›</button>
                    </div>
                  )}
                </div>
              )}
              toolbarRightExtra={(
                <button
                  onClick={() => setShowNewFamily(true)}
                  title="Новая заявка"
                  style={{ width: 30, height: 30, border: 'none', borderRadius: 10, background: '#31A4A5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <Plus size={16} />
                </button>
              )}
            />
          ))}
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          width: schoolsSidebarReserveWidth,
          flexShrink: 0,
          transition: 'width .18s ease',
        }}
      />

      <SchoolDockSidebar
        hidden={schoolsSidebarCollapsed}
        onHiddenChange={setSchoolsBarCollapsed}
        items={[
          ...schoolButtonItems.filter(t => t.key !== 'ALL').map((t, index) => ({
            key: t.key,
            label: schoolSidebarFullLabel[t.key] ?? t.label,
            color: LOGISTICS_CHART_COLORS[index % LOGISTICS_CHART_COLORS.length],
            logo: t.logo,
            disabled: !isTabAllowed(t.key),
            active: activeTab === t.key,
          })),
          ...extraSchoolDockItems,
        ]}
        onSelect={(key) => {
          const currentMetric = dashboardMetric;
          setModeFilter(getSchoolSwitchFilters(key));
          setDashboardSchoolKey(key);
          setDashboardMetric(currentMetric);
          if (mode === 'logistics') {
            setLogisticsDashboardCollapsed(false);
          }
        }}
      />

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
                <input
                  value={driverDraft?.fullName ?? ''}
                  onChange={event => setDriverDraftField('fullName', event.target.value)}
                  placeholder="ФИО водителя"
                  style={{
                    width: 'min(460px, 70vw)',
                    height: 34,
                    border: '1px solid #DDE9EC',
                    borderRadius: 10,
                    padding: '0 10px',
                    fontSize: 20,
                    fontWeight: 900,
                    color: '#17222F',
                    outline: 'none',
                  }}
                />
                <div style={{ marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap', color: '#626C8B', fontSize: 13, fontWeight: 750 }}>
                  <span>{driverDraft?.phone || 'номер не указан'}</span>
                  <span>ID: {selectedDriver.driverId.slice(0, 8)}</span>
                  <span>{DRIVER_STATUS_OPTIONS.find(option => option.value === driverDraft?.status)?.label ?? 'Статус не указан'}</span>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', color: '#17222F', fontSize: 13, fontWeight: 800 }}>
                  <span>Наш долг: {money(selectedDriverFinanceTotals.balance)}</span>
                  <span>Не хватает документов: {missingDriverDocuments}</span>
                  <span>Просрочены: {expiredDriverDocuments}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={saveSelectedDriver}
                  disabled={savingDriver || !driverDraft}
                  title="Сохранить"
                  style={{
                    height: 36,
                    padding: '0 12px',
                    border: 'none',
                    borderRadius: 12,
                    background: savingDriver ? '#A7CFCF' : '#31A4A5',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    cursor: savingDriver ? 'default' : 'pointer',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  <Save size={15} />
                  {savingDriver ? 'Сохранение...' : 'Сохранить'}
                </button>
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
                  }}
                >
                  <X size={18} />
                </button>
              </div>
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
                { key: 'documents' as DriverCardTab, label: 'Документы' },
                { key: 'finance' as DriverCardTab, label: 'Финансы' },
                { key: 'advances' as DriverCardTab, label: `Авансы${driverAdvances.length ? ` (${driverAdvances.length})` : ''}` },
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
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#17222F', marginBottom: 10 }}>Школа / авто</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 8, columnGap: 12, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Школа</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.branchShorts.join(', ') || '-'}</span>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Трансфер</span>
                    <span style={{ color: '#17222F', fontWeight: 850 }}>{selectedDriver.transferNumbers || '-'}</span>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Тип ТС</span>
                    <select
                      value={driverDraft?.vehicleType ?? ''}
                      onChange={event => setDriverDraftField('vehicleType', event.target.value as VehicleType | '')}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', background: '#fff', outline: 'none' }}
                    >
                      <option value="">Не указан</option>
                      {VEHICLE_TYPE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Марка</span>
                    <input
                      value={driverDraft?.brand ?? ''}
                      onChange={event => setDriverDraftField('brand', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', outline: 'none' }}
                    />
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Модель</span>
                    <input
                      value={driverDraft?.model ?? ''}
                      onChange={event => setDriverDraftField('model', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', outline: 'none' }}
                    />
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Гос. номер</span>
                    <input
                      value={driverDraft?.plateNumber ?? ''}
                      onChange={event => setDriverDraftField('plateNumber', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', outline: 'none' }}
                    />
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Мест</span>
                    <input
                      value={driverDraft?.seats ?? ''}
                      onChange={event => setDriverDraftField('seats', event.target.value.replace(/\D/g, ''))}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', outline: 'none' }}
                    />
                  </div>
                </section>

                <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#17222F', marginBottom: 10 }}>Контакты / адрес</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 8, columnGap: 12, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Телефон</span>
                    <input
                      value={driverDraft?.phone ?? ''}
                      onChange={event => setDriverDraftField('phone', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', outline: 'none' }}
                    />
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Доп. контакт</span>
                    <input
                      value={driverDraft?.secondPhone ?? ''}
                      onChange={event => setDriverDraftField('secondPhone', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', outline: 'none' }}
                    />
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Статус</span>
                    <select
                      value={driverDraft?.status ?? 'active'}
                      onChange={event => setDriverDraftField('status', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', background: '#fff', outline: 'none' }}
                    >
                      {DRIVER_STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Адрес</span>
                    <input
                      value={driverDraft?.address ?? ''}
                      onChange={event => setDriverDraftField('address', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 750, color: '#17222F', outline: 'none' }}
                    />
                    <span style={{ color: '#7A859D', fontWeight: 800 }}>Комментарий</span>
                    <textarea
                      value={driverDraft?.comment ?? ''}
                      onChange={event => setDriverDraftField('comment', event.target.value)}
                      rows={3}
                      style={{ minHeight: 58, border: '1px solid #DDE9EC', borderRadius: 8, padding: '7px 8px', fontSize: 12, fontWeight: 700, color: '#17222F', outline: 'none', resize: 'vertical' }}
                    />
                  </div>
                </section>
              </div>

              <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#17222F', marginBottom: 9 }}>Район</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {['Микрорайоны','Центр','Ак-Ордо','Арча-Бешик','Аламедин 1','Дордой','Маевка','Тунгуч','Кок-Жар','Джал','Кара-Жыгач','Пригородный','Новопавловка','Новопакровка','с. Манас','ГЭС 2','Киргизия','Политех','Рабочий'].map(name => {
                    const active = driverDraft?.districts.includes(name) ?? false;
                    return (
                      <button key={name} type="button" onClick={() => setDriverDraftField('districts', active ? (driverDraft?.districts ?? []).filter(d => d !== name) : [...(driverDraft?.districts ?? []), name])} style={{ height: 28, padding: '0 10px', border: `1px solid ${active ? '#31A4A5' : '#DDE9EC'}`, borderRadius: 999, background: active ? '#DFF4F4' : '#fff', color: active ? '#237F81' : '#52606F', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                        {name}
                      </button>
                    );
                  })}
                </div>
              </section>

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
              ) : selectedDriverTab === 'documents' ? (
              <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', overflow: 'hidden' }}>
                <div style={{
                  height: 42,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '0 14px',
                  borderBottom: '1px solid #E5EEF1',
                  fontSize: 13,
                  fontWeight: 900,
                  color: '#17222F',
                }}>
                  <span>Документы</span>
                  <span style={{ color: '#7A859D', fontSize: 11, fontWeight: 850 }}>
                    Не хватает: {missingDriverDocuments} · Просрочены: {expiredDriverDocuments}
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Название', 'Номер', 'Дата выдачи', 'Дата окончания', 'Скан', 'Обязательно'].map(label => (
                          <th key={label} style={{
                            height: 34,
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
                      {driverDocumentsDraft.map((document, index) => {
                        const missing = driverDocumentMissing(document);
                        const expired = !missing && driverDocumentExpired(document);
                        return (
                          <tr key={document.type}>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input value={document.title} onChange={event => setDriverDocumentField(index, 'title', event.target.value)} style={{ width: '100%', height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 800, color: '#17222F', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input value={document.number} onChange={event => setDriverDocumentField(index, 'number', event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${missing && !document.number.trim() ? '#EF7168' : '#DDE9EC'}`, borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 700, color: '#17222F', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input type="date" value={document.issuedAt} onChange={event => setDriverDocumentField(index, 'issuedAt', event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${missing && !document.issuedAt ? '#EF7168' : '#DDE9EC'}`, borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 700, color: '#17222F', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input type="date" value={document.expiresAt} onChange={event => setDriverDocumentField(index, 'expiresAt', event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${expired || (missing && !document.expiresAt) ? '#EF7168' : '#DDE9EC'}`, borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 700, color: expired ? '#B42318' : '#17222F', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <label style={{ height: 30, padding: '0 9px', border: `1px solid ${missing && !document.scanUrl ? '#EF7168' : '#DDE9EC'}`, borderRadius: 8, background: '#fff', color: '#52606F', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 850, whiteSpace: 'nowrap' }}>
                                  {document.scanFile ? document.scanFile.name : document.scanUrl ? 'Заменить' : 'Добавить'}
                                  <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={event => setDriverDocumentField(index, 'scanFile', event.target.files?.[0] ?? null)}
                                    style={{ display: 'none' }}
                                  />
                                </label>
                                {document.scanUrl && (
                                  <a href={document.scanUrl} target="_blank" rel="noreferrer" style={{ color: '#237F81', fontSize: 12, fontWeight: 850, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                    Открыть
                                  </a>
                                )}
                              </div>
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: missing ? '#B42318' : expired ? '#B45309' : '#237F81', fontSize: 12, fontWeight: 850 }}>
                                <input type="checkbox" checked={document.required} onChange={event => setDriverDocumentField(index, 'required', event.target.checked)} />
                                {missing ? 'Не хватает' : expired ? 'Просрочен' : 'ОК'}
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              ) : selectedDriverTab === 'finance' ? (
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
              ) : selectedDriverTab === 'advances' ? (
              <>
              <section style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', overflow: 'hidden' }}>
                <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', borderBottom: '1px solid #E5EEF1', fontSize: 13, fontWeight: 900, color: '#17222F' }}>
                  <span>История авансов</span>
                  {driverAdvances.length > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#237F81' }}>
                      Итого: {money(driverAdvances.reduce((sum, a) => sum + a.amount, 0))}
                    </span>
                  )}
                </div>
                {loadingAdvances ? (
                  <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Загрузка...</div>
                ) : driverAdvances.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7A859D' }}>Авансов пока нет</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Дата', 'Сумма', 'Комментарий', 'Добавлен', ''].map(label => (
                            <th key={label} style={{ height: 34, padding: '0 12px', borderBottom: '1px solid #E5EEF1', textAlign: label === 'Сумма' ? 'right' : 'left', fontSize: 11, fontWeight: 900, color: '#7A859D', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {driverAdvances.map((advance, index) => (
                          <tr key={advance.id}>
                            <td style={{ height: 42, padding: '0 12px', borderBottom: index === driverAdvances.length - 1 ? 'none' : '1px solid #EEF4F6', fontSize: 13, fontWeight: 850, color: '#17222F', whiteSpace: 'nowrap' }}>
                              {advance.date ? new Date(advance.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                            </td>
                            <td style={{ height: 42, padding: '0 12px', borderBottom: index === driverAdvances.length - 1 ? 'none' : '1px solid #EEF4F6', fontSize: 13, fontWeight: 900, color: '#237F81', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {money(advance.amount)}
                            </td>
                            <td style={{ height: 42, padding: '0 12px', borderBottom: index === driverAdvances.length - 1 ? 'none' : '1px solid #EEF4F6', fontSize: 13, fontWeight: 650, color: '#52606F' }}>
                              {advance.comment || '—'}
                            </td>
                            <td style={{ height: 42, padding: '0 12px', borderBottom: index === driverAdvances.length - 1 ? 'none' : '1px solid #EEF4F6', fontSize: 12, fontWeight: 650, color: '#7A859D', whiteSpace: 'nowrap' }}>
                              {advance.createdAt ? new Date(advance.createdAt).toLocaleDateString('ru-RU') : '—'}
                            </td>
                            <td style={{ height: 42, padding: '0 8px', borderBottom: index === driverAdvances.length - 1 ? 'none' : '1px solid #EEF4F6', textAlign: 'right' }}>
                              <button
                                onClick={() => removeDriverAdvance(advance.id)}
                                title="Удалить"
                                style={{ width: 28, height: 28, border: '1px solid #F5C6C6', borderRadius: 8, background: '#FFF5F5', color: '#B42318', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              >
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              </>
              ) : null}
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
                        {['ФИО водителя', 'Дата начала', 'Дата конец', 'Статус'].map(label => (
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
                          {[entry.driverName, entry.startDate, entry.endDate, entry.status].map((value, cellIndex) => (
                            <td key={cellIndex} style={{
                              height: 42,
                              padding: '0 12px',
                              borderBottom: index === selectedTransferCard.history.length - 1 ? 'none' : '1px solid #EEF4F6',
                              fontSize: 13,
                              fontWeight: cellIndex === 0 ? 850 : 650,
                              color: cellIndex === 3 ? '#237F81' : '#17222F',
                              whiteSpace: 'nowrap',
                            }}>
                              {value || '-'}
                            </td>
                          ))}
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} style={{
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

      {adminFilterOpen && adminFilterDraft && (
        <div
          onClick={() => setAdminFilterOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(23,34,47,0.18)', backdropFilter: 'blur(2px)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 340, background: '#fff', borderRadius: 18, boxShadow: '0 16px 48px rgba(30,56,75,0.18)', border: '1px solid #D4E3E7', padding: '22px 24px 20px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#17222F' }}>
                Фильтры · {SCHOOL_TABS.find(t => t.key === adminFilterOpen)?.label ?? adminFilterOpen}
              </span>
              <button onClick={() => setAdminFilterOpen(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#626C8B', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7A859D', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Метрика</div>
                <NotionSelect
                  value={adminFilterDraft.metric}
                  options={LOGISTICS_DASHBOARD_METRICS.map(m => ({ value: m.key, label: m.label }))}
                  onChange={v => setAdminFilterDraft(prev => prev ? { ...prev, metric: v as LogisticsDashboardMetric } : prev)}
                  variant="inline"
                  panelWidth={260}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7A859D', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Тип транспорта</div>
                <NotionSelect
                  value={adminFilterDraft.vehicleFilter}
                  options={LOGISTICS_VEHICLE_FILTERS.map(f => ({ value: f.key, label: f.label }))}
                  onChange={v => setAdminFilterDraft(prev => prev ? { ...prev, vehicleFilter: v as LogisticsVehicleFilter } : prev)}
                  variant="inline"
                  panelWidth={210}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAdminFilterOpen(null)}
                style={{ padding: '7px 16px', border: '1px solid #D4E3E7', borderRadius: 10, background: '#F5FAFB', color: '#626C8B', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}
              >
                Отмена
              </button>
              <button
                onClick={saveAdminFilter}
                disabled={savingPageFilter}
                style={{ padding: '7px 16px', border: 'none', borderRadius: 10, background: '#31A4A5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: savingPageFilter ? 'default' : 'pointer', opacity: savingPageFilter ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Save size={13} />
                {savingPageFilter ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewFamily && (
        <NewFamilyModal
          onClose={() => setShowNewFamily(false)}

        />
      )}

      {showNewDriver && (
        <NewDriverModal
          branches={driverBranches}
          initialBranchKey={selectedDashboardSchool?.key === DRIVER_RESERVE_KEY ? undefined : selectedDashboardSchool?.key}
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
