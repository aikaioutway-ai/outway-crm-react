import React, { useEffect, useMemo, useState } from 'react';
import { Family, FamilyPayment, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import {
  SCHOOL_TABS, ZONE_COLOR, VT_LABEL
} from './constants';
import { fetchV2FamiliesTable, fetchV2Family, updateV2Child, updateV2ChildRoute, updateV2Family } from '../../services/crmV2Service';
import FamilyDrawer from './FamilyDrawer';
import NewFamilyModal from './NewFamilyModal';
import PaymentModal from './PaymentModal';
import { confirmFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import { PanelLeftClose, PanelLeftOpen, Search, Plus, RefreshCw } from 'lucide-react';
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

const CHILD_STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'new', label: 'Новый' },
  { value: 'waiting', label: 'Ожидание' },
  { value: 'boarded', label: 'Посажен' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'paused', label: 'Пауза' },
];

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

function modeTitle(mode: FamiliesMode): string {
  if (mode === 'payments') return 'Оплата';
  if (mode === 'cashier') return 'Кассир';
  if (mode === 'logistics') return 'Логист';
  return 'Новые заявки';
}

const TRANSFER_TONE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  microbus: { bg: '#EEF2FF', border: '#C7D2FE', text: '#312E81', dot: '#312E81' },
  minivan: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', dot: '#10B981' },
  sedan: { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E', dot: '#F59E0B' },
  empty: { bg: '#F8FAFC', border: '#CBD5E1', text: '#475569', dot: '#94A3B8' },
};

const VEHICLE_ORDER = ['microbus', 'minivan', 'sedan', 'empty'];
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
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [showNewFamily, setShowNewFamily]     = useState(false);
  const [paymentFamily, setPaymentFamily]     = useState<Family | null>(null);
  const [showSchools, setShowSchools] = useState(() => localStorage.getItem('families_show_schools') !== 'false');
  const [showTransfers, setShowTransfers] = useState(() => localStorage.getItem('families_show_transfers') !== 'false');
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);

  function toggleSchools(next: boolean) {
    setShowSchools(next);
    localStorage.setItem('families_show_schools', String(next));
  }

  function toggleTransfers(next: boolean) {
    setShowTransfers(next);
    localStorage.setItem('families_show_transfers', String(next));
  }

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

  async function openFamily(familyId: string) {
    const family = await fetchV2Family(familyId);
    if (family) setSelectedFamily(family);
  }

  async function openPayment(familyId: string) {
    const family = await fetchV2Family(familyId);
    if (family) setPaymentFamily(family);
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
      if (selectedFamily?.id === row.familyId) {
        void fetchV2Family(row.familyId).then(family => {
          if (family) setSelectedFamily(family);
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
  const modeRows = mode === 'requests'
    ? rows.filter(row => row.status === 'new')
    : mode === 'logistics'
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
  }

  const filtered = modeRows.filter(r => {
    if (!matchesSchool(r)) return false;
    if (!matchesSearch(r)) return false;
    if (quickTransfer === 'empty' && r.transferNumber) return false;
    if (quickTransfer && quickTransfer !== 'empty' && r.transferNumber !== quickTransfer) return false;
    if (quickChildStatus && r.status !== quickChildStatus) return false;
    if (quickPaymentStatus && r.paymentStatus !== quickPaymentStatus) return false;
    return true;
  });

  const familyCount = new Set(filtered.filter(r => r.isFirstChild).map(r => r.familyId)).size;
  const childCount  = filtered.length;
  const debtorRows = uniqueFamilyRows(rows.filter(row => row.debtAmount > 0));
  const debtorSum = debtorRows.reduce((sum, row) => sum + row.debtAmount, 0);
  const pendingRows = uniqueFamilyRows(rows.filter(row => row.pendingPayment > 0));
  const pendingSum = pendingRows.reduce((sum, row) => sum + row.pendingPayment, 0);
  const logisticsRows = logisticsWorkRows(rows);
  const summaryText = mode === 'payments'
    ? `${debtorRows.length} должников · ${compactMoney(debtorSum)} сом`
    : mode === 'cashier'
      ? `${pendingRows.length} чеков · ${compactMoney(pendingSum)} сом`
      : mode === 'logistics'
        ? `Мкр ${averageChildrenByVehicle(logisticsRows, 'microbus').toFixed(1)} · Минивэн ${averageChildrenByVehicle(logisticsRows, 'minivan').toFixed(1)} · Седан ${averageChildrenByVehicle(logisticsRows, 'sedan').toFixed(1)}`
        : `${familyCount} семей · ${childCount} детей`;
  const transferButtonItems = TRANSFER_BAR_OPTIONS
    .map(transfer => {
      const transferRows = rows.filter(row => row.transferNumber === transfer && matchesSchool(row) && matchesSearch(row));
      const vehicleType = transferRows.find(row => row.vehicleType === 'microbus')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'minivan')?.vehicleType
        ?? transferRows.find(row => row.vehicleType === 'sedan')?.vehicleType
        ?? 'empty';
      return { transfer, vehicleType };
    })
    .sort((a, b) => {
      const group = VEHICLE_ORDER.indexOf(a.vehicleType) - VEHICLE_ORDER.indexOf(b.vehicleType);
      if (group !== 0) return group;
      return Number(a.transfer) - Number(b.transfer);
    });
  if (mode === 'logistics') {
    transferButtonItems.push({ transfer: 'empty', vehicleType: 'empty' });
  }
  const schoolButtonItems = SCHOOL_TABS.slice(1).concat(SCHOOL_TABS[0]);
  const tableQuickSelectStyle: React.CSSProperties = {
    height: 28,
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
  const tableColumns = useMemo<ColumnDef<ChildRow>[]>(() => [
    {
      key: 'openCard',
      label: 'Оплата',
      type: 'text',
      category: 'Действия',
      width: 86,
      render: (_value, row) => (
        <button
          onClick={(event) => {
            event.stopPropagation();
            openPayment(row.familyId);
          }}
          style={{
            height: 24,
            padding: '0 9px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: '#EEF2FF',
            color: '#312E81',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Оплата
        </button>
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
  ], [mode, confirmingPaymentId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── ШАПКА тёмная ── */}
      <div style={{
        background: '#312E81',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
        height: 52,
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(199,210,254,0.6)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Имя, телефон, ребёнок, адрес..."
            style={{
              width: '100%', padding: '7px 10px 7px 32px',
              border: '1px solid rgba(199,210,254,0.25)',
              borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.08)', outline: 'none', color: '#fff',
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(199,210,254,0.85)', whiteSpace: 'nowrap' }}>
          {modeTitle(mode)} · {summaryText}
        </span>
        <button onClick={() => load()} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          borderRadius: 'var(--radius)', border: '1px solid rgba(199,210,254,0.25)',
          background: 'rgba(255,255,255,0.08)', fontSize: 13, fontWeight: 500,
          color: 'rgba(199,210,254,0.9)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <RefreshCw size={13} /> Обновить
        </button>
        <button onClick={() => setShowNewFamily(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px',
          border: 'none', borderRadius: 'var(--radius)',
          background: '#fff', color: '#312E81', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <Plus size={14} /> Новая заявка
        </button>
      </div>

      {/* ── ОСНОВНОЙ КОНТЕНТ ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: 8, padding: '8px' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 8,
          boxShadow: '0 4px 12px rgba(49,46,129,0.05)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34 }}>
            <button
              onClick={() => toggleSchools(!showSchools)}
              title={showSchools ? 'Скрыть филиалы' : 'Показать филиалы'}
              style={{
                height: 28,
                minWidth: 112,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: '1px solid var(--border)',
                borderRadius: 7,
                background: showSchools ? '#EEF2FF' : '#F8F9FF',
                color: '#312E81',
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {showSchools ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />} Филиалы
            </button>
            {showSchools ? (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 2px 2px', flex: 1 }}>
                {schoolButtonItems.map((t) => {
                  const isActive = activeTab === t.key;
                  const metric = branchMetric[t.key] ?? { value: 0, label: '0' };
                  const hasBadge = Boolean(metric.alert);
                  return (
                    <button
                      key={t.key}
                      onClick={() => setModeFilter({ activeTab: t.key })}
                      style={{
                        height: 28,
                        width: 72,
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '0 7px',
                        border: `1px solid ${isActive ? '#312E81' : 'var(--border)'}`,
                        borderRadius: 7,
                        background: isActive ? '#EEF2FF' : '#fff',
                        color: isActive ? '#312E81' : 'var(--text)',
                        fontSize: 12,
                        fontWeight: isActive ? 800 : 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        overflow: 'visible',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: hasBadge ? '#EF4444' : '#10B981' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                      {metric.value > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: -5,
                          right: -3,
                          minWidth: 16,
                          height: 16,
                          padding: '0 4px',
                          borderRadius: 8,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                          color: hasBadge ? '#fff' : '#312E81',
                          background: hasBadge ? '#EF4444' : '#C7D2FE',
                        }}>
                          {metric.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                onClick={() => toggleSchools(true)}
                style={{
                  height: 28,
                  border: '1px dashed var(--border)',
                  borderRadius: 7,
                  background: '#F8F9FF',
                  color: 'var(--text-2)',
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Показать филиалы
              </button>
            )}
          </div>

          {mode !== 'requests' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
            <button
              onClick={() => toggleTransfers(!showTransfers)}
              title={showTransfers ? 'Скрыть трансферы' : 'Показать трансферы'}
              style={{
                height: 28,
                minWidth: 112,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: '1px solid var(--border)',
                borderRadius: 7,
                background: showTransfers ? '#EEF2FF' : '#F8F9FF',
                color: '#312E81',
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {showTransfers ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />} Трансферы
            </button>
            {showTransfers ? (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 2px 2px', flex: 1 }}>
                {transferButtonItems.map(({ transfer, vehicleType }) => {
                  const isActive = quickTransfer === transfer;
                  const metric = transferMetric[transfer] ?? { value: 0, label: '0' };
                  const tone = TRANSFER_TONE[vehicleType] ?? TRANSFER_TONE.empty;
                  const label = transfer === 'empty' ? 'Пустой' : `№ ${transfer}`;
                  return (
                    <button
                      key={transfer}
                      onClick={() => setModeFilter({ quickTransfer: transfer })}
                      style={{
                        height: 28,
                        width: transfer === 'empty' ? 66 : 56,
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0,
                        padding: 0,
                        border: `1px solid ${isActive ? tone.text : tone.border}`,
                        borderRadius: 7,
                        background: isActive ? tone.bg : '#fff',
                        color: isActive ? tone.text : 'var(--text)',
                        fontSize: 12,
                        fontWeight: isActive ? 800 : 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        overflow: 'visible',
                      }}
                    >
                      <span>{label}</span>
                      {metric.value > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: -7,
                          right: -4,
                          minWidth: 18,
                          height: 18,
                          padding: '0 5px',
                          borderRadius: 9,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 800,
                          color: tone.text,
                          background: tone.bg,
                        }}>
                          {metric.label}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={() => setModeFilter({ quickTransfer: '' })}
                  style={{
                    height: 28,
                    width: 56,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0,
                    padding: 0,
                    border: `1px solid ${quickTransfer === '' ? '#312E81' : 'var(--border)'}`,
                    borderRadius: 7,
                    background: quickTransfer === '' ? '#EEF2FF' : '#fff',
                    color: quickTransfer === '' ? '#312E81' : 'var(--text)',
                    fontSize: 12,
                    fontWeight: quickTransfer === '' ? 800 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Все
                </button>
              </div>
            ) : (
              <button
                onClick={() => toggleTransfers(true)}
                style={{
                  height: 28,
                  border: '1px dashed var(--border)',
                  borderRadius: 7,
                  background: '#F8F9FF',
                  color: 'var(--text-2)',
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Показать трансферы
              </button>
            )}
          </div>}
        </div>

        {/* ── ТАБЛИЦА ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <DataTable<ChildRow>
            columns={tableColumns}
            data={filtered}
            rowKey="rowId"
            storageKey={`families_table_${mode}`}
            loading={loading}
            emptyText="Заявок не найдено"
            groupColorKey="familyIndex"
            canManageProperties={canManageProperties}
            onRowClick={(row) => openFamily(row.familyId)}
            onRowDelete={(row) => console.log('delete', row.rowId)}
            onRowEdit={(row) => console.log('edit', row.rowId)}
            onRowPayment={(row) => openPayment(row.familyId)}
            onCellSave={handleCellSave}
            toolbarExtra={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select value={quickChildStatus} onChange={e => setModeFilter({ quickChildStatus: e.target.value })} style={tableQuickSelectStyle}>
                  {CHILD_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select value={quickPaymentStatus} onChange={e => setModeFilter({ quickPaymentStatus: e.target.value })} style={tableQuickSelectStyle}>
                  {PAYMENT_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
          />
        </div>
      </div>

      {selectedFamily && (
        <FamilyDrawer
          family={selectedFamily}
          onClose={() => setSelectedFamily(null)}
          userRole={userRole}
          userName="Кайрат"
        />
      )}
      {showNewFamily && (
        <NewFamilyModal
          onClose={() => setShowNewFamily(false)}
          
        />
      )}
      {paymentFamily && (
        <PaymentModal
          family={paymentFamily}
          onClose={() => setPaymentFamily(null)}
          userRole={userRole}
          userName="Кайрат"
        />
      )}
    </div>
  );
}
