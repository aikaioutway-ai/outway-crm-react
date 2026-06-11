import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Family, SchoolCode } from '../../types';
import { money } from '../../utils/pricing';
import { schoolByCode } from '../../utils/schools';
import SchoolBar from '../../core/bars/SchoolBar';
import StatusBadge from '../../core/cards/StatusBadge';
import { Search, Plus, RefreshCw } from 'lucide-react';

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

  const ZONE_STYLE: Record<string, { bg: string; color: string }> = {
    A: { bg: '#E8F5E9', color: '#2E7D32' },
    B: { bg: '#EDE7F6', color: '#4527A0' },
    C: { bg: '#E3F2FD', color: '#1565C0' },
  };

  const VT_LABEL: Record<string, string> = {
    microbus: 'Микроавтобус',
    minivan:  'Минивэн',
    sedan:    'Седан',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* School tabs */}
      <SchoolBar active={school} onChange={setSchool} badges={badges} />

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', background: '#fff',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-2)',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Имя, телефон, адрес..."
            style={{
              width: '100%', padding: '7px 10px 7px 30px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              fontSize: 13, background: 'var(--bg)', outline: 'none',
              color: 'var(--text)',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {filtered.length} семей
        </span>

        <button
          onClick={load}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', background: '#fff',
            fontSize: 13, color: 'var(--text-2)',
          }}
        >
          <RefreshCw size={13} />
          Обновить
        </button>

        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 16px', border: 'none',
          borderRadius: 'var(--radius)', background: 'var(--accent)',
          color: '#fff', fontSize: 13, fontWeight: 600,
        }}>
          <Plus size={14} />
          Новая заявка
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-2)' }}>
            Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-2)' }}>
            Заявок не найдено
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#fff', borderBottom: '2px solid var(--border)' }}>
                {['Родитель', 'Школа', 'Адрес', 'Зона', 'Транспорт', 'Сумма/мес', 'Статус'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 12, color: 'var(--text-2)',
                    fontWeight: 600, whiteSpace: 'nowrap',
                    background: '#fff',
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
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{f.parentName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{f.phone}</div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>
                    {schoolByCode(f.schoolCode)?.name ?? f.schoolCode}
                  </td>
                  <td style={{ padding: '10px 16px', maxWidth: 200 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.fullAddress}
                    </div>
                    {f.distanceKm && (
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{f.distanceKm} км</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 9px',
                      borderRadius: 4, fontSize: 12, fontWeight: 700,
                      background: ZONE_STYLE[f.zone]?.bg,
                      color: ZONE_STYLE[f.zone]?.color,
                    }}>
                      Зона {f.zone}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>
                    {VT_LABEL[f.vehicleType] ?? f.vehicleType}
                    {f.transferNumber && (
                      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>  №{f.transferNumber}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                      {money(f.monthlyPrice)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
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
