import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Child, Family } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import { ZONE_COLOR, VT_LABEL } from './constants';
import { Section, Tag, PriceCell, Spinner } from './DrawerUI';

interface KidState {
  id: string;
  childName: string;
  cls: string;
  transferNumber: string;
  selfExitAllowed: boolean;
}

interface Props {
  children: Child[];
  loading: boolean;
  family: Family;
  editMode: boolean;
  isAdmin: boolean;
  onReload?: () => void;
}

export default function TabChildren({ children, loading, family, isAdmin, onReload }: Props) {
  const [kids, setKids] = useState<KidState[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setKids(children.map(k => ({
      id: String(k.id),
      childName: k.childName,
      cls: k.class,
      transferNumber: k.transferNumber ? String(k.transferNumber) : '',
      selfExitAllowed: k.selfExitAllowed,
    })));
  }, [children]);

  if (loading) return <Spinner />;

  // Цена берётся из family (зона/транспорт/школа хранятся там)
  function getPrice(index: number) {
    const base = getPriceByZone(family.schoolCode as any, family.zone as any, family.vehicleType as any);
    const discount = index > 0 ? Math.round(base * 0.05) : 0;
    return { base, discount, final: base - discount };
  }

  const familyTotal = kids.reduce((s, _, i) => s + getPrice(i).final, 0);

  async function saveKid(kid: KidState) {
    setSaving(kid.id);
    const { error } = await supabase.from('children').update({
      child_name:        kid.childName,
      class:             kid.cls,
      self_exit_allowed: kid.selfExitAllowed ? 'Да' : 'Нет',
      transfer_number:   kid.transferNumber ? Number(kid.transferNumber) : null,
    }).eq('id', Number(kid.id));
    setSaving(null);
    if (!error) {
      setMsg('Сохранено ✓');
      setTimeout(() => setMsg(''), 2000);
      onReload?.();
    } else {
      setMsg(`Ошибка: ${error.message}`);
      console.error('saveKid error:', error);
      setTimeout(() => setMsg(''), 6000);
    }
  }

  async function deleteKid(kid: KidState) {
    if (!window.confirm(`Удалить ${kid.childName}?`)) return;
    await supabase.from('children').delete().eq('id', Number(kid.id));
    setKids(ks => ks.filter(k => k.id !== kid.id));
    onReload?.();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 13, color: 'var(--text)', background: '#fff',
    boxSizing: 'border-box',
  };

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.includes('Ошибка') ? '#FFEBEE' : '#E8F5E9',
          color: msg.includes('Ошибка') ? '#C62828' : '#2E7D32',
          borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600,
        }}>
          {msg}
        </div>
      )}

      {/* Инфо о тарифе семьи */}
      <div style={{ background: '#EEF2FF', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
          <b style={{ color: 'var(--text)' }}>Школа:</b> {family.schoolCode}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
          <b style={{ color: 'var(--text)' }}>Зона:</b> {family.zone}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
          <b style={{ color: 'var(--text)' }}>Транспорт:</b> {VT_LABEL[family.vehicleType] ?? family.vehicleType}
        </div>
      </div>

      <Section title={`Дети (${kids.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {kids.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-2)', fontSize: 13 }}>Детей нет</div>
          )}
          {kids.map((kid, i) => {
            const { base, discount, final } = getPrice(i);
            const setKid = (patch: Partial<KidState>) =>
              setKids(ks => ks.map((k, j) => j === i ? { ...k, ...patch } : k));
            const isSavingThis = saving === kid.id;

            return (
              <div key={kid.id} style={{
                background: '#fff', borderRadius: 10, padding: '14px 16px',
                border: '1px solid var(--border)',
              }}>
                {/* Шапка карточки */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--accent-l)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{kid.childName}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{money(final)}</div>
                      {discount > 0 && <div style={{ fontSize: 10, fontWeight: 600, color: '#2E7D32' }}>−{money(discount)} (5%)</div>}
                    </div>
                    {isAdmin && (
                      <button onClick={() => deleteKid(kid)} style={{
                        padding: '5px 8px', background: '#FFEBEE', color: '#C62828',
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                      }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Поля редактирования — всегда открыты */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Имя ребёнка</div>
                    <input
                      value={kid.childName}
                      onChange={e => setKid({ childName: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Класс</div>
                    <input
                      value={kid.cls}
                      onChange={e => setKid({ cls: e.target.value })}
                      placeholder="Например: 3А"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>№ Трансфера</div>
                    <input
                      value={kid.transferNumber}
                      onChange={e => setKid({ transferNumber: e.target.value })}
                      placeholder="—"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={kid.selfExitAllowed}
                        onChange={e => setKid({ selfExitAllowed: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Самовыход</span>
                    </label>
                  </div>
                </div>

                {/* Теги */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Tag label={VT_LABEL[family.vehicleType] ?? family.vehicleType} />
                  <Tag label={`Зона ${family.zone}`} color={ZONE_COLOR[family.zone]} />
                  {kid.selfExitAllowed && <Tag label="Самовыход ✓" color={{ bg: '#E8F5E9', color: '#2E7D32' }} />}
                </div>

                {/* Цена */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 16 }}>
                  <PriceCell label="Базовая цена" value={money(base)} />
                  <PriceCell label="Скидка" value={discount > 0 ? `−${money(discount)}` : '—'} />
                  <PriceCell label="Итого" value={money(final)} bold />
                </div>

                {/* Кнопка сохранить */}
                <button
                  onClick={() => saveKid(kid)}
                  disabled={isSavingThis}
                  style={{
                    marginTop: 12, width: '100%', padding: '9px 0',
                    background: isSavingThis ? '#C7D2FE' : 'var(--accent)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, fontWeight: 700, cursor: isSavingThis ? 'default' : 'pointer',
                  }}
                >
                  {isSavingThis ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Итого семья */}
      <div style={{
        background: 'var(--accent)', borderRadius: 10, padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Итого за семью / месяц</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            {kids.length} {kids.length === 1 ? 'ребёнок' : 'детей'}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{money(familyTotal)}</div>
      </div>
    </div>
  );
}
