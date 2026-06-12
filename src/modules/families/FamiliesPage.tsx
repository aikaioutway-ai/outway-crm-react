import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Family } from '../../types';
import { money } from '../../utils/pricing';
import {
  ZONE_COLOR, VT_LABEL, normalizeZone, getBranchShort, getBranchFilter
} from './constants';
import { SCHOOL_TABS } from '../../core/bars/SchoolSidebar';
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
  { key: 'branchName',     label: 'Филиал',       type: 'text',   category: 'Клиент',  width: 160, visible: false },
  { key: 'vehicleType',    label: 'Тип ТС',       type: 'select', category: 'Маршрут', width: 100, visible: false },
  { key: 'transferNumber', label: '№ Трансфера',  type: 'text',   category: 'Маршрут', width: 100, visible: false },
  { key: 'familyId',       label: 'ID семьи',     type: 'text',   category: 'Система', width: 120, visible: false },
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
        const zone         = normalizeZone(f.zone, 'A');
        const vt           = f.vehicle_type ?? 'microbus';
        const kids         = childMap[f.id] ?? [];
        const items        = kids.length > 0 ? kids : [null];
        const branchName   = f.branch_name ?? '';
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

  // Фильтрация — ALL показывает всё без фильтра
  const filtered = rows.filter(r => {
    if (activeTab !== 'ALL') {
      const tab = SCHOOL_TABS.find(t => t.key === activeTab);
      if (tab) {
        if (tab.branches.length > 0) {
          if (!tab.branches.includes(r.branchName)) return false;
        } else if (tab.codes.length > 0) {
          if (['ING', 'ING_P', 'ING_W'].includes(activeTab)) {
            if (r.branchFilter !== activeTab) return false;
          } else {
            if (!tab.codes.includes(r.schoolCode)) return false;
          }
        }
      }
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        r.parentName.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.childName.toLowerCase().includes(q) ||
        r.streetAddress.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const familyCount = new Set(filtered.filter(r => r.isFirstChild).map(r => r.familyId)).size;
  const childCount  = filtered.length;

  // Высота тулбара таблицы (Фильтр/Сортировка/Свойства) ≈ 44px
  // Шапка (поиск) ≈ 52px
  // Итого отступ сверху для SchoolSidebar = 52px (шапка) + 44px (тулбар) = 96px
  const HEADER_H  = 52;  // шапка с поиском
  const TOOLBAR_H = 44;  // тулбар таблицы

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── ШАПКА — тёмный фон ── */}
      <div style={{
        background: '#312E81',
        padding: '0 16px',
        height: HEADER_H,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(199,210,254,0.6)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Имя, телефон, ребёнок, адрес..."
            style={{
              width: '100%', padding: '8px 10px 8px 32px',
              border: '1px solid rgba(199,210,254,0.25)',
              borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.1)', outline: 'none', color: '#fff',
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(199,210,254,0.85)', whiteSpace: 'nowrap' }}>
          {familyCount} семей · {childCount} детей
        </span>
        <button onClick={load} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          borderRadius: 'var(--radius)', border: '1px solid rgba(199,210,254,0.3)',
          background: 'rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500,
          color: 'rgba(199,210,254,0.9)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <RefreshCw size={13} /> Обновить
        </button>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px',
          border: 'none', borderRadius: 'var(--radius)',
          background: '#fff', color: '#312E81', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <Plus size={14} /> Новая заявка
        </button>
      </div>

      {/* ── КОНТЕНТ: school sidebar + таблица ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 10, padding: '10px 10px 10px 10px' }}>

        {/* ── SCHOOL SIDEBAR — отдельная карточка ── */}
        <div style={{
          width: 150,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          borderRadius: 10,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(49,46,129,0.06)',
        }}>
          {/* Заголовок — высота совпадает с тулбаром таблицы */}
          <div style={{
            height: TOOLBAR_H,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            borderBottom: '2px solid var(--border)',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
            }}>
              Филиалы
            </span>
          </div>

          {/* Список школ — чередующийся фон */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {SCHOOL_TABS.map((tab, idx) => {
              const isActive = activeTab === tab.key;
              const count    = counts[tab.key] ?? 0;
              const badge    = badgeByTab[tab.key] ?? 0;
              const hasBadge = badge > 0;
              const isEven   = idx % 2 === 0;

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 12px',
                    border: 'none',
                    borderLeft: isActive ? '3px solid #312E81' : '3px solid transparent',
                    // Чередующийся фон
                    background: isActive
                      ? '#EEF2FF'
                      : isEven ? '#fff' : '#F8F9FF',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  {/* Круглая точка */}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: hasBadge ? '#EF4444' : '#10B981',
                  }} />

                  <span style={{
                    flex: 1, fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#312E81' : 'var(--text)',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {tab.label}
                  </span>

                  {count > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                      color: hasBadge ? '#fff' : (isActive ? '#312E81' : 'var(--text-2)'),
                      background: hasBadge ? '#EF4444' : (isActive ? '#C7D2FE' : 'transparent'),
                      borderRadius: 10,
                      padding: (hasBadge || isActive) ? '1px 6px' : '0',
                      minWidth: 20, textAlign: 'center',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── ТАБЛИЦА — отдельная карточка ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 10,
          border: '1px solid var(--border)',
          boxShadow: '0 1px 4px rgba(49,46,129,0.06)',
          background: '#fff',
        }}>
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
