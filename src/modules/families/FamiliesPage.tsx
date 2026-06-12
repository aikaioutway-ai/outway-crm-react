import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { SchoolCode, Family } from '../../types';
import { money } from '../../utils/pricing';
import { SCHOOL_SHORT, VT_LABEL, ZONE_COLOR, normalizeZone } from './constants';
import FamilyDrawer from './FamilyDrawer';
import SchoolBar from '../../core/bars/SchoolBar';
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
  schoolLabel: string;
  fullAddress: string;
  distanceKm: number | null;
  zone: string;
  vehicleType: string;
  vehicleLabel: string;
  monthlyPrice: number;
  status: string;
  transferNumber: string | null;
}

const COLUMNS: ColumnDef<ChildRow>[] = [
  {
    key: 'parentName', label: 'Родитель', type: 'text', category: 'Клиент', width: 200,
    render: (val, row) => row.isFirstChild ? (
      <div style={{ lineHeight: '1.35' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{val}</div>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>{row.phone}</div>
      </div>
    ) : (
      <div style={{ fontSize: 11, color: 'var(--text-2)', paddingLeft: 10 }}>└ семья #{row.familyId.slice(-4)}</div>
    ),
    getValue: (row) => row.parentName,
  },
  {
    key: 'childName', label: 'Ребёнок', type: 'text', width: 160,
    render: (val, row) => (
      <div style={{ lineHeight: '1.35' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{val || '—'}</div>
        {row.childClass && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{row.childClass} класс</div>}
      </div>
    ),
  },
  {
    key: 'schoolLabel', label: 'Школа', type: 'select', category: 'Клиент', width: 90,
    render: (val) => <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{val}</span>,
  },
  {
    key: 'fullAddress', label: 'Адрес', type: 'text', category: 'Адрес', width: 200,
    render: (val, row) => row.isFirstChild ? (
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{val}</div>
        {row.distanceKm && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{row.distanceKm} км</div>}
      </div>
    ) : <span style={{ color: 'var(--text-2)', fontSize: 12 }}>—</span>,
    getValue: (row) => row.fullAddress,
  },
  {
    key: 'zone', label: 'Зона', type: 'select', width: 90,
    render: (val) => (
      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: ZONE_COLOR[val]?.bg, color: ZONE_COLOR[val]?.color }}>
        Зона {val}
      </span>
    ),
  },
  {
    key: 'vehicleLabel', label: 'Транспорт', type: 'select', category: 'Маршрут', width: 130,
    render: (val, row) => (
      <div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{val}</span>
        {row.transferNumber && <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 4 }}>№{row.transferNumber}</span>}
      </div>
    ),
  },
  {
    key: 'monthlyPrice', label: 'Сумма/мес', type: 'currency', category: 'Финансы', width: 120,
    render: (val) => <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{money(val)}</span>,
  },
  {
    key: 'status', label: 'Статус', type: 'badge', category: 'Клиент', width: 100,
    render: (val) => <StatusBadge status={val} size="sm" />,
  },
  { key: 'phone',      label: 'Телефон',        type: 'text',   category: 'Клиент', width: 130, visible: false },
  { key: 'distanceKm', label: 'Дистанция (км)', type: 'number', category: 'Адрес',  width: 120, visible: false },
];

export default function FamiliesPage() {
  const [rows, setRows]   = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [school, setSchool]   = useState<SchoolCode | 'ALL'>('ALL');
  const [search, setSearch]   = useState('');
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
        const zone     = normalizeZone(f.zone, 'A');
        const vt       = f.vehicle_type ?? 'microbus';
        const kids     = childMap[f.id] ?? [];
        const items    = kids.length > 0 ? kids : [null];

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
            schoolLabel:    SCHOOL_SHORT[f.school_code] ?? f.school_code,
            fullAddress:    f.full_address,
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

  const filtered = rows.filter(r => {
    if (school !== 'ALL' && r.schoolCode !== school) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.parentName.toLowerCase().includes(q) || r.phone.includes(q) ||
             r.childName.toLowerCase().includes(q) || r.fullAddress.toLowerCase().includes(q);
    }
    return true;
  });

  const badges: Partial<Record<SchoolCode | 'ALL', number>> = {};
  const seen = new Set<string>();
  rows.forEach(r => {
    if (r.status === 'new' && !seen.has(r.familyId)) {
      seen.add(r.familyId);
      badges[r.schoolCode as SchoolCode] = (badges[r.schoolCode as SchoolCode] ?? 0) + 1;
      badges['ALL'] = (badges['ALL'] ?? 0) + 1;
    }
  });

  const familyCount = new Set(filtered.map(r => r.familyId)).size;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <SchoolBar active={school} onChange={setSchool} badges={badges} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: '#fff', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Имя, телефон, ребёнок, адрес..."
            style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, background: 'var(--bg)', outline: 'none', color: 'var(--text)' }} />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{familyCount} семей · {filtered.length} детей</span>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Обновить
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={14} /> Новая заявка
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        <DataTable<ChildRow>
          columns={COLUMNS} data={filtered} rowKey="rowId"
          storageKey="families_table" loading={loading}
          emptyText="Заявок не найдено" groupColorKey="familyIndex"
          onRowClick={(row) => openFamily(row.familyId)}
          onRowDelete={(row) => console.log('delete', row.rowId)}
          onRowEdit={(row) => console.log('edit', row.rowId)}
        />
      </div>

      {selectedFamily && (
        <FamilyDrawer family={selectedFamily} onClose={() => setSelectedFamily(null)} userRole="admin" userName="Кайрат" />
      )}
    </div>
  );
}
