import React, { useEffect, useState } from 'react';
import { Family, FamilyPayment, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import {
  SCHOOL_TABS, ZONE_COLOR, VT_LABEL
} from './constants';
import { fetchV2FamiliesTable, fetchV2Family, updateV2Child, updateV2ChildRoute, updateV2Family } from '../../services/crmV2Service';
import InlineFamilyCard from './InlineFamilyCard';
import NewFamilyModal from './NewFamilyModal';
import { confirmFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import { Search, Plus } from 'lucide-react';
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
  stopNumber: string | null;
  timeMorning: string | null;
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
  userRole?: 'admin' | 'manager' | 'cashier' | 'logist' | 'director';
}

interface ModeFilters {
  activeTab: string;
  quickTransfer: string;
  quickChildStatus: string;
  quickPaymentStatus: string;
}

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
  { key: 'totalPaid', label: 'Общ. выплата', type: 'currency', category: 'Финансы', width: 110, visible: false, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'pendingPayment', label: 'На проверке', type: 'currency', category: 'Финансы', width: 105, visible: false, render: (val) => <span>{money(Number(val ?? 0))}</span> },
  { key: 'schoolCode',     label: 'Код школы',   type: 'text',   category: 'Система',  width: 90,  visible: false, filterable: false, sortable: false, showInProperties: false },
  { key: 'branchName',     label: 'Филиал',       type: 'text',   category: 'Система',  width: 160, visible: false, filterable: false, sortable: false, showInProperties: false },
  { key: 'vehicleType',    label: 'Тип ТС',       type: 'select', category: 'Система', width: 100, visible: false, filterable: false, sortable: false, showInProperties: false },
  { key: 'familyId',       label: 'ID семьи',     type: 'text',   category: 'Система', width: 120, visible: false, filterable: false, sortable: false, showInProperties: false },
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
  const amount = Math.round(Number(value || 0));
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}м`;
  if (Math.abs(amount) >= 1000) return `${Math.round(amount / 1000)}к`;
  return amount.toLocaleString('ru-RU');
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

const logisticsDashboardStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '150px minmax(0, 1fr)',
  gap: 16,
  alignItems: 'center',
  minHeight: 168,
  padding: '12px 42px 10px 14px',
  background: '#fff',
  border: '1px solid #E8ECEF',
  borderRadius: 10,
  overflow: 'hidden',
};

const logisticsCollapsedStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 34,
  padding: '5px 8px 5px 12px',
  background: '#fff',
  border: '1px solid #E8ECEF',
  borderRadius: 10,
};

const logisticsCollapsedDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: '#F59E0B',
  flexShrink: 0,
};

const logisticsToggleStyle: React.CSSProperties = {
  height: 26,
  padding: '0 9px',
  border: '1px solid #E8ECEF',
  borderRadius: 7,
  background: '#fff',
  color: '#6B7280',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  justifySelf: 'end',
};

const logisticsGaugeStyle: React.CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 4,
};

const logisticsGaugeTitleStyle: React.CSSProperties = {
  justifySelf: 'start',
  marginLeft: 14,
  fontSize: 12,
  fontWeight: 850,
  color: '#111827',
};

const logisticsGaugeValueStyle: React.CSSProperties = {
  position: 'absolute',
  fontSize: 24,
  fontWeight: 900,
  color: '#111827',
};

const logisticsBarsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(58px, 1fr))',
  alignItems: 'end',
  gap: 8,
  minWidth: 0,
  overflow: 'hidden',
  padding: '16px 0 2px',
  borderBottom: '1px solid #E5ECEF',
  scrollbarWidth: 'none',
};

const logisticsBarItemStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: '18px 98px 24px',
  justifyItems: 'center',
  alignItems: 'end',
  minWidth: 0,
};

const logisticsBarValueStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 750,
  color: '#6B7280',
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
};

const logisticsBarLabelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 72,
  paddingTop: 6,
  fontSize: 10,
  fontWeight: 700,
  color: '#6B7280',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

function LogisticsMicrobusDashboard({
  items,
  collapsed,
  onToggle,
}: {
  items: { key: string; label: string; value: number; color: string }[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const maxValue = Math.max(20, ...items.map(item => item.value));
  const average = items.length
    ? items.reduce((sum, item) => sum + item.value, 0) / items.length
    : 0;
  const radius = 38;
  const stroke = 11;
  const circumference = 2 * Math.PI * radius;
  const gap = 4;
  const totalValue = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;

  if (collapsed) {
    return (
      <div style={logisticsCollapsedStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={logisticsCollapsedDotStyle} />
          <span style={{ fontSize: 12, fontWeight: 850, color: '#111827' }}>Средний по микроавтобусам</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#F59E0B' }}>{average.toFixed(2)}</span>
        </div>
        <button onClick={onToggle} style={logisticsToggleStyle}>Показать</button>
      </div>
    );
  }

  return (
    <div style={logisticsDashboardStyle}>
      <button onClick={onToggle} style={{ ...logisticsToggleStyle, position: 'absolute', top: 8, right: 8 }}>Скрыть</button>
      <div style={logisticsGaugeStyle}>
        <div style={logisticsGaugeTitleStyle}>Средний</div>
        <div style={{ position: 'relative', width: 112, height: 112, display: 'grid', placeItems: 'center' }}>
          <svg width="112" height="112" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="56" cy="56" r={radius} fill="none" stroke="#EEF2F5" strokeWidth={stroke} />
            {items.map(item => {
              const dash = Math.max(1, (item.value / totalValue) * circumference - gap);
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
          <div style={logisticsGaugeValueStyle}>{average.toFixed(2)}</div>
        </div>
      </div>

      <div style={logisticsBarsStyle}>
        {items.map(item => {
          const height = Math.max(10, Math.round((item.value / maxValue) * 94));
          return (
            <div key={item.key} style={logisticsBarItemStyle}>
              <div style={logisticsBarValueStyle}>{item.value.toFixed(1)}</div>
              <div style={logisticsBarTrackStyle}>
                <div style={{ ...logisticsBarStyle, height, background: item.color }} />
              </div>
              <div style={logisticsBarLabelStyle}>{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TRANSFER_TONE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  microbus: { bg: '#FFF7ED', border: '#FED7AA', text: '#F59E0B', dot: '#F59E0B' },
  minivan: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', dot: '#10B981' },
  sedan: { bg: '#FEF3C7', border: '#FDE68A', text: '#F59E0B', dot: '#F59E0B' },
  empty: { bg: '#F8FAFC', border: '#CBD5E1', text: '#475569', dot: '#94A3B8' },
};

const TRANSFER_TABS = [
  ...TRANSFER_BAR_OPTIONS.map(transfer => ({ key: transfer, label: transfer })),
];
const DEFAULT_MODE_FILTERS: ModeFilters = {
  activeTab: 'ALL',
  quickTransfer: '',
  quickChildStatus: '',
  quickPaymentStatus: '',
};

export default function FamiliesPage({ mode = 'requests', userRole = 'admin' }: FamiliesPageProps) {
  const [rows, setRows]           = useState<ChildRow[]>(() => familiesRowsCache ?? []);
  const [loading, setLoading]     = useState(() => !familiesRowsCache);
  const [search, setSearch]       = useState('');
  const [filtersByMode, setFiltersByMode] = useState<Record<FamiliesMode, ModeFilters>>({
    requests: { ...DEFAULT_MODE_FILTERS },
    payments: { ...DEFAULT_MODE_FILTERS },
    cashier: { ...DEFAULT_MODE_FILTERS },
    logistics: { ...DEFAULT_MODE_FILTERS },
  });
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily]     = useState<Family | null>(null);
  const [expandedInitialTab, setExpandedInitialTab] = useState<'overview' | 'finance'>('overview');
  const [showNewFamily, setShowNewFamily]       = useState(false);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [logisticsDashboardCollapsed, setLogisticsDashboardCollapsed] = useState(false);

  const modeFilters = filtersByMode[mode] ?? DEFAULT_MODE_FILTERS;
  const { activeTab, quickTransfer, quickChildStatus, quickPaymentStatus } = modeFilters;
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
    load(!familiesRowsCache);
  }, []);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const result = normalizeRows(await fetchV2FamiliesTable());
      familiesRowsCache = result;
      setRows(result);
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
        confirmedBy: 'Кайрат',
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

  const canManageProperties = userRole === 'admin' || userRole === 'director';
  const modeRows = mode === 'logistics'
      ? logisticsWorkRows(rows)
      : rows;

  const rowMatchesSchoolTab = (row: ChildRow, tabItem: typeof SCHOOL_TABS[number]) => {
    if (tabItem.key === 'ALL') return true;
    if (row.branchFilter === tabItem.key) return true;
    if (tabItem.branches.length > 0) return tabItem.branches.includes(row.branchName);
    if (tabItem.codes.length > 0) return tabItem.codes.includes(row.schoolCode);
    return false;
  };

  const branchMetric: Record<string, { value: number; label: string; alert?: boolean }> = {};
  const transferMetric: Record<string, { value: number; label: string; alert?: boolean }> = {};

  SCHOOL_TABS.forEach(tabItem => {
    const branchRows = tabItem.key === 'ALL'
      ? rows
      : rows.filter(row => rowMatchesSchoolTab(row, tabItem));

    if (mode === 'requests') {
      const count = branchRows.filter(row => row.status === 'new').length;
      branchMetric[tabItem.key] = { value: count, label: String(count), alert: count > 0 };
    } else if (mode === 'payments') {
      const debt = uniqueFamilyRows(branchRows.filter(row => row.debtAmount > 0)).reduce((sum, row) => sum + row.debtAmount, 0);
      branchMetric[tabItem.key] = { value: debt, label: compactMoney(debt), alert: debt > 0 };
    } else if (mode === 'cashier') {
      const pendingRows = uniqueFamilyRows(branchRows.filter(row => row.pendingPayment > 0));
      branchMetric[tabItem.key] = { value: pendingRows.length, label: String(pendingRows.length), alert: pendingRows.length > 0 };
    } else {
      const avg = tabItem.key === 'ALL'
        ? averageChildrenByVehicle(logisticsWorkRows(rows), 'microbus')
        : averageMicrobusByBranch(logisticsWorkRows(rows), tabItem.key);
      branchMetric[tabItem.key] = { value: avg, label: avg ? avg.toFixed(1) : '0' };
    }
  });

  // Фильтрация
  const tab = SCHOOL_TABS.find(t => t.key === activeTab);
  const matchesSchool = (r: ChildRow) => {
    if (!tab) return true;
    return rowMatchesSchoolTab(r, tab);
  };
  const matchesSearch = (r: ChildRow) => {
    if (search) {
      const q = search.toLowerCase().replace(/\s+/g, '');
      const haystack = Object.values(r)
        .map(value => String(value ?? '').toLowerCase())
        .join(' ')
        .replace(/\s+/g, '');
      if (!haystack.includes(q)) return false;
    }
    return true;
  };
  TRANSFER_BAR_OPTIONS.forEach(transfer => {
    const transferRows = rows.filter(row => row.transferNumber === transfer && matchesSchool(row) && matchesSearch(row));
    if (mode === 'payments') {
      const debt = uniqueFamilyRows(transferRows.filter(row => row.debtAmount > 0)).reduce((sum, row) => sum + row.debtAmount, 0);
      transferMetric[transfer] = { value: debt, label: compactMoney(debt), alert: debt > 0 };
    } else if (mode === 'cashier') {
      const pendingRows = uniqueFamilyRows(transferRows.filter(row => row.pendingPayment > 0));
      transferMetric[transfer] = { value: pendingRows.length, label: String(pendingRows.length), alert: pendingRows.length > 0 };
    } else {
      const count = logisticsWorkRows(transferRows).length;
      transferMetric[transfer] = { value: count, label: String(count), alert: count > 0 };
    }
  });
  if (mode === 'logistics') {
    const emptyRows = logisticsWorkRows(rows.filter(row => !row.transferNumber && matchesSchool(row) && matchesSearch(row)));
    transferMetric.empty = { value: emptyRows.length, label: String(emptyRows.length), alert: emptyRows.length > 0 };
  } else {
    const emptyRows = rows.filter(row => !row.transferNumber && matchesSchool(row) && matchesSearch(row));
    if (mode === 'payments') {
      const debt = uniqueFamilyRows(emptyRows.filter(row => row.debtAmount > 0)).reduce((sum, row) => sum + row.debtAmount, 0);
      transferMetric.empty = { value: debt, label: compactMoney(debt), alert: debt > 0 };
    } else if (mode === 'cashier') {
      const pendingRows = uniqueFamilyRows(emptyRows.filter(row => row.pendingPayment > 0));
      transferMetric.empty = { value: pendingRows.length, label: String(pendingRows.length), alert: pendingRows.length > 0 };
    } else {
      const count = emptyRows.length;
      transferMetric.empty = { value: count, label: String(count), alert: count > 0 };
    }
  }

  const filtered = modeRows.filter(r => {
    if (!matchesSchool(r)) return false;
    if (!matchesSearch(r)) return false;
    if (quickTransfer === 'empty' && r.transferNumber) return false;
    if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
    if (quickChildStatus === 'transfered' && !r.transferNumber) return false;
    if (quickChildStatus && quickChildStatus !== 'transfered' && r.status !== quickChildStatus) return false;
    if (quickPaymentStatus && r.paymentStatus !== quickPaymentStatus) return false;
    return true;
  });

  const transferVehicleTone = (transfer: string) => {
    if (!transfer || transfer === 'empty') return TRANSFER_TONE.empty;
    const transferRows = rows.filter(row => row.transferNumber === transfer && matchesSchool(row) && matchesSearch(row));
    const vehicleType = transferRows.find(row => row.vehicleType === 'microbus')?.vehicleType
      ?? transferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
      ?? transferRows.find(row => row.vehicleType === 'sedan')?.vehicleType
      ?? 'empty';
    return TRANSFER_TONE[vehicleType] ?? TRANSFER_TONE.empty;
  };
  const quickStatusItems = [
    {
      key: 'new',
      label: '?',
      title: 'Новые',
      count: rows.filter(row => row.status === 'new' && matchesSchool(row) && matchesSearch(row)).length,
      tone: '#F59E0B',
    },
    {
      key: 'rejected',
      label: '×',
      title: 'Отказ',
      count: rows.filter(row => row.status === 'rejected' && matchesSchool(row) && matchesSearch(row)).length,
      tone: '#64748B',
    },
  ];
  const schoolButtonItems = SCHOOL_TABS;
  const logisticsAvgItems = schoolButtonItems
    .filter(item => item.key !== 'ALL')
    .map((item, index) => ({
      key: item.key,
      label: item.label,
      value: averageMicrobusByBranch(logisticsWorkRows(rows), item.key),
      color: LOGISTICS_CHART_COLORS[index % LOGISTICS_CHART_COLORS.length],
    }));
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
  const tableColumns: ColumnDef<ChildRow>[] = [
    {
      key: 'openCard',
      label: 'Оплата',
      type: 'text',
      category: 'Действия',
      width: 80,
      sortable: false,
      filterable: false,
      showInProperties: false,
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
              border: '1px solid #E8ECEF',
              borderRadius: 6,
              background: '#fff',
              color: '#F59E0B',
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
      width: 120,
      visible: mode === 'cashier',
      render: (_value, row) => {
        const disabled = !row.isFirstChild || !row.pendingPaymentId || confirmingPaymentId === row.pendingPaymentId;
        if (!row.isFirstChild || !row.pendingPaymentId) return <span style={{ color: 'var(--text-2)' }}>—</span>;
        return (
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
        );
      },
      getValue: (row) => row.pendingPaymentId ? 'На проверке' : '',
    },
    ...COLUMNS,
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>

      {/* ── ОСНОВНОЙ КОНТЕНТ ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px', minHeight: '100%' }}>
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '6px 8px 0',
          boxShadow: '0 8px 20px rgba(8,11,11,0.06)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            minHeight: 34,
            overflow: 'hidden',
            padding: '3px 2px 0',
            borderBottom: '3px solid #EEF3F5',
          }}>
            {schoolButtonItems.map((t, index) => {
              const isActive = activeTab === t.key;
              const metric = branchMetric[t.key] ?? { value: 0, label: '0' };
              const hasBadge = Boolean(metric.alert);
              return (
                <React.Fragment key={t.key}>
                  <button
                    onClick={() => setModeFilter({ activeTab: t.key })}
                    style={{
                      height: 31,
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 0 8px',
                      border: 'none',
                      borderBottom: `3px solid ${isActive ? '#3F46D3' : 'transparent'}`,
                      background: 'transparent',
                      color: isActive ? '#3F46D3' : '#5A5C61',
                      fontSize: 11,
                      fontWeight: isActive ? 800 : 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flex: '0 1 auto',
                      minWidth: 0,
                      overflow: 'visible',
                    }}
                  >
                    <span style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: hasBadge ? '#EF4444' : '#159A6A',
                      flexShrink: 0,
                    }} />
                    <span>{t.label}</span>
                    {metric.value > 0 && (
                      <span style={{
                        minWidth: 18,
                        height: 16,
                        padding: '0 6px',
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 800,
                        color: '#fff',
                        background: '#EF4444',
                      }}>
                        {metric.label}
                      </span>
                    )}
                  </button>
                  {index < schoolButtonItems.length - 1 && (
                    <span style={{
                      width: 1,
                      height: 18,
                      alignSelf: 'center',
                      background: '#DDE7EB',
                      opacity: 0.9,
                      flexShrink: 0,
                    }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

        </div>

        {mode === 'logistics' && (
          <LogisticsMicrobusDashboard
            items={logisticsAvgItems}
            collapsed={logisticsDashboardCollapsed}
            onToggle={() => setLogisticsDashboardCollapsed(value => !value)}
          />
        )}

        {/* ── ТАБЛИЦА ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'visible', minWidth: 0 }}>
          <div style={{
            position: 'sticky',
            top: 49,
            zIndex: 35,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 4,
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '4px 8px 0',
            marginBottom: -1,
            background: '#F8FAFC',
            border: '1px solid #E8ECEF',
            borderBottom: 'none',
            borderRadius: '10px 10px 0 0',
            scrollbarWidth: 'none',
            flexShrink: 0,
          }}>
            {TRANSFER_TABS.map(tabItem => {
              const isActive = quickTransfer === tabItem.key && quickChildStatus === '';
              const metric = tabItem.key ? transferMetric[tabItem.key] : { value: filtered.length, label: String(filtered.length), alert: filtered.length > 0 };
              const tone = transferVehicleTone(tabItem.key);
              const showBadge = Boolean(metric?.value);
              return (
                <button
                  key={tabItem.key || 'all'}
                  onClick={() => setModeFilter({ quickTransfer: tabItem.key, quickChildStatus: '' })}
                  title={tabItem.label}
                  style={{
                    height: 31,
                    minWidth: tabItem.key === 'empty' ? 94 : tabItem.key === '' ? 46 : 32,
                    padding: tabItem.key === 'empty' ? '0 10px' : '0 8px',
                    border: '1px solid #E4E8EC',
                    borderBottomColor: isActive ? '#fff' : '#E4E8EC',
                    borderRadius: '8px 8px 0 0',
                    background: isActive ? '#fff' : '#F8FAFC',
                    color: isActive ? '#111827' : '#6B7280',
                    fontSize: 12,
                    fontWeight: isActive ? 800 : 650,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    boxShadow: isActive ? '0 -1px 0 #fff inset' : 'none',
                    flexShrink: 0,
                  }}
                >
                  {tabItem.key && tabItem.key !== 'empty' && (
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: tone.dot, opacity: 0.75 }} />
                  )}
                  <span>{tabItem.label}</span>
                  {showBadge && (
                    <span style={{
                      minWidth: 16,
                      height: 16,
                      padding: '0 5px',
                      borderRadius: 999,
                      background: isActive ? '#F1F5F9' : '#EEF2F5',
                      color: metric?.alert ? '#475569' : '#94A3B8',
                      fontSize: 9,
                      fontWeight: 800,
                      lineHeight: '16px',
                    }}>
                      {metric?.label}
                    </span>
                  )}
                </button>
              );
            })}
            <div style={{ width: 8, height: 22, borderLeft: '1px solid #E4E8EC', flexShrink: 0 }} />
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
                    border: `1px solid ${isActive ? item.tone : '#E4E8EC'}`,
                    borderBottomColor: isActive ? '#fff' : '#E4E8EC',
                    borderRadius: '8px 8px 0 0',
                    background: isActive ? '#fff' : '#F8FAFC',
                    color: isActive ? item.tone : '#6B7280',
                    fontSize: item.key === 'rejected' ? 17 : 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                >
                  {item.label}
                  {item.count > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: 3,
                      right: 3,
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: item.tone,
                    }} />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setModeFilter({ quickTransfer: '', quickChildStatus: '' })}
              style={{
                height: 31,
                padding: '0 10px',
                border: '1px solid #E4E8EC',
                borderBottomColor: quickTransfer === '' && quickChildStatus === '' ? '#fff' : '#E4E8EC',
                borderRadius: '8px 8px 0 0',
                background: quickTransfer === '' && quickChildStatus === '' ? '#fff' : '#F8FAFC',
                color: '#475569',
                fontSize: 12,
                fontWeight: 750,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Все
            </button>
          </div>
          <DataTable<ChildRow>
            columns={tableColumns}
            data={filtered}
            rowKey="rowId"
            storageKey={`families_table_${mode}`}
            loading={loading}
            emptyText="Заявок не найдено"
            canManageProperties={canManageProperties}
            onRowOpen={(row) => toggleExpandedFamily(row.familyId, row, 'overview')}
            onRowDelete={(row) => console.log('delete', row.rowId)}
            onRowEdit={(row) => console.log('edit', row.rowId)}
            onCellSave={handleCellSave}
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
                  background: '#F59E0B',
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
        </div>
      </div>

      {showNewFamily && (
        <NewFamilyModal
          onClose={() => setShowNewFamily(false)}
          
        />
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
          <div onClick={event => event.stopPropagation()} style={{ width: 'min(1080px, calc(100vw - 48px))' }}>
            {expandedFamily ? (
              <InlineFamilyCard
                family={expandedFamily}
                userRole={userRole}
                userName="Кайрат"
                initialTab={expandedInitialTab}
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


