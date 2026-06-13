import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, MapPin, User, Users, ChevronRight } from 'lucide-react';
import { SchoolCode, Zone, VehicleType } from '../../types';
import { getFamilyPrice, getZoneByDistance, money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import { SCHOOL_NAME } from './constants';

const YANDEX_GEO_KEY = 'cfbdce72-0cdf-45ea-91e4-1b6e5826a090';

const SCHOOL_COORDS: Record<string, [number, number]> = {
  KINGS:   [42.8696, 74.5773],
  LIGHT:   [42.8572, 74.6061],
  BILIM:   [42.8540, 74.6050],
  AES:     [42.8766, 74.6025],
  KAS:     [42.8648, 74.5956],
  EPSILON: [42.8431, 74.5998],
  GENIUS:  [42.8713, 74.6312],
  GENIUS4: [42.8504, 74.5681],
  NOVA:    [42.8342, 74.5960],
  INDIGO:  [42.8680, 74.6120],
  ERUDIT:  [42.8600, 74.5883],
  TENSAY:  [42.8547, 74.6085],
  EDISON:  [42.8483, 74.6043],
};

function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function loadYmapsScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).ymaps) { resolve(); return; }
    const existing = document.getElementById('ymaps-script');
    if (existing) {
      // already loading — wait
      const wait = setInterval(() => {
        if ((window as any).ymaps) { clearInterval(wait); resolve(); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.id = 'ymaps-script';
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_GEO_KEY}&lang=ru_RU`;
    script.onload = () => {
      (window as any).ymaps.ready(() => resolve());
    };
    document.head.appendChild(script);
  });
}

interface KidForm {
  childName: string; cls: string; schoolCode: SchoolCode;
  vehicleType: VehicleType; zone: Zone; selfExitAllowed: boolean;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
  defaultSchool?: SchoolCode;
}

type Step = 'parent' | 'address' | 'children' | 'review';

export default function NewFamilyModal({ onClose, onCreated, defaultSchool = 'INDIGO' }: Props) {
  const [step, setStep]   = useState<Step>('parent');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Parent
  const [parentName, setParentName]     = useState('');
  const [phone, setPhone]               = useState('');
  const [phoneTg, setPhoneTg]           = useState('');
  const [secondPhone, setSecondPhone]   = useState('');
  const [contactName, setContactName]   = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Address
  const [address, setAddress]       = useState('');
  const [lat, setLat]               = useState<number | null>(null);
  const [lng, setLng]               = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [zone, setZone]             = useState<Zone>('A');
  const [geoLoading, setGeoLoading] = useState(false);

  // School & vehicle
  const [schoolCode, setSchoolCode]   = useState<SchoolCode>(defaultSchool);
  const [vehicleType, setVehicleType] = useState<VehicleType>('microbus');

  // Children
  const [kids, setKids] = useState<KidForm[]>([{
    childName: '', cls: '', schoolCode: defaultSchool,
    vehicleType: 'microbus', zone: 'A', selfExitAllowed: false,
  }]);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const ymapsRef        = useRef<any>(null);
  const mapRef          = useRef<any>(null);
  const placemarkRef    = useRef<any>(null);
  const mapInitialized  = useRef(false);

  // ─── Инициализация карты когда step === 'address' и div готов ───────────
  const initMap = useCallback(() => {
    if (mapInitialized.current) return;
    if (!mapContainerRef.current) return;
    const ymaps = (window as any).ymaps;
    if (!ymaps) return;
    ymapsRef.current = ymaps;

    const map = new ymaps.Map(mapContainerRef.current, {
      center: [42.8700, 74.5900],
      zoom: 12,
      controls: ['zoomControl', 'searchControl'],
    });
    mapRef.current = map;
    mapInitialized.current = true;

    map.events.add('click', (e: any) => {
      const coords = e.get('coords');
      placeMarker(coords[0], coords[1]);
      reverseGeocode(coords[0], coords[1]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Запускаем карту когда переходим на шаг address
  useEffect(() => {
    if (step !== 'address') return;
    // Ждём следующий тик чтобы div успел отрендериться
    const timer = setTimeout(async () => {
      await loadYmapsScript();
      initMap();
    }, 50);
    return () => clearTimeout(timer);
  }, [step, initMap]);

  function placeMarker(latV: number, lngV: number) {
    const ymaps = ymapsRef.current;
    if (!ymaps || !mapRef.current) return;
    if (placemarkRef.current) mapRef.current.geoObjects.remove(placemarkRef.current);
    const pm = new ymaps.Placemark([latV, lngV], {}, {
      preset: 'islands#violetDotIconWithCaption',
      iconColor: '#312E81',
    });
    mapRef.current.geoObjects.add(pm);
    placemarkRef.current = pm;
    setLat(latV);
    setLng(lngV);
    updateDist(latV, lngV);
  }

  function updateDist(latV: number, lngV: number) {
    const sc = SCHOOL_COORDS[schoolCode];
    if (!sc) return;
    const dist = Math.round(calcDistance(latV, lngV, sc[0], sc[1]) * 10) / 10;
    setDistanceKm(dist);
    const z = getZoneByDistance(dist);
    setZone(z);
    setKids(ks => ks.map(k => ({ ...k, zone: z })));
  }

  async function geocodeAddress(addr: string) {
    if (!addr.trim()) return;
    setGeoLoading(true);
    try {
      const resp = await fetch(
        `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_GEO_KEY}&geocode=${encodeURIComponent('Бишкек, ' + addr)}&format=json&results=1`
      );
      const data = await resp.json();
      const pos = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos;
      if (pos) {
        const [lngStr, latStr] = pos.split(' ');
        const latV = parseFloat(latStr);
        const lngV = parseFloat(lngStr);
        placeMarker(latV, lngV);
        if (mapRef.current) mapRef.current.setCenter([latV, lngV], 16);
      }
    } catch { /* ignore */ }
    setGeoLoading(false);
  }

  async function reverseGeocode(latV: number, lngV: number) {
    try {
      const resp = await fetch(
        `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_GEO_KEY}&geocode=${lngV},${latV}&format=json&results=1`
      );
      const data = await resp.json();
      const name = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.name;
      if (name) setAddress(name);
    } catch { /* ignore */ }
  }

  // При смене школы пересчитываем зону
  useEffect(() => {
    if (lat && lng) updateDist(lat, lng);
  }, [schoolCode]); // eslint-disable-line react-hooks/exhaustive-deps

  function addKid() {
    setKids(ks => [...ks, { childName: '', cls: '', schoolCode, vehicleType, zone, selfExitAllowed: false }]);
  }

  function removeKid(i: number) { setKids(ks => ks.filter((_, j) => j !== i)); }
  function setKid(i: number, patch: Partial<KidForm>) {
    setKids(ks => ks.map((k, j) => j === i ? { ...k, ...patch } : k));
  }

  const familyPrice = kids.length > 0
    ? getFamilyPrice(kids.map(k => ({ schoolCode: k.schoolCode, zone: k.zone, vehicleType: k.vehicleType })))
    : 0;

  async function handleCreate() {
    if (!parentName || !phone) { setError('Заполните ФИО и телефон'); return; }
    setSaving(true); setError('');

    const { data: fam, error: famErr } = await supabase.from('families').insert({
      parent_name: parentName, phone, phone_telegram: phoneTg || null,
      second_phone: secondPhone || null, contact_name: contactName || null,
      contact_phone: contactPhone || null, full_address: address,
      latitude: lat, longitude: lng, distance_km: distanceKm,
      zone: zone === 'A' ? 1 : zone === 'B' ? 2 : 3,
      school_code: schoolCode, vehicle_type: vehicleType,
      monthly_price: familyPrice, status: 'new',
    }).select().single();

    if (famErr || !fam) { setError('Ошибка создания'); setSaving(false); return; }
    const famId = fam.id;

    if (kids.length > 0) {
      await supabase.from('children').insert(kids.map(k => ({
        family_id: famId, child_name: k.childName, class: k.cls,
        school_code: k.schoolCode, vehicle_type: k.vehicleType,
        zone: k.zone === 'A' ? 1 : k.zone === 'B' ? 2 : 3,
        self_exit_allowed: k.selfExitAllowed,
      })));
    }

    await supabase.from('payments').insert([
      { family_id: famId, school_code: schoolCode, month: 0, year: 2026, amount: familyPrice, manager_amount: 0, accountant_status: 'Не оплачено', fact_amount: 0, is_frozen: false, has_receipt: false },
      { family_id: famId, school_code: schoolCode, month: 9, year: 2026, amount: familyPrice, manager_amount: 0, accountant_status: 'Не оплачено', fact_amount: 0, is_frozen: false, has_receipt: false },
    ]);

    setSaving(false);
    onCreated();
    onClose();
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'parent', label: 'Родитель' }, { key: 'address', label: 'Адрес' },
    { key: 'children', label: 'Дети' },   { key: 'review', label: 'Итог' },
  ];
  const stepIdx = steps.findIndex(s => s.key === step);

  const ZONE_INFO: Record<Zone, { color: string; label: string }> = {
    A: { color: '#065F46', label: 'до 3.3 км' },
    B: { color: '#4338CA', label: '3.3–6.3 км' },
    C: { color: '#1D4ED8', label: 'свыше 6.3 км' },
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 700, maxHeight: '92vh',
        background: '#fff', zIndex: 501, borderRadius: 16,
        boxShadow: '0 20px 60px rgba(49,46,129,0.22)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{ background: 'var(--accent)', padding: '18px 22px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Новая заявка</div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
              <X size={16} />
            </button>
          </div>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {steps.map((s, i) => {
              const done = i < stepIdx; const active = i === stepIdx;
              return (
                <React.Fragment key={s.key}>
                  <div onClick={() => done && setStep(s.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: done ? 'pointer' : 'default' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700, background: done ? '#A5B4FC' : active ? '#fff' : 'rgba(255,255,255,0.2)', color: done ? 'var(--accent)' : active ? 'var(--accent)' : 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#fff' : 'rgba(255,255,255,0.55)' }}>{s.label}</span>
                  </div>
                  {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.2)', margin: '0 10px' }} />}
                </React.Fragment>
              );
            })}
          </div>

          {/* Tab line */}
          <div style={{ height: 14 }} />
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', background: '#FAFBFF' }}>

          {error && (
            <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 600 }}>{error}</div>
          )}

          {/* ── STEP: PARENT ── */}
          {step === 'parent' && (
            <div>
              <SectionTitle icon={<User size={14} />}>Данные родителя</SectionTitle>
              <FormGrid>
                <FormField label="ФИО *" span={2}><Input value={parentName} onChange={setParentName} placeholder="Иванова Мария Петровна" /></FormField>
                <FormField label="Телефон *"><Input value={phone} onChange={setPhone} placeholder="0700 000 000" /></FormField>
                <FormField label="Telegram"><Input value={phoneTg} onChange={setPhoneTg} placeholder="@username" /></FormField>
                <FormField label="Второй телефон" span={2}><Input value={secondPhone} onChange={setSecondPhone} placeholder="Необязательно" /></FormField>
              </FormGrid>
              <SectionTitle icon={<User size={14} />} style={{ marginTop: 20 }}>Доп. контакт (необязательно)</SectionTitle>
              <FormGrid>
                <FormField label="Имя"><Input value={contactName} onChange={setContactName} placeholder="Имя" /></FormField>
                <FormField label="Телефон"><Input value={contactPhone} onChange={setContactPhone} placeholder="Телефон" /></FormField>
              </FormGrid>
            </div>
          )}

          {/* ── STEP: ADDRESS ── */}
          {step === 'address' && (
            <div>
              <SectionTitle icon={<MapPin size={14} />}>Адрес и маршрут</SectionTitle>
              <FormGrid>
                <FormField label="Школа" span={2}>
                  <select value={schoolCode} onChange={e => setSchoolCode(e.target.value as SchoolCode)} style={selectStyle}>
                    {Object.entries(SCHOOL_NAME).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </FormField>
                <FormField label="Тип транспорта" span={2}>
                  <select value={vehicleType} onChange={e => setVehicleType(e.target.value as VehicleType)} style={selectStyle}>
                    <option value="microbus">Микроавтобус</option>
                    <option value="minivan">Минивэн (9 500 сом/мес)</option>
                    <option value="sedan">Седан (10 500 сом/мес)</option>
                  </select>
                </FormField>
              </FormGrid>

              {/* Адрес + кнопка геокодинга */}
              <div style={{ marginBottom: 10 }}>
                <Label>Адрес — введите и нажмите «Найти» или кликните на карте</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && geocodeAddress(address)}
                    placeholder="ул. Баба-Ата, 7Д"
                    style={{ ...inputBaseStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => geocodeAddress(address)}
                    disabled={geoLoading}
                    style={{ padding: '0 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: geoLoading ? 0.7 : 1 }}
                  >
                    {geoLoading ? '...' : '📍 Найти'}
                  </button>
                </div>
              </div>

              {/* ── КАРТА ── div всегда в DOM когда step===address */}
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12, background: '#e8eaf0' }}>
                <div ref={mapContainerRef} style={{ height: 300, width: '100%' }} />
              </div>

              {/* Результат */}
              {distanceKm ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <InfoTile label="Расстояние" value={`${distanceKm} км`} />
                  <InfoTile label="Зона" value={`Зона ${zone} · ${ZONE_INFO[zone].label}`} color={ZONE_INFO[zone].color} />
                  <InfoTile label="Тариф / месяц" value={money(familyPrice)} color="var(--accent)" />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--text-2)', fontSize: 12 }}>
                  Кликните на карте или введите адрес чтобы определить зону
                </div>
              )}

              {lat && lng && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>
                  📌 {lat.toFixed(6)}, {lng.toFixed(6)}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: CHILDREN ── */}
          {step === 'children' && (
            <div>
              <SectionTitle icon={<Users size={14} />}>Дети</SectionTitle>
              {kids.map((kid, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>
                      Ребёнок {i + 1}{i > 0 ? ' (−5% скидка)' : ''}
                    </div>
                    {kids.length > 1 && (
                      <button onClick={() => removeKid(i)} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Удалить</button>
                    )}
                  </div>
                  <FormGrid>
                    <FormField label="ФИО ребёнка" span={2}><Input value={kid.childName} onChange={v => setKid(i, { childName: v })} placeholder="Иванов Иван" /></FormField>
                    <FormField label="Класс"><Input value={kid.cls} onChange={v => setKid(i, { cls: v })} placeholder="5А" /></FormField>
                    <FormField label="Школа">
                      <select value={kid.schoolCode} onChange={e => setKid(i, { schoolCode: e.target.value as SchoolCode })} style={selectStyle}>
                        {Object.entries(SCHOOL_NAME).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Транспорт" span={2}>
                      <select value={kid.vehicleType} onChange={e => setKid(i, { vehicleType: e.target.value as VehicleType })} style={selectStyle}>
                        <option value="microbus">Микроавтобус</option>
                        <option value="minivan">Минивэн</option>
                        <option value="sedan">Седан</option>
                      </select>
                    </FormField>
                    <FormField label="Самовыход" span={2}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={kid.selfExitAllowed} onChange={e => setKid(i, { selfExitAllowed: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Разрешён самовыход</span>
                      </label>
                    </FormField>
                  </FormGrid>
                </div>
              ))}
              <button onClick={addKid} style={{ width: '100%', padding: '10px', background: '#EEF2FF', color: 'var(--accent)', border: '1.5px dashed #A5B4FC', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + Добавить ребёнка
              </button>
            </div>
          )}

          {/* ── STEP: REVIEW ── */}
          {step === 'review' && (
            <div>
              <SectionTitle icon={<ChevronRight size={14} />}>Итог заявки</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ReviewCard label="Родитель">
                  <ReviewRow k="ФИО" v={parentName} />
                  <ReviewRow k="Телефон" v={phone} />
                  {phoneTg && <ReviewRow k="Telegram" v={phoneTg} />}
                  {contactName && <ReviewRow k="Контакт" v={`${contactName}  ${contactPhone}`} />}
                </ReviewCard>
                <ReviewCard label="Адрес">
                  <ReviewRow k="Адрес" v={address || '—'} />
                  {lat && lng && <ReviewRow k="Координаты" v={`${lat.toFixed(5)}, ${lng.toFixed(5)}`} />}
                  {distanceKm && <ReviewRow k="Расстояние" v={`${distanceKm} км · Зона ${zone}`} />}
                  <ReviewRow k="Школа" v={SCHOOL_NAME[schoolCode] ?? schoolCode} />
                  <ReviewRow k="Транспорт" v={{ microbus: 'Микроавтобус', minivan: 'Минивэн', sedan: 'Седан' }[vehicleType]} />
                </ReviewCard>
                <ReviewCard label={`Дети (${kids.length})`}>
                  {kids.map((k, i) => <ReviewRow key={i} k={k.childName || `Ребёнок ${i+1}`} v={`${k.cls} кл. · ${SCHOOL_NAME[k.schoolCode]}`} />)}
                </ReviewCard>
                <div style={{ background: 'var(--accent)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Начисление в месяц</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Депозит + Сентябрь = {money(familyPrice * 2)}</div>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{money(familyPrice)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0, background: '#fff' }}>
          {stepIdx > 0 && (
            <button onClick={() => setStep(steps[stepIdx - 1].key)} style={{ padding: '10px 20px', background: '#F3F4F6', color: 'var(--text)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Назад</button>
          )}
          {step !== 'review'
            ? <button onClick={() => setStep(steps[stepIdx + 1].key)} style={{ flex: 1, padding: '11px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Далее →</button>
            : <button onClick={handleCreate} disabled={saving} style={{ flex: 1, padding: '11px', background: '#065F46', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Создаём...' : '✓ Создать заявку'}
              </button>
          }
        </div>
      </div>
    </>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

const inputBaseStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, color: 'var(--text)', background: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputBaseStyle, cursor: 'pointer' };

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputBaseStyle} />;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{children}</div>;
}
function SectionTitle({ icon, children, style }: { icon?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, ...style }}><span style={{ color: 'var(--accent)' }}>{icon}</span><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</span></div>;
}
function FormGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 4 }}>{children}</div>;
}
function FormField({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return <div style={{ gridColumn: span === 2 ? 'span 2' : undefined }}><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>{children}</div>;
}
function InfoTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div style={{ background: '#F0F4FF', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div><div style={{ fontSize: 14, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div></div>;
}
function ReviewCard({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}><div style={{ background: 'var(--accent)', padding: '7px 14px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div><div style={{ padding: '10px 14px' }}>{children}</div></div>;
}
function ReviewRow({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', gap: 8, marginBottom: 5 }}><span style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 100 }}>{k}</span><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{v}</span></div>;
}
