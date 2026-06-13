import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Child, Family } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import { SCHOOL_NAME, VT_LABEL, ZONE_COLOR, normalizeZone, normalizeVehicle, zoneToNum } from './constants';
import { Section, ESelect, Tag, PriceCell, Spinner } from './DrawerUI';

interface KidState {
  id: string;
  childName: string;
  cls: string;
  vehicleType: string;
  zone: string;
  schoolCode: string;
  transferNumber?: number;
  selfExitAllowed: boolean;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
}

interface Props {
  children: Child[];
  loading: boolean;
  family: Family;
  editMode: boolean;
  isAdmin: boolean;
  onReload?: () => void;
}

export default function TabChildren({ children, loading, family, editMode, isAdmin, onReload }: Props) {
  const [kids, setKids] = useState<KidState[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setKids(children.map((k, i) => ({
      id: k.id,
      childName: k.childName,
      cls: k.class,
      vehicleType: normalizeVehicle(k.vehicleType),
      zone: normalizeZone(k.zone, family.zone),
      schoolCode: k.schoolCode || family.schoolCode,
      transferNumber: k.transferNumber,
      selfExitAllowed: k.selfExitAllowed,
      discountType: i > 0 ? 'percent' : 'none',
      discountValue: i > 0 ? 5 : 0,
    })));
  }, [children, family.zone, family.schoolCode]);

  if (loading) return <Spinner />;

  function getPrice(kid: KidState) {
    const base = getPriceByZone(kid.schoolCode as any, kid.zone as any, kid.vehicleType as any);
    const discount = kid.discountType === 'percent'
      ? Math.round(base * kid.discountValue / 100)
      : kid.discountType === 'fixed' ? kid.discountValue : 0;
    return { base, discount, final: Math.max(0, base - discount) };
  }

  const prices = kids.map(getPrice);
  const familyTotal = prices.reduce((s, p) => s + p.final, 0);

  async function saveKid(kid: KidState) {
    setSaving(kid.id);
    const { error } = await supabase.from('children').update({
      child_name:        kid.childName,
      class:             kid.cls,
      vehicle_type:      kid.vehicleType,
      zone:              zoneToNum(kid.zone),
      transfer_number:   kid.transferNumber,
      self_exit_allowed: kid.selfExitAllowed,
    }).eq('id', kid.id);
    setSaving(null);
    if (!error) {
      setMsg('Сохранено ✓');
      setTimeout(() => setMsg(''), 2000);
      onReload?.();
    } else {
      const errMsg = error?.message || error?.details || JSON.stringify(error);
      setMsg(`Ошибка: ${errMsg}`);
      console.error('saveKid error:', error);
      setTimeout(() => setMsg(''), 6000);
    }
  }

  async function deleteKid(kid: KidState) {
    if (!window.confirm(`Удалить ${kid.childName}?`)) return;
    await supabase.from('children').delete().eq('id', kid.id);
    setKids(ks => ks.filter(k => k.id !== kid.id));
    onReload?.();
  }

  return (
    <div>
      {msg && (
        <div style={{ background: msg.includes('Ошибка') ? '#FFEBEE' : '#E8F5E9', color: msg.includes('Ошибка') ? '#C62828' : '#2E7D32', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
          {msg}
        </div>
      )}

      <Section title={`Дети (${kids.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {kids.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-2)', fontSize: 13 }}>Детей нет</div>
          )}
          {kids.map((kid, i) => {
            const { base, discount, final } = prices[i];
            const setKid = (patch: Partial<KidState>) => setKids(ks => ks.map((k, j) => j === i ? { ...k, ...patch } : k));
            const isSavingThis = saving === kid.id;
            return (
              <div key={kid.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                      {i + 1}
                    </div>
                    <div>
                      {editMode
                        ? <input value={kid.childName} onChange={e => setKid({ childName: e.target.value })}
                            style={{ fontWeight: 700, fontSize: 14, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--text)', background: '#fff' }} />
                        : <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{kid.childName}</div>
                      }
                      {editMode
                        ? <input value={kid.cls} onChange={e => setKid({ cls: e.target.value })} placeholder="Класс"
                            style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px', color: 'var(--text-2)', marginTop: 3, width: 80 }} />
                        : <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginTop: 2 }}>{kid.cls} класс</div>
                      }
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{money(final)}</div>
                      {discount > 0 && <div style={{ fontSize: 10, fontWeight: 600, color: '#2E7D32' }}>−{money(discount)}</div>}
                    </div>
                    {editMode && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => saveKid(kid)} disabled={isSavingThis} style={{ padding: '5px 10px', background: isSavingThis ? '#C7D2FE' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: isSavingThis ? 'default' : 'pointer' }}>
                          {isSavingThis ? '...' : 'Сохр.'}
                        </button>
                        {isAdmin && (
                          <button onClick={() => deleteKid(kid)} style={{ padding: '5px 8px', background: '#FFEBEE', color: '#C62828', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tags / Edit */}
                {editMode ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <ESelect value={kid.vehicleType} onChange={v => setKid({ vehicleType: v })} options={[
                      { value: 'microbus', label: 'Микроавтобус' },
                      { value: 'minivan',  label: 'Минивэн' },
                      { value: 'sedan',    label: 'Седан' },
                    ]} />
                    <ESelect value={kid.zone} onChange={v => setKid({ zone: v })} options={[
                      { value: 'A', label: 'Зона A' },
                      { value: 'B', label: 'Зона B' },
                      { value: 'C', label: 'Зона C' },
                    ]} />
                    <ESelect value={kid.schoolCode} onChange={v => setKid({ schoolCode: v })}
                      options={Object.entries(SCHOOL_NAME).map(([code, name]) => ({ value: code, label: name }))}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                      <input type="checkbox" checked={kid.selfExitAllowed} onChange={e => setKid({ selfExitAllowed: e.target.checked })} />
                      Самовыход
                    </label>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <Tag label={VT_LABEL[kid.vehicleType] ?? kid.vehicleType} />
                    <Tag label={`Зона ${kid.zone}`} color={ZONE_COLOR[kid.zone]} />
                    <Tag label={SCHOOL_NAME[kid.schoolCode] ?? kid.schoolCode} />
                    {kid.transferNumber && <Tag label={`Трансфер №${kid.transferNumber}`} />}
                    {kid.selfExitAllowed && <Tag label="Самовыход ✓" color={{ bg: '#E8F5E9', color: '#2E7D32' }} />}
                  </div>
                )}

                {/* Price breakdown */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <PriceCell label="Базовая цена" value={money(base)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Скидка</div>
                      {editMode && isAdmin ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select value={kid.discountType} onChange={e => setKid({ discountType: e.target.value as any })}
                            style={{ padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)' }}>
                            <option value="none">Нет</option>
                            <option value="percent">%</option>
                            <option value="fixed">сом</option>
                          </select>
                          {kid.discountType !== 'none' && (
                            <input type="number" value={kid.discountValue} onChange={e => setKid({ discountValue: Number(e.target.value) })}
                              style={{ width: 64, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 500, color: discount > 0 ? '#2E7D32' : 'var(--text-2)' }}>
                          {kid.discountType === 'percent' ? `${kid.discountValue}%`
                            : kid.discountType === 'fixed' ? money(kid.discountValue) : '—'}
                        </div>
                      )}
                    </div>
                    <PriceCell label="Итого" value={money(final)} bold />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Family total */}
      <div style={{ background: 'var(--accent)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Итого за семью / месяц</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{kids.length} {kids.length === 1 ? 'ребёнок' : 'детей'}</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{money(familyTotal)}</div>
      </div>
    </div>
  );
}
