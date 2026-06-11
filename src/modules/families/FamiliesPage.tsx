import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Family, SchoolCode } from '../../types';
import { money } from '../../utils/pricing';
import { schoolByCode } from '../../utils/schools';
import SchoolBar from '../../core/bars/SchoolBar';
import StatusBadge from '../../core/cards/StatusBadge';
import { Search, Plus, RefreshCw } from 'lucide-react';

const SHORT_SCHOOL: Record<string, string> = {
  KINGS:   'Kings',   LIGHT:   'Light',  BILIM:   'Bilim',
  AES:     'AES',     KAS:     'KAS',    EPSILON: 'Eps',
  GENIUS:  'Genius',  GENIUS4: 'Gen4',   NOVA:    'Nova',
  INDIGO:  'Indigo',  ERUDIT:  'Erudit', TENSAY:  'Tensay',
  TENSAI:  'Tensay',  EDISON:  'Edison',
};

const ZONE_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#E8F5E9', color: '#1B5E20' },
  B: { bg: '#EDE7F6', color: '#311B92' },
  C: { bg: '#E3F2FD', color: '#0D47A1' },
};

const VT_LABEL: Record<string, string> = {
  microbus:    'Микроавтобус',
  bus:         'Микроавтобус',
  minibus:     'Микроавтобус',
  'mini-bus':  'Микроавтобус',
  minivan:     'Минивэн',
  sedan:       'Седан',
  car:         'Седан',
};

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<SchoolCode | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('families')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      const mapped: Family[] = data.map((r: any) => ({
        id:            r.id,
        schoolCode:    r.school_code,
        parentName:    r.parent_name,
        phone:         r.phone,
        phoneTelegram: r.phone_telegram,
        secondPhone:   r.second_phone,
        contactName:   r.contact_name,
        contactPhone:  r.contact_phone,
        fullAddress:   r.full_address,
        latitude:      r.latitude,
        longitude:     r.longitude,
        distanceKm:    r.distance_km,
        zone:          r.zone === 1 ? 'A' : r.zone === 2 ? 'B' : 'C',
        vehicleType:   r.vehicle_type ?? 'microbus',
        vehicleLabel:  r.vehicle_label,
        monthlyPrice:  r.monthly_price ?? 0,
        comment:       r.comment,
        createdAt:     r.created_at,
        status:        r.status ?? 'new',
        transferNumber: r.transfer_number,
        stopNumber:    r.stop_number,
        timeMorning:   r.time_morning,
        timeEvening:   r.time_evening,
      }));
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

      {/* School tabs */}
      <SchoolBar active={school} onChange={setSchool} badges={badges} />

      {/* Toolbar */}
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

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          {filtered.length} семей
        </span>

        <button
          onClick={load}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', background: '#fff',
            fontSize: 13, fontWeight: 500, color: 'var(--text-2)',
          }}
        >
          <RefreshCw size={13} />
          Обновить
        </button>

        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 18px', border: 'none',
          borderRadius: 'var(--radius)', background: 'var(--accent)',
          color: '#fff', fontSize: 13, fontWeight: 700,
        }}>
          <Plus size={14} />
          Новая заявка
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-2)', fontWeight: 500 }}>
            Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-2)', fontWeight: 500 }}>
            Заявок не найдено
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#fff', borderBottom: '2px solid var(--border)' }}>
                {['Родитель', 'Школа', 'Адрес', 'Зона', 'Транспорт', 'Сумма/мес', 'Статус'].map(h => (
                  <th key={h} style={{
                    padding: '11px 16px', textAlign: 'left',
                    fontSize: 12, color: 'var(--text-2)',
                    fontWeight: 700, whiteSpace: 'nowrap',
                    background: '#fff', letterSpacing: 0.3,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => (
                <tr
                  key={f.id}
                  style={{
                    background: i % 2 === 0 ? '#fff' : 'var(--bg)',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#EEF2FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : 'var(--bg)')}
                >
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{f.parentName}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginTop: 2 }}>{f.phone}</div>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {SHORT_SCHOOL[f.schoolCode] ?? f.schoolCode}
                  </td>
                  <td style={{ padding: '11px 16px', maxWidth: 220 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.fullAddress}
                    </div>
                    {f.distanceKm && (
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginTop: 2 }}>{f.distanceKm} км</div>
                    )}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px',
                      borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: ZONE_STYLE[f.zone]?.bg,
                      color: ZONE_STYLE[f.zone]?.color,
                    }}>
                      Зона {f.zone}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {VT_LABEL[f.vehicleType] ?? f.vehicleType}
                    {f.transferNumber && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>  №{f.transferNumber}</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                      {money(f.monthlyPrice)}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <StatusBadge status={f.status} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
