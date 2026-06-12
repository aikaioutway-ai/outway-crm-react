import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Family } from '../../types';
import { SCHOOL_NAME, VT_LABEL } from './constants';
import { Section, Field, EInput, ESelect, SaveBtn } from './DrawerUI';

interface Props {
  family: Family;
  editMode: boolean;
  saving: boolean;
  onSave: (f: Family) => void;
}

export default function TabInfo({ family, editMode, saving, onSave }: Props) {
  const [form, setForm] = useState({ ...family });
  useEffect(() => { setForm({ ...family }); }, [family]);

  const set = (k: keyof Family) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const hasCoords = family.latitude && family.longitude;
  const mapsUrl = hasCoords
    ? `https://yandex.ru/maps/?pt=${family.longitude},${family.latitude}&z=16&l=map`
    : family.fullAddress
    ? `https://yandex.ru/maps/?text=${encodeURIComponent(family.fullAddress)}`
    : null;

  const zoneDesc = family.zone === 'A' ? 'до 3.3 км' : family.zone === 'B' ? '3.3–6.3 км' : 'свыше 6.3 км';
  const statusLabel = { active: 'Активный', new: 'Новый', inactive: 'Неактивный', rejected: 'Отказ' }[family.status] ?? family.status;

  return (
    <div>
      <Section title="Родитель">
        <Field label="ФИО"            value={form.parentName}         editMode={editMode} inputEl={<EInput value={form.parentName}         onChange={set('parentName')} />} />
        <Field label="Телефон"        value={form.phone}              editMode={editMode} inputEl={<EInput value={form.phone}              onChange={set('phone')} />} />
        <Field label="Telegram"       value={form.phoneTelegram ?? ''} editMode={editMode} inputEl={<EInput value={form.phoneTelegram ?? ''} onChange={set('phoneTelegram')} />} />
        <Field label="Второй телефон" value={form.secondPhone ?? ''}  editMode={editMode} inputEl={<EInput value={form.secondPhone ?? ''}  onChange={set('secondPhone')} />} />
      </Section>

      {(editMode || form.contactName || form.contactPhone) && (
        <Section title="Дополнительный контакт">
          <Field label="Имя"     value={form.contactName ?? ''}  editMode={editMode} inputEl={<EInput value={form.contactName ?? ''}  onChange={set('contactName')} />} />
          <Field label="Телефон" value={form.contactPhone ?? ''} editMode={editMode} inputEl={<EInput value={form.contactPhone ?? ''} onChange={set('contactPhone')} />} />
        </Section>
      )}

      <Section title="Адрес и маршрут">
        <Field label="Адрес" value={form.fullAddress} editMode={editMode} inputEl={<EInput value={form.fullAddress} onChange={set('fullAddress')} />} />
        {hasCoords && (
          <Field label="Координаты" value={`${family.latitude?.toFixed(6)}, ${family.longitude?.toFixed(6)}`} />
        )}
        {mapsUrl && (
          <div style={{ display: 'flex', marginBottom: 10, gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', minWidth: 160, flexShrink: 0 }}>На карте</span>
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
              <MapPin size={14} /> Открыть Яндекс Карты
            </a>
          </div>
        )}
        <Field label="Расстояние"    value={family.distanceKm ? `${family.distanceKm} км` : null} />
        <Field label="Зона"          value={`Зона ${family.zone} (${zoneDesc})`} />
        <Field label="Тип транспорта" value={VT_LABEL[family.vehicleType] ?? family.vehicleType}
          editMode={editMode}
          inputEl={<ESelect value={form.vehicleType} onChange={set('vehicleType')} options={[
            { value: 'microbus', label: 'Микроавтобус' },
            { value: 'minivan',  label: 'Минивэн' },
            { value: 'sedan',    label: 'Седан' },
          ]} />}
        />
      </Section>

      <Section title="Прочее">
        <Field label="Школа" value={SCHOOL_NAME[form.schoolCode] ?? form.schoolCode}
          editMode={editMode}
          inputEl={<ESelect value={form.schoolCode} onChange={set('schoolCode')}
            options={Object.entries(SCHOOL_NAME).map(([code, name]) => ({ value: code, label: name }))}
          />}
        />
        <Field label="Статус" value={statusLabel}
          editMode={editMode}
          inputEl={<ESelect value={form.status ?? 'new'} onChange={set('status')} options={[
            { value: 'new',      label: 'Новый' },
            { value: 'active',   label: 'Активный' },
            { value: 'inactive', label: 'Неактивный' },
            { value: 'rejected', label: 'Отказ' },
          ]} />}
        />
        <Field label="Дата заявки" value={family.createdAt ? new Date(family.createdAt).toLocaleDateString('ru-RU') : null} />
        {(editMode || form.comment) && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>Комментарий</div>
            {editMode
              ? <textarea value={form.comment ?? ''} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', resize: 'vertical', boxSizing: 'border-box' }} />
              : <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.5, fontWeight: 500 }}>{form.comment}</div>
            }
          </div>
        )}
      </Section>

      {editMode && <SaveBtn onClick={() => onSave(form)} saving={saving} />}
    </div>
  );
}
