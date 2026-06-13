import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Family } from '../../types';
import { money } from '../../utils/pricing';
import {
  ZONE_COLOR, VT_LABEL, normalizeZone, getBranchShort, getBranchFilter
} from './constants';
import { SCHOOL_TABS } from '../../core/bars/SchoolSidebar';
import FamilyDrawer from './FamilyDrawer';
import NewFamilyModal from './NewFamilyModal';
import PaymentModal from './PaymentModal';
import StatusBadge from '../../core/cards/StatusBadge';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { formatName, formatPhone } from '../../utils/format';

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
  { key: 'branchName',     label: 'Филиал',       type: 'text',   category: 'Клиент',  width: 160, visible: false },
  { key: 'vehicleType',    label: 'Тип ТС',       type: 'select', category: 'Маршрут', width: 100, visible: false },
  { key: 'transferNumber', label: '№ Трансфера',  type: 'text',   category: 'Маршрут', width: 100, visible: false },
  { key: 'familyId',       label: 'ID семьи',     type: 'text',   category: 'Система', width: 120, visible: false },
];

// Высоты для симметрии
const H_TOOLBAR = 45;  // высота тулбара таблицы (Фильтр/Сортировка)
const H_HEADER  = 36;  // высота заголовка таблицы (#, Телефон...)
const H_ROW     = 34;  // высота строки таблицы

export default function FamiliesPage() {
  const [rows, setRows]           = useState<ChildRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [search, setSearch]       = useState('');
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [showNewFamily, setShowNewFamily]     = useState(false);
  const [paymentFamily, setPaymentFamily]     = useState<Family | null>(null);

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
        const kids = childMap[f.id] ?? [];
        const items = kids.length > 0 ? kids : [null];

        // Адрес берём из семьи или из первого ребёнка
        const streetAddr = stripAddress(f.full_address ?? kids[0]?.address ?? null);
        const distanceKm = f.distance_km ?? kids[0]?.distance_km ?? null;
        const familyStatus = f.status ?? 'new';

        items.forEach((c: any, idx: number) => {
          // school_code: приоритет у ребёнка, fallback у семьи (для старых записей)
          const schoolCode  = c?.school_code ?? f.school_code ?? '';
          const branchName  = c?.branch_name ?? f.branch_name ?? '';
          const branchShort = getBranchShort(branchName, schoolCode);
          const branchFilter = getBranchFilter(branchName, schoolCode);

          const zone = normalizeZone(c?.zone ?? f.zone, 'A');
          const vt   = c?.vehicle_type ?? f.vehicle_type ?? 'microbus';

          // Цена: из ребёнка или из семьи
          const monthlyPrice = c?.monthly_price ?? f.monthly_price ?? 0;

          result.push({
            rowId:         c ? c.id : f.id + '_empty',
            familyId:      f.id,
            familyIndex,
            isFirstChild:  idx === 0,
            childName:     c?.child_name ?? '',
            childClass:    c?.class ?? '',
            parentName:    formatName(f.parent_name),
            phone:         formatPhone(f.phone),
            schoolCode,
            branchName,
            branchShort,
            branchFilter,
            streetAddress: idx === 0 ? streetAddr : '',
            distanceKm:    idx === 0 ? distanceKm : null,
            zone,
            vehicleType:   vt,
            vehicleLabel:  VT_LABEL[vt] ?? vt,
            monthlyPrice,
            status:        familyStatus,
            transferNumber: c?.transfer_number ?? f.transfer_number ?? null,
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
    const { data: kids } = await supabase.from('children').select('*').eq('family_id', familyId);
    const firstKid = kids?.[0];
    setSelectedFamily({
      id: f.id,
      schoolCode: firstKid?.school_code ?? f.school_code,
      parentName: f.parent_name,
      phone: f.phone, phoneTelegram: f.phone_telegram, secondPhone: f.second_phone,
      contactName: f.contact_name, contactPhone: f.contact_phone,
      fullAddress: f.full_address ?? firstKid?.address,
      latitude: f.latitude ?? firstKid?.latitude,
      longitude: f.longitude ?? firstKid?.longitude,
      distanceKm: f.distance_km ?? firstKid?.distance_km,
      zone: normalizeZone(firstKid?.zone ?? f.zone, 'A') as any,
      vehicleType: firstKid?.vehicle_type ?? f.vehicle_type,
      vehicleLabel: f.vehicle_label,
      monthlyPrice: f.monthly_price ?? 0,
      comment: f.comment,
      createdAt: f.created_at, status: f.status ?? 'new',
      transferNumber: firstKid?.transfer_number ?? f.transfer_number,
      stopNumber: firstKid?.stop_number ?? f.stop_number,
      timeMorning: firstKid?.time_morning ?? f.time_morning,
      timeEvening: f.time_evening,
    });
  }

  // Подсчёт семей по табу
  const familyByTab: Record<string, Set<string>> = { ALL: new Set() };
  const badgeByTab: Record<string, number> = {};
  const seenNew = new Set<string>();

  rows.forEach(r => {
    if (!r.isFirstChild) return;
    familyByTab['ALL'].add(r.familyId);
    const tk = r.branchFilter;
    if (!familyByTab[tk]) familyByTab[tk] = new Set();
    familyByTab[tk].add(r.familyId);
    if (r.status === 'new' && !seenNew.has(r.familyId)) {
      seenNew.add(r.familyId);
      badgeByTab['ALL'] = (badgeByTab['ALL'] ?? 0) + 1;
      badgeByTab[tk] = (badgeByTab[tk] ?? 0) + 1;
    }
  });

  const counts: Record<string, number> = {};
  SCHOOL_TABS.forEach(t => { counts[t.key] = familyByTab[t.key]?.size ?? 0; });

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
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
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
          {familyCount} семей · {childCount} детей
        </span>
        <button onClick={load} style={{
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
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 8, padding: '8px 8px 8px 8px' }}>

        {/* ── SCHOOL SIDEBAR ── */}
        <div style={{
          width: 148,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          {/* Шапка ФИЛИАЛЫ */}
          <div style={{
            height: H_TOOLBAR,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            borderBottom: '1px solid var(--border)',
            background: '#fff',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
              textTransform: 'uppercase', letterSpacing: '0.7px',
            }}>
              Филиалы
            </span>
          </div>

          {/* Кнопка ВСЕ */}
          {(() => {
            const allTab = SCHOOL_TABS[0];
            const isActive = activeTab === 'ALL';
            const count = counts['ALL'] ?? 0;
            const badge = badgeByTab['ALL'] ?? 0;
            const hasBadge = badge > 0;
            return (
              <button
                onClick={() => setActiveTab('ALL')}
                style={{
                  height: H_HEADER,
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0 12px',
                  border: 'none',
                  borderLeft: isActive ? '3px solid #312E81' : '3px solid transparent',
                  borderBottom: '1px solid var(--border)',
                  background: isActive ? '#EEF2FF' : '#F8F9FF',
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'all 0.12s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: hasBadge ? '#EF4444' : '#10B981' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 700 : 600, color: isActive ? '#312E81' : 'var(--text)', textAlign: 'left' }}>
                  {allTab.label}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    color: hasBadge ? '#fff' : (isActive ? '#312E81' : 'var(--text-2)'),
                    background: hasBadge ? '#EF4444' : (isActive ? '#C7D2FE' : 'transparent'),
                    borderRadius: 10, padding: '1px 6px', minWidth: 20, textAlign: 'center',
                  }}>{count}</span>
                )}
              </button>
            );
          })()}

          {/* Список школ */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {SCHOOL_TABS.slice(1).map((t, idx) => {
              const isActive = activeTab === t.key;
              const count = counts[t.key] ?? 0;
              const badge = badgeByTab[t.key] ?? 0;
              const hasBadge = badge > 0;
              const isEven = idx % 2 === 0;

              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    width: '100%',
                    height: H_ROW,
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0 12px',
                    border: 'none',
                    borderLeft: isActive ? '3px solid #312E81' : '3px solid transparent',
                    borderBottom: '1px solid var(--border)',
                    background: isActive ? '#EEF2FF' : isEven ? '#fff' : '#F6F8FF',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: hasBadge ? '#EF4444' : '#10B981' }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? '#312E81' : 'var(--text)', textAlign: 'left' }}>
                    {t.label}
                  </span>
                  {count > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                      color: hasBadge ? '#fff' : (isActive ? '#312E81' : 'var(--text-2)'),
                      background: hasBadge ? '#EF4444' : (isActive ? '#C7D2FE' : 'transparent'),
                      borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center',
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── ТАБЛИЦА ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
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
            onRowPayment={async (row) => {
              const { data: f } = await supabase.from('families').select('*').eq('id', row.familyId).single();
              const { data: kids } = await supabase.from('children').select('*').eq('family_id', row.familyId);
              const firstKid = kids?.[0];
              if (f) setPaymentFamily({
                id: f.id,
                schoolCode: firstKid?.school_code ?? f.school_code,
                parentName: f.parent_name, phone: f.phone, phoneTelegram: f.phone_telegram,
                secondPhone: f.second_phone, contactName: f.contact_name, contactPhone: f.contact_phone,
                fullAddress: f.full_address ?? firstKid?.address,
                latitude: f.latitude ?? firstKid?.latitude,
                longitude: f.longitude ?? firstKid?.longitude,
                distanceKm: f.distance_km ?? firstKid?.distance_km,
                zone: normalizeZone(firstKid?.zone ?? f.zone, 'A') as any,
                vehicleType: firstKid?.vehicle_type ?? f.vehicle_type,
                vehicleLabel: f.vehicle_label,
                monthlyPrice: f.monthly_price ?? 0, comment: f.comment,
                createdAt: f.created_at, status: f.status ?? 'new',
                transferNumber: firstKid?.transfer_number ?? f.transfer_number,
                stopNumber: firstKid?.stop_number ?? f.stop_number,
                timeMorning: firstKid?.time_morning ?? f.time_morning,
                timeEvening: f.time_evening,
              });
            }}
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
      {showNewFamily && (
        <NewFamilyModal
          onClose={() => setShowNewFamily(false)}
        />
      )}
      {paymentFamily && (
        <PaymentModal
          family={paymentFamily}
          onClose={() => setPaymentFamily(null)}
          userRole="admin"
          userName="Кайрат"
        />
      )}
    </div>
  );
}
