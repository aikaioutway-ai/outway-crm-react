import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Family } from '../../types';
import { money } from '../../utils/pricing';
import {
  ZONE_COLOR, VT_LABEL, normalizeZone, getBranchShort, getBranchFilter
} from './constants';
import SchoolSidebar, { SCHOOL_TABS } from '../../core/bars/SchoolSidebar';
import FamilyDrawer from './FamilyDrawer';
import StatusBadge from '../../core/cards/StatusBadge';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import { Search, Plus, RefreshCw } from 'lucide-react';

interface ChildRow {
  rowId: string;
  familyId: string;
  familyIndex: number;
  isFirstChild: boolean;
  childName: string;
  childClass: string;
  parentName: string;
  phone: string;
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
  transferNumber: string | null;
}

function stripAddress(addr: string | null): string {
  if (!addr) return '';
  return addr
    .replace(/^кыргызстан,?\s*/i, '')
    .replace(/^бишкек,?\s*/i, '')
    .replace(/^кыргызстан,?\s*бишкек,?\s*/i, '')
    .trim();
}

const COLUMNS: ColumnDef<ChildRow>[] = [
  {
    key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 160,
    render: (val, row) => row.isFirstChild
      ? <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{val}</span>
      : <span style={{ fontSize: 11, color: 'var(--text-2)', paddingLeft: 8 }}>└ #{row.familyId.slice(-4)}</span>,
    getValue: (row) => row.parentName,
  },
  {
    key: 'phone', label: 'Телефон', type: 'text', category: 'Клиент', width: 120,
    render: (val, row) => row.isFirstChild
      ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{val}</span>
      : null,
  },
  {
    key: 'childName', label: 'Ребёнок', type: 'text', category: 'Клиент', width: 160,
    render: (val) => <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{val || '—'}</span>,
  },
  {
    key: 'childClass', label: 'Класс', type: 'text', category: 'Клиент', width: 65,
    render: (val) => <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{val ? `${val} кл.` : '—'}</span>,
  },
  {
    key: 'branchShort', label: 'Школа', type: 'select', category: 'Клиент', width: 80,
    render: (val, row) => (
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
        {val}
        {row.branchName === 'Asylkech Girls School' && (
          <span style={{ fontSize: 10, color: 'var(--text-2)', marginLeft: 3 }}>_A</span>
        )}
      </span>
    ),
    getValue: (row) => row.branchShort,
  },
  {
    key: 'streetAddress', label: 'Адрес', type: 'text', category: 'Адрес', width: 230,
    render: (val, row) => row.isFirstChild
      ? <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{val || '—'}</span>
      : <span style={{ color: 'var(--text-2)', fontSize: 12 }}>—</span>,
    getValue: (row) => row.streetAddress,
  },
  {
    key: 'distanceKm', label: 'Км', type: 'number', category: 'Адрес', width: 60,
    render: (val, row) => row.isFirstChild && val
      ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{val}</span>
      : null,
  },
  {
    key: 'zone', label: 'Зона', type: 'select', category: 'Адрес', width: 65,
    render: (val) => val ? (
      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: ZONE_COLOR[val]?.bg, color: ZONE_COLOR[val]?.color }}>
        {val}
      </span>
    ) : null,
  },
  {
    key: 'vehicleLabel', label: 'Транспорт', type: 'select', category: 'Маршрут', width: 120,
    render: (val, row) => (
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
        {val}{row.transferNumber ? ` №${row.transferNumber}` : ''}
      </span>
    ),
  },
  {
    key: 'monthlyPrice', label: 'Сумма/мес', type: 'currency', category: 'Финансы', width: 110,
    render: (val) => <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{money(val)}</span>,
  },
  {
    key: 'status', label: 'Статус', type: 'badge', category: 'Клиент', width: 100,
    render: (val) => <StatusBadge status={val} size="sm" />,
  },
  { key: 'schoolCode',     label: 'Код школы',   type: 'text',   category: 'Клиент',  width: 90,  visible: false },
  { key: 'branchName',    label: 'Филиал',       type: 'text',   category: 'Клиент',  width: 160, visible: false },
  { key: 'vehicleType',   label: 'Тип ТС',       type: 'select', category: 'Маршрут', width: 100, visible: false },
  { key: 'transferNumber',label: '№ Трансфера',  type: 'text',   category: 'Маршрут', width: 100, visible: false },
  { key: 'familyId',      label: 'ID семьи',     type: 'text',   category: 'Система', width: 120, visible: false },
];

export default function FamiliesPage() {
  const [rows, setRows]           = useState<ChildRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [search, setSearch]       = useState('');
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [famRes, childRes] = await Promise.all([
      supabase.from('families').select('*').order('created_at', { ascending: false }),
      supabase.from('children').select('*'),
    ]);

    if (famRes.data) {
      const childMap: Record<string, any[]> = {};
      (childRes.data ?? []).forEach((c: any) => {
        if (!childMap[c.family_id]) childMap[c.family_id] = [];
        childMap[c.family_id].push(c);
      });

      const result: ChildRow[] = [];
      let familyIndex = 0;

      famRes.data.forEach((f: any) => {
        const zone        = normalizeZone(f.zone, 'A');
        const vt          = f.vehicle_type ?? 'microbus';
        const kids        = childMap[f.id] ?? [];
        const items       = kids.length > 0 ? kids : [null];
        const branchName  = f.branch_name ?? '';
        const branchShort  = getBranchShort(branchName, f.school_code);
        const branchFilter = getBranchFilter(branchName, f.school_code);
        const streetAddr   = stripAddress(f.full_address);

        items.forEach((c: any, idx: number) => {
          result.push({
            rowId:          c ? c.id : f.id + '_empty',
            familyId:       f.id,
            familyIndex,
            isFirstChild:   idx === 0,
            childName:      c?.child_name ?? '',
            childClass:     c?.class ?? '',
            parentName:     f.parent_name,
            phone:          f.phone,
            schoolCode:     f.school_code,
            branchName,
            branchShort,
            branchFilter,
            streetAddress:  streetAddr,
            distanceKm:     f.distance_km,
            zone,
            vehicleType:    vt,
            vehicleLabel:   VT_LABEL[vt] ?? vt,
            monthlyPrice:   f.monthly_price ?? 0,
            status:         f.status ?? 'new',
            transferNumber: f.transfer_number,
          });
        });
        familyIndex++;
      });

      setRows(result);
    }
    setLoading(false);
  }

  async function openFamily(familyId: string) {
    const { data: f } = await supabase.from('families').select('*').eq('id', familyId).single();
    if (!f) return;
    setSelectedFamily({
      id: f.id, schoolCode: f.school_code, parentName: f.parent_name,
      phone: f.phone, phoneTelegram: f.phone_telegram, secondPhone: f.second_phone,
      contactName: f.contact_name, contactPhone: f.contact_phone,
      fullAddress: f.full_address, latitude: f.latitude, longitude: f.longitude,
      distanceKm: f.distance_km, zone: normalizeZone(f.zone, 'A') as any,
      vehicleType: f.vehicle_type, vehicleLabel: f.vehicle_label,
      monthlyPrice: f.monthly_price ?? 0, comment: f.comment,
      createdAt: f.created_at, status: f.status ?? 'new',
      transferNumber: f.transfer_number, stopNumber: f.stop_number,
      timeMorning: f.time_morning, timeEvening: f.time_evening,
    });
  }

  // Подсчёт количества семей по табу
  const familyByTab: Record<string, Set<string>> = {};
  const badgeByTab: Record<string, number> = {};
  const seenFamilies = new Set<string>();

  rows.forEach(r => {
    if (!r.isFirstChild) return;
    // ALL
    if (!familyByTab['ALL']) familyByTab['ALL'] = new Set();
    familyByTab['ALL'].add(r.familyId);

    // По табу
    const tabKey = r.branchFilter;
    if (!familyByTab[tabKey]) familyByTab[tabKey] = new Set();
    familyByTab[tabKey].add(r.familyId);

    // Badges (новые заявки)
    if (r.status === 'new' && !seenFamilies.has(r.familyId)) {
      seenFamilies.add(r.familyId);
      badgeByTab['ALL'] = (badgeByTab['ALL'] ?? 0) + 1;
      badgeByTab[tabKey] = (badgeByTab[tabKey] ?? 0) + 1;
    }
  });

  const counts: Record<string, number> = {};
  SCHOOL_TABS.forEach(t => {
    counts[t.key] = familyByTab[t.key]?.size ?? 0;
  });

  // Фильтрация
  const tab = SCHOOL_TABS.find(t => t.key === activeTab);
  const filtered = rows.filter(r => {
    if (activeTab !== 'ALL' && tab) {
      if (tab.branches.length > 0) {
        if (!tab.branches.includes(r.branchName)) return false;
      } else if (tab.codes.length > 0) {
        if (['ING','ING_P','ING_W'].includes(activeTab)) {
          if (r.branchFilter !== activeTab) return false;
        } else {
          if (!tab.codes.includes(r.schoolCode)) return false;
        }
      }
    }
    if (search) {
      const q = search.toLowerCase();
      return r.parentName.toLowerCase().includes(q) ||
             r.phone.includes(q) ||
             r.childName.toLowerCase().includes(q) ||
             r.streetAddress.toLowerCase().includes(q);
    }
    return true;
  });

  const familyCount = new Set(filtered.filter(r => r.isFirstChild).map(r => r.familyId)).size;
  const childCount  = filtered.length;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── SCHOOL SIDEBAR (004) ── */}
      <SchoolSidebar
        active={activeTab}
        onChange={setActiveTab}
        counts={counts}
        badges={badgeByTab}
      />

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── TOOLBAR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#fff', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Имя, телефон, ребёнок, адрес..."
              style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, background: 'var(--bg)', outline: 'none', color: 'var(--text)' }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
            {familyCount} семей · {childCount} детей
          </span>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <RefreshCw size={13} /> Обновить
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Новая заявка
          </button>
        </div>

        {/* ── ТАБЛИЦА ── */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '10px 14px', display: 'flex', flexDirection: 'column' }}>
          <DataTable<ChildRow>
            columns={COLUMNS}
            data={filtered}
            rowKey="rowId"
            storageKey="families_table"
            loading={loading}
            emptyText="Заявок не найдено"
            groupColorKey="familyIndex"
            onRowClick={(row) => openFamily(row.familyId)}
            onRowDelete={(row) => console.log('delete', row.rowId)}
            onRowEdit={(row) => console.log('edit', row.rowId)}
            onRowPayment={(row) => console.log('new payment', row.familyId)}
          />
        </div>
      </div>

      {selectedFamily && (
        <FamilyDrawer
          family={selectedFamily}
          onClose={() => setSelectedFamily(null)}
          userRole="admin"
          userName="Кайрат"
        />
      )}
    </div>
  );
}
