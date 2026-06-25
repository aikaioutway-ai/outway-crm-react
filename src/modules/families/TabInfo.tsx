import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Family } from '../../types';
import { SCHOOL_NAME } from './constants';
import { Section } from './DrawerUI';
import { formatName, formatPhone } from '../../utils/format';

interface Props {
  family: Family;
  saving: boolean;
  onSave: (f: Family) => void;
}

export default function TabInfo({ family, saving, onSave }: Props) {
  const [form, setForm] = useState({ ...family });
  useEffect(() => { setForm({ ...family }); }, [family]);

  const patch = (updates: Partial<Family>) => {
    setForm(current => ({ ...current, ...updates }));
  };
  const commit = (updates: Partial<Family> = {}) => {
    const next = { ...form, ...updates };
    setForm(next);
    onSave(next);
  };

  const hasCoords = Boolean(family.latitude && family.longitude);
  const mapsUrl = hasCoords
    ? `https://yandex.ru/maps/?pt=${family.longitude},${family.latitude}&z=16&l=map`
    : form.fullAddress
      ? `https://yandex.ru/maps/?text=${encodeURIComponent(form.fullAddress)}`
      : null;

  return (
    <div>
      <Section title="Контакты и адрес">
        <div style={cardStyle}>
          <Field label="Родитель" tone="soft">
            <input
              className="family-card-control"
              value={form.parentName}
              onChange={e => patch({ parentName: e.target.value })}
              onBlur={e => commit({ parentName: formatName(e.currentTarget.value) })}
              style={notionControlStyle}
            />
          </Field>
          <Field label="Телефон" tone="soft">
            <input
              className="family-card-control"
              value={form.phone}
              onChange={e => patch({ phone: e.target.value })}
              onBlur={e => commit({ phone: formatPhone(e.currentTarget.value) })}
              style={notionControlStyle}
            />
          </Field>
          <Field label="Телефон 2" tone="soft">
            <input
              className="family-card-control"
              value={form.secondPhone ?? ''}
              onChange={e => patch({ secondPhone: e.target.value })}
              onBlur={e => commit({ secondPhone: formatPhone(e.currentTarget.value) })}
              placeholder="—"
              style={notionControlStyle}
            />
          </Field>
          <Spacer />
          <Field label="Доп. контакт" tone="clear">
            <input
              className="family-card-control"
              value={form.contactName ?? ''}
              onChange={e => patch({ contactName: e.target.value })}
              onBlur={e => commit({ contactName: formatName(e.currentTarget.value) })}
              placeholder="—"
              style={notionControlStyle}
            />
          </Field>
          <Field label="Телефон контакта" tone="clear">
            <input
              className="family-card-control"
              value={form.contactPhone ?? ''}
              onChange={e => patch({ contactPhone: e.target.value })}
              onBlur={e => commit({ contactPhone: formatPhone(e.currentTarget.value) })}
              placeholder="—"
              style={notionControlStyle}
            />
          </Field>
          <Spacer />
          <Field label="Школа" tone="soft">
            <select
              className="family-card-control"
              value={form.schoolCode}
              onChange={e => commit({ schoolCode: e.currentTarget.value as Family['schoolCode'] })}
              style={notionSelectStyle}
            >
              {Object.entries(SCHOOL_NAME).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Зона" tone="soft">
            <select
              className="family-card-control"
              value={form.zone}
              onChange={e => commit({ zone: e.currentTarget.value as Family['zone'] })}
              style={notionSelectStyle}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Field>
          <Field label="Трансфер" tone="soft">
            <input
              className="family-card-control"
              type="number"
              value={form.transferNumber ?? ''}
              onChange={e => patch({ transferNumber: e.target.value ? Number(e.target.value) : undefined })}
              onBlur={e => commit({ transferNumber: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
              placeholder="—"
              style={notionControlStyle}
            />
          </Field>
          <Spacer />
          <Field label="Дата заявки" tone="clear">
            <span style={readonlyValueStyle}>
              {form.createdAt ? new Date(form.createdAt).toLocaleDateString('ru-RU') : '—'}
            </span>
          </Field>
          {hasCoords && (
            <Field label="Координаты" tone="clear">
              <span style={readonlyValueStyle}>
                {family.latitude?.toFixed(6)}, {family.longitude?.toFixed(6)}
              </span>
            </Field>
          )}
          {mapsUrl && (
            <Field label="На карте" tone="clear">
              <a href={mapsUrl} target="_blank" rel="noreferrer" style={mapLinkStyle}>
                <MapPin size={14} /> Открыть Яндекс Карты
              </a>
            </Field>
          )}
          {saving && <div style={savingStyle}>Сохраняем...</div>}
        </div>
      </Section>
    </div>
  );
}

function Field({ label, children, tone = 'soft' }: { label: string; children: React.ReactNode; tone?: 'soft' | 'clear' }) {
  return (
    <label style={fieldStyle(tone)}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Spacer() {
  return <div style={spacerStyle} />;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E8EEF1',
  borderRadius: 10,
  padding: '8px 12px',
};

function fieldStyle(tone: 'soft' | 'clear'): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '150px minmax(0, 1fr)',
    gap: 12,
    alignItems: 'center',
    minHeight: 36,
    borderBottom: '1px solid #F0F3F5',
    borderRadius: 7,
    padding: '0 8px',
    background: tone === 'soft' ? '#F8FAFC' : '#FFF8F1',
  };
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 750,
  color: '#8A94A3',
};

const notionControlStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  border: '1px solid transparent',
  borderRadius: 7,
  background: 'transparent',
  color: 'var(--text)',
  padding: '0 8px',
  minHeight: 30,
  fontSize: 13,
  fontWeight: 650,
  outline: 'none',
};

const notionSelectStyle: React.CSSProperties = {
  ...notionControlStyle,
  background: 'transparent',
  color: 'var(--text)',
};

const readonlyValueStyle: React.CSSProperties = {
  padding: '0 8px',
  fontSize: 13,
  fontWeight: 650,
  color: 'var(--text)',
};

const mapLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  width: 'fit-content',
  borderRadius: 7,
  background: '#F7F9FB',
  color: '#374151',
  padding: '5px 8px',
  fontSize: 12,
  fontWeight: 800,
  textDecoration: 'none',
};

const savingStyle: React.CSSProperties = {
  marginTop: 8,
  borderRadius: 8,
  background: '#D7EEEE',
  color: '#237F81',
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 750,
};

const spacerStyle: React.CSSProperties = {
  height: 10,
  borderBottom: '1px solid #F0F3F5',
};
