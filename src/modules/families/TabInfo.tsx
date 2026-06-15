import React, { useEffect, useState } from 'react';
import { MapPin, Pencil, Save, X } from 'lucide-react';
import { Family } from '../../types';
import { SCHOOL_NAME, VT_LABEL } from './constants';
import { Section } from './DrawerUI';
import { formatPhone } from '../../utils/format';

interface Props {
  family: Family;
  saving: boolean;
  onSave: (f: Family) => void;
}

export default function TabInfo({ family, saving, onSave }: Props) {
  const [form, setForm] = useState({ ...family });
  const [localEdit, setLocalEdit] = useState(false);
  useEffect(() => { setForm({ ...family }); }, [family]);

  const set = (key: keyof Family) => (value: string) => setForm(current => ({ ...current, [key]: value }));

  const hasCoords = Boolean(family.latitude && family.longitude);
  const mapsUrl = hasCoords
    ? `https://yandex.ru/maps/?pt=${family.longitude},${family.latitude}&z=16&l=map`
    : family.fullAddress
      ? `https://yandex.ru/maps/?text=${encodeURIComponent(family.fullAddress)}`
      : null;

  if (localEdit) {
    return (
      <div>
        <Section
          title="Редактирование родителя"
          action={(
            <button onClick={() => { setLocalEdit(false); setForm({ ...family }); }} style={{ ...smallBtnStyle, background: '#F3F4F6', color: 'var(--text)' }}>
              <X size={13} /> Закрыть
            </button>
          )}
        >
          <div style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
              <Field label="ФИО родителя">
                <input value={form.parentName} onChange={e => set('parentName')(e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <Field label="Основной телефон">
                <input value={form.phone} onChange={e => set('phone')(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Второй телефон">
                <input value={form.secondPhone ?? ''} onChange={e => set('secondPhone')(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Доп. контакт">
                <input value={form.contactName ?? ''} onChange={e => set('contactName')(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Телефон доп. контакта">
                <input value={form.contactPhone ?? ''} onChange={e => set('contactPhone')(e.target.value)} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 135px 135px', gap: 8, marginBottom: 8 }}>
              <Field label="Школа">
                <select value={form.schoolCode} onChange={e => set('schoolCode')(e.target.value)} style={inputStyle}>
                  {Object.entries(SCHOOL_NAME).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Зона">
                <select value={form.zone} onChange={e => set('zone')(e.target.value)} style={inputStyle}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </Field>
              <Field label="Транспорт">
                <select value={form.vehicleType} onChange={e => set('vehicleType')(e.target.value)} style={inputStyle}>
                  <option value="microbus">Микроавтобус</option>
                  <option value="minivan">Минивэн</option>
                  <option value="sedan">Седан</option>
                </select>
              </Field>
            </div>

            <Field label="Адрес">
              <input value={form.fullAddress} onChange={e => set('fullAddress')(e.target.value)} style={inputStyle} />
            </Field>

            <div style={{ marginTop: 8 }}>
              <Field label="Комментарий">
                <textarea
                  value={form.comment ?? ''}
                  onChange={e => setForm(current => ({ ...current, comment: e.target.value }))}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 54 }}
                />
              </Field>
            </div>

            <button onClick={() => { onSave(form); setLocalEdit(false); }} disabled={saving} style={saveBtnStyle}>
              <Save size={15} /> {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div>
      <Section
        title="Карточка родителя"
        action={(
          <button onClick={() => setLocalEdit(true)} style={smallBtnStyle}>
            <Pencil size={13} /> Редактировать
          </button>
        )}
      >
        <div style={summaryGridStyle}>
          <SummaryTile label="Родитель" value={family.parentName || '—'} />
          <SummaryTile label="Школа" value={family.branchShort || SCHOOL_NAME[family.schoolCode] || family.schoolCode} sub={family.branchName} />
          <SummaryTile label="Зона" value={`Зона ${family.zone}`} sub={family.distanceKm ? `${family.distanceKm} км` : undefined} />
          <SummaryTile label="Транспорт" value={VT_LABEL[family.vehicleType] ?? family.vehicleType} />
        </div>
      </Section>

      <Section title="Контакты">
        <div style={cardStyle}>
          <InfoRow label="Основной телефон" value={formatPhone(family.phone)} />
          <InfoRow label="Telegram" value={family.phoneTelegram ? 'Да' : '—'} />
          <InfoRow label="Второй телефон" value={family.secondPhone ? formatPhone(family.secondPhone) : '—'} />
          {(family.contactName || family.contactPhone) && (
            <>
              <InfoRow label="Доп. контакт" value={family.contactName || '—'} />
              <InfoRow label="Телефон доп. контакта" value={family.contactPhone ? formatPhone(family.contactPhone) : '—'} />
            </>
          )}
        </div>
      </Section>

      <Section title="Адрес и маршрут">
        <div style={cardStyle}>
          <InfoRow label="Адрес" value={family.fullAddress || '—'} wide />
          {hasCoords && (
            <InfoRow label="Координаты" value={`${family.latitude?.toFixed(6)}, ${family.longitude?.toFixed(6)}`} />
          )}
          {mapsUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span style={rowLabelStyle}>На карте</span>
              <a href={mapsUrl} target="_blank" rel="noreferrer" style={mapLinkStyle}>
                <MapPin size={14} /> Открыть Яндекс Карты
              </a>
            </div>
          )}
        </div>
      </Section>

      {(family.comment || family.createdAt) && (
        <Section title="Прочее">
          <div style={cardStyle}>
            <InfoRow label="Дата заявки" value={family.createdAt ? new Date(family.createdAt).toLocaleDateString('ru-RU') : '—'} />
            {family.comment && <InfoRow label="Комментарий" value={family.comment} wide />}
          </div>
        </Section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={tileStyle}>
      <div style={tileLabelStyle}>{label}</div>
      <div style={tileValueStyle}>{value}</div>
      {sub && <div style={tileSubStyle}>{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: wide ? '140px 1fr' : '140px minmax(0, 1fr)', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={rowLabelStyle}>{label}</div>
      <div style={rowValueStyle}>{value}</div>
    </div>
  );
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
};

const tileStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  minHeight: 58,
};

const tileLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: 'var(--text-2)',
  textTransform: 'uppercase',
  letterSpacing: 0.45,
};

const tileValueStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 14,
  fontWeight: 800,
  color: 'var(--text)',
  lineHeight: 1.25,
};

const tileSubStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 10,
  color: 'var(--text-2)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: 'var(--text-2)',
  textTransform: 'uppercase',
  letterSpacing: 0.45,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 12,
  color: 'var(--text)',
  background: '#fff',
  boxSizing: 'border-box',
};

const saveBtnStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 10,
  border: 'none',
  borderRadius: 8,
  background: 'var(--accent)',
  color: '#fff',
  padding: '9px 12px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 8,
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--text-2)',
  textTransform: 'uppercase',
  letterSpacing: 0.35,
};

const rowValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text)',
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const mapLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  fontWeight: 800,
  color: 'var(--accent)',
  textDecoration: 'none',
};

const smallBtnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 7,
  background: 'var(--accent)',
  color: '#fff',
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
};
