import React, { useEffect, useState } from 'react';
import { Family, Child } from '../../types';
import { VT_LABEL } from './constants';
import { Section, ESelect, SaveBtn, Spinner } from './DrawerUI';

interface KidLogistic {
  id: string;
  childName: string;
  cls: string;
  vehicleType: string;
  transferNumber?: number;
  stopNumber?: number;
  timeMorning?: string;
}

interface Props {
  family: Family;
  children: Child[];
  loading: boolean;
  editMode: boolean;
  saving: boolean;
  onSave: (f: Family) => void;
  onSaveChildren: (kids: KidLogistic[]) => Promise<void>;
}

// Генерируем массив номеров трансферов 1-30 и остановок 1-20
const TRANSFER_OPTIONS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: `Трансфер №${i + 1}` }));
const STOP_OPTIONS     = Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `Остановка ${i + 1}` }));

export default function TabLogistics({ family, children, loading, editMode, saving, onSave, onSaveChildren }: Props) {
  const [form, setForm] = useState({ ...family });
  const [kids, setKids] = useState<KidLogistic[]>([]);
  const [savingKids, setSavingKids] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setForm({ ...family }); }, [family]);

  useEffect(() => {
    setKids(children.map(c => ({
      id: c.id,
      childName: c.childName,
      cls: c.class,
      vehicleType: c.vehicleType,
      transferNumber: (c as any).transferNumber,
      stopNumber: (c as any).stopNumber,
      timeMorning: (c as any).timeMorning,
    })));
  }, [children]);

  if (loading) return <Spinner />;

  const set = (k: keyof Family) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  function setKid(i: number, patch: Partial<KidLogistic>) {
    setKids(ks => ks.map((k, j) => j === i ? { ...k, ...patch } : k));
  }

  async function handleSave() {
    setSavingKids(true);
    await onSaveChildren(kids);
    onSave(form);
    setSavingKids(false);
    setMsg('Сохранено ✓');
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <div>
      {msg && (
        <div style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {msg}
        </div>
      )}

      {/* Тип транспорта для семьи */}
      <Section title="Транспорт семьи">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FieldBox label="Тип транспорта">
            {editMode
              ? <ESelect value={form.vehicleType} onChange={set('vehicleType')} options={[
                  { value: 'microbus', label: 'Микроавтобус' },
                  { value: 'minivan',  label: 'Минивэн' },
                  { value: 'sedan',    label: 'Седан' },
                ]} />
              : <ValueText>{VT_LABEL[family.vehicleType] ?? family.vehicleType}</ValueText>
            }
          </FieldBox>
          <FieldBox label="Адрес">
            <ValueText muted>{family.fullAddress}</ValueText>
          </FieldBox>
        </div>
      </Section>

      {/* Логистика по каждому ребёнку */}
      <Section title={`Маршрут по детям (${kids.length})`}>
        {kids.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-2)', fontSize: 13 }}>Детей нет</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {kids.map((kid, i) => (
            <div key={kid.id} style={{
              background: '#fff', borderRadius: 12, border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              {/* Kid header */}
              <div style={{
                background: 'var(--accent)', padding: '10px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{kid.childName}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>
                    {kid.cls} кл. · {VT_LABEL[kid.vehicleType] ?? kid.vehicleType}
                  </div>
                </div>
                {/* Quick badges */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {kid.transferNumber && (
                    <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                      №{kid.transferNumber}
                    </span>
                  )}
                  {kid.stopNumber && (
                    <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                      ост.{kid.stopNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Kid fields */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <FieldBox label="Трансфер">
                    {editMode
                      ? <ESelect
                          value={kid.transferNumber ? String(kid.transferNumber) : ''}
                          onChange={v => setKid(i, { transferNumber: v ? Number(v) : undefined })}
                          options={[{ value: '', label: 'Не назначен' }, ...TRANSFER_OPTIONS]}
                        />
                      : <ValueText>{kid.transferNumber ? `Трансфер №${kid.transferNumber}` : '—'}</ValueText>
                    }
                  </FieldBox>
                  <FieldBox label="Остановка">
                    {editMode
                      ? <ESelect
                          value={kid.stopNumber ? String(kid.stopNumber) : ''}
                          onChange={v => setKid(i, { stopNumber: v ? Number(v) : undefined })}
                          options={[{ value: '', label: 'Не назначена' }, ...STOP_OPTIONS]}
                        />
                      : <ValueText>{kid.stopNumber ? `Остановка ${kid.stopNumber}` : '—'}</ValueText>
                    }
                  </FieldBox>
                  <FieldBox label="Время утро">
                    {editMode
                      ? <input
                          type="time"
                          value={kid.timeMorning ?? ''}
                          onChange={e => setKid(i, { timeMorning: e.target.value })}
                          style={{
                            width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                            borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
                            boxSizing: 'border-box',
                          }}
                        />
                      : <ValueText accent>{kid.timeMorning || '—'}</ValueText>
                    }
                  </FieldBox>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {editMode && (
        <SaveBtn onClick={handleSave} saving={saving || savingKids} label="Сохранить логистику" />
      )}
    </div>
  );
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ValueText({ children, muted, accent }: { children: React.ReactNode; muted?: boolean; accent?: boolean }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: accent ? 700 : 600,
      color: accent ? 'var(--accent)' : muted ? 'var(--text-2)' : 'var(--text)',
      padding: '5px 0',
    }}>
      {children}
    </div>
  );
}
