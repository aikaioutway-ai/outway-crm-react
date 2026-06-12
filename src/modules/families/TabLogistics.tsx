import React, { useEffect, useState } from 'react';
import { Family, Child } from '../../types';
import { VT_LABEL } from './constants';
import { Section, Field, EInput, ESelect, SaveBtn, Spinner } from './DrawerUI';

interface Props {
  family: Family;
  children: Child[];
  loading: boolean;
  editMode: boolean;
  saving: boolean;
  onSave: (f: Family) => void;
}

export default function TabLogistics({ family, children, loading, editMode, saving, onSave }: Props) {
  const [form, setForm] = useState({ ...family });
  useEffect(() => { setForm({ ...family }); }, [family]);
  const set = (k: keyof Family) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <Spinner />;

  return (
    <div>
      <Section title="Маршрут семьи">
        <Field label="Тип транспорта" value={VT_LABEL[family.vehicleType] ?? family.vehicleType}
          editMode={editMode}
          inputEl={<ESelect value={form.vehicleType} onChange={set('vehicleType')} options={[
            { value: 'microbus', label: 'Микроавтобус' },
            { value: 'minivan',  label: 'Минивэн' },
            { value: 'sedan',    label: 'Седан' },
          ]} />}
        />
        <Field label="Номер трансфера" value={family.transferNumber ? `№${family.transferNumber}` : null}
          editMode={editMode}
          inputEl={<EInput value={String(form.transferNumber ?? '')} type="number" onChange={v => setForm(f => ({ ...f, transferNumber: Number(v) || undefined }))} />}
        />
        <Field label="Номер остановки" value={family.stopNumber ? `Остановка ${family.stopNumber}` : null}
          editMode={editMode}
          inputEl={<EInput value={String(form.stopNumber ?? '')} type="number" onChange={v => setForm(f => ({ ...f, stopNumber: Number(v) || undefined }))} />}
        />
        <Field label="Время утро"  value={family.timeMorning}  editMode={editMode} inputEl={<EInput value={form.timeMorning ?? ''}  onChange={set('timeMorning')} />} />
        <Field label="Время вечер" value={family.timeEvening}  editMode={editMode} inputEl={<EInput value={form.timeEvening ?? ''} onChange={set('timeEvening')} />} />
        <Field label="Адрес" value={family.fullAddress} />
      </Section>

      {editMode && <SaveBtn onClick={() => onSave(form)} saving={saving} label="Сохранить логистику" />}

      {children.length > 0 && (
        <Section title="Дети в маршруте">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['ФИО', 'Тип ТС', 'Трансфер', 'Остановка', 'Утро'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((kid, i) => (
                <tr key={kid.id} style={{ background: i % 2 === 0 ? '#fff' : 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    <div>{kid.childName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{kid.class} кл.</div>
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, color: 'var(--text)' }}>{VT_LABEL[kid.vehicleType] ?? kid.vehicleType}</td>
                  <td style={{ padding: '10px', fontSize: 12, color: 'var(--text)' }}>{kid.transferNumber ? `№${kid.transferNumber}` : '—'}</td>
                  <td style={{ padding: '10px', fontSize: 12, color: 'var(--text)' }}>{family.stopNumber ?? '—'}</td>
                  <td style={{ padding: '10px', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{family.timeMorning ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
