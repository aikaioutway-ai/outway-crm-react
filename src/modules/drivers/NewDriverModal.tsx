import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { VehicleType } from '../../types';
import { createV2Driver, V2BranchOption } from '../../services/crmV2Service';
import { VT_LABEL } from '../families/constants';

const DISTRICTS = [
  'Микрорайоны',
  'Центр',
  'Ак-Ордо',
  'Арча-Бешик',
  'Аламедин 1',
  'Дордой',
  'Маевка',
  'Тунгуч',
  'Кок-Жар',
  'Джал',
  'Кара-Жыгач',
  'Пригородный',
  'Новопавловка',
  'Новопакровка',
  'с. Манас',
  'ГЭС 2',
  'Киргизия',
  'Политех',
  'Рабочий',
];

const TRANSFER_NUMBERS = Array.from({ length: 20 }, (_, index) => index + 1);
const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'microbus', label: VT_LABEL.microbus ?? 'Микроавтобус' },
  { value: 'minivan', label: VT_LABEL.minivan ?? 'Минивэн' },
  { value: 'sedan', label: VT_LABEL.sedan ?? 'Седан' },
];

interface Props {
  branches: V2BranchOption[];
  initialBranchKey?: string;
  onClose: () => void;
  onCreated: (driverId: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  border: '1px solid #D4E3E7',
  borderRadius: 9,
  padding: '0 10px',
  fontSize: 13,
  fontWeight: 650,
  color: '#17222F',
  outline: 'none',
  background: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 11,
  fontWeight: 900,
  color: '#7A859D',
  textTransform: 'uppercase',
};

export default function NewDriverModal({ branches, initialBranchKey, onClose, onCreated }: Props) {
  const initialBranch = useMemo(() => (
    branches.find(branch => branch.code === initialBranchKey || branch.shortName === initialBranchKey)
    ?? branches[0]
  ), [branches, initialBranchKey]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [secondPhone, setSecondPhone] = useState('');
  const [address, setAddress] = useState('');
  const [branchId, setBranchId] = useState(initialBranch?.id ?? '');
  const [transferNumber, setTransferNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('microbus');
  const [plateNumber, setPlateNumber] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [seats, setSeats] = useState('');
  const [comment, setComment] = useState('');
  const [districts, setDistricts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const selectedBranch = branches.find(branch => branch.id === branchId);

  function toggleDistrict(name: string) {
    setDistricts(prev => (
      prev.includes(name)
        ? prev.filter(item => item !== name)
        : [...prev, name]
    ));
  }

  async function submit() {
    if (!fullName.trim()) {
      alert('Укажите ФИО водителя');
      return;
    }
    if (!phone.trim()) {
      alert('Укажите номер водителя');
      return;
    }

    setSaving(true);
    try {
      const driverId = await createV2Driver({
        fullName,
        phone,
        secondPhone,
        address,
        districts,
        branchId: transferNumber ? branchId : undefined,
        schoolId: transferNumber ? selectedBranch?.schoolId : undefined,
        transferNumber: transferNumber ? Number(transferNumber) : undefined,
        vehicleType: transferNumber ? vehicleType : undefined,
        plateNumber,
        brand,
        model,
        seats: seats ? Number(seats) : null,
        comment,
      });
      onCreated(driverId);
    } catch (error) {
      console.error('Driver create failed', error);
      alert('Не удалось добавить водителя');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(23, 34, 47, 0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <section onClick={event => event.stopPropagation()} style={{ width: 'min(820px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', borderRadius: 18, background: '#fff', border: '1px solid #D4E3E7', boxShadow: '0 24px 60px rgba(30, 56, 75, 0.22)', display: 'flex', flexDirection: 'column' }}>
        <header style={{ minHeight: 64, padding: '14px 18px', borderBottom: '1px solid #E5EEF1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#17222F' }}>Новый водитель</div>
            <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: '#7A859D' }}>Если трансфер не выбран, водитель уйдет в ожидание</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: '1px solid #D4E3E7', borderRadius: 12, background: '#fff', color: '#626C8B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: 18, overflowY: 'auto', background: '#F5FAFB', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <label style={labelStyle}>ФИО<input style={inputStyle} value={fullName} onChange={event => setFullName(event.target.value)} /></label>
            <label style={labelStyle}>Номер<input style={inputStyle} value={phone} onChange={event => setPhone(event.target.value)} /></label>
            <label style={labelStyle}>Доп. контакт<input style={inputStyle} value={secondPhone} onChange={event => setSecondPhone(event.target.value)} /></label>
            <label style={labelStyle}>Адрес<input style={inputStyle} value={address} onChange={event => setAddress(event.target.value)} /></label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <label style={labelStyle}>Школа
              <select style={inputStyle} value={branchId} onChange={event => setBranchId(event.target.value)}>
                {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.shortName || branch.code}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Трансфер
              <select style={inputStyle} value={transferNumber} onChange={event => setTransferNumber(event.target.value)}>
                <option value="">Ожидание</option>
                {TRANSFER_NUMBERS.map(number => <option key={number} value={number}>№{number}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Тип ТС
              <select style={inputStyle} value={vehicleType} onChange={event => setVehicleType(event.target.value as VehicleType)}>
                {VEHICLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <label style={labelStyle}>Гос. номер<input style={inputStyle} value={plateNumber} onChange={event => setPlateNumber(event.target.value)} /></label>
            <label style={labelStyle}>Марка<input style={inputStyle} value={brand} onChange={event => setBrand(event.target.value)} /></label>
            <label style={labelStyle}>Модель<input style={inputStyle} value={model} onChange={event => setModel(event.target.value)} /></label>
            <label style={labelStyle}>Мест<input style={inputStyle} type="number" min={1} value={seats} onChange={event => setSeats(event.target.value)} /></label>
          </div>

          <div style={{ border: '1px solid #DDE9EC', borderRadius: 12, background: '#fff', padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#7A859D', textTransform: 'uppercase', marginBottom: 9 }}>Район</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {DISTRICTS.map(name => {
                const active = districts.includes(name);
                return (
                  <button key={name} type="button" onClick={() => toggleDistrict(name)} style={{ height: 28, padding: '0 10px', border: `1px solid ${active ? '#31A4A5' : '#DDE9EC'}`, borderRadius: 999, background: active ? '#DFF4F4' : '#fff', color: active ? '#237F81' : '#52606F', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={labelStyle}>Комментарий
            <textarea value={comment} onChange={event => setComment(event.target.value)} style={{ ...inputStyle, height: 72, padding: 10, resize: 'vertical' }} />
          </label>
        </div>

        <footer style={{ padding: 14, borderTop: '1px solid #E5EEF1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ height: 36, padding: '0 14px', border: '1px solid #D4E3E7', borderRadius: 10, background: '#fff', color: '#52606F', fontWeight: 850, cursor: saving ? 'default' : 'pointer' }}>Отмена</button>
          <button onClick={submit} disabled={saving} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 10, background: saving ? '#9CCFD0' : '#31A4A5', color: '#fff', fontWeight: 900, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Сохраняю...' : 'Добавить'}
          </button>
        </footer>
      </section>
    </div>
  );
}
