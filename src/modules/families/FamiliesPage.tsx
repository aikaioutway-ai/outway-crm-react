import { withFormerTransferDrivers } from '../drivers/formerTransferDrivers';
import { MAX_TRANSFER_NUMBER, parseTransferChoice, TRANSFER_NUMBER_VALUES, TRANSFER_X, TRANSFER_X_LABEL, transferChoiceValue } from './constants';
import { fetchTransferDriversHistory } from '../../services/expenseService';
import { withSchoolColumn } from '../../core/tables/withSchoolColumn';
import ReceiptModal from './ReceiptModal';
import FilterableTable from '../../core/tables/FilterableTable';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import PaymentDots from './PaymentDots';
import { paymentDotPeriods, periodKey, type ChildPaymentDots } from './paymentDotsModel';
import { driverMatchesSchool, isVisibleDriver } from '../drivers/driverSchoolVisibility';
import DriverPaymentsPanel from '../drivers/DriverPaymentsPanel';
import TaskButton from '../tasks/TaskButton';
import TransferNumberBadge from '../../core/dashboard/TransferNumberBadge';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Family, FamilyPayment, PaymentType, UserRole, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import { setChildDiscountChoice } from '../../services/discountService';
import {
  SCHOOL_TABS, ZONE_COLOR, VT_LABEL, getBranchFilter, isSchoolInTier, schoolTabsForTier
} from './constants';
import type { SchoolTier } from './SchoolTierTabs';
import { adminDeleteV2Child, CashierPaymentRow, changeV2DriverTransfer, clearV2TransferVehicleType, createDefaultV2DriverDocuments, deleteV2Driver, FAMILIES_CHANGED_EVENT, fetchAllV2FamiliesPages, fetchCashierPaymentsTable, fetchChargesForPeriod, fetchChildPaymentDots, fetchFamilyPaymentDots, fetchPageFilters, fetchPaymentsTable, fetchV2Branches, fetchV2DriverDocuments, fetchV2DriversTable, fetchV2Family, fetchV2TransfersDashboard, PageFilterSettings, PaymentTableRow, PeriodChargeStats, rejectV2Family, savePageFilter, saveV2DriverDocuments, updateV2Child, updateV2ChildBoardingDate, updateV2ChildRoute, updateV2Driver, updateV2Family, updateV2TransferVehicleType, V2BranchOption, V2DriverDocumentInput, V2DriverTableRow, V2TransferDashboardRow } from '../../services/crmV2Service';
import { familiesTableQuery, logisticsTableQuery, useFamiliesPages, useBranchStats, usePaymentsTable, usePeriodChargeStats } from '../../hooks/useCrmQueries';
import { queryClient } from '../../services/queryClient';
import InlineFamilyCard from './InlineFamilyCard';
import AccrualDialog, { AccrualDialogState } from './AccrualDialog';
import DeleteChildModal from './DeleteChildModal';
import NewFamilyModal from './NewFamilyModal';
import NewDriverModal from '../drivers/NewDriverModal';
import { B2B_ORDER_STATUSES, B2BOrder } from '../b2b/B2BOrders';
import { useB2BOrders } from '../../hooks/useB2BData';
import { DRIVER_RESERVE_KEY, isReserveDriver } from '../drivers/DriversOverview';
import { confirmFamilyPayment, copyPreviousMonthCharges, invalidateFinanceCache, setChildCharge, undoCopyPreviousMonthCharges, updateFamilyPayment } from '../../services/financeService';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import NotionSelect from '../../core/selects/NotionSelect';
import '../../core/tables/DataTable.css';
import { Check, ChevronDown, ChevronUp, Copy, Plus, X, Save, Paperclip, Pencil, Trash2, UserRound } from 'lucide-react';
import { formatClassName, formatName, formatPhone, phoneMatchesQuery } from '../../utils/format';
import { ALL_PERIODS, CASHIER_PERIODS, currentPayrollPeriodKey, currentCashierPeriodKey } from './constants';
import SchoolDockSidebar, { SCHOOL_DOCK_HIDDEN_WIDTH, SCHOOL_DOCK_WIDTH, type SchoolDockItem } from './SchoolDockSidebar';
import {
  childDebtAmount, compactMoney,
  downloadXlsxBuffer, driverDocumentExpired, driverDocumentMissing, formatDateShort, formatPhoneDisplay,
  isNewUnassignedRow, logisticsWorkRows, matchesVehicleTypes, normalizeRows, paymentRowMatchesPeriod,
  uniqueFamilyRows, vehicleTypeShortLabel, XLSX_BRAND,
} from './familiesRowHelpers';
import { buildDriverParentCardLines, buildDriverParentCardText } from './driverParentCard';

function cashierRowMatchesSelectedPeriod(row: CashierPaymentRow | PaymentTableRow, periodKey: string): boolean {
  if (periodKey === 'ALL') {
    return CASHIER_PERIODS.some(period => paymentRowMatchesPeriod(row, period.key));
  }
  return paymentRowMatchesPeriod(row, periodKey);
}

function isConfirmedPaymentStatus(status: string): boolean {
  const lower = String(status ?? '').toLowerCase();
  return lower === 'paid' || lower === 'confirmed' || lower.includes('оплач') || lower.includes('подтверж');
}

function toCashierPaymentRow(row: PaymentTableRow): CashierPaymentRow {
  return { ...row, comment: '' };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // В некоторых встроенных браузерах доступ к Clipboard API запрещён.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

// Точки оплат грузятся частями по 100 детей: адрес запроса остаётся коротким,
// а при подгрузке следующей страницы таблицы уже загруженные части не повторяются.
const PAYMENT_DOTS_CHUNK = 100;
const PAYMENT_DOTS_PERIODS = paymentDotPeriods();
const combinePaymentDots = (results: UseQueryResult<Record<string, ChildPaymentDots>>[]) =>
  Object.assign({}, ...results.map(result => result.data ?? {})) as Record<string, ChildPaymentDots>;

export interface ChildRow {
  rowId: string;
  familyId: string;
  familyIndex: number;
  isFirstChild: boolean;
  childCreatedAt: string | null;
  transferAssignedAt: string | null;
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
  isTestTransfer?: boolean;
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
  discountOverridePercent?: number | null;
  fixedPrice?: number | null;
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
}

type FamiliesMode = 'requests' | 'payments' | 'charges' | 'debtors' | 'directory' | 'cashier' | 'logistics';

interface FamiliesPageProps {
  schoolTier?: SchoolTier;
  initialOpenDriverId?: string;
  mode?: FamiliesMode;
  accrualsView?: boolean;
  /** Дату посадки правят только владелец и руководство. */
  canEditBoardingDate?: boolean;
  userRole?: UserRole;
  userName?: string;
  authToken?: string;
  allowedSchools?: string[];
  settingsScope?: string;
  initialQuickFilter?: Partial<ModeFilters>;
  adminFiltersOpen?: boolean;
  onAdminFiltersClose?: () => void;
  columnsOpen?: boolean;
  onColumnsOpenChange?: (v: boolean) => void;
  hideTransferBars?: boolean;
  onSchoolKeyChange?: (key: string) => void;
  customTopContent?: React.ReactNode;
  customTableContent?: React.ReactNode;
  extraSchoolDockItems?: SchoolDockItem[];
  onSchoolsSidebarWidthChange?: (width: number) => void;
  externalQuickTransfer?: string;
  externalQuickChildStatus?: string;
  externalPeriodKey?: string;
  initialOpenFamilyId?: string | null;
  initialSearch?: string;
  initialSearchChildId?: string;
  onInitialFamilyOpened?: () => void;
  cashierView?: 'pending' | 'confirmed';
  /** Показывать только детей в трансферах этих типов машин (пусто — все). */
  vehicleTypes?: readonly VehicleType[];
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

const TRANSFER_OPTIONS = TRANSFER_NUMBER_VALUES.map(value => ({ value, label: `№ ${value}` }));
const TRANSFER_BAR_OPTIONS = TRANSFER_NUMBER_VALUES;
const STOP_OPTIONS = Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const PAYMENT_METHOD_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'transfer', label: 'АйКай Мбанк' },
];

const COLUMNS: ColumnDef<ChildRow>[] = [
  {
    key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 160, editable: true,
    render: (val, row) => row.isFirstChild
      ? <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{val}</span>
      : <span style={{ fontSize: 11, color: 'var(--text-2)', paddingLeft: 8 }}>└ #{row.familyId.slice(-4)}</span>,
    getValue: (row) => row.parentName,
  },
  {
    key: 'phone', label: 'Телефон', type: 'text', category: 'Клиент', width: 145, editable: true,
    render: (val, row) => row.isFirstChild
      ? <span className="dt-phone">{formatPhoneDisplay(val as string)}</span>
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
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
        {val}
        {['Asylkech Girls School', 'AsylKech Girls School'].includes(row.branchName) && (
          <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 3 }}>_A</span>
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
      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: ZONE_COLOR[val]?.bg, color: ZONE_COLOR[val]?.color }}>
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
    render: (_val, row) => (
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
        {(VT_LABEL[row.vehicleType] ?? row.vehicleType)}{' '}<TransferNumberBadge number={row.transferNumber} vehicleType={row.vehicleType} />
      </span>
    ),
    getValue: (row) => row.vehicleType,
  },
  {
    key: 'transferNumber', label: '№ Трансфера', type: 'select', category: 'Маршрут', width: 100, editable: true,
    editOptions: [{ value: '', label: '—' }, { value: TRANSFER_X, label: TRANSFER_X_LABEL }, ...TRANSFER_OPTIONS],
    getValue: (row) => transferChoiceValue(row.status, row.transferNumber),
    render: (val, row) => <TransferNumberBadge number={val} vehicleType={row.vehicleType} />,
  },
  {
    key: 'stopNumber', label: 'Остановка', type: 'select', category: 'Маршрут', width: 95, editable: true,
    editOptions: [{ value: '', label: '—' }, ...STOP_OPTIONS],
    render: (val) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{val || '—'}</span>,
  },
  {
    key: 'timeMorning', label: 'Время утро', type: 'text', category: 'Маршрут', width: 95, editable: true,
    render: (val) => <span style={{ fontSize: 12, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'monthlyPrice', label: 'Сумма/мес', type: 'currency', category: 'Финансы', width: 110,
    render: (val) => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{money(val)}</span>,
  },
  { key: 'discountAmount', label: 'Скидка', type: 'currency', category: 'Финансы', width: 95, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'debtAmount', label: 'Долг', type: 'currency', category: 'Финансы', width: 95, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'balance', label: 'Баланс', type: 'currency', category: 'Финансы', width: 95, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'totalCharged', label: 'Общ. начисл.', type: 'currency', category: 'Финансы', width: 110, visible: false, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'totalPaid', label: 'Платежи', type: 'currency', category: 'Финансы', width: 110, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
  { key: 'pendingPayment', label: 'На проверке', type: 'currency', category: 'Финансы', width: 105, visible: false, aggregateByKey: 'familyId', render: (val, row) => <span>{row.isFirstChild ? money(Number(val ?? 0)) : '—'}</span> },
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
    render: (value,row) => <span style={{ fontWeight: 600, color: 'var(--text)' }}>{value || '—'}{row.previousAssignment && <small style={{display:'block',color:'var(--text-2)'}}>Ранее на трансфере</small>}</span>,
  },
  { key: 'phone', label: 'Телефон', type: 'text', category: 'Водитель', width: 145, render: value => <span className="dt-phone">{formatPhoneDisplay(value as string) || '—'}</span> },
  { key: 'secondPhone', label: 'Доп. телефон', type: 'text', category: 'Водитель', width: 145, visible: false, render: value => <span className="dt-phone">{formatPhoneDisplay(value as string) || '—'}</span> },
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
        color: value === 'active' ? '#1B5E20' : 'var(--text)',
        fontSize: 11,
        fontWeight: 600,
      }}>
        {{active:'Активен',inactive:'Неактивен',vacation:'Отпуск',dismissed:'Уволен',archive:'Архив',reserve:'Резерв'}[String(value)] || value || '—'}
      </span>
    ),
  },
  { key: 'branchShorts', label: 'Школа', type: 'text', category: 'Маршрут', width: 110, getValue: row => row.branchShorts.join(', ') },
  { key: 'transferNumbers', label: 'Трансфер', type: 'text', category: 'Маршрут', width: 140, render: (value, row) => <TransferNumberBadge number={value} vehicleType={row.vehicleType} /> },
  {
    key: 'vehicleLabel',
    label: 'Тип ТС',
    type: 'select',
    category: 'Авто',
    width: 125,
    render: value => <span style={{ fontWeight: 600, color: 'var(--text)' }}>{value || '—'}</span>,
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

type LogisticsDashboardMetric = 'average' | 'count' | 'debtSum' | 'debtorsCount' | 'chargedSum' | 'paidCount' | 'paidSum' | 'balanceSum' | 'pendingSum' | 'pendingAmount' | 'rejectedCount' | 'rejectedSum' | 'allPaymentsCount' | 'allPaymentsSum';
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
type DriverCardTab = 'main' | 'children' | 'parentCard' | 'documents' | 'finance' | 'b2b' | 'advances';
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

const DRIVER_STATUS_OPTIONS = [
  { value: 'active', label: 'Активен' },
  { value: 'inactive', label: 'Неактивен' },
  { value: 'vacation', label: 'Отпуск' },
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

const LOGISTICS_VEHICLE_FILTERS: { key: LogisticsVehicleFilter; label: string }[] = [
  { key: 'all', label: 'Все ТС' },
  { key: 'microbus', label: 'Микроавтобус' },
  { key: 'minivan', label: 'Минивэн' },
  { key: 'sedan', label: 'Седан' },
];


const TRANSFER_TONE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  microbus: { bg: '#D7EEEE', border: '#AAD4D4', text: '#146566', dot: '#1A7F80' },
  minivan: { bg: '#F3EEFF', border: '#D9C9FE', text: '#6D28D9', dot: '#8B5CF6' },
  sedan: { bg: '#FFF4EB', border: '#FED7AA', text: '#C2410C', dot: '#F97316' },
  empty: { bg: '#F5FAFB', border: 'var(--border)', text: 'var(--text-2)', dot: '#AAB5AE' },
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

const EMPTY_PERIOD_STATS: PeriodChargeStats[] = [];
const ACCRUAL_REFRESH_DELAY_MS = 2000;
type AccrualColumns = { deposit: Map<string, number>; previous: Map<string, number>; current: Map<string, number> };

/** Начисления изменились: колонки месяцев, долг по детям и итоги школ перечитаются при следующем показе. */
function invalidateAccrualCaches() {
  invalidateFinanceCache();
  void queryClient.invalidateQueries({ queryKey: ['child-accrual-columns'] });
  void queryClient.invalidateQueries({ queryKey: ['manager-charge-stats'] });
}
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
    if (row.pendingPaymentCount > 0) return <span style={{ color: '#B45309', fontWeight: 600, fontSize: 11 }}>На проверке</span>;
    if (row.rejectedPaymentCount > 0) return <span style={{ color: '#C62828', fontWeight: 600, fontSize: 11 }}>Отклонён</span>;
    if (row.paidPaymentCount > 0) return <span style={{ color: '#15803D', fontWeight: 600, fontSize: 11 }}>Подтверждён</span>;
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
    if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 600, fontSize: 11 }}>АйКай Мбанк</span>;
    if (lower === 'cash' || lower.includes('нал')) return <span style={{ color: '#15803D', fontWeight: 600, fontSize: 11 }}>Наличный</span>;
    return <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{type}</span>;
  },
};
function ReceiptThumb({ url, paymentId, subtitle, canEdit = false, onSaved }: { url: string; paymentId?: string | null; subtitle?: string; canEdit?: boolean; onSaved?: (payment: FamilyPayment) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        title="Открыть чек"
        aria-label="Открыть чек"
        style={{ display: 'inline-flex', alignItems: 'center', padding: 0, border: 0, background: 'transparent', color: '#146566', cursor: 'pointer' }}
      >
        <Paperclip size={16} strokeWidth={2.5} />
      </button>
      {open && <ReceiptModal receiptUrl={url} paymentId={paymentId ?? undefined} subtitle={subtitle} canEdit={canEdit} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
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
    return <ReceiptThumb url={url} paymentId={row.pendingPaymentId} subtitle={row.parentName} />;
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
    render: (val) => <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{val ?? '—'}</span>,
  },
  {
    key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 170,
    render: (val) => <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'phone', label: 'Телефон', type: 'text', category: 'Клиент', width: 145,
    render: (val) => <span className="dt-phone">{formatPhoneDisplay(val as string) || '—'}</span>,
  },
  {
    key: 'childrenNames', label: 'Дети', type: 'text', category: 'Клиент', width: 200,
    render: (val) => <span style={{ fontSize: 12, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'amount', label: 'Сумма', type: 'currency', category: 'Платёж', width: 110,
    render: (val) => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{money(Number(val ?? 0))}</span>,
  },
  {
    key: 'status', label: 'Статус', type: 'text', category: 'Платёж', width: 115, sortable: false, filterable: false,
    render: (val) => {
      const s = PAYMENT_STATUS_COLOR[String(val)] ?? { color: '#9AA7AE' };
      return <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{PAYMENT_STATUS_LABEL[String(val)] ?? val}</span>;
    },
  },
  {
    key: 'paymentMethod', label: 'Вид оплаты', type: 'select', category: 'Платёж', width: 110, sortable: false, filterable: false,
    editOptions: PAYMENT_METHOD_OPTIONS,
    render: (val) => {
      if (!val) return <span style={{ color: '#9AA7AE', fontSize: 11 }}>—</span>;
      const lower = String(val).toLowerCase();
      if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 600, fontSize: 11 }}>АйКай Мбанк</span>;
      if (lower === 'cash' || lower.includes('нал')) return <span style={{ color: '#15803D', fontWeight: 600, fontSize: 11 }}>Наличный</span>;
      return <span style={{ fontSize: 11, color: 'var(--text)' }}>{val}</span>;
    },
  },
  {
    key: 'receiptUrl', label: 'Чек', type: 'text', category: 'Платёж', width: 52, sortable: false, filterable: false,
    render: (val, row) => {
      if (!val) return <Paperclip size={15} strokeWidth={1.5} style={{ color: '#C8D5D8' }} />;
      return <ReceiptThumb url={String(val)} paymentId={row.id} subtitle={row.parentName} />;
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

interface LastAccrualCopy { operationId: string; month: number; year: number; count: number; day: string }
const LAST_ACCRUAL_COPY_KEY = 'accruals_last_copy_v1';
function todayKey(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bishkek' });
}
function readLastAccrualCopy(): LastAccrualCopy | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_ACCRUAL_COPY_KEY) ?? 'null');
    return value?.operationId ? value as LastAccrualCopy : null;
  } catch {
    return null;
  }
}
function writeLastAccrualCopy(value: LastAccrualCopy | null): void {
  try {
    if (value) localStorage.setItem(LAST_ACCRUAL_COPY_KEY, JSON.stringify(value));
    else localStorage.removeItem(LAST_ACCRUAL_COPY_KEY);
  } catch {
    // Без хранилища ссылка на отмену просто пропадёт после перезагрузки.
  }
}

export default function FamiliesPage({ mode = 'requests', accrualsView = false, canEditBoardingDate = false, userRole = 'admin', userName = 'CRM', authToken = '', allowedSchools, settingsScope, initialQuickFilter, adminFiltersOpen, onAdminFiltersClose, columnsOpen, onColumnsOpenChange, hideTransferBars = false, onSchoolKeyChange, customTopContent, customTableContent, extraSchoolDockItems = [], onSchoolsSidebarWidthChange, externalQuickTransfer, externalQuickChildStatus, externalPeriodKey, initialOpenFamilyId, initialOpenDriverId, initialSearch, initialSearchChildId, onInitialFamilyOpened, cashierView = 'pending', schoolTier = '1.0', vehicleTypes }: FamiliesPageProps) {
  // В разделе «Школы 2.0» таблица работает только со школами 2.0.
  const schoolTabs = useMemo(() => schoolTabsForTier(schoolTier), [schoolTier]);
  const hasAdminAccess = userRole === 'admin' || userRole === 'gen_director';
  const canRejectFamilies = ['admin', 'manager', 'logist', 'senior_logist', 'director', 'gen_director'].includes(userRole);
  const { data: b2bOrders = [] } = useB2BOrders();
  const [rows, setRows]           = useState<ChildRow[]>(() => familiesRowsCache ?? []);
  const [paymentRows, setPaymentRows] = useState<PaymentTableRow[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  // Фильтр или «повторы» в заголовке таблицы должны искать по всем семьям, а не по одной странице с сервера.
  const [tableFiltersActive, setTableFiltersActive] = useState(false);
  const [cashierRows, setCashierRows] = useState<CashierPaymentRow[]>([]);
  const [loadingCashier, setLoadingCashier] = useState(false);
  const [cashierConfirmingId, setCashierConfirmingId] = useState<string | null>(null);
  const [cashierEditingId, setCashierEditingId] = useState<string | null>(null);
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
  const [childToDelete, setChildToDelete]       = useState<ChildRow | null>(null);
  const [driverBranches, setDriverBranches]     = useState<V2BranchOption[]>([]);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [tableBarsCollapsedByMode, setTableBarsCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_COLLAPSED });
  const [schoolsBarCollapsedByMode, setSchoolsBarCollapsedByMode] = useState<Record<FamiliesMode, boolean>>({ ...DEFAULT_MODE_SIDEBAR_COLLAPSED });
  const [dashboardSchoolByMode, setDashboardSchoolByMode] = useState<Partial<Record<FamiliesMode, string>>>({});
  const [dashboardMetricByMode, setDashboardMetricByMode] = useState<Partial<Record<FamiliesMode, LogisticsDashboardMetric>>>({});
  const [chargesPeriodKey, setChargesPeriodKey] = useState<string>('ALL');
  const [paymentsPeriodKey, setPaymentsPeriodKey] = useState<string>('ALL');
  const isPaymentsMode = mode === 'payments';
  const isCashierMode = mode === 'cashier';

  const { data: cashierConfirmedSource = null, isLoading: loadingCashierConfirmed } = usePaymentsTable({
    enabled: isCashierMode && cashierView === 'confirmed',
  });
  const cashierConfirmedRows = useMemo(
    () => (cashierConfirmedSource ?? []).filter(row => isConfirmedPaymentStatus(row.status)).map(toCashierPaymentRow),
    [cashierConfirmedSource],
  );

  const cashierColumns = useMemo((): ColumnDef<CashierPaymentRow>[] => [
    { key: 'receiptCode', label: 'Код чека', type: 'text', category: 'Платёж', width: 180, render: val => <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{val || '—'}</span> },
    { key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 160, render: (val) => <span style={{ fontWeight: 600, fontSize: 13 }}>{val || '—'}</span> },
    { key: 'childrenNames', label: 'Дети', type: 'text', category: 'Клиент', width: 160, render: (val) => {
      const names = String(val || '').split(',').map(n => n.trim()).filter(Boolean);
      if (!names.length) return <span style={{ fontSize: 12, color: '#9AA7AE' }}>—</span>;
      return <span style={{ fontSize: 12, lineHeight: 1.5 }}>{names.map((n, i) => <React.Fragment key={i}>{n}{i < names.length - 1 && <br />}</React.Fragment>)}</span>;
    }},
    { key: 'amount', label: 'Сумма', type: 'currency', category: 'Платёж', width: 110, render: (val) => <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{money(Number(val ?? 0))}</span> },
    {
      key: 'createdAt', label: 'Дата поступления', type: 'text', category: 'Платёж', width: 130, sortable: false, filterable: false,
      render: (_val, row) => {
        const date = cashierView === 'confirmed' ? row.actualPaymentDate : cashierDates[row.id];
        return <span style={{ fontSize: 12, color: date ? 'var(--text)' : '#9AA7AE' }}>{date ? new Date(date).toLocaleDateString('ru-RU') : '—'}</span>;
      },
    },
    {
      key: 'status', label: 'Подтверждение', type: 'text', category: 'Платёж', width: 230, sortable: false, filterable: false,
      render: (_val, row) => {
        if (cashierView === 'confirmed') {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--success)', background: 'rgba(16,185,129,.1)' }}>
              ✓ Подтверждено
            </span>
          );
        }
        const busy = cashierConfirmingId === row.id;
        if (cashierEditingId !== row.id) {
          return (
            <button
              onClick={e => {
                e.stopPropagation();
                setCashierDates(prev => ({ ...prev, [row.id]: prev[row.id] || new Date().toISOString().slice(0, 10) }));
                setCashierEditingId(row.id);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: '#fff', cursor: 'pointer' }}
            >
              <Pencil size={12} /> На проверке
            </button>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
            <input
              type="date"
              autoFocus
              disabled={busy}
              value={cashierDates[row.id] ?? ''}
              onChange={e => setCashierDates(prev => ({ ...prev, [row.id]: e.target.value }))}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 12, color: 'var(--text)', background: '#fff', width: 118 }}
            />
            <button
              title="Подтвердить"
              disabled={busy || !cashierDates[row.id]}
              onClick={() => cashierConfirm(row, cashierDates[row.id] ?? '')}
              style={{ border: 'none', borderRadius: 6, width: 26, height: 26, fontSize: 13, fontWeight: 600, color: '#fff', background: busy || !cashierDates[row.id] ? '#A7E4D3' : 'var(--success)', cursor: busy || !cashierDates[row.id] ? 'not-allowed' : 'pointer' }}
            >✓</button>
            <button
              title="Отклонить"
              disabled={busy}
              onClick={() => cashierReject(row)}
              style={{ border: 'none', borderRadius: 6, width: 26, height: 26, fontSize: 13, fontWeight: 600, color: '#991B1B', background: '#FEE2E2', cursor: busy ? 'not-allowed' : 'pointer' }}
            >✕</button>
            <button
              title="Отмена"
              disabled={busy}
              onClick={() => setCashierEditingId(null)}
              style={{ border: 'none', borderRadius: 6, width: 26, height: 26, fontSize: 12, fontWeight: 600, color: 'var(--text-2)', background: 'var(--surface-2)', cursor: busy ? 'not-allowed' : 'pointer' }}
            >×</button>
          </div>
        );
      },
    },
    {
      key: 'paymentMethod', label: 'Вид оплаты', type: 'select', category: 'Платёж', width: 100, sortable: false, filterable: false,
      editable: hasAdminAccess,
      editOptions: PAYMENT_METHOD_OPTIONS,
      render: (val) => {
        if (!val) return <span style={{ color: '#9AA7AE', fontSize: 11 }}>—</span>;
        const lower = String(val).toLowerCase();
        if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 600, fontSize: 11 }}>АйКай Мбанк</span>;
        return <span style={{ color: '#15803D', fontWeight: 600, fontSize: 11 }}>Наличный</span>;
      },
    },
    {
      key: 'receiptUrl', label: 'Чек', type: 'text', category: 'Платёж', width: 52, sortable: false, filterable: false,
      render: (val, row) => !val ? <Paperclip size={15} strokeWidth={1.5} style={{ color: '#C8D5D8' }} /> : <ReceiptThumb url={String(val)} paymentId={row.id} subtitle={row.parentName} canEdit={hasAdminAccess || userRole === 'cashier'} onSaved={payment => {
        const patch = { receiptCode: payment.receiptCode ?? null, paymentDate: payment.paymentDate };
        setCashierRows(previous => previous.map(item => item.id === payment.id ? { ...item, ...patch } : item));
      }} />,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [cashierDates, cashierConfirmingId, cashierEditingId, hasAdminAccess, cashierView, userRole]);
  const [transferCardNumber, setTransferCardNumber] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(initialOpenDriverId ?? null);
  useEffect(() => { if (initialOpenDriverId) setSelectedDriverId(initialOpenDriverId); }, [initialOpenDriverId]);
  const [selectedDriverTab, setSelectedDriverTab] = useState<DriverCardTab>('main');
  const [driverParentCardCopied, setDriverParentCardCopied] = useState(false);
  const [driverDraft, setDriverDraft] = useState<DriverDraft | null>(null);
  const [driverTransferDraftId, setDriverTransferDraftId] = useState('');
  const [driverBranchDraftId, setDriverBranchDraftId] = useState('');
  const [driverDocumentsDraft, setDriverDocumentsDraft] = useState<V2DriverDocumentInput[]>(() => createDefaultV2DriverDocuments());
  const [savingDriver, setSavingDriver] = useState(false);
  const [deletingDriver, setDeletingDriver] = useState(false);
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
  const dashboardVehicleFilter = tabDefaultFilters[`${mode}:${activeTab}`]?.vehicleFilter ?? tabDefaultFilters[`${mode}:ALL`]?.vehicleFilter ?? 'all';
  const tableStorageKey = isRequestsModule
    ? 'families_table_requests_v3'
    : isChargesMode
      ? accrualsView ? 'families_table_accruals_v3' : 'families_table_charges_v2'
      : isPaymentsMode
      ? 'families_table_payments_v2'
      : isDirectoryMode
        ? settingsScope ? `families_table_${settingsScope}_directory_v2` : 'families_table_directory_v2'
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
    if (isChargesMode) setChargesPeriodKey(externalPeriodKey);
    else setPaymentsPeriodKey(externalPeriodKey);
  }, [externalPeriodKey, isChargesMode]);

  useEffect(() => {
    if (!isCashierMode || externalPeriodKey !== undefined) return;
    if (paymentsPeriodKey === 'ALL' || CASHIER_PERIODS.some(period => period.key === paymentsPeriodKey)) return;
    setPaymentsPeriodKey(currentCashierPeriodKey());
  }, [externalPeriodKey, isCashierMode, paymentsPeriodKey]);
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

  useEffect(() => {
    // «Заявки»/«Справочник» берут данные из useFamiliesPage (постранично) —
    // полная загрузка тут не нужна и раньше приводила к двойному фетчу
    // (полный rows для сводок + отдельная страница для таблицы). Полная
    // загрузка запускается лениво, если mode позже сменится на режим,
    // которому всё ещё нужен весь rows (Кассир/Логистика/Начисления/...).
    // Исключение: при фильтре в заголовке таблицы им нужен весь список (берётся из общего кэша).
    if ((isRequestsModule || mode === 'directory') && !tableFiltersActive) return;
    load(!familiesRowsCache, false);
    // This transition loader deliberately follows the active module only. `load`
    // reads the latest cache and filters when the effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRequestsModule, mode, tableFiltersActive]);

  useEffect(() => {
    if (!isDirectoryMode) return;
    let cancelled = false;
    Promise.all([
      fetchV2TransfersDashboard(),
      fetchV2DriversTable(),
    ]).then(([transfers, drivers]) => {
      if (cancelled) return;
      setDashboardTransfers(transfers);
      setDriverRows(drivers);
    }).catch(error => {
      console.error('Directory transport metadata load failed', error);
    });
    return () => { cancelled = true; };
  }, [isDirectoryMode]);

  useEffect(() => {
    if (isRequestsModule || mode === 'directory') return;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void load(false); }, 80);
    };
    window.addEventListener(FAMILIES_CHANGED_EVENT, refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(FAMILIES_CHANGED_EVENT, refresh);
    };
    // Realtime refresh intentionally uses the current module's loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          quickTransfer: externalQuickTransfer ?? '',
          quickChildStatus: externalQuickChildStatus ?? (mode === 'directory' ? '' : current.quickChildStatus),
        },
      };
    });
    setDashboardSchoolByMode(prev => (
      prev[mode] === nextActiveTab ? prev : { ...prev, [mode]: nextActiveTab }
    ));
  }, [initialQuickFilter?.activeTab, mode, externalQuickTransfer, externalQuickChildStatus]);

  useEffect(() => {
    if (typeof initialSearch === 'string') setSearch(initialSearch);
  }, [initialSearch]);

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
        ? { ...column, editable: hasAdminAccess }
        : column
    ))
  ), [hasAdminAccess]);

  async function handlePaymentMethodCellSave(row: PaymentTableRow | CashierPaymentRow, key: string, value: any): Promise<boolean> {
    if (!hasAdminAccess) {
      alert('Менять вид оплаты может только админ');
      return false;
    }
    if (key !== 'paymentMethod') return false;

    try {
      const paymentType = value as PaymentType;
      const savedPaymentType = await updateFamilyPayment(row.id, { paymentType });
      if (savedPaymentType !== paymentType) return false;
      setPaymentRows(prev => prev.map(item => (
        item.id === row.id ? { ...item, paymentMethod: savedPaymentType } : item
      )));
      setCashierRows(prev => prev.map(item => (
        item.id === row.id ? { ...item, paymentMethod: savedPaymentType } : item
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
      setCashierEditingId(null);
      loadCashierRows();
    } catch (e: any) { alert('Не удалось подтвердить: ' + (e?.message ?? '')); }
    finally { setCashierConfirmingId(null); }
  }

  async function cashierReject(row: CashierPaymentRow) {
    try {
      await updateFamilyPayment(row.id, { status: 'Отклонено' });
      setCashierEditingId(null);
      loadCashierRows();
    } catch (e: any) { alert('Не удалось отклонить: ' + (e?.message ?? '')); }
  }

  useEffect(() => {
    const modes: FamiliesMode[] = ['requests', 'payments', 'debtors', 'directory', 'cashier', 'logistics'];
    fetchPageFilters(modes).catch(() => [] as PageFilterSettings[]).then(rows => {
      const map: Record<string, { metric: LogisticsDashboardMetric; vehicleFilter: LogisticsVehicleFilter }> = {};
      rows.forEach(row => {
        map[`${row.mode}:${row.tab_key}`] = {
          metric: row.metric as LogisticsDashboardMetric,
          vehicleFilter: row.vehicle_filter as LogisticsVehicleFilter,
        };
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

  // Начисления по детям за выбранный период ('ALL' — за всё время); тот же кеш, что у полосы цифр школы.
  const periodStatsQuery = usePeriodChargeStats(chargesPeriodKey, { enabled: isChargesMode && !accrualsView });
  const childPeriodStats = periodStatsQuery.data ?? EMPTY_PERIOD_STATS;
  const periodStats = chargesPeriodKey === 'ALL' ? EMPTY_PERIOD_STATS : childPeriodStats;
  // В строке ребёнка — его начисление и долг, а не итог семьи.
  const periodStatsByChild = useMemo(() => {
    const map = new Map<string, PeriodChargeStats>();
    childPeriodStats.forEach(stat => { if (stat.childId) map.set(stat.childId, stat); });
    return map;
  }, [childPeriodStats]);
  // «Долг» в «Начислениях» — весь долг ребёнка за все периоды (тот же кеш 'ALL').
  const accrualDebtQuery = usePeriodChargeStats('ALL', { enabled: accrualsView });
  const accrualDebtByChild = useMemo(() => {
    const map = new Map<string, number>();
    (accrualDebtQuery.data ?? EMPTY_PERIOD_STATS).forEach(stat => { if (stat.childId) map.set(stat.childId, stat.debt); });
    return map;
  }, [accrualDebtQuery.data]);
  const rowDebt = (row: ChildRow) => periodStatsByChild.get(row.rowId)?.debt ?? (chargesPeriodKey === 'ALL' ? childDebtAmount(row) : 0);

  const accrualPeriod = ALL_PERIODS.find(p => p.key === chargesPeriodKey && p.key !== 'deposit')
    ?? ALL_PERIODS.find(p => p.key === currentPayrollPeriodKey())!;
  const previousAccrualMonth = accrualPeriod.month === 1 ? 12 : accrualPeriod.month - 1;
  const previousAccrualYear = accrualPeriod.month === 1 ? accrualPeriod.year - 1 : accrualPeriod.year;
  // Депозит учебного года хранится как начисление за май этого года.
  const accrualDepositYear = accrualPeriod.month >= 6 ? accrualPeriod.year + 1 : accrualPeriod.year;
  // Вкладку «Начисления» видят только те, кому App разрешил canAccessManagerAccruals, — они же и правят.
  const canEditAccruals = accrualsView;
  const [copyingAccruals, setCopyingAccruals] = useState(false);
  const [accrualDialog, setAccrualDialog] = useState<AccrualDialogState | null>(null);
  // Последний перенос — его можно отменить в тот же день, в том числе после перезагрузки страницы.
  const [lastAccrualCopy, setLastAccrualCopy] = useState<LastAccrualCopy | null>(readLastAccrualCopy);
  // Галочки во вкладке «Начисления»: массовые действия идут только по отмеченным детям.
  const [selectedAccrualIds, setSelectedAccrualIds] = useState<Set<string>>(() => new Set());
  useEffect(() => { setSelectedAccrualIds(new Set()); }, [chargesPeriodKey]);
  const canUndoAccrualCopy = canEditAccruals && lastAccrualCopy != null
    && lastAccrualCopy.month === accrualPeriod.month && lastAccrualCopy.year === accrualPeriod.year
    && lastAccrualCopy.day === todayKey();
  const accrualQueryKey = ['child-accrual-columns', accrualPeriod.year, accrualPeriod.month] as const;
  const accrualRefreshTimer = useRef<number | null>(null);
  useEffect(() => () => {
    // Ушли со страницы до фоновой перезагрузки — пусть данные обновятся при следующем открытии.
    if (accrualRefreshTimer.current) { window.clearTimeout(accrualRefreshTimer.current); invalidateAccrualCaches(); }
  }, []);
  const accrualQuery = useQuery({
    queryKey: accrualQueryKey,
    enabled: accrualsView,
    queryFn: async (): Promise<AccrualColumns> => {
      const [deposit, previous, current] = await Promise.all([
        fetchChargesForPeriod(null, null, 'deposit'),
        fetchChargesForPeriod(previousAccrualMonth, previousAccrualYear, null),
        fetchChargesForPeriod(accrualPeriod.month, accrualPeriod.year, null),
      ]);
      const byChild = (items: PeriodChargeStats[]) => new Map(items.filter(item => item.childId).map(item => [item.childId, item.charged]));
      return { deposit: byChild(deposit), previous: byChild(previous), current: byChild(current) };
    },
  });

  // force — после правок: данные берутся заново (или из уже идущего запроса),
  // без force — из общего кэша, если он ещё свежий.
  async function load(showSpinner = true, force = true) {
    if (showSpinner) setLoading(true);
    try {
      const shouldLoadTransportMeta = mode === 'logistics' || isDriversModule;
      const [families, transfers, drivers] = await Promise.all([
        mode === 'logistics'
          ? queryClient.fetchQuery(force ? { ...logisticsTableQuery, staleTime: 0 } : logisticsTableQuery)
          : queryClient.fetchQuery(force ? { ...familiesTableQuery, staleTime: 0 } : familiesTableQuery),
        shouldLoadTransportMeta ? fetchV2TransfersDashboard().catch(() => []) : Promise.resolve([]),
        shouldLoadTransportMeta ? fetchV2DriversTable().catch(() => []) : Promise.resolve([]),
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

  // После правок начислений и скидок — одна тихая перезагрузка через 2 с после последней правки,
  // а не полная перезагрузка таблиц на каждую ячейку.
  function scheduleAccrualRefresh() {
    if (accrualRefreshTimer.current) window.clearTimeout(accrualRefreshTimer.current);
    accrualRefreshTimer.current = window.setTimeout(() => {
      accrualRefreshTimer.current = null;
      invalidateAccrualCaches();
      void load(false);
    }, ACCRUAL_REFRESH_DELAY_MS);
  }

  async function saveBoardingDate(row: ChildRow, date: string): Promise<boolean> {
    if (!canEditBoardingDate || row.rowId.endsWith('_empty')) return false;
    if (date === (row.transferAssignedAt ?? '').slice(0, 10)) return true;
    try {
      const saved = await updateV2ChildBoardingDate({
        childId: row.rowId, familyId: row.familyId, childName: row.childName,
        date, previous: row.transferAssignedAt, actorName: userName,
      });
      setRows(prev => {
        const next = prev.map(item => item.rowId === row.rowId ? { ...item, transferAssignedAt: saved } : item);
        familiesRowsCache = next;
        return next;
      });
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить дату посадки');
      return false;
    }
  }

  async function saveAccrualCell(row: ChildRow, key: string, value: any): Promise<boolean> {
    if (row.rowId.endsWith('_empty')) return false;
    const showError = (error: unknown, title: string) => setAccrualDialog({
      title,
      message: error instanceof Error ? error.message : 'Попробуйте ещё раз',
    });
    if (key === 'discountAmount') {
      const currentChoice = row.discountOverridePercent == null ? 'auto' : String(row.discountOverridePercent);
      if (String(value) === currentChoice) return true;
      try {
        if (row.fixedPrice != null) throw new Error('У ребёнка фиксированная цена — скидку меняют в карточке');
        await setChildDiscountChoice(authToken, row.rowId, value === 'auto' ? null : Number(value), { deferRefresh: true });
        const discountOverridePercent = value === 'auto' ? null : Number(value);
        setRows(prev => prev.map(item => item.rowId === row.rowId ? { ...item, discountOverridePercent } : item));
        scheduleAccrualRefresh();
        return true;
      } catch (error) {
        showError(error, 'Не удалось изменить скидку');
        return false;
      }
    }
    const text = String(value ?? '').replace(/\s/g, '').replace(',', '.');
    const amount = text === '' ? 0 : Number(text);
    if (!Number.isFinite(amount) || amount < 0) {
      showError(new Error('Введите сумму числом'), 'Не удалось сохранить начисление');
      return false;
    }
    const target = key === 'accrual_deposit'
      ? { chargeType: 'deposit' as const, month: 5, year: accrualDepositYear }
      : key === 'accrual_previous'
        ? { chargeType: 'monthly' as const, month: previousAccrualMonth, year: previousAccrualYear }
        : { chargeType: 'monthly' as const, month: accrualPeriod.month, year: accrualPeriod.year };
    // Сумма не изменилась (в том числе пустое поле вместо нуля) — ничего не сохраняем и не спрашиваем.
    const currentAmount = accrualQuery.data?.[key.replace('accrual_', '') as 'deposit' | 'previous' | 'current'].get(row.rowId) ?? 0;
    if (amount === currentAmount) return true;
    const save = async () => {
      await setChildCharge({ childId: row.rowId, ...target, amount, actor: userName, deferRefresh: true });
      // База приняла сумму — сразу показываем её в ячейке, остальное обновится в фоне.
      const column = key.replace('accrual_', '') as 'deposit' | 'previous' | 'current';
      queryClient.setQueryData<AccrualColumns>(accrualQueryKey, (old: AccrualColumns | undefined) => {
        if (!old) return old;
        const next = new Map(old[column]);
        next.set(row.rowId, amount);
        return { ...old, [column]: next };
      });
      scheduleAccrualRefresh();
    };
    // Любое изменение суммы подтверждается в окне CRM; ячейка закрывается сразу.
    setAccrualDialog({
      title: 'Подтверждение',
      message: `Подтверждаете изменения? ${row.childName}: ${money(currentAmount)} → ${money(amount)}`,
      confirmLabel: 'Подтвердить',
      onConfirm: save,
    });
    return true;
  }

  function copyAccrualsFromPreviousMonth(rowsToCopy: ChildRow[]) {
    const childIds = rowsToCopy.map(row => row.rowId).filter(id => !id.endsWith('_empty'));
    if (!childIds.length) return;
    const monthName = (month: number) => new Date(2000, month - 1, 1).toLocaleString('ru-RU', { month: 'long' });
    setAccrualDialog({
      title: 'Перенести с прошлого месяца',
      message: `Перенести начисления за ${monthName(previousAccrualMonth)} в ${monthName(accrualPeriod.month)} для ${childIds.length} детей?\n\n`
        + `Детям, у которых уже есть начисление за ${monthName(accrualPeriod.month)}, сумма не изменится. `
        + 'Новые начисления сразу спишутся с баланса семей.',
      confirmLabel: 'Перенести',
      onConfirm: async () => {
        setCopyingAccruals(true);
        try {
          const result = await copyPreviousMonthCharges({ childIds, month: accrualPeriod.month, year: accrualPeriod.year, actor: userName });
          if (result.operationId) {
            const copy = { operationId: result.operationId, month: accrualPeriod.month, year: accrualPeriod.year, count: result.created, day: todayKey() };
            setLastAccrualCopy(copy);
            writeLastAccrualCopy(copy);
          }
          await Promise.all([accrualQuery.refetch(), load(false)]);
          setSelectedAccrualIds(new Set());
          return `Перенесено: ${result.created}.\nУже было начисление: ${result.skipped}.\nНет начисления за прошлый месяц: ${result.noSource}.`;
        } finally {
          setCopyingAccruals(false);
        }
      },
    });
  }

  function setAmountForSelectedAccruals(rowsToSet: ChildRow[]) {
    const targets = rowsToSet.filter(row => !row.rowId.endsWith('_empty'));
    if (!targets.length) return;
    const monthName = new Date(2000, accrualPeriod.month - 1, 1).toLocaleString('ru-RU', { month: 'long' });
    const alreadyCharged = targets.filter(row => (accrualQuery.data?.current.get(row.rowId) ?? 0) > 0).length;
    setAccrualDialog({
      title: 'Поставить сумму выбранным',
      message: `Начисление за ${monthName} для ${targets.length} детей.`
        + (alreadyCharged ? `\nУ ${alreadyCharged} уже есть начисление — оно заменится на новую сумму.` : '')
        + '\nНовые начисления сразу спишутся с баланса семей.',
      amountInput: { label: 'Сумма, сом' },
      confirmLabel: 'Начислить',
      onConfirm: async amountText => {
        const text = amountText.replace(/\s/g, '').replace(',', '.');
        const amount = Number(text);
        if (!text || !Number.isFinite(amount) || amount <= 0) throw new Error('Введите сумму числом больше нуля');
        setCopyingAccruals(true);
        let done = 0;
        const failed: string[] = [];
        try {
          for (const row of targets) {
            if ((accrualQuery.data?.current.get(row.rowId) ?? 0) === amount) { done += 1; continue; }
            try {
              await setChildCharge({ childId: row.rowId, chargeType: 'monthly', month: accrualPeriod.month, year: accrualPeriod.year, amount, actor: userName });
              done += 1;
            } catch {
              failed.push(row.childName);
            }
          }
          await Promise.all([accrualQuery.refetch(), load(false)]);
          setSelectedAccrualIds(new Set());
          return `Начислено ${money(amount)}: ${done}.` + (failed.length ? `\nНе удалось: ${failed.join(', ')}.` : '');
        } finally {
          setCopyingAccruals(false);
        }
      },
    });
  }

  function undoLastAccrualCopy() {
    const copy = lastAccrualCopy;
    if (!copy) return;
    setAccrualDialog({
      title: 'Отменить перенос',
      message: `Отменить последний перенос (${copy.count} начислений)? Списанные за них деньги вернутся на баланс семей.`,
      confirmLabel: 'Отменить перенос',
      onConfirm: async () => {
        setCopyingAccruals(true);
        try {
          const result = await undoCopyPreviousMonthCharges(copy.operationId, userName);
          setLastAccrualCopy(null);
          writeLastAccrualCopy(null);
          await Promise.all([accrualQuery.refetch(), load(false)]);
          return result.changed > 0
            ? `Отменено: ${result.undone}.\nНе тронуты, потому что сумму меняли вручную: ${result.changedNames.join(', ')}.`
            : `Отменено: ${result.undone}.`;
        } finally {
          setCopyingAccruals(false);
        }
      },
    });
  }

  async function handleCellSave(row: ChildRow, key: string, value: any): Promise<boolean> {
    if (key === 'transferAssignedAt') return saveBoardingDate(row, String(value ?? ''));
    if (accrualsView && (key === 'discountAmount' || key.startsWith('accrual_'))) return saveAccrualCell(row, key, value);
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
        if (key === 'vehicleLabel' && row.transferNumber) {
          await updateV2TransferVehicleType({
            schoolId: row.schoolId,
            branchId: row.branchId,
            transferNumber: Number(row.transferNumber),
            vehicleType: value as VehicleType,
            source: mode === 'logistics' ? 'logistics' : 'family_card',
            actorName: userName,
          });
          await load(false);
          return true;
        }
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

        // Смена типа ТС цену не меняет — пересчёт только при смене зоны.
        if (key === 'zone') {
          const base = getPriceByZone(row.schoolCode as any, value as Zone, row.vehicleType as VehicleType);
          // Итоговую цену со скидками пересчитывает база.
          updates.base_price = base;
        }

        if (key === 'transferNumber') {
          if (value === TRANSFER_X && !window.confirm(`Отправить «${row.childName || row.parentName}» в трансфер Х (отказ)?`)) return false;
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
            transferNumber: parseTransferChoice(value),
            stopNumber: row.stopNumber ? Number(row.stopNumber) : undefined,
            timeMorning: row.timeMorning ?? undefined,
            source: 'transfer_move',
            actorName: userName,
          });
          await load(false);
          return true;
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
        source: 'logistics',
        actorName: userName,
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
    if(!isSchoolInTier(tabKey, schoolTier))return false;
    if (!hasSchoolRestriction) return true;
    if (tabKey === 'ALL') return true;
    return allowedSchools!.some(k => k.toLowerCase() === tabKey.toLowerCase());
  }, [allowedSchools, hasSchoolRestriction, schoolTier]);

  const matchesSingleTab = useCallback((row: ChildRow, tabItem: typeof SCHOOL_TABS[number]) => {
    if (row.branchFilter === tabItem.key) return true;
    if (tabItem.branches.length > 0) return tabItem.branches.includes(row.branchName);
    if (tabItem.codes.length > 0) return tabItem.codes.includes(row.schoolCode);
    return false;
  }, []);

  const rowMatchesSchoolTab = useCallback((row: ChildRow, tabItem: typeof SCHOOL_TABS[number]) => {
    if(!isSchoolInTier(row.branchFilter, schoolTier))return false;
    if (tabItem.key === 'ALL') {
      if (!hasSchoolRestriction) return true;
      // «Все школы» для ограниченного сотрудника — не «вообще все», а объединение
      // его собственных разрешённых школ (раньше тут была строка, всегда
      // возвращавшая true для любого сотрудника с непустым allowedSchools).
      return schoolTabs.some(t => (
        allowedSchools!.some(k => k.toLowerCase() === t.key.toLowerCase()) && matchesSingleTab(row, t)
      ));
    }
    if (!isTabAllowed(tabItem.key)) return false;
    return matchesSingleTab(row, tabItem);
  }, [allowedSchools, hasSchoolRestriction, isTabAllowed, matchesSingleTab, schoolTabs, schoolTier]);

  const tab = useMemo(() => schoolTabs.find(t => t.key === activeTab), [activeTab, schoolTabs]);

  // Постраничная загрузка для «Заявки»/«Справочник» — единственных режимов,
  // переведённых на серверную пагинацию (RPC get_families_page). Остальные
  // остальные режимы пока используют полную выборку для своих таблиц и
  // связанных карточек редактирования.
  const usesServerPages = isRequestsModule || isDirectoryMode;
  const isPagedMode = usesServerPages && !tableFiltersActive;
  const branchStatsForPaging = useBranchStats();
  const [familiesPageNumber, setFamiliesPageNumber] = useState(0);
  const FAMILIES_PAGE_SIZE = 100;

  const activeTabKeys = useMemo(() => {
    const allTabKeys = schoolTabs.filter(t => t.key !== 'ALL').map(t => t.key);
    const base = (!tab || tab.key === 'ALL') ? allTabKeys : [tab.key];
    if (!hasSchoolRestriction) return base;
    return base.filter(key => isTabAllowed(key));
  }, [tab, hasSchoolRestriction, isTabAllowed, schoolTabs]);

  // Резолвим выбранную школьную вкладку (+ ограничение allowedSchools) в
  // конкретные branch_id — RPC ничего не знает про SCHOOL_TABS/BRANCH_TO_FILTER,
  // эта группировка остаётся клиентской (как и в get_branch_stats).
  const branchIdsForPage = useMemo(() => {
    const branches = branchStatsForPaging.data ?? [];
    if((!tab || tab.key==='ALL') && !hasSchoolRestriction)return branches.filter(branch=>isSchoolInTier(branch.branchName, schoolTier) && isSchoolInTier(getBranchFilter(branch.branchName,branch.branchCode), schoolTier)).map(branch=>branch.branchId);
    const keySet = new Set(activeTabKeys);
    return branches
      .filter(b => keySet.has(getBranchFilter(b.branchName, b.branchCode)))
      .map(b => b.branchId);
  }, [activeTabKeys, branchStatsForPaging.data, tab, hasSchoolRestriction, schoolTier]);

  const branchesReadyForPaging = branchStatsForPaging.isSuccess;

  // quickChildStatus==='transfered' — синтетический статус (row.transferNumber
  // непусто), а не значение колонки status в базе; переводим его отдельно в
  // hasTransfer, не путая с реальными статусами ('new'/'rejected'/...).
  const pagedChildStatus = (quickChildStatus && quickChildStatus !== 'transfered') ? quickChildStatus : null;
  const pagedHasTransfer = quickTransfer === 'empty' || quickChildStatus === 'new'
    ? false
    : (quickChildStatus === 'transfered' ? true : null);
  const pagedTransferNumber = quickTransfer && quickTransfer !== 'empty' && quickTransfer !== 'inactive'
    ? Number(quickTransfer) : null;

  const familiesPageParams = useMemo(() => ({
    branchIds: branchIdsForPage,
    search: search || undefined,
    childStatus: pagedChildStatus,
    hasTransfer: pagedHasTransfer,
    transferNumber: pagedTransferNumber,
    // При фильтре «Отказ» отказников не исключаем, иначе список всегда пуст.
    excludeRejectedChildren: isDirectoryMode && pagedChildStatus !== 'rejected',
    pageSize: FAMILIES_PAGE_SIZE,
  }), [branchIdsForPage, search, pagedChildStatus, pagedHasTransfer, pagedTransferNumber, isDirectoryMode]);

  // familiesPageNumber — сколько страниц по 100 семей догружено сверх первой (листанием таблицы дальше конца).
  const familiesPageQuery = useFamiliesPages(familiesPageParams, familiesPageNumber + 1, { enabled: isPagedMode && branchesReadyForPaging });

  useEffect(() => {
    setFamiliesPageNumber(0);
  }, [mode, activeTab, search, quickChildStatus, quickTransfer]);

  const pagedRows: ChildRow[] = familiesPageQuery.rows.length ? familiesPageQuery.rows : EMPTY_CHILD_ROWS;
  const pagedTotalPages = Math.max(1, Math.ceil(familiesPageQuery.totalFamilies / FAMILIES_PAGE_SIZE));
  const hasMorePagedRows = isPagedMode && familiesPageNumber + 1 < pagedTotalPages;

  const modeRows = useMemo<Array<ChildRow | (typeof pagedRows)[number]>>(() => {
    if (isPagedMode) return pagedRows;
    // В Справочнике, Оплатах и Начислениях Менеджера отказники видны только по фишке «Отказ».
    if ((isDirectoryMode || mode === 'charges') && quickChildStatus !== 'rejected') return rows.filter(row => row.status !== 'rejected');
    // Кнопка «Отказ» показывает именно отказников — не отсекаем их заранее.
    return mode === 'logistics' && quickChildStatus !== 'rejected' ? logisticsWorkRows(rows) : rows;
  }, [isPagedMode, isDirectoryMode, pagedRows, mode, rows, quickChildStatus]);

  useEffect(() => {
    if (!initialOpenFamilyId) return;
    const row = modeRows.find(item => item.familyId === initialOpenFamilyId);
    if (!row) return;
    setFiltersByMode(prev => ({
      ...prev,
      [mode]: { ...(prev[mode] ?? DEFAULT_MODE_FILTERS), activeTab: row.branchFilter, quickTransfer: '', quickChildStatus: '' },
    }));
    setDashboardSchoolByMode(prev => (
      prev[mode] === row.branchFilter ? prev : { ...prev, [mode]: row.branchFilter }
    ));
    void toggleExpandedFamily(row.familyId, row, 'overview');
    onInitialFamilyOpened?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenFamilyId, modeRows]);

  const matchesSchool = useCallback((r: ChildRow) => {
    if (!tab) return true;
    return rowMatchesSchoolTab(r, tab);
  }, [rowMatchesSchoolTab, tab]);
  const matchesSearch = useCallback((r: ChildRow) => {
    if (initialSearchChildId && search && search === initialSearch) return r.rowId === initialSearchChildId;
    if (search) {
      if (phoneMatchesQuery(search, r.phone, r.secondPhone, r.contactPhone)) return true;
      const q = search.toLowerCase().replace(/\s+/g, '');
      const haystack = Object.values(r)
        .map(value => String(value ?? '').toLowerCase())
        .join(' ')
        .replace(/\s+/g, '');
      if (!haystack.includes(q)) return false;
    }
    return true;
  }, [search, initialSearch, initialSearchChildId]);
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
    // В постраничных режимах школа и поиск уже применены серверным RPC.
    // Повторные клиентские проверки могли скрыть найденную строку из-за
    // различий в нормализации филиала, имени или телефона.
    if (!isPagedMode && !matchesSchool(r)) return false;
    // Keep the visible page responsive to the shared dashboard search even when
    // server-side pagination is enabled. The server query still narrows the full
    // result set, while this prevents stale rows from flashing in the table.
    if (!matchesSearch(r)) return false;
    if (!matchesVehicleTypes(r, vehicleTypes)) return false;
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
    if (mode === 'charges' && !accrualsView) {
      if (dashboardMetric === 'count' && !isNewUnassignedRow(r)) return false;
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
        const periodDebt = rowDebt(r);
        if (periodDebt <= 0) return false;
      }
      if (dashboardMetric === 'balanceSum' && Number(r.balance || 0) <= 0) return false;
    }
    if (mode === 'cashier' && r.pendingPayment <= 0) return false;
    if (quickTransfer === 'empty' && r.transferNumber) return false;
    if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
    if (quickChildStatus === 'transfered' && !r.transferNumber) return false;
    if (quickChildStatus === 'new' && !isNewUnassignedRow(r)) return false;
    if (quickChildStatus && quickChildStatus !== 'new' && quickChildStatus !== 'transfered' && r.status !== quickChildStatus) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [accrualsView, dashboardMetric, isPagedMode, matchesSchool, matchesSearch, mode, modeRows, quickChildStatus, quickTransfer, periodStatsByChild, periodStatsFiltered, vehicleTypes]);

  const filteredSorted = useMemo(() => {
    if (isDirectoryMode) {
      const timestamp = (row: ChildRow) => {
        // По умолчанию справочник идёт по дате заявки, новые семьи сверху.
        const value = row.childCreatedAt;
        if (!value) return null;
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? null : parsed;
      };
      const familyTimestamp = new Map<string, number | null>();
      filtered.forEach(row => {
        const value = timestamp(row);
        const current = familyTimestamp.get(row.familyId);
        if (value != null && (current == null || value > current)) familyTimestamp.set(row.familyId, value);
        else if (!familyTimestamp.has(row.familyId)) familyTimestamp.set(row.familyId, null);
      });
      return [...filtered].sort((a, b) => {
        const aTime = familyTimestamp.get(a.familyId) ?? null;
        const bTime = familyTimestamp.get(b.familyId) ?? null;
        if (aTime == null && bTime != null) return 1;
        if (aTime != null && bTime == null) return -1;
        if (aTime != null && bTime != null && aTime !== bTime) {
          return bTime - aTime;
        }
        if (a.familyId === b.familyId) return a.familyIndex - b.familyIndex;
        return a.familyIndex - b.familyIndex;
      });
    }
    if (!isChargesMode || accrualsView) return filtered;
    const periodFamilyIds = chargesPeriodKey !== 'ALL' && periodStats.length > 0
      ? new Set(periodStats.map(s => s.familyId))
      : null;
    const base = periodFamilyIds
      ? filtered.filter(r => periodFamilyIds.has(r.familyId))
      : filtered;
    // Семьи — по общему долгу детей, дети одной семьи идут подряд.
    const familyDebt = new Map<string, number>();
    base.forEach(row => familyDebt.set(row.familyId, (familyDebt.get(row.familyId) ?? 0) + rowDebt(row)));
    return [...base].sort((a, b) => (familyDebt.get(b.familyId) ?? 0) - (familyDebt.get(a.familyId) ?? 0)
      || a.familyId.localeCompare(b.familyId)
      || a.familyIndex - b.familyIndex);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rowDebt зависит от periodStatsByChild
  }, [filtered, accrualsView, isChargesMode, isDirectoryMode, chargesPeriodKey, periodStats, periodStatsByChild]);

  // Точки видят все разделы с детьми, включая Логистику: по ним видно, когда ребёнка пора убрать.
  const showPaymentDots = !isDriversModule;
  const paymentDotChunks = useMemo(() => {
    if (!showPaymentDots) return [] as string[][];
    const ids = Array.from(new Set(filteredSorted.map(row => row.rowId).filter(id => !id.endsWith("_empty"))));
    return Array.from({ length: Math.ceil(ids.length / PAYMENT_DOTS_CHUNK) }, (_, index) => ids.slice(index * PAYMENT_DOTS_CHUNK, (index + 1) * PAYMENT_DOTS_CHUNK));
  }, [filteredSorted, showPaymentDots]);
  const paymentDotsByChild = useQueries({
    queries: paymentDotChunks.map(ids => ({
      queryKey: ['childPaymentDots', PAYMENT_DOTS_PERIODS.map(periodKey).join(','), ids],
      queryFn: () => fetchChildPaymentDots(ids, PAYMENT_DOTS_PERIODS),
      staleTime: 60_000,
    })),
    combine: combinePaymentDots,
  });

  // Кассиру и в «Оплатах» — точки всей семьи у имени родителя: видно, за какие месяцы долг.
  const familyDotChunks = useMemo(() => {
    const source: { familyId: string }[] = isCashierMode ? (cashierView === 'confirmed' ? cashierConfirmedRows : cashierRows) : isPaymentsMode ? paymentRows : [];
    const ids = Array.from(new Set(source.map(row => row.familyId).filter(Boolean)));
    return Array.from({ length: Math.ceil(ids.length / PAYMENT_DOTS_CHUNK) }, (_, index) => ids.slice(index * PAYMENT_DOTS_CHUNK, (index + 1) * PAYMENT_DOTS_CHUNK));
  }, [isCashierMode, isPaymentsMode, cashierView, cashierConfirmedRows, cashierRows, paymentRows]);
  const paymentDotsByFamily = useQueries({
    queries: familyDotChunks.map(ids => ({
      queryKey: ['familyPaymentDots', PAYMENT_DOTS_PERIODS.map(periodKey).join(','), ids],
      queryFn: () => fetchFamilyPaymentDots(ids, PAYMENT_DOTS_PERIODS),
      staleTime: 60_000,
    })),
    combine: combinePaymentDots,
  });
  const withParentDots = useCallback(<T extends { familyId: string }>(columns: ColumnDef<T>[]): ColumnDef<T>[] => columns.map(column => column.key !== 'parentName' ? column : {
    ...column,
    render: (value: unknown, row: T) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.render ? column.render(value as never, row) : String(value ?? '')}</span>
        <PaymentDots dots={paymentDotsByFamily[row.familyId]} periods={PAYMENT_DOTS_PERIODS} />
      </span>
    ),
  }), [paymentDotsByFamily]);
  const cashierColumnsWithDots = useMemo(() => withParentDots(cashierColumns), [withParentDots, cashierColumns]);
  const paymentTableColumnsWithDots = useMemo(() => withParentDots(paymentTableColumns), [withParentDots, paymentTableColumns]);
  // Отмеченные, но скрытые поиском или фильтром дети в массовые действия не попадают.
  const selectedAccrualRows = selectedAccrualIds.size ? filteredSorted.filter(row => selectedAccrualIds.has(row.rowId)) : [];

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
        count: rows.filter(row => isNewUnassignedRow(row) && matchesSchool(row) && matchesSearch(row)).length,
        tone: '#1A7F80',
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
  const schoolButtonItems = schoolTabs;
  const schoolSidebarFullLabel: Record<string, string> = {
    TIS: 'Тенсай',
    ERU: 'Эрудит-ISIT',
    EDI: 'Edison',
    EPS: 'Эпсилон',
    AES: 'American-European School',
    KAS: 'Kyrgyz-American School',
    GEN2: 'Гениум — Чуйкова',
    GEN4: 'Гениум — Авангард',
    NOVA: 'Nova International School',
    ING: 'Индиго Kids',
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

  const driverReserveSchool = { key: DRIVER_RESERVE_KEY, label: 'Резерв', branches: [], codes: [] };
  const selectedDashboardSchool = isDriversModule && (dashboardSchoolKey === DRIVER_RESERVE_KEY || activeTab === DRIVER_RESERVE_KEY)
    ? driverReserveSchool
    : schoolButtonItems.find(item => item.key === dashboardSchoolKey)
      ?? schoolButtonItems.find(item => item.key === activeTab)
      ?? schoolButtonItems[0];
  const dashboardSchoolRows = useMemo(() => (
    selectedDashboardSchool
      ? rows.filter(row => rowMatchesSchoolTab(row, selectedDashboardSchool))
      : []
  ), [rowMatchesSchoolTab, rows, selectedDashboardSchool]);
  const activeDirectoryTransfer = useMemo(() => {
    if (!isDirectoryMode || !/^\d+$/.test(quickTransfer) || !selectedDashboardSchool || selectedDashboardSchool.key === 'ALL') {
      return null;
    }
    const sampleRow = dashboardSchoolRows.find(row => row.transferNumber === quickTransfer);
    return dashboardTransfers.find(transfer => (
      transfer.transferNumber === quickTransfer
      && (sampleRow?.branchId
        ? transfer.branchId === sampleRow.branchId
        : transfer.branchCode === selectedDashboardSchool.key || transfer.branchShort === selectedDashboardSchool.label)
    )) ?? null;
  }, [dashboardSchoolRows, dashboardTransfers, isDirectoryMode, quickTransfer, selectedDashboardSchool]);
  const activeDirectoryDriver = activeDirectoryTransfer?.driverId
    ? driverRows.find(driver => driver.driverId === activeDirectoryTransfer.driverId) ?? null
    : null;
  const dashboardWorkRows = logisticsWorkRows(dashboardSchoolRows);
  const historyTransfers=useMemo(()=>dashboardTransfers.filter(transfer=>{
    const key=getBranchFilter(transfer.branchShort,transfer.branchCode);
    return isSchoolInTier(key,schoolTier) && (selectedDashboardSchool?.key==='ALL' ? schoolButtonItems.some(item=>item.key===key) : key===selectedDashboardSchool?.key) && (!/^\d+$/.test(quickTransfer) || transfer.transferNumber===quickTransfer);
  }),[dashboardTransfers,quickTransfer,schoolButtonItems,selectedDashboardSchool,schoolTier]);
  const formerDriversQuery=useQuery({queryKey:['transferDriversHistory',historyTransfers.map(item=>item.id),authToken],queryFn:()=>fetchTransferDriversHistory(historyTransfers.map(item=>item.id),authToken),enabled:isDriversModule && Boolean(authToken) && historyTransfers.length>0,retry:false});
  const driverRowsWithHistory=useMemo(()=>withFormerTransferDrivers(driverRows,historyTransfers,formerDriversQuery.data??[]),[driverRows,historyTransfers,formerDriversQuery.data]);
  const filteredDriverRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return driverRowsWithHistory.filter(row => {
      if(!isVisibleDriver(row))return false;
      const isReserveSelected = selectedDashboardSchool?.key === DRIVER_RESERVE_KEY;
      if (
        selectedDashboardSchool
        && selectedDashboardSchool.key !== 'ALL'
        && !isReserveSelected
        && isReserveDriver(row) && !row.previousAssignment
      ) {
        return false;
      }
      const schoolMatch = !selectedDashboardSchool
        || selectedDashboardSchool.key === 'ALL'
        || (isReserveSelected && isReserveDriver(row))
        || driverMatchesSchool(row, selectedDashboardSchool.key)
        || dashboardSchoolRows.some(schoolRow => row.branchIds.includes(String(schoolRow.branchId ?? '')));
      if (!schoolMatch) return false;
      if (dashboardVehicleFilter !== 'all' && row.vehicleType !== dashboardVehicleFilter) return false;
      if (quickTransfer === 'empty' && row.transferCount > 0) return false;
      if (quickTransfer === 'inactive' && row.status === 'active' && !row.previousAssignment) return false;
      if (quickTransfer && quickTransfer !== 'empty' && quickTransfer !== 'inactive') {
        const transferNumbers = row.transferNumbers
          .split(',')
          .map(item => item.replace(/\D/g, ''))
          .filter(Boolean);
        if (!transferNumbers.includes(quickTransfer)) return false;
      }
      if (!q) return true;
      if (phoneMatchesQuery(q, row.phone, row.secondPhone)) return true;
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
    }).sort((a,b)=>Number(Boolean(a.previousAssignment))-Number(Boolean(b.previousAssignment)) || Number(b.status==='active')-Number(a.status==='active') || a.fullName.localeCompare(b.fullName,'ru'));
  }, [dashboardSchoolRows, dashboardVehicleFilter, driverRowsWithHistory, quickTransfer, search, selectedDashboardSchool]);
  const selectedDriver = selectedDriverId
    ? driverRows.find(row => row.driverId === selectedDriverId) ?? null
    : null;
  const driverBranchOptions = useMemo(() => (
    driverBranches.filter(branch => isSchoolInTier(branch.shortName || branch.code, schoolTier) && isSchoolInTier(branch.name, schoolTier))
  ), [driverBranches, schoolTier]);
  // Школа водителя не хранится отдельно: она определяется школой его трансфера.
  // Поэтому выбор школы в карточке только сужает список трансферов.
  const driverTransferOptions = useMemo(() => {
    if (!selectedDriver || !driverBranchDraftId) return [];
    return dashboardTransfers
      .filter(transfer => transfer.branchId === driverBranchDraftId && isSchoolInTier(transfer.branchShort, schoolTier) && isSchoolInTier(getBranchFilter(transfer.branchShort,transfer.branchCode), schoolTier))
      // Номера трансферов только 1–15; старые пустые №16+ в базе не предлагаем.
      .filter(transfer => Number(transfer.transferNumber) <= MAX_TRANSFER_NUMBER)
      .sort((left, right) => Number(left.transferNumber) - Number(right.transferNumber));
  }, [dashboardTransfers, driverBranchDraftId, selectedDriver, schoolTier]);
  const changeDriverBranchDraft = (branchId: string) => {
    setDriverBranchDraftId(branchId);
    if (!dashboardTransfers.some(transfer => transfer.id === driverTransferDraftId && transfer.branchId === branchId)) {
      setDriverTransferDraftId('');
    }
  };
  const openDirectoryDriver = () => {
    if (!activeDirectoryDriver) return;
    setSelectedDriverTab('main');
    setSelectedDriverId(activeDirectoryDriver.driverId);
  };

  useEffect(() => {
    if (!selectedDriver) {
      setDriverDraft(null);
      setDriverTransferDraftId('');
      setDriverBranchDraftId('');
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
    setDriverTransferDraftId(selectedDriver.transfers[0]?.id ?? '');
    setDriverBranchDraftId(selectedDriver.branchIds[0] ?? '');
  }, [selectedDriver]);
  useEffect(() => {
    if (!selectedDriverId) return;
    let cancelled = false;
    fetchV2DriverDocuments(selectedDriverId)
      .then(documents => {
        if (!cancelled) setDriverDocumentsDraft(documents.map(({ id: _id, driverId: _driverId, ...document }) => document));
      })
      .catch(error => {
        console.error('Driver documents load failed', error);
        if (!cancelled) setDriverDocumentsDraft(createDefaultV2DriverDocuments());
      });
    return () => {
      cancelled = true;
    };
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
    if (driverBranchDraftId && !driverTransferDraftId) {
      alert('Выберите трансфер в этой школе или укажите школу «Резерв»');
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
      await changeV2DriverTransfer({
        driverId: selectedDriver.driverId,
        previousTransferId: selectedDriver.transfers[0]?.id ?? null,
        nextTransferId: driverTransferDraftId || null,
      });
      await saveV2DriverDocuments(selectedDriver.driverId, driverDocumentsDraft);
      await load(false);
    } catch (error) {
      console.error('Driver save failed', error);
      alert(error instanceof Error ? `Не удалось сохранить водителя: ${error.message}` : 'Не удалось сохранить водителя');
    } finally {
      setSavingDriver(false);
    }
  };
  const removeSelectedDriver = async () => {
    if (!selectedDriver) return;
    const message = selectedDriver.transferCount > 0
      ? `Удалить водителя «${selectedDriver.fullName}»? Он будет снят с ${selectedDriver.transferCount} трансфер(ов), связанные документы и авансы будут удалены.`
      : `Удалить водителя «${selectedDriver.fullName}»? Связанные документы и авансы будут удалены.`;
    if (!window.confirm(message)) return;
    setDeletingDriver(true);
    try {
      await deleteV2Driver(selectedDriver.driverId);
      setSelectedDriverId(null);
      await load(false);
    } catch (error) {
      console.error('Driver delete failed', error);
      alert(error instanceof Error ? `Не удалось удалить водителя: ${error.message}` : 'Не удалось удалить водителя');
    } finally {
      setDeletingDriver(false);
    }
  };
  const selectedDriverChildren = useMemo(() => (
    selectedDriverId
      ? rows
          .filter(row => row.driverId === selectedDriverId && row.status !== 'rejected' && row.childName)
          .sort((a, b) => {const stop=(value:string|null)=>value && Number.isFinite(Number(value)) && Number(value)>0?Number(value):Infinity;return stop(a.stopNumber)-stop(b.stopNumber) || a.childName.localeCompare(b.childName,'ru');})
      : []
  ), [rows, selectedDriverId]);
  const selectedDriverTransfer = useMemo(() => (
    dashboardTransfers.find(transfer => transfer.id === driverTransferDraftId)
      ?? (selectedDriver?.transfers.length === 1
        ? dashboardTransfers.find(transfer => transfer.id === selectedDriver.transfers[0].id)
        : undefined)
  ), [dashboardTransfers, driverTransferDraftId, selectedDriver]);
  const driverParentCardLines = useMemo(() => buildDriverParentCardLines({
    school: selectedDriverTransfer?.branchShort || selectedDriver?.branchShorts.join(', '),
    transferNumber: selectedDriverTransfer?.transferNumber || (selectedDriver?.transfers.length === 1 ? selectedDriver.transfers[0].transferNumber : ''),
    driverName: driverDraft?.fullName,
    phone: driverDraft?.phone,
    secondPhone: driverDraft?.secondPhone,
    brand: driverDraft?.brand,
    model: driverDraft?.model,
    plateNumber: driverDraft?.plateNumber,
    seats: driverDraft?.seats,
  }), [driverDraft, selectedDriver, selectedDriverTransfer]);
  const copyDriverParentCard = async () => {
    const text = buildDriverParentCardText({
      school: selectedDriverTransfer?.branchShort || selectedDriver?.branchShorts.join(', '),
      transferNumber: selectedDriverTransfer?.transferNumber || (selectedDriver?.transfers.length === 1 ? selectedDriver.transfers[0].transferNumber : ''),
      driverName: driverDraft?.fullName,
      phone: driverDraft?.phone,
      secondPhone: driverDraft?.secondPhone,
      brand: driverDraft?.brand,
      model: driverDraft?.model,
      plateNumber: driverDraft?.plateNumber,
      seats: driverDraft?.seats,
    });
    if (await copyTextToClipboard(text)) {
      setDriverParentCardCopied(true);
      window.setTimeout(() => setDriverParentCardCopied(false), 1800);
    }
  };
  const selectedDriverB2BOrders = useMemo<B2BOrder[]>(() => (
    selectedDriverId
      ? b2bOrders
          .filter(order => order.driverId === selectedDriverId)
          .sort((a, b) => b.departureDate.localeCompare(a.departureDate))
      : []
  ), [b2bOrders, selectedDriverId]);
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
      const tab = schoolTabs.find(t => t.key === schoolKey);
      const schoolRows = tab ? rows.filter(r => rowMatchesSchoolTab(r, tab)) : rows;
      const counts: Record<string, number> = {};
      uniqueFamilyRows(schoolRows.filter(r => r.pendingPayment > 0)).forEach(r => {
        if (r.transferNumber) counts[r.transferNumber] = (counts[r.transferNumber] || 0) + 1;
      });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return { activeTab: schoolKey, quickTransfer: best?.[0] ?? '', quickChildStatus: '' };
    }
    return { activeTab: schoolKey, quickChildStatus: '', quickTransfer: '' };
  }, [mode, rows, rowMatchesSchoolTab, schoolTabs, userRole]);

  const baseTableColumns: ColumnDef<ChildRow>[] = useMemo(() => {
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
              color: '#146566',
              fontSize: 11,
              fontWeight: 600,
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
        if (lower === 'transfer' || lower.includes('qr')) return <span style={{ color: '#1D6FA4', fontWeight: 600, fontSize: 11 }}>АйКай Мбанк</span>;
        if (lower === 'cash' || lower.includes('нал')) return <span style={{ color: '#15803D', fontWeight: 600, fontSize: 11 }}>Наличный</span>;
        return <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{type}</span>;
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
        return <ReceiptThumb url={url} paymentId={row.pendingPaymentId} subtitle={row.parentName} canEdit={hasAdminAccess || userRole === 'cashier'} />;
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
        <span style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>
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
                fontWeight: 600,
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
                fontWeight: 600,
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
    const dateColumn = (key: 'childCreatedAt' | 'transferAssignedAt', label: string): ColumnDef<ChildRow> => ({
      key, label, type: 'date', width: 120, visible: true,
      editable: key === 'transferAssignedAt' && canEditBoardingDate,
      getValue: row => row[key] ?? '',
      render: (_value, row) => formatDateShort(row[key] ?? undefined),
    });
    if (accrualsView) {
      const ACADEMIC_MONTHS = new Set([1, 2, 3, 4, 5, 9, 10, 11, 12]);
      const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
      const monthLabel = (month: number) => MONTH_NAMES[month - 1] ?? String(month);
      const amountColumn = (key: 'deposit' | 'previous' | 'current', label: string, editable = canEditAccruals): ColumnDef<ChildRow> => ({
        key: `accrual_${key}`, label, type: 'currency', width: 180, visible: true, editable,
        getValue: row => accrualQuery.data?.[key].get(row.rowId) ?? 0,
        render: (_value, row) => accrualQuery.isError ? <span title="Не удалось загрузить начисления">Ошибка</span>
          : accrualQuery.isPending ? '…' : money(accrualQuery.data?.[key].get(row.rowId) ?? 0),
      });
      // Базовая цена = цена в месяц + скидка, поэтому процент считаем от их суммы.
      const discountPercent = (row: ChildRow) => {
        const discount = Number(row.discountAmount || 0);
        const base = Number(row.monthlyPrice || 0) + discount;
        return base > 0 ? Math.round(discount / base * 1000) / 10 : 0;
      };
      return [
        { ...COLUMNS.find(column => column.key === 'childName')!, visible: true },
        dateColumn('childCreatedAt', 'Дата заявки'),
        dateColumn('transferAssignedAt', 'Дата посадки'),
        { ...COLUMNS.find(column => column.key === 'monthlyPrice')!, label: 'Цена в месяц', visible: true },
        {
          ...COLUMNS.find(column => column.key === 'discountAmount')!,
          label: 'Скидка, %',
          type: 'number',
          visible: true,
          // Та же скидка, что в карточке ребёнка: она определяет цену в месяц.
          editable: canEditAccruals,
          editOptions: [
            { value: 'auto', label: 'Автоматически' },
            ...Array.from({ length: 11 }, (_, index) => ({ value: String(index * 5), label: `${index * 5}%` })),
          ],
          getValue: row => row.discountOverridePercent == null ? 'auto' : String(row.discountOverridePercent),
          render: (_value, row) => `${discountPercent(row)}%`,
        },
        amountColumn('deposit', 'Депозит'),
        amountColumn('previous', monthLabel(previousAccrualMonth), canEditAccruals && ACADEMIC_MONTHS.has(previousAccrualMonth)),
        amountColumn('current', monthLabel(accrualPeriod.month)),
        {
          // Весь непогашенный долг ребёнка (все месяцы и депозит), как «Долг» в «Оплатах».
          key: 'childDebtAmount', label: 'Долг', type: 'currency', width: 130, visible: true,
          getValue: row => accrualDebtByChild.get(row.rowId) ?? 0,
          render: (_value, row) => {
            if (accrualDebtQuery.isPending) return '…';
            const debt = accrualDebtByChild.get(row.rowId) ?? 0;
            return <span style={{ color: debt > 0 ? '#C62828' : undefined, fontWeight: debt > 0 ? 700 : undefined }}>{money(debt)}</span>;
          },
        },
        { ...COLUMNS.find(column => column.key === 'transferNumber')!, visible: true },
      ];
    }
    const dataCols = (isRequestsModule ? REQUEST_COLUMNS : isChargesMode ? CHARGES_COLUMNS : isPaymentsMode ? PAYMENTS_COLUMNS : COLUMNS).map(column => {
      const configuredColumn = isRequestsModule
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
              ...(column.key === 'totalCharged' ? {
                getValue: (row: ChildRow) => periodStatsByChild.get(row.rowId)?.charged ?? 0,
                render: (_val: any, row: ChildRow) => <span>{money(periodStatsByChild.get(row.rowId)?.charged ?? 0)}</span>,
              } : {}),
              ...(column.key === 'debtAmount' ? {
                getValue: rowDebt,
                render: (_val: any, row: ChildRow) => {
                  const debt = rowDebt(row);
                  return <span style={{ color: debt > 0 ? '#C62828' : undefined, fontWeight: debt > 0 ? 700 : undefined }}>{money(debt)}</span>;
                },
              } : {}),
            }
          : column;
      return configuredColumn;
    });
    if (mode === 'logistics') {
      // Логистика не загружает деньги семей — колонки счёта ей не показываются.
      const accountColumns = new Set(['debtAmount', 'balance', 'totalCharged', 'totalPaid', 'pendingPayment']);
      for (let index = dataCols.length - 1; index >= 0; index--) {
        if (accountColumns.has(String(dataCols[index].key))) dataCols.splice(index, 1);
      }
    }
    if (isDirectoryMode || mode === 'logistics') {
      // Как в «Начислениях»: даты заявки и посадки — отдельные колонки сразу после ребёнка.
      const childIndex = dataCols.findIndex(column => column.key === 'childName');
      dataCols.splice(childIndex + 1, 0, dateColumn('childCreatedAt', 'Дата заявки'), dateColumn('transferAssignedAt', 'Дата посадки'));
    }
    return isChargesMode || isRequestsModule || isPaymentsMode
      ? [...dataCols, openCardCol]
      : [openCardCol, ...otherActionCols, ...dataCols];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accrualsView, canEditAccruals, accrualQuery.data, accrualQuery.isPending, accrualQuery.isError, accrualPeriod.month, accrualPeriod.year, previousAccrualMonth, previousAccrualYear, isChargesMode, isDirectoryMode, isRequestsModule, isPaymentsMode, mode, userRole, chargesPeriodKey, periodStatsByChild, accrualDebtByChild, accrualDebtQuery.isPending]);

  // Точки оплат прямо в ячейке ребёнка: депозит, затем месяцы сезона.
  // При редактировании ФИО вместо ячейки показывается поле ввода, и точки скрываются.
  const tableColumns = useMemo(() => !showPaymentDots ? baseTableColumns : baseTableColumns.map(column => column.key !== 'childName' ? column : {
    ...column,
    render: (value: unknown, row: ChildRow) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.render ? column.render(value as never, row) : String(value ?? '')}</span>
        {!row.rowId.endsWith('_empty') && <PaymentDots dots={paymentDotsByChild[row.rowId]} periods={PAYMENT_DOTS_PERIODS} />}
      </span>
    ),
  }), [baseTableColumns, showPaymentDots, paymentDotsByChild]);

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
        row.phone,
        row.secondPhone,
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

  const exportDirectoryRouteSheet = async (exportRows: ChildRow[]) => {
    const routeRows = exportRows.filter(row => row.status !== 'rejected');
    if (!routeRows.length) {
      window.alert('Нет данных для маршрутного листа');
      return;
    }

    const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter(Boolean).map(String)));
    const groupedRows = new Map<string, ChildRow[]>();
    routeRows.forEach(row => {
      const schoolKey = row.branchId || row.branchFilter || row.branchShort || row.branchName || 'school';
      const transferKey = row.transferNumber || '';
      const key = `${schoolKey}:${transferKey}`;
      groupedRows.set(key, [...(groupedRows.get(key) ?? []), row]);
    });

    const groups = Array.from(groupedRows.values()).sort((left, right) => {
      const schoolDiff = (left[0]?.branchShort || left[0]?.branchName || '').localeCompare(right[0]?.branchShort || right[0]?.branchName || '', 'ru');
      if (schoolDiff) return schoolDiff;
      return Number(left[0]?.transferNumber || 999) - Number(right[0]?.transferNumber || 999);
    });
    const schools = unique(routeRows.map(row => row.branchShort || row.branchName));
    const schoolTitle = schools.join(', ') || '—';
    const safeName = `${schoolTitle}_${groups.length > 1 ? 'Все_трансферы' : groups[0]?.[0]?.transferNumber ? `№${groups[0][0].transferNumber}` : 'Без_трансфера'}`
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_');

    const { buildDirectoryRouteWorkbook } = await import('./directoryRouteWorkbook');
    const workbook = buildDirectoryRouteWorkbook(groups.map(groupRows => {
      const sampleRow = groupRows[0];
      const transferMeta = sampleRow?.transferNumber
        ? dashboardTransfers.find(item => (
            item.transferNumber === sampleRow.transferNumber
            && (sampleRow.branchId
              ? item.branchId === sampleRow.branchId
              : item.branchCode === sampleRow.branchFilter || item.branchShort === sampleRow.branchShort)
          ))
        : undefined;
      const driverIds = unique(groupRows.map(row => row.driverId));
      const driverId = driverIds.length === 1 ? driverIds[0] : transferMeta?.driverId;
      const driver = driverRows.find(item => item.driverId === driverId);
      const groupSchool = unique(groupRows.map(row => row.branchShort || row.branchName)).join(', ') || '—';
      const vehicle = [driver?.vehicleLabel || groupRows.find(row => row.vehicleLabel)?.vehicleLabel, driver?.plateNumber]
        .filter(Boolean)
        .join(' / ') || '—';

      return {
        rows: groupRows,
        meta: {
          school: groupSchool,
          transfer: sampleRow?.transferNumber ? `№${sampleRow.transferNumber}` : 'Без трансфера',
          driver: driver?.fullName || '—',
          contacts: [driver?.phone, driver?.secondPhone].filter(Boolean).join(' / ') || '—',
          vehicle,
        },
      };
    }));
    const buffer = await workbook.xlsx.writeBuffer();
    downloadXlsxBuffer(`Маршрутный_лист_${safeName || 'manager'}.xlsx`, buffer as ArrayBuffer);
  };

  const exportAllDirectoryRouteRows = async (_visibleRows: ChildRow[]) => {
    try {
      const result = await fetchAllV2FamiliesPages(familiesPageParams);
      await exportDirectoryRouteSheet(result.rows);
    } catch (error) {
      console.error('Directory route export failed', error);
      window.alert('Не удалось загрузить полный список для выгрузки');
    }
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
          padding: customTopContent ? '0 0 8px' : '8px 0',
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
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              <span style={{ color: '#1A7F80', fontWeight: 600 }}>{moduleLabel}</span>
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
                    color: isActive ? 'var(--text)' : isActual ? 'var(--text-2)' : '#9AA7AE',
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
                  <span style={{ lineHeight: 1, fontWeight: 600 }}>#{tabItem.label}</span>
                  <span style={{
                    minHeight: 8,
                    color: isActual ? tone.dot : '#AEBAB7',
                    fontSize: 11,
                    fontWeight: 600,
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
                      color: isActive ? item.tone : 'var(--text-2)',
                      fontSize: item.key === 'rejected' ? 17 : 13,
                      fontWeight: 600,
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
                  color: quickTransfer === '' && quickChildStatus === '' ? 'var(--text)' : 'var(--text-2)',
                  fontSize: 15,
                  fontWeight: 600,
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
                  color: 'var(--text-2)',
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
                color: 'var(--text)',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>
                <span style={{ color: '#1A7F80' }}>{moduleLabel}</span>
                <span style={{ color: 'var(--border)' }}>·</span>
                {selectedSchoolLabel}
                <span style={{ color: 'var(--border)' }}>·</span>
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
                  color: 'var(--text-2)',
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
            <>
            {formerDriversQuery.isError && <p role="status" style={{color:'var(--text-2)',padding:12}}>Прежние назначения недоступны: требуется обновление сервера истории. Текущие водители показаны ниже.</p>}
            <DataTable<V2DriverTableRow>
              getTaskTarget={row=>({type:'driver',id:row.driverId,label:row.fullName})}
              key="drivers_table"
              columns={activeTab === 'ALL' ? withSchoolColumn(DRIVER_COLUMNS, row => row.branchShorts.join(', ')) : DRIVER_COLUMNS}
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
              toolbarRightExtra={(
                <button
                  onClick={() => setShowNewDriver(true)}
                  title="Новый водитель"
                  style={{
                    width: 30,
                    height: 30,
                    border: 'none',
                    borderRadius: 10,
                    background: '#1A7F80',
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
            </>
          ) : isCashierMode ? (
            <DataTable<CashierPaymentRow>
              getTaskTarget={row=>({type:'family',id:row.familyId,label:row.parentName})}
              key={`cashier_table_${cashierView}`}
              columns={activeTab === 'ALL' ? withSchoolColumn(cashierColumnsWithDots, row => row.branchShort) : cashierColumnsWithDots}
              data={(cashierView === 'confirmed' ? cashierConfirmedRows : cashierRows).filter(r => {
                if (!cashierRowMatchesSelectedPeriod(r, paymentsPeriodKey)) return false;
                if (!schoolTabs.some(school => school.key !== 'ALL' && isTabAllowed(school.key) && [school.key, school.label].some(label => label.toLowerCase() === r.branchShort.toLowerCase()))) return false;
                if (tab && tab.key !== 'ALL') {
                  const bs = r.branchShort.toLowerCase();
                  if (bs !== tab.key.toLowerCase() && bs !== tab.label.toLowerCase()) return false;
                }
                if (quickTransfer === 'empty' && r.transferNumber) return false;
                if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
                if (!search) return true;
                const q = search.toLowerCase().replace(/\s+/g, '');
                return phoneMatchesQuery(search, r.phone) || [r.parentName, r.phone, r.childrenNames, r.branchShort].some(v => v.toLowerCase().replace(/\s+/g, '').includes(q));
              })}
              rowKey="id"
              storageKey="cashier_table_v1"
              loading={cashierView === 'confirmed' ? loadingCashierConfirmed : loadingCashier}
              emptyText={cashierView === 'confirmed' ? 'Подтвержденных платежей нет' : 'Платежей на проверке нет'}
              canManageProperties={false}
              onCellSave={hasAdminAccess ? handlePaymentMethodCellSave : undefined}
              showProperties={columnsOpen ?? false}
              onShowPropertiesChange={v => onColumnsOpenChange?.(v)}
              onRowOpen={(row) => {
                const childRow = rows.find(r => r.familyId === row.familyId);
                if (childRow) toggleExpandedFamily(row.familyId, childRow, 'finance');
              }}
              hideToolbar={tableBarsCollapsed}
            />
          ) : isPaymentsMode ? (
            <DataTable<PaymentTableRow>
              getTaskTarget={row=>({type:'family',id:row.familyId,label:row.parentName})}
              key="payments_table"
              columns={activeTab === 'ALL' ? withSchoolColumn(paymentTableColumnsWithDots, row => row.branchShort) : paymentTableColumnsWithDots}
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
                return phoneMatchesQuery(search, r.phone) || [r.parentName, r.phone, r.childrenNames].some(v => v.toLowerCase().replace(/\s+/g, '').includes(q));
              })}
              rowKey="id"
              storageKey="payments_table_v1"
              loading={loadingPayments}
              emptyText="Платежей не найдено"
              canManageProperties={false}
              onCellSave={hasAdminAccess ? handlePaymentMethodCellSave : undefined}
              onRowOpen={(row) => {
                const childRow = rows.find(r => r.familyId === row.familyId);
                if (childRow) toggleExpandedFamily(row.familyId, childRow, 'finance');
              }}
              showProperties={columnsOpen ?? false}
              onShowPropertiesChange={v => onColumnsOpenChange?.(v)}
              hideToolbar={tableBarsCollapsed}
            />
          ) : (
            <DataTable<ChildRow>
              getTaskTarget={row=>!row.rowId.endsWith('_empty') ? {type:'child',id:row.rowId,label:row.childName,familyId:row.familyId,schoolKey:row.branchFilter} : {type:'family',id:row.familyId,label:row.parentName}}
              key={`families_table_${accrualsView ? 'accruals' : mode}`}
              columns={activeTab === 'ALL' ? withSchoolColumn(tableColumns, row => row.branchShort) : tableColumns}
              data={filteredSorted}
              rowKey="rowId"
              groupByKey="familyId"
              selectable={canEditAccruals}
              bulkDelete={!canEditAccruals}
              onClientFiltersActiveChange={setTableFiltersActive}
              selectedKeys={canEditAccruals ? selectedAccrualIds : undefined}
              onSelectedKeysChange={canEditAccruals ? keys => setSelectedAccrualIds(new Set(keys)) : undefined}
              storageKey={tableStorageKey}
              loading={isPagedMode ? familiesPageQuery.isPending : loading}
              hasMoreRows={hasMorePagedRows}
              loadingMoreRows={isPagedMode && familiesPageQuery.isLoadingMore}
              onLoadMoreRows={() => setFamiliesPageNumber(page => page + 1)}
              emptyText="Заявок не найдено"
              canManageProperties={false}
              showProperties={columnsOpen ?? false}
              onShowPropertiesChange={v => onColumnsOpenChange?.(v)}
              onRowOpen={(row) => toggleExpandedFamily(row.familyId, row, 'overview')}
              onRowReject={canRejectFamilies ? async (row) => {
                // Отказ = трансфер Х только для ребёнка из строки; братья и сёстры не меняются.
                // Строка без детей (пустая семья) — отказ всей семьи.
                const isChildRow = !row.rowId.endsWith('_empty');
                const question = isChildRow
                  ? `Отправить «${row.childName || 'ребёнка'}» в трансфер Х (отказ)? Остальные дети семьи не изменятся.`
                  : `Перевести семью "${row.parentName}" в «Отказ»? Все данные сохранятся.`;
                if (!window.confirm(question)) return;
                try {
                  if (isChildRow) await updateV2Child(row.rowId, { status: 'rejected' });
                  else await rejectV2Family(row.familyId, userName);
                  setRows(prev => {
                    const next = prev.map(item => (isChildRow ? item.rowId === row.rowId : item.familyId === row.familyId)
                      ? { ...item, status: 'rejected', transferNumber: null }
                      : item);
                    familiesRowsCache = next;
                    return next;
                  });
                } catch (e: any) {
                  window.alert('Не удалось перевести в отказ: ' + (e?.message ?? String(e)));
                }
              } : undefined}
              canRowReject={(row) => row.status !== 'rejected'}
              onRowDelete={userRole === 'admin' ? row => setChildToDelete(row) : undefined}
              canRowDelete={(row) => row.rowId !== `${row.familyId}_empty`}
              onCellSave={handleCellSave}
              onExport={mode === 'logistics'
                ? exportLogisticsRouteSheet
                : isDirectoryMode
                  ? exportAllDirectoryRouteRows
                  : undefined}
              hideToolbar={tableBarsCollapsed}
              toolbarExtra={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {canEditAccruals && (
                    <button
                      type="button"
                      onClick={() => copyAccrualsFromPreviousMonth(selectedAccrualRows.length ? selectedAccrualRows : filteredSorted)}
                      disabled={copyingAccruals}
                      title={selectedAccrualRows.length
                        ? 'Отмеченным детям без начисления в этом месяце поставить сумму прошлого месяца'
                        : 'Детям без начисления в этом месяце поставить сумму прошлого месяца. Галочками можно выбрать только нужных'}
                      style={{ height: 26, padding: '0 10px', border: 'none', borderRadius: 7, background: copyingAccruals ? '#A7C9CA' : '#1A7F80', color: '#fff', fontSize: 11, fontWeight: 600, cursor: copyingAccruals ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {copyingAccruals ? 'Выполняем...' : selectedAccrualRows.length ? `Перенести с прошлого месяца (${selectedAccrualRows.length})` : 'Перенести с прошлого месяца'}
                    </button>
                  )}
                  {canEditAccruals && selectedAccrualRows.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAmountForSelectedAccruals(selectedAccrualRows)}
                        disabled={copyingAccruals}
                        title="Ввести сумму один раз и начислить её всем отмеченным детям за этот месяц"
                        style={{ height: 26, padding: '0 10px', border: '1px solid #1A7F80', borderRadius: 7, background: '#fff', color: '#1A7F80', fontSize: 11, fontWeight: 600, cursor: copyingAccruals ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Поставить сумму ({selectedAccrualRows.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAccrualIds(new Set())}
                        style={{ height: 26, padding: '0 4px', border: 'none', background: 'none', color: '#9AA5AE', fontSize: 11, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        снять выбор
                      </button>
                    </>
                  )}
                  {canUndoAccrualCopy && (
                    <button
                      type="button"
                      onClick={undoLastAccrualCopy}
                      disabled={copyingAccruals}
                      title="Убрать начисления, созданные последним переносом, и вернуть деньги на баланс"
                      style={{ height: 26, padding: '0 4px', border: 'none', background: 'none', color: '#9AA5AE', fontSize: 11, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      отменить перенос
                    </button>
                  )}

                </div>
              )}
              toolbarRightExtra={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isDirectoryMode && (
                    <>
                      <button
                        type="button"
                        onClick={openDirectoryDriver}
                        disabled={!activeDirectoryDriver}
                        title={activeDirectoryDriver ? `Открыть водителя: ${activeDirectoryDriver.fullName}` : activeDirectoryTransfer ? 'Водитель не назначен' : 'Выберите конкретный трансфер'}
                        style={{ height: 30, padding: '0 10px', border: `1px solid ${activeDirectoryDriver ? '#1A7F80' : 'var(--border)'}`, borderRadius: 10, background: activeDirectoryDriver ? '#1A7F80' : '#F5FAFB', color: activeDirectoryDriver ? '#fff' : '#A4B0B7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: activeDirectoryDriver ? 'pointer' : 'default', flexShrink: 0 }}
                      >
                        <UserRound size={14} />
                        Водитель
                      </button>
                    </>
                  )}
                  {userRole !== 'cashier' && (
                    <button
                      onClick={() => setShowNewFamily(true)}
                      title="Новая заявка"
                      style={{ width: 30, height: 30, border: 'none', borderRadius: 10, background: '#1A7F80', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
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
        }}
      />

      {selectedDriver && (
        <div className="ow-overlay"
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
          <section className="driver-card-modal"
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
            <header className="driver-card-header" style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              padding: '18px 20px 14px',
              borderBottom: '1px solid #E5EEF1',
            }}>
              <div className="driver-card-identity" style={{ minWidth: 0 }}>
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
                    fontWeight: 600,
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
                <div style={{ marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>
                  <span>{driverDraft?.phone || 'номер не указан'}</span>
                  <span>ID: {selectedDriver.driverId.slice(0, 8)}</span>
                  <span>{DRIVER_STATUS_OPTIONS.find(option => option.value === driverDraft?.status)?.label ?? 'Статус не указан'}</span>
                </div>

              </div>
              <div className="driver-card-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <TaskButton target={{type:'driver',id:selectedDriver.driverId,label:selectedDriver.fullName}} />

                <button
                  onClick={removeSelectedDriver}
                  disabled={savingDriver || deletingDriver}
                  title="Удалить водителя"
                  style={{
                    height: 36,
                    padding: '0 12px',
                    border: '1px solid #F1CACA',
                    borderRadius: 12,
                    background: '#FFF5F5',
                    color: '#B42318',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    cursor: savingDriver || deletingDriver ? 'default' : 'pointer',
                    opacity: savingDriver || deletingDriver ? 0.6 : 1,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Trash2 size={15} />
                  {deletingDriver ? 'Удаление...' : 'Удалить'}
                </button>
                <button
                  onClick={saveSelectedDriver}
                  disabled={savingDriver || !driverDraft}
                  title="Сохранить"
                  style={{
                    height: 36,
                    padding: '0 12px',
                    border: 'none',
                    borderRadius: 12,
                    background: savingDriver ? '#A7CFCF' : '#1A7F80',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    cursor: savingDriver ? 'default' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
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
                    color: 'var(--text-2)',
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
                { key: 'children' as DriverCardTab, label: 'Дети' },
                { key: 'documents' as DriverCardTab, label: 'Документы' },
                { key: 'finance' as DriverCardTab, label: 'Финансы' },
                { key: 'b2b' as DriverCardTab, label: `B2B${selectedDriverB2BOrders.length ? ` (${selectedDriverB2BOrders.length})` : ''}` },
              ].map(tabItem => {
                const active = selectedDriverTab === tabItem.key;
                return (
                  <button
                    key={tabItem.key}
                    onClick={() => setSelectedDriverTab(tabItem.key)}
                    className={`ow-card-tab${active ? ' is-active' : ''}`}
                    role="tab"
                    aria-selected={active}
                    style={{
                      height: 30,
                      padding: '0 12px',
                      border: `1px solid ${active ? '#1A7F80' : 'var(--border)'}`,
                      borderRadius: 10,
                      background: active ? '#DFF4F4' : '#fff',
                      color: active ? '#146566' : 'var(--text)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tabItem.label}
                  </button>
                );
              })}
            </div>

            <div className="ow-card-body" style={{ padding: 18, overflowY: 'auto', background: '#F5FAFB' }}>
              {selectedDriverTab === 'main' ? (
              <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
                gap: 12,
                marginBottom: 12,
              }}>
                <section className="ow-card-section" style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Школа / авто</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 8, columnGap: 12, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Школа</span>
                    <select
                      aria-label="Школа водителя"
                      value={driverBranchDraftId}
                      onChange={event => changeDriverBranchDraft(event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: '#fff', outline: 'none' }}
                    >
                      <option value="">Резерв</option>
                      {driverBranchOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.shortName || branch.code}</option>)}
                    </select>
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Трансфер</span>
                    <select
                      aria-label="Трансфер водителя"
                      value={driverTransferDraftId}
                      disabled={!driverBranchDraftId}
                      onChange={event => setDriverTransferDraftId(event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: driverBranchDraftId ? '#fff' : '#F2F6F7', outline: 'none' }}
                    >
                      <option value="">{driverBranchDraftId ? (driverTransferOptions.length ? 'Выберите трансфер' : 'В школе нет трансферов') : 'Без трансфера'}</option>
                      {driverTransferOptions.map(transfer => {
                        const assignedDriver = transfer.driverId
                          ? driverRows.find(driver => driver.driverId === transfer.driverId)
                          : null;
                        const occupiedByAnotherDriver = Boolean(assignedDriver && assignedDriver.driverId !== selectedDriver.driverId);
                        return (
                          <option key={transfer.id} value={transfer.id} disabled={occupiedByAnotherDriver}>
                            №{transfer.transferNumber}
                            {occupiedByAnotherDriver ? ` · занят: ${assignedDriver?.fullName}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Тип ТС</span>
                    <select
                      value={driverDraft?.vehicleType ?? ''}
                      onChange={event => setDriverDraftField('vehicleType', event.target.value as VehicleType | '')}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: '#fff', outline: 'none' }}
                    >
                      <option value="">Не указан</option>
                      {VEHICLE_TYPE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Марка</span>
                    <input
                      value={driverDraft?.brand ?? ''}
                      onChange={event => setDriverDraftField('brand', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    />
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Модель</span>
                    <input
                      value={driverDraft?.model ?? ''}
                      onChange={event => setDriverDraftField('model', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    />
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Гос. номер</span>
                    <input
                      value={driverDraft?.plateNumber ?? ''}
                      onChange={event => setDriverDraftField('plateNumber', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    />
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Мест</span>
                    <input
                      value={driverDraft?.seats ?? ''}
                      onChange={event => setDriverDraftField('seats', event.target.value.replace(/\D/g, ''))}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                </section>

                <section className="ow-card-section" style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Контакты / адрес</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 8, columnGap: 12, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Телефон</span>
                    <input
                      value={driverDraft?.phone ?? ''}
                      onChange={event => setDriverDraftField('phone', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    />
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Доп. контакт</span>
                    <input
                      value={driverDraft?.secondPhone ?? ''}
                      onChange={event => setDriverDraftField('secondPhone', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    />
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Статус</span>
                    <select
                      value={driverDraft?.status ?? 'active'}
                      onChange={event => setDriverDraftField('status', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: '#fff', outline: 'none' }}
                    >
                      {DRIVER_STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Адрес</span>
                    <input
                      value={driverDraft?.address ?? ''}
                      onChange={event => setDriverDraftField('address', event.target.value)}
                      style={{ height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                    />
                    <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>Комментарий</span>
                    <textarea
                      value={driverDraft?.comment ?? ''}
                      onChange={event => setDriverDraftField('comment', event.target.value)}
                      rows={3}
                      style={{ minHeight: 58, border: '1px solid #DDE9EC', borderRadius: 8, padding: '7px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none', resize: 'vertical' }}
                    />
                  </div>
                </section>
              </div>



              </>
              ) : selectedDriverTab === 'children' ? (
              <section className="ow-card-section" style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', overflow: 'hidden' }}>
                <div style={{
                  height: 42,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 14px',
                  borderBottom: '1px solid #E5EEF1',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                }}>
                  Дети ({selectedDriverChildren.length})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <FilterableTable data-comment-table="families/FamiliesPage:0" data-comment-context={selectedDriver?.driverId} style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['№', 'ФИО', 'Адрес', 'Телефон', 'Остановка', 'Координаты'].map(label => (
                          <th key={label} style={{
                            height: 36,
                            padding: '0 10px',
                            borderBottom: '1px solid #E5EEF1',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-2)',
                            textTransform: 'none',
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
                          <tr data-comment-row={child.rowId} key={child.rowId}>
                            {[
                              index + 1,
                              child.childName || '-',
                              child.streetAddress || '-',
                              child.phone || child.contactPhone || '-',
                              child.stopNumber || '—',
                              coords,
                            ].map((value, cellIndex) => (
                              <td key={cellIndex} data-no-comments={cellIndex === 0 ? 'true' : undefined} style={{
                                height: 42,
                                padding: '0 10px',
                                borderBottom: index === selectedDriverChildren.length - 1 ? 'none' : '1px solid #EEF4F6',
                                fontSize: 13,
                                fontWeight: cellIndex === 1 ? 850 : 650,
                                color: 'var(--text)',
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
                          <td colSpan={6} style={{
                            height: 58,
                            padding: '0 14px',
                            color: 'var(--text-2)',
                            fontSize: 13,
                            fontWeight: 600,
                          }}>
                            Детей по этому водителю нет
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </FilterableTable>
                </div>
              </section>
              ) : selectedDriverTab === 'parentCard' ? (
                <section style={{ maxWidth: 620, margin: '0 auto', borderRadius: 16, background: '#fff', border: '1px solid #CFE5E7', overflow: 'hidden' }}>
                  <div style={{ minHeight: 54, padding: '10px 14px', borderBottom: '1px solid #E5EEF1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 950, color: 'var(--text)' }}>Краткая карточка для родителей</div>
                      <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Готовый текст для отправки в Telegram или WhatsApp</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyDriverParentCard()}
                      style={{ height: 34, padding: '0 12px', border: 'none', borderRadius: 10, background: driverParentCardCopied ? '#EAF7EF' : '#1A7F80', color: driverParentCardCopied ? '#2B8952' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {driverParentCardCopied ? <Check size={15} /> : <Copy size={15} />}
                      {driverParentCardCopied ? 'Скопировано' : 'Скопировать'}
                    </button>
                  </div>
                  <div style={{ padding: 18, background: '#F5FAFB' }}>
                    <div style={{ padding: '16px 18px', borderRadius: 14, background: '#fff', border: '1px solid #DDE9EC', boxShadow: '0 6px 18px rgba(30, 56, 75, 0.06)', color: 'var(--text)', fontSize: 14, lineHeight: 1.7 }}>
                      {driverParentCardLines.map((line, index) => (
                        <div key={line} style={{ fontWeight: index === 0 ? 950 : 750, marginBottom: index === 0 && driverParentCardLines.length > 1 ? 8 : 0 }}>{line}</div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, color: 'var(--text-2)', fontSize: 11, fontWeight: 600, lineHeight: 1.45 }}>
                      Пустые поля автоматически не добавляются в сообщение.
                    </div>
                  </div>
                </section>
              ) : selectedDriverTab === 'documents' ? (
              <section className="ow-card-section" style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', overflow: 'hidden' }}>
                <div style={{
                  height: 42,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '0 14px',
                  borderBottom: '1px solid #E5EEF1',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                }}>
                  <span>Документы</span>
                  <span style={{ color: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>
                    Не хватает: {missingDriverDocuments} · Просрочены: {expiredDriverDocuments}
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <FilterableTable data-comment-table="families/FamiliesPage:1" data-comment-context={selectedDriver?.driverId} style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Название', 'Номер', 'Дата выдачи', 'Дата окончания', 'Скан', 'Обязательно'].map(label => (
                          <th key={label} style={{
                            height: 34,
                            padding: '0 10px',
                            borderBottom: '1px solid #E5EEF1',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-2)',
                            textTransform: 'none',
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
                          <tr data-comment-row={document.type} key={document.type}>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input value={document.title} onChange={event => setDriverDocumentField(index, 'title', event.target.value)} style={{ width: '100%', height: 30, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input value={document.number} onChange={event => setDriverDocumentField(index, 'number', event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${missing && !document.number.trim() ? '#EF7168' : 'var(--border)'}`, borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input type="date" value={document.issuedAt} onChange={event => setDriverDocumentField(index, 'issuedAt', event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${missing && !document.issuedAt ? '#EF7168' : 'var(--border)'}`, borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <input type="date" value={document.expiresAt} onChange={event => setDriverDocumentField(index, 'expiresAt', event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${expired || (missing && !document.expiresAt) ? '#EF7168' : 'var(--border)'}`, borderRadius: 8, padding: '0 8px', fontSize: 12, fontWeight: 600, color: expired ? '#B42318' : 'var(--text)', outline: 'none' }} />
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <label style={{ height: 30, padding: '0 9px', border: `1px solid ${missing && !document.scanUrl ? '#EF7168' : 'var(--border)'}`, borderRadius: 8, background: '#fff', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {document.scanFile ? document.scanFile.name : document.scanUrl ? 'Заменить' : 'Добавить'}
                                  <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={event => setDriverDocumentField(index, 'scanFile', event.target.files?.[0] ?? null)}
                                    style={{ display: 'none' }}
                                  />
                                </label>
                                {document.scanUrl && (
                                  <a href={document.scanUrl} target="_blank" rel="noreferrer" style={{ color: '#146566', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                    Открыть
                                  </a>
                                )}
                              </div>
                            </td>
                            <td style={{ height: 42, padding: '6px 10px', borderBottom: index === driverDocumentsDraft.length - 1 ? 'none' : '1px solid #EEF4F6' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: missing ? '#B42318' : expired ? '#B45309' : '#146566', fontSize: 12, fontWeight: 600 }}>
                                <input type="checkbox" checked={document.required} onChange={event => setDriverDocumentField(index, 'required', event.target.checked)} />
                                {missing ? 'Не хватает' : expired ? 'Просрочен' : 'ОК'}
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </FilterableTable>
                </div>
              </section>
              ) : selectedDriverTab === 'finance' ? (
                <DriverPaymentsPanel driverId={selectedDriver.driverId} sessionToken={authToken} view="history" canDeleteAdvance />
              ) : selectedDriverTab === 'b2b' ? (
                <section className="ow-card-section" style={{ borderRadius: 12, background: '#fff', border: '1px solid #DDE9EC', overflow: 'hidden' }}>
                  <div style={{ minHeight: 52, padding: '10px 14px', borderBottom: '1px solid #E5EEF1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>История заказов B2B</div>
                      <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Корпоративные выезды, на которые был назначен водитель</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ padding: '6px 9px', borderRadius: 9, background: '#E7F6F4', color: '#146566', fontSize: 11, fontWeight: 600 }}>Заказов: {selectedDriverB2BOrders.length}</span>
                      <span style={{ padding: '6px 9px', borderRadius: 9, background: '#F1F7FA', color: 'var(--text)', fontSize: 11, fontWeight: 600 }}>Начислено: {money(selectedDriverB2BOrders.reduce((sum, order) => sum + (order.driverPricePerUnit ?? 0) * order.transportCount, 0))}</span>
                    </div>
                  </div>
                  {selectedDriverB2BOrders.length === 0 ? (
                    <div style={{ minHeight: 190, padding: 24, display: 'grid', placeItems: 'center', color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>У водителя пока нет заказов B2B</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <FilterableTable data-comment-table="families/FamiliesPage:2" data-comment-context={selectedDriver?.driverId} style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                        <thead><tr>{['Дата выезда', 'Заказ', 'Клиент', 'Маршрут', 'Транспорт', 'Начислено', 'Статус'].map(label => <th key={label} style={{ height: 36, padding: '0 11px', borderBottom: '1px solid #E5EEF1', background: '#F8FCFC', color: 'var(--text-2)', textAlign: label === 'Начислено' ? 'right' : 'left', fontSize: 11, fontWeight: 600, textTransform: 'none', whiteSpace: 'nowrap' }}>{label}</th>)}</tr></thead>
                        <tbody>{selectedDriverB2BOrders.map((order, index) => {
                          const status = B2B_ORDER_STATUSES.find(item => item.key === order.status)?.label ?? order.status;
                          return <tr data-comment-row={order.id} key={order.id}>
                            <td style={{ height: 46, padding: '0 11px', borderBottom: index === selectedDriverB2BOrders.length - 1 ? 'none' : '1px solid #EEF4F6', color: 'var(--text)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{order.departureDate || '—'}</td>
                            <td style={{ height: 46, padding: '0 11px', borderBottom: index === selectedDriverB2BOrders.length - 1 ? 'none' : '1px solid #EEF4F6', color: '#146566', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{order.number}</td>
                            <td style={{ height: 46, padding: '0 11px', borderBottom: index === selectedDriverB2BOrders.length - 1 ? 'none' : '1px solid #EEF4F6', color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>{order.client}</td>
                            <td style={{ height: 46, padding: '0 11px', borderBottom: index === selectedDriverB2BOrders.length - 1 ? 'none' : '1px solid #EEF4F6', color: 'var(--text)', fontSize: 12 }}>{order.routeFrom} → {order.routeTo}</td>
                            <td style={{ height: 46, padding: '0 11px', borderBottom: index === selectedDriverB2BOrders.length - 1 ? 'none' : '1px solid #EEF4F6', color: 'var(--text)', fontSize: 12, whiteSpace: 'nowrap' }}>{order.transportCount}× {order.transport}</td>
                            <td style={{ height: 46, padding: '0 11px', borderBottom: index === selectedDriverB2BOrders.length - 1 ? 'none' : '1px solid #EEF4F6', color: 'var(--text)', fontSize: 12, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{money((order.driverPricePerUnit ?? 0) * order.transportCount)}</td>
                            <td style={{ height: 46, padding: '0 11px', borderBottom: index === selectedDriverB2BOrders.length - 1 ? 'none' : '1px solid #EEF4F6' }}><span style={{ display: 'inline-flex', padding: '5px 8px', borderRadius: 8, background: order.status === 'success' ? '#EAF7EF' : order.status === 'driver_assigned' ? '#FFF7E8' : '#EEF4FF', color: order.status === 'success' ? '#2B8952' : order.status === 'driver_assigned' ? '#A96E13' : '#4770BD', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{status}</span></td>
                          </tr>;
                        })}</tbody>
                      </FilterableTable>
                    </div>
                  )}
                </section>
              ) : selectedDriverTab === 'advances' ? (
                <DriverPaymentsPanel driverId={selectedDriver.driverId} sessionToken={authToken} view="history" canDeleteAdvance/>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {selectedTransferCard && (
        <div className="ow-overlay"
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
          <section className="ow-modal" role="dialog" aria-modal="true"
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
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
                  Трансфер №{selectedTransferCard.transfer.transferNumber}
                  <TaskButton target={{type:'transfer',id:selectedTransferCard.transfer.id,label:`Трансфер № ${selectedTransferCard.transfer.transferNumber}`}} />
                </div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
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
                  color: 'var(--text-2)',
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

            <div className="ow-card-body" style={{ padding: 18, overflowY: 'auto', background: '#F5FAFB' }}>
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
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'none' }}>{item.label}</div>
                    <div style={{ marginTop: 7, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  fontWeight: 600,
                  color: 'var(--text)',
                }}>
                  История водителей
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <FilterableTable data-comment-table="families/FamiliesPage:3" data-comment-context={selectedTransferCard?.transfer.id} style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr>
                        {['ФИО водителя', 'Дата начала', 'Дата конец', 'Статус'].map(label => (
                          <th key={label} style={{
                            height: 36,
                            padding: '0 12px',
                            borderBottom: '1px solid #E5EEF1',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-2)',
                            textTransform: 'none',
                            whiteSpace: 'nowrap',
                          }}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransferCard.history.length ? selectedTransferCard.history.map((entry, index) => (
                        <tr data-comment-row={`${selectedTransferCard.transfer.driverId || "unassigned"}:${entry.startDate}`} key={`${entry.driverName}-${index}`}>
                          {[entry.driverName, entry.startDate, entry.endDate, entry.status].map((value, cellIndex) => (
                            <td key={cellIndex} style={{
                              height: 42,
                              padding: '0 12px',
                              borderBottom: index === selectedTransferCard.history.length - 1 ? 'none' : '1px solid #EEF4F6',
                              fontSize: 13,
                              fontWeight: cellIndex === 0 ? 850 : 650,
                              color: cellIndex === 3 ? '#146566' : 'var(--text)',
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
                            color: 'var(--text-2)',
                            fontSize: 13,
                            fontWeight: 600,
                          }}>
                            Водитель не назначен
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </FilterableTable>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {adminFilterOpen && adminFilterDraft && (
        <div className="ow-overlay"
          onClick={() => setAdminFilterOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(23,34,47,0.18)', backdropFilter: 'blur(2px)' }}
        >
          <div className="ow-modal" role="dialog" aria-modal="true"
            onClick={e => e.stopPropagation()}
            style={{ width: 340, background: '#fff', borderRadius: 18, boxShadow: '0 16px 48px rgba(30,56,75,0.18)', border: '1px solid #D4E3E7', padding: '22px 24px 20px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                Фильтры · {schoolTabs.find(t => t.key === adminFilterOpen)?.label ?? adminFilterOpen}
              </span>
              <button onClick={() => setAdminFilterOpen(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, textTransform: 'none', letterSpacing: '0.05em' }}>Метрика</div>
                <NotionSelect
                  value={adminFilterDraft.metric}
                  options={LOGISTICS_DASHBOARD_METRICS.map(m => ({ value: m.key, label: m.label }))}
                  onChange={v => setAdminFilterDraft(prev => prev ? { ...prev, metric: v as LogisticsDashboardMetric } : prev)}
                  variant="inline"
                  panelWidth={260}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, textTransform: 'none', letterSpacing: '0.05em' }}>Тип транспорта</div>
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
                style={{ padding: '7px 16px', border: '1px solid #D4E3E7', borderRadius: 10, background: '#F5FAFB', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Отмена
              </button>
              <button
                onClick={saveAdminFilter}
                disabled={savingPageFilter}
                style={{ padding: '7px 16px', border: 'none', borderRadius: 10, background: '#1A7F80', color: '#fff', fontSize: 13, fontWeight: 600, cursor: savingPageFilter ? 'default' : 'pointer', opacity: savingPageFilter ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
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

      {accrualDialog && <AccrualDialog dialog={accrualDialog} onClose={() => setAccrualDialog(null)} />}
      {childToDelete && (
        <DeleteChildModal
          childName={childToDelete.childName}
          familyId={childToDelete.familyId}
          onClose={() => setChildToDelete(null)}
          onDelete={async reason => {
            await adminDeleteV2Child(childToDelete.rowId, reason, authToken);
            setRows(prev => {
              const next = prev.filter(item => item.rowId !== childToDelete.rowId);
              familiesRowsCache = next;
              return next;
            });
          }}
        />
      )}
      {showNewDriver && (
        <NewDriverModal
          sessionToken={authToken}
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
          className="notion-select-panel"
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
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 600,
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
              color: 'var(--text-2)',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'none',
              whiteSpace: 'nowrap',
            }}>
              Фильтр
            </span>
          </div>
          <div style={{
            padding: '1px 6px 6px',
            color: 'var(--text-2)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'none',
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
                  className="notion-select-option"
                  type="button"
                  onClick={() => changeDashboardTransferVehicleType(option.value)}
                  style={{
                    width: '100%',
                    minHeight: 34,
                    border: `1px solid ${active ? tone.border : 'transparent'}`,
                    borderRadius: 10,
                    background: active ? tone.bg : '#fff',
                    color: active ? tone.text : 'var(--text)',
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
                sessionToken={authToken}
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
                fontWeight: 600,
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
