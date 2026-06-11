import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Family, SchoolCode } from '../../types';
import { money } from '../../utils/pricing';

import SchoolBar from '../../core/bars/SchoolBar';
import StatusBadge from '../../core/cards/StatusBadge';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import FamilyDrawer from './FamilyDrawer';
import { Search, Plus, RefreshCw } from 'lucide-react';

const SHORT_SCHOOL: Record<string, string> = {
  KINGS: 'Kings', LIGHT: 'Light', BILIM: 'Bilim',
  AES: 'AES', KAS: 'KAS', EPSILON: 'Eps',
  GENIUS: 'Genius', GENIUS4: 'Gen4', NOVA: 'Nova',
  INDIGO: 'Indigo', ERUDIT: 'Erudit', TENSAY: 'Tensay',
  TENSAI: 'Tensay', EDISON: 'Edison',
};

const ZONE_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#E8F5E9', color: '#1B5E20' },
  B: { bg: '#EDE7F6', color: '#311B92' },
  C: { bg: '#E3F2FD', color: '#0D47A1' },
};

const VT_LABEL: Record<string, string> = {
  microbus: 'Микроавтобус', bus: 'Микроавтобус',
  minibus: 'Микроавтобус', 'mini-bus': 'Микроавтобус',
  minivan: 'Минивэн', sedan: 'Седан', car: 'Седан',
};

interface FamilyRow extends Family {
  schoolLabel: string;
  zoneLabel: string;
  vehicleLabel2: string;
}

const COLUMNS: ColumnDef<FamilyRow>[] = [
  {
    key: 'parentName',
    label: 'Родитель',
    type: 'text',
    width: 200,
    render: (val, row) => (
      <div style={{ lineHeight: '1.35' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{val}</div>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>{row.phone}</div>
      </div>
    ),
    getValue: (row) => row.parentName,
  },
  {
    key: 'schoolLabel',
    label: 'Школа',
    type: 'select',
    width: 90,
    render: (val) => (
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{val}</span>
    ),
  },
  {
    key: 'fullAddress',
    label: 'Адрес',
    type: 'text',
    width: 220,
    render: (val, row) => (
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
          {val}
        </div>
        {row.distanceKm && (
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginTop: 2 }}>
            {row.distanceKm} км
          </div>
        )}
      </div>
    ),
  },
  {
    key: 'zoneLabel',
    label: 'Зона',
    type: 'select',
    width: 90,
    render: (_, row) => (
      <span style={{
        display: 'inline-block', padding: '3px 10px',
        borderRadius: 6, fontSize: 12, fontWeight: 700,
        background: ZONE_STYLE[row.zone]?.bg,
        color: ZONE_STYLE[row.zone]?.color,
      }}>
        Зона {row.zone}
      </span>
    ),
    getValue: (row) => row.zone,
  },
  {
    key: 'vehicleLabel2',
    label: 'Транспорт',
    type: 'select',
    width: 130,
    render: (val, row) => (
      <div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{val}</span>
        {row.transferNumber && (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginLeft: 4 }}>
            №{row.transferNumber}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'monthlyPrice',
    label: 'Сумма/мес',
    type: 'currency',
    width: 120,
    render: (val) => (
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
        {money(val)}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Статус',
    type: 'badge',
    width: 100,
    render: (val) => <StatusBadge status={val} size="sm" />,
  },
  {
    key: 'phone',
    label: 'Телефон',
    type: 'text',
    width: 130,
    visible: false,
  },
  {
    key: 'distanceKm',
    label: 'Дистанция (км)',
    type: 'number',
    width: 120,
    visible: false,
  },
  {
    key: 'createdAt',
    label: 'Дата создания',
    type: 'date',
    width: 130,
    visible: false,
    render: (val) => (
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
        {val ? new Date(val).toLocaleDateString('ru-RU') : '—'}
      </span>
    ),
  },
];

export default function FamiliesPage() {
  const [families, setFamilies] = useState<FamilyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<SchoolCode | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FamilyRow | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('families')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      const mapped: FamilyRow[] = data.map((r: any) => {
        const zone = r.zone === 1 ? 'A' : r.zone === 2 ? 'B' : 'C';
        const vt = r.vehicle_type ?? 'microbus';
        return {
          id:             r.id,
          schoolCode:     r.school_code,
          parentName:     r.parent_name,
          phone:          r.phone,
          phoneTelegram:  r.phone_telegram,
          secondPhone:    r.second_phone,
          contactName:    r.contact_name,
          contactPhone:   r.contact_phone,
          fullAddress:    r.full_address,
          latitude:       r.latitude,
          longitude:      r.longitude,
          distanceKm:     r.distance_km,
          zone,
          vehicleType:    vt,
          vehicleLabel:   r.vehicle_label,
          monthlyPrice:   r.monthly_price ?? 0,
          comment:        r.comment,
          createdAt:      r.created_at,
          status:         r.status ?? 'new',
          transferNumber: r.transfer_number,
          stopNumber:     r.stop_number,
          timeMorning:    r.time_morning,
          timeEvening:    r.time_evening,
          schoolLabel:    SHORT_SCHOOL[r.school_code] ?? r.school_code,
          zoneLabel:      `Зона ${zone}`,
          vehicleLabel2:  VT_LABEL[vt] ?? vt,
        };
      });
      setFamilies(mapped);
    }
    setLoading(false);
  }

  const filtered = families.filter(f => {
    if (school !== 'ALL' && f.schoolCode !== school) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        f.parentName.toLowerCase().includes(q) ||
        f.phone.includes(q) ||
        f.fullAddress.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const badges: Partial<Record<SchoolCode | 'ALL', number>> = {};
  families.forEach(f => {
    if (f.status === 'new') {
      badges[f.schoolCode] = (badges[f.schoolCode] ?? 0) + 1;
      badges['ALL'] = (badges['ALL'] ?? 0) + 1;
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <SchoolBar active={school} onChange={setSchool} badges={badges} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', background: '#fff',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-2)',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Имя, телефон, адрес..."
            style={{
              width: '100%', padding: '8px 10px 8px 32px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              fontSize: 13, fontWeight: 500, background: 'var(--bg)',
              outline: 'none', color: 'var(--text)',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={load}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', background: '#fff',
            fontSize: 13, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} />
          Обновить
        </button>

        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 18px', border: 'none',
          borderRadius: 'var(--radius)', background: 'var(--accent)',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={14} />
          Новая заявка
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        <DataTable<FamilyRow>
          columns={COLUMNS}
          data={filtered}
          rowKey="id"
          storageKey="families_table"
          loading={loading}
          emptyText="Заявок не найдено"
          onRowClick={(row) => setSelected(row)}
          onRowDelete={(row) => console.log('delete family', row.id)}
          onRowEdit={(row) => setSelected(row)}
        />
      </div>

      {selected && (
        <FamilyDrawer
          family={selected}
          onClose={() => setSelected(null)}
        />
      )}

    </div>
  );
}
