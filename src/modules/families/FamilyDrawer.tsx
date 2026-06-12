import React, { useEffect, useState } from 'react';
import { X, User, Users, Truck, CreditCard, Pencil, Check, MapPin, Plus, Trash2, History } from 'lucide-react';
import { Family, Child, Payment } from '../../types';
import { getPriceByZone, calcPenalty, money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import StatusBadge from '../../core/cards/StatusBadge';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SCHOOL_NAME: Record<string, string> = {
  KINGS: 'Kings', LIGHT: 'Light Academy', BILIM: 'Bilim KG',
  AES: 'AES', KAS: 'KAS', EPSILON: 'Epsilon',
  GENIUS: 'Genius', GENIUS4: 'Genius 4', NOVA: 'Nova',
  INDIGO: 'Indigo', ERUDIT: 'Erudit', TENSAY: 'Tensay', EDISON: 'Edison',
};

const VT_LABEL: Record<string, string> = {
  microbus: 'Микроавтобус', minibus: 'Микроавтобус', bus: 'Микроавтобус',
  minivan: 'Минивэн', sedan: 'Седан',
};

const ZONE_COLOR: Record<string, { bg: string; color: string }> = {
  A: { bg: '#E8F5E9', color: '#1B5E20' },
  B: { bg: '#EDE7F6', color: '#311B92' },
  C: { bg: '#E3F2FD', color: '#0D47A1' },
};

const PERIOD_LABEL: Record<string, string> = {
  deposit: 'Депозит',
  '9': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь',
  '1': 'Январь', '2': 'Февраль', '3': 'Март', '4': 'Апрель', '5': 'Май',
};

const PERIOD_ORDER = ['deposit','9','10','11','12','1','2','3','4','5'];

const STATUS_CHAIN = ['Не оплачено','Просрочено','На проверке','На проверке (чек)','Частично оплачено','Оплачено'];

function normalizeZone(z: any, fallback: string): string {
  if (z === 'A' || z === 'B' || z === 'C') return z;
  const n = Number(z);
  if (n === 1) return 'A'; if (n === 2) return 'B'; if (n === 3) return 'C';
  return fallback;
}
function normalizeVehicle(vt: any): string {
  if (!vt) return 'microbus';
  if (vt === 'minibus' || vt === 'bus' || vt === 'mini-bus') return 'microbus';
  return vt;
}
function zoneToNum(z: string): number { return z === 'A' ? 1 : z === 'B' ? 2 : 3; }

// ─── types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  familyId: string;
  userName: string;
  action: string;
  field: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
}

interface Props {
  family: Family;
  onClose: () => void;
  userRole?: string;
  userName?: string;
}

type Tab = 'info' | 'children' | 'logistics' | 'finance' | 'history';

// ─── component ────────────────────────────────────────────────────────────────

export default function FamilyDrawer({ family, onClose, userRole = 'manager', userName = 'Менеджер' }: Props) {
  const [tab, setTab] = useState<Tab>('info');
  const [children, setChildren] = useState<Child[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFamily, setSavedFamily] = useState<Family>(family);
  const [saveMsg, setSaveMsg] = useState('');

  const isAdmin = userRole === 'admin' || userRole === 'director';
  const isCashier = userRole === 'cashier';

  useEffect(() => {
    setSavedFamily(family);
    loadChildren();
    loadPayments();
    loadAudit();
    setEditMode(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  async function loadChildren() {
    setLoadingChildren(true);
    const { data } = await supabase.from('children').select('*').eq('family_id', family.id);
    if (data) {
      setChildren(data.map((r: any) => ({
        id: r.id, familyId: r.family_id, childName: r.child_name,
        class: r.class, selfExitAllowed: r.self_exit_allowed ?? false,
        routeSource: r.route_source, transferNumber: r.transfer_number,
        schoolCode: r.school_code || family.schoolCode,
        zone: normalizeZone(r.zone, family.zone) as any,
        vehicleType: normalizeVehicle(r.vehicle_type) as any,
      })));
    }
    setLoadingChildren(false);
  }

  async function loadPayments() {
    setLoadingPayments(true);
    const { data } = await supabase.from('payments').select('*').eq('family_id', family.id);
    if (data) {
      setPayments(data.map((r: any) => ({
        id: String(r.id), familyId: String(r.family_id),
        schoolCode: r.school_code || family.schoolCode,
        periodKey: (r.month === 0 ? 'deposit' : String(r.month)) as import('../../types').PeriodKey,
        month: Number(r.month), year: Number(r.year),
        amount: Number(r.amount ?? 0), managerAmount: Number(r.manager_amount ?? 0),
        managerDate: r.manager_date ?? '', hasReceipt: Boolean(r.has_receipt),
        accountantStatus: r.accountant_status ?? 'Не оплачено',
        factAmount: Number(r.fact_amount ?? 0), factDate: r.fact_date ?? '',
        isFrozen: Boolean(r.is_frozen), comment: r.comment ?? '',
      })));
    }
    setLoadingPayments(false);
  }

  async function loadAudit() {
    try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return; // таблица может ещё не существовать
    if (data) {
      setAudit(data.map((r: any) => ({
        id: String(r.id), familyId: String(r.family_id),
        userName: r.user_name ?? 'Система', action: r.action ?? '',
        field: r.field ?? '', oldValue: r.old_value ?? '', newValue: r.new_value ?? '',
        createdAt: r.created_at ?? '',
      })));
    }
    } catch { /* таблица не создана */ }
  }

  async function addAudit(action: string, field: string, oldVal: string, newVal: string) {
    try {
      await supabase.from('audit_log').insert({
        family_id: family.id, user_name: userName,
        action, field, old_value: oldVal, new_value: newVal,
      });
    } catch { /* таблица не создана */ }
  }

  // header debt
  const totalDebt = payments
    .filter(p => p.periodKey !== 'deposit')
    .filter(p => ['Не оплачено','Просрочено','Частично оплачено'].includes(p.accountantStatus))
    .reduce((s, p) => s + Math.max(0, p.amount - p.factAmount), 0);

  async function handleSaveFamily(updated: Family) {
    setSaving(true);
    const { error } = await supabase.from('families').update({
      parent_name:    updated.parentName,
      phone:          updated.phone,
      phone_telegram: updated.phoneTelegram,
      second_phone:   updated.secondPhone,
      contact_name:   updated.contactName,
      contact_phone:  updated.contactPhone,
      full_address:   updated.fullAddress,
      comment:        updated.comment,
      school_code:    updated.schoolCode,
      vehicle_type:   updated.vehicleType,
      zone:           zoneToNum(updated.zone),
      transfer_number: updated.transferNumber,
      stop_number:    updated.stopNumber,
      time_morning:   updated.timeMorning,
      time_evening:   updated.timeEvening,
      status:         updated.status,
    }).eq('id', family.id);

    if (!error) {
      setSavedFamily(updated);
      setEditMode(false);
      setSaveMsg('Сохранено ✓');
      setTimeout(() => setSaveMsg(''), 2000);
      await addAudit('Редактирование семьи', 'family', JSON.stringify(family), JSON.stringify(updated));
      await loadAudit();
    } else {
      setSaveMsg('Ошибка сохранения');
    }
    setSaving(false);
  }

  async function handleSavePayment(p: Payment, updates: Partial<Payment>) {
    const { error } = await supabase.from('payments').update({
      amount:           updates.amount ?? p.amount,
      manager_amount:   updates.managerAmount ?? p.managerAmount,
      manager_date:     updates.managerDate ?? p.managerDate,
      has_receipt:      updates.hasReceipt ?? p.hasReceipt,
      accountant_status: updates.accountantStatus ?? p.accountantStatus,
      fact_amount:      updates.factAmount ?? p.factAmount,
      fact_date:        updates.factDate ?? p.factDate,
      is_frozen:        updates.isFrozen ?? p.isFrozen,
      comment:          updates.comment ?? p.comment,
    }).eq('id', p.id);
    if (!error) {
      await loadPayments();
      await addAudit('Изменение платежа', PERIOD_LABEL[p.periodKey] ?? p.periodKey,
        `статус: ${p.accountantStatus}, сумма: ${p.amount}`,
        `статус: ${updates.accountantStatus ?? p.accountantStatus}, факт: ${updates.factAmount ?? p.factAmount}`);
      await loadAudit();
    }
    return !error;
  }

  async function handleDeletePayment(p: Payment) {
    if (!window.confirm(`Удалить запись "${PERIOD_LABEL[p.periodKey]}"?`)) return;
    await supabase.from('payments').delete().eq('id', p.id);
    await addAudit('Удаление платежа', PERIOD_LABEL[p.periodKey] ?? p.periodKey, money(p.amount), '—');
    await loadPayments();
    await loadAudit();
  }

  async function handleAddPayment(periodKey: string, month: number, year: number, amount: number) {
    const { error } = await supabase.from('payments').insert({
      family_id: family.id, school_code: family.schoolCode,
      month, year, amount, manager_amount: 0,
      accountant_status: 'Не оплачено', fact_amount: 0,
      is_frozen: false, has_receipt: false,
    });
    if (!error) {
      await loadPayments();
      await addAudit('Добавление платежа', PERIOD_LABEL[periodKey] ?? periodKey, '—', money(amount));
      await loadAudit();
    }
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'info',      label: 'Основная',    icon: <User size={13} /> },
    { key: 'children',  label: 'Дети и цена', icon: <Users size={13} /> },
    { key: 'logistics', label: 'Логистика',   icon: <Truck size={13} /> },
    { key: 'finance',   label: 'Финансы',     icon: <CreditCard size={13} /> },
    { key: 'history',   label: 'История',     icon: <History size={13} /> },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.18)', zIndex:400 }} />
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, width:660,
        background:'#fff', zIndex:401, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 32px rgba(49,46,129,0.13)',
        animation:'slideIn 0.22s ease',
      }}>
        {/* HEADER */}
        <div style={{ background:'var(--accent)', padding:'18px 22px 16px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'#fff', lineHeight:1.2 }}>{savedFamily.parentName}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:3 }}>
                {savedFamily.phone}
                {savedFamily.phoneTelegram && <span style={{ marginLeft:10 }}>TG: {savedFamily.phoneTelegram}</span>}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {saveMsg && <span style={{ fontSize:12, color:'#A5D6A7', fontWeight:600 }}>{saveMsg}</span>}
              <button onClick={() => setEditMode(e => !e)} title={editMode ? 'Отмена' : 'Редактировать'} style={{
                background: editMode ? '#fff' : 'rgba(255,255,255,0.15)',
                border:'none', borderRadius:8, width:34, height:34,
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', color: editMode ? 'var(--accent)' : '#fff', flexShrink:0,
              }}>
                {editMode ? <Check size={16} /> : <Pencil size={15} />}
              </button>
              <button onClick={onClose} style={{
                background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8,
                width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', color:'#fff', flexShrink:0,
              }}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <HChip label="Школа" value={SCHOOL_NAME[savedFamily.schoolCode] ?? savedFamily.schoolCode} />
            <HChip label="Зона" value={`Зона ${savedFamily.zone}`}
              chipStyle={{ background:ZONE_COLOR[savedFamily.zone]?.bg, color:ZONE_COLOR[savedFamily.zone]?.color }} />
            {totalDebt > 0
              ? <HChip label="Долг" value={money(totalDebt)} chipStyle={{ background:'#FFEBEE', color:'#C62828' }} />
              : <HChip label="Баланс" value="✓ Нет долга" chipStyle={{ background:'#E8F5E9', color:'#2E7D32' }} />}
            <HChip label="Статус" value={
              savedFamily.status === 'active' ? 'Активный' : savedFamily.status === 'new' ? 'Новый' :
              savedFamily.status === 'inactive' ? 'Неактивный' : 'Отказ'
            } />
          </div>
        </div>

        {/* TABS */}
        <div style={{ display:'flex', borderBottom:'2px solid var(--border)', background:'#fff', flexShrink:0, overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex:1, padding:'11px 4px 10px', border:'none', whiteSpace:'nowrap',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom:-2, background:'none',
              color: tab === t.key ? 'var(--accent)' : 'var(--text-2)',
              fontSize:11, fontWeight: tab === t.key ? 700 : 500,
              cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', gap:5, transition:'all 0.15s',
            }}>
              {t.icon}{t.label}
              {t.key === 'history' && audit.length > 0 && (
                <span style={{ background:'var(--accent)', color:'#fff', borderRadius:10, fontSize:9, padding:'1px 5px', fontWeight:700 }}>{audit.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 22px' }}>
          {tab === 'info' && (
            <TabInfo
              family={savedFamily}
              editMode={editMode}
              saving={saving}
              onSave={handleSaveFamily}
            />
          )}
          {tab === 'children'  && <TabChildren children={children} loading={loadingChildren} family={savedFamily} editMode={editMode} isAdmin={isAdmin} />}
          {tab === 'logistics' && <TabLogistics family={savedFamily} children={children} loading={loadingChildren} editMode={editMode} saving={saving} onSave={handleSaveFamily} />}
          {tab === 'finance'   && (
            <TabFinance
              payments={payments} loading={loadingPayments} family={savedFamily}
              editMode={editMode} isAdmin={isAdmin} isCashier={isCashier}
              onSavePayment={handleSavePayment}
              onDeletePayment={handleDeletePayment}
              onAddPayment={handleAddPayment}
            />
          )}
          {tab === 'history'   && <TabHistory audit={audit} />}
        </div>
      </div>
      <style>{`
        @keyframes slideIn { from { transform:translateX(40px); opacity:0 } to { transform:translateX(0); opacity:1 } }
      `}</style>
    </>
  );
}

// ─── HChip ────────────────────────────────────────────────────────────────────

function HChip({ label, value, chipStyle }: { label:string; value:string; chipStyle?: React.CSSProperties }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.13)', borderRadius:8, padding:'5px 11px', ...chipStyle }}>
      <span style={{ fontSize:10, fontWeight:600, color:chipStyle?.color ?? 'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:0.5, display:'block', marginBottom:1 }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:700, color:chipStyle?.color ?? '#fff' }}>{value}</span>
    </div>
  );
}

// ─── Section / Field ──────────────────────────────────────────────────────────

function Section({ title, children, action }: { title:string; children:React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, paddingBottom:7, borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:0.8 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, editMode, inputEl }: { label:string; value?:string|number|null; editMode?:boolean; inputEl?:React.ReactNode }) {
  if (!editMode && (value === undefined || value === null || value === '')) return null;
  return (
    <div style={{ display:'flex', marginBottom:10, gap:8, alignItems: editMode ? 'center' : 'flex-start' }}>
      <span style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', minWidth:160, flexShrink:0 }}>{label}</span>
      {editMode && inputEl ? inputEl : <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{value ?? '—'}</span>}
    </div>
  );
}

function EInput({ value, onChange, type = 'text' }: { value:string; onChange:(v:string)=>void; type?:string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} style={{
      flex:1, padding:'5px 10px', border:'1px solid var(--border)',
      borderRadius:6, fontSize:13, fontWeight:500, color:'var(--text)',
      background:'var(--bg)', outline:'none',
    }} />
  );
}

function ESelect({ value, onChange, options }: { value:string; onChange:(v:string)=>void; options:{value:string;label:string}[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      flex:1, padding:'5px 10px', border:'1px solid var(--border)', borderRadius:6,
      fontSize:13, fontWeight:500, color:'var(--text)', background:'var(--bg)', outline:'none',
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── TAB: Основная ────────────────────────────────────────────────────────────

function TabInfo({ family, editMode, saving, onSave }: {
  family:Family; editMode:boolean; saving:boolean; onSave:(f:Family)=>void;
}) {
  const [form, setForm] = useState({ ...family });
  useEffect(() => { setForm({ ...family }); }, [family]);

  const set = (k: keyof Family) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const hasCoords = family.latitude && family.longitude;
  const mapsUrl = hasCoords
    ? `https://yandex.ru/maps/?pt=${family.longitude},${family.latitude}&z=16&l=map`
    : family.fullAddress
    ? `https://yandex.ru/maps/?text=${encodeURIComponent(family.fullAddress)}`
    : null;

  return (
    <div>
      <Section title="Родитель">
        <Field label="ФИО"           value={form.parentName}    editMode={editMode} inputEl={<EInput value={form.parentName} onChange={set('parentName')} />} />
        <Field label="Телефон"       value={form.phone}         editMode={editMode} inputEl={<EInput value={form.phone}      onChange={set('phone')} />} />
        <Field label="Telegram"      value={form.phoneTelegram ?? ''} editMode={editMode} inputEl={<EInput value={form.phoneTelegram ?? ''} onChange={set('phoneTelegram')} />} />
        <Field label="Второй телефон" value={form.secondPhone ?? ''} editMode={editMode} inputEl={<EInput value={form.secondPhone ?? ''} onChange={set('secondPhone')} />} />
      </Section>

      {(editMode || form.contactName || form.contactPhone) && (
        <Section title="Дополнительный контакт">
          <Field label="Имя контакта"    value={form.contactName ?? ''} editMode={editMode} inputEl={<EInput value={form.contactName ?? ''} onChange={set('contactName')} />} />
          <Field label="Телефон контакта" value={form.contactPhone ?? ''} editMode={editMode} inputEl={<EInput value={form.contactPhone ?? ''} onChange={set('contactPhone')} />} />
        </Section>
      )}

      <Section title="Адрес и маршрут">
        <Field label="Полный адрес" value={form.fullAddress} editMode={editMode} inputEl={<EInput value={form.fullAddress} onChange={set('fullAddress')} />} />
        {hasCoords && (
          <div style={{ display:'flex', marginBottom:10, gap:8, alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', minWidth:160, flexShrink:0 }}>Координаты</span>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{family.latitude?.toFixed(6)}, {family.longitude?.toFixed(6)}</span>
          </div>
        )}
        {mapsUrl && (
          <div style={{ display:'flex', marginBottom:10, gap:8, alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', minWidth:160, flexShrink:0 }}>На карте</span>
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:13, fontWeight:600, color:'var(--accent)', textDecoration:'none' }}>
              <MapPin size={14} /> Открыть Яндекс Карты
            </a>
          </div>
        )}
        <Field label="Расстояние" value={family.distanceKm ? `${family.distanceKm} км` : null} />
        <Field label="Зона" value={`Зона ${family.zone} (${family.zone==='A'?'до 3.3 км':family.zone==='B'?'3.3–6.3 км':'свыше 6.3 км'})`} />
        <Field label="Тип транспорта" value={VT_LABEL[family.vehicleType] ?? family.vehicleType}
          editMode={editMode}
          inputEl={<ESelect value={form.vehicleType} onChange={set('vehicleType')} options={[
            {value:'microbus',label:'Микроавтобус'},{value:'minivan',label:'Минивэн'},{value:'sedan',label:'Седан'},
          ]} />}
        />
      </Section>

      <Section title="Прочее">
        <Field label="Школа" value={SCHOOL_NAME[form.schoolCode] ?? form.schoolCode}
          editMode={editMode}
          inputEl={<ESelect value={form.schoolCode} onChange={set('schoolCode')} options={
            Object.entries(SCHOOL_NAME).map(([code,name]) => ({ value:code, label:name }))
          } />}
        />
        <Field label="Статус" value={
          form.status === 'active' ? 'Активный' : form.status === 'new' ? 'Новый' :
          form.status === 'inactive' ? 'Неактивный' : 'Отказ'
        }
          editMode={editMode}
          inputEl={<ESelect value={form.status ?? 'new'} onChange={set('status')} options={[
            {value:'new',label:'Новый'},{value:'active',label:'Активный'},
            {value:'inactive',label:'Неактивный'},{value:'refused',label:'Отказ'},
          ]} />}
        />
        <Field label="Дата заявки" value={family.createdAt ? new Date(family.createdAt).toLocaleDateString('ru-RU') : null} />
        {(editMode || form.comment) && (
          <div style={{ marginTop:4 }}>
            <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', marginBottom:6 }}>Комментарий</div>
            {editMode
              ? <textarea value={form.comment ?? ''} onChange={e => setForm(f => ({ ...f, comment:e.target.value }))} rows={3}
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text)', background:'var(--bg)', resize:'vertical', boxSizing:'border-box' }} />
              : <div style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--text)', lineHeight:1.5, fontWeight:500 }}>{form.comment}</div>
            }
          </div>
        )}
      </Section>

      {editMode && (
        <button onClick={() => onSave(form)} disabled={saving} style={{
          width:'100%', padding:'12px', background:'var(--accent)', color:'#fff',
          border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', opacity: saving ? 0.7 : 1,
        }}>
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      )}
    </div>
  );
}

// ─── TAB: Дети и цена ─────────────────────────────────────────────────────────

interface KidState {
  id: string; childName: string; cls: string; vehicleType: string;
  zone: string; schoolCode: string; transferNumber?: number;
  selfExitAllowed: boolean; discountType: 'none'|'percent'|'fixed'; discountValue: number;
}

function TabChildren({ children, loading, family, editMode, isAdmin }: {
  children: Child[]; loading: boolean; family: Family; editMode: boolean; isAdmin: boolean;
}) {
  const [kids, setKids] = useState<KidState[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setKids(children.map((k, i) => ({
      id: k.id, childName: k.childName, cls: k.class,
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
    let discount = 0;
    if (kid.discountType === 'percent') discount = Math.round(base * kid.discountValue / 100);
    if (kid.discountType === 'fixed') discount = kid.discountValue;
    return { base, discount, final: Math.max(0, base - discount) };
  }

  const prices = kids.map(k => getPrice(k));
  const familyTotal = prices.reduce((s, p) => s + p.final, 0);

  async function saveKid(kid: KidState) {
    setSaving(true);
    await supabase.from('children').update({
      child_name: kid.childName, class: kid.cls,
      vehicle_type: kid.vehicleType, zone: zoneToNum(kid.zone),
      school_code: kid.schoolCode, transfer_number: kid.transferNumber,
      self_exit_allowed: kid.selfExitAllowed,
    }).eq('id', kid.id);
    setSaving(false);
    setMsg('Ребёнок сохранён ✓');
    setTimeout(() => setMsg(''), 2000);
  }

  async function deleteKid(kid: KidState) {
    if (!window.confirm(`Удалить ${kid.childName}?`)) return;
    await supabase.from('children').delete().eq('id', kid.id);
    setKids(ks => ks.filter(k => k.id !== kid.id));
  }

  return (
    <div>
      {msg && <div style={{ background:'#E8F5E9', color:'#2E7D32', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:13, fontWeight:600 }}>{msg}</div>}
      <Section title={`Дети (${kids.length})`}>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {kids.length === 0 && <Empty text="Детей нет" />}
          {kids.map((kid, i) => {
            const { base, discount, final } = prices[i];
            const setKid = (patch: Partial<KidState>) => setKids(ks => ks.map((k,j) => j===i ? {...k,...patch} : k));
            return (
              <div key={kid.id} style={{ background:'var(--bg)', borderRadius:10, padding:'14px 16px', border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent-l)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--accent)' }}>{i+1}</div>
                    <div>
                      {editMode
                        ? <input value={kid.childName} onChange={e => setKid({ childName:e.target.value })}
                            style={{ fontWeight:700, fontSize:14, border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--text)', background:'#fff' }} />
                        : <div style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{kid.childName}</div>
                      }
                      {editMode
                        ? <input value={kid.cls} onChange={e => setKid({ cls:e.target.value })} placeholder="Класс"
                            style={{ fontSize:11, border:'1px solid var(--border)', borderRadius:5, padding:'2px 6px', color:'var(--text-2)', marginTop:3, width:80 }} />
                        : <div style={{ fontSize:11, fontWeight:500, color:'var(--text-2)', marginTop:2 }}>{kid.cls} класс</div>
                      }
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--accent)' }}>{money(final)}</div>
                      {discount > 0 && <div style={{ fontSize:10, fontWeight:600, color:'#2E7D32' }}>−{money(discount)}</div>}
                    </div>
                    {editMode && (
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => saveKid(kid)} disabled={saving} style={{ padding:'5px 10px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                          {saving ? '...' : 'Сохр.'}
                        </button>
                        {isAdmin && (
                          <button onClick={() => deleteKid(kid)} style={{ padding:'5px 8px', background:'#FFEBEE', color:'#C62828', border:'none', borderRadius:6, cursor:'pointer' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* tags / edit fields */}
                {editMode ? (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                    <ESelect value={kid.vehicleType} onChange={v => setKid({ vehicleType:v })} options={[
                      {value:'microbus',label:'Микроавтобус'},{value:'minivan',label:'Минивэн'},{value:'sedan',label:'Седан'},
                    ]} />
                    <ESelect value={kid.zone} onChange={v => setKid({ zone:v })} options={[
                      {value:'A',label:'Зона A'},{value:'B',label:'Зона B'},{value:'C',label:'Зона C'},
                    ]} />
                    <ESelect value={kid.schoolCode} onChange={v => setKid({ schoolCode:v })} options={
                      Object.entries(SCHOOL_NAME).map(([code,name]) => ({ value:code, label:name }))
                    } />
                    <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:500, color:'var(--text)' }}>
                      <input type="checkbox" checked={kid.selfExitAllowed} onChange={e => setKid({ selfExitAllowed:e.target.checked })} />
                      Самовыход
                    </label>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                    <Tag label={VT_LABEL[kid.vehicleType] ?? kid.vehicleType} />
                    <Tag label={`Зона ${kid.zone}`} color={ZONE_COLOR[kid.zone]} />
                    <Tag label={SCHOOL_NAME[kid.schoolCode] ?? kid.schoolCode} />
                    {kid.transferNumber && <Tag label={`Трансфер №${kid.transferNumber}`} />}
                    {kid.selfExitAllowed && <Tag label="Самовыход ✓" color={{ bg:'#E8F5E9', color:'#2E7D32' }} />}
                  </div>
                )}

                <div style={{ borderTop:'1px solid var(--border)', paddingTop:10 }}>
                  <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                    <PCell label="Базовая цена" value={money(base)} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, color:'var(--text-2)', fontWeight:500, textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Скидка</div>
                      {(editMode && isAdmin) ? (
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <select value={kid.discountType} onChange={e => setKid({ discountType:e.target.value as any })}
                            style={{ padding:'3px 6px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, color:'var(--text)' }}>
                            <option value="none">Нет</option>
                            <option value="percent">%</option>
                            <option value="fixed">сом</option>
                          </select>
                          {kid.discountType !== 'none' && (
                            <input type="number" value={kid.discountValue} onChange={e => setKid({ discountValue:Number(e.target.value) })}
                              style={{ width:64, padding:'3px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12 }} />
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize:13, fontWeight:500, color: discount>0 ? '#2E7D32' : 'var(--text-2)' }}>
                          {kid.discountType==='percent' ? `${kid.discountValue}%` :
                           kid.discountType==='fixed' ? money(kid.discountValue) : '—'}
                        </div>
                      )}
                    </div>
                    <PCell label="Итого" value={money(final)} bold />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <div style={{ background:'var(--accent)', borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.7)' }}>Итого за семью / месяц</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>{kids.length} {kids.length===1?'ребёнок':'детей'}</div>
        </div>
        <div style={{ fontSize:22, fontWeight:700, color:'#fff' }}>{money(familyTotal)}</div>
      </div>
    </div>
  );
}

// ─── TAB: Логистика ───────────────────────────────────────────────────────────

function TabLogistics({ family, children, loading, editMode, saving, onSave }: {
  family:Family; children:Child[]; loading:boolean; editMode:boolean; saving:boolean; onSave:(f:Family)=>void;
}) {
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
            {value:'microbus',label:'Микроавтобус'},{value:'minivan',label:'Минивэн'},{value:'sedan',label:'Седан'},
          ]} />}
        />
        <Field label="Номер трансфера" value={family.transferNumber ? `№${family.transferNumber}` : null}
          editMode={editMode}
          inputEl={<EInput value={String(form.transferNumber ?? '')} onChange={v => setForm(f => ({ ...f, transferNumber: Number(v) || undefined }))} type="number" />}
        />
        <Field label="Номер остановки" value={family.stopNumber ? `Остановка ${family.stopNumber}` : null}
          editMode={editMode}
          inputEl={<EInput value={String(form.stopNumber ?? '')} onChange={v => setForm(f => ({ ...f, stopNumber: Number(v) || undefined }))} type="number" />}
        />
        <Field label="Время утро" value={family.timeMorning}
          editMode={editMode}
          inputEl={<EInput value={form.timeMorning ?? ''} onChange={set('timeMorning')} />}
        />
        <Field label="Время вечер" value={family.timeEvening}
          editMode={editMode}
          inputEl={<EInput value={form.timeEvening ?? ''} onChange={set('timeEvening')} />}
        />
        <Field label="Адрес" value={family.fullAddress} />
      </Section>

      {editMode && (
        <button onClick={() => onSave(form)} disabled={saving} style={{
          width:'100%', padding:'12px', background:'var(--accent)', color:'#fff',
          border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:16, opacity: saving ? 0.7 : 1,
        }}>
          {saving ? 'Сохранение...' : 'Сохранить логистику'}
        </button>
      )}

      {children.length > 0 && (
        <Section title="Дети в маршруте">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg)' }}>
                {['ФИО','Тип ТС','Трансфер','Остановка','Утро'].map(h => (
                  <th key={h} style={{ textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-2)', padding:'8px 10px', textTransform:'uppercase', letterSpacing:0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((kid, i) => (
                <tr key={kid.id} style={{ background: i%2===0 ? '#fff' : 'var(--bg)', borderTop:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px', fontSize:13, fontWeight:600, color:'var(--text)' }}>
                    <div>{kid.childName}</div>
                    <div style={{ fontSize:11, color:'var(--text-2)', marginTop:1 }}>{kid.class} кл.</div>
                  </td>
                  <td style={{ padding:'10px', fontSize:12, color:'var(--text)' }}>{VT_LABEL[kid.vehicleType] ?? kid.vehicleType}</td>
                  <td style={{ padding:'10px', fontSize:12, color:'var(--text)' }}>{kid.transferNumber ? `№${kid.transferNumber}` : '—'}</td>
                  <td style={{ padding:'10px', fontSize:12, color:'var(--text)' }}>{family.stopNumber ?? '—'}</td>
                  <td style={{ padding:'10px', fontSize:12, fontWeight:600, color:'var(--accent)' }}>{family.timeMorning ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

// ─── TAB: Финансы ─────────────────────────────────────────────────────────────

const ALL_PERIODS = [
  { key:'deposit', month:0, year:2026, label:'Депозит' },
  { key:'9', month:9, year:2026, label:'Сентябрь 2026' },
  { key:'10', month:10, year:2026, label:'Октябрь 2026' },
  { key:'11', month:11, year:2026, label:'Ноябрь 2026' },
  { key:'12', month:12, year:2026, label:'Декабрь 2026' },
  { key:'1', month:1, year:2027, label:'Январь 2027' },
  { key:'2', month:2, year:2027, label:'Февраль 2027' },
  { key:'3', month:3, year:2027, label:'Март 2027' },
  { key:'4', month:4, year:2027, label:'Апрель 2027' },
  { key:'5', month:5, year:2027, label:'Май 2027' },
];

function TabFinance({ payments, loading, family, editMode, isAdmin, isCashier, onSavePayment, onDeletePayment, onAddPayment }: {
  payments:Payment[]; loading:boolean; family:Family;
  editMode:boolean; isAdmin:boolean; isCashier:boolean;
  onSavePayment:(p:Payment, updates:Partial<Payment>)=>Promise<boolean>;
  onDeletePayment:(p:Payment)=>void;
  onAddPayment:(periodKey:string, month:number, year:number, amount:number)=>void;
}) {
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriodKey, setNewPeriodKey] = useState('9');
  const [newAmount, setNewAmount] = useState('');

  if (loading) return <Spinner />;

  const sorted = [...payments].sort((a,b) => PERIOD_ORDER.indexOf(a.periodKey) - PERIOD_ORDER.indexOf(b.periodKey));
  const deposit = sorted.find(p => p.periodKey === 'deposit');
  const monthly = sorted.filter(p => p.periodKey !== 'deposit');

  const totalCharged = monthly.reduce((s,p) => s + p.amount, 0);
  const totalPaid    = monthly.reduce((s,p) => s + p.factAmount, 0);
  const totalDebt    = Math.max(0, totalCharged - totalPaid);

  const existingKeys = new Set<string>(payments.map(p => p.periodKey));
  const availablePeriods = ALL_PERIODS.filter(p => !existingKeys.has(p.key));

  function handleAdd() {
    const period = ALL_PERIODS.find(p => p.key === newPeriodKey);
    if (!period) return;
    onAddPayment(period.key, period.month, period.year, Number(newAmount) || 0);
    setAddingPeriod(false);
    setNewAmount('');
  }

  return (
    <div>
      {/* Summary */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <SCard label="Начислено" value={money(totalCharged)} />
        <SCard label="Оплачено"  value={money(totalPaid)} color="#2E7D32" />
        {totalDebt > 0
          ? <SCard label="Долг" value={money(totalDebt)} color="#C62828" bg="#FFEBEE" />
          : <SCard label="Баланс" value="✓ Чисто" color="#2E7D32" bg="#E8F5E9" />}
      </div>

      {deposit && (
        <Section title="Депозит">
          <PayRow payment={deposit} isDeposit isAdmin={isAdmin} isCashier={isCashier} editMode={editMode}
            onSave={u => onSavePayment(deposit, u)} onDelete={() => onDeletePayment(deposit)} />
        </Section>
      )}

      <Section
        title={`Периоды (${monthly.length})`}
        action={editMode && availablePeriods.length > 0 ? (
          <button onClick={() => setAddingPeriod(p => !p)} style={{
            display:'flex', alignItems:'center', gap:4, padding:'4px 10px',
            background:'var(--accent)', color:'#fff', border:'none', borderRadius:6,
            fontSize:11, fontWeight:600, cursor:'pointer',
          }}>
            <Plus size={11} /> Добавить
          </button>
        ) : undefined}
      >
        {/* Add period form */}
        {addingPeriod && (
          <div style={{ background:'#EEF2FF', borderRadius:8, padding:'12px', marginBottom:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:4 }}>Период</div>
              <select value={newPeriodKey} onChange={e => setNewPeriodKey(e.target.value)}
                style={{ padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, color:'var(--text)' }}>
                {availablePeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:4 }}>Сумма (сом)</div>
              <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="6000"
                style={{ padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, color:'var(--text)', width:120 }} />
            </div>
            <button onClick={handleAdd} style={{ padding:'7px 16px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Создать
            </button>
            <button onClick={() => setAddingPeriod(false)} style={{ padding:'7px 12px', background:'var(--bg)', color:'var(--text-2)', border:'1px solid var(--border)', borderRadius:6, fontSize:13, cursor:'pointer' }}>
              Отмена
            </button>
          </div>
        )}

        {monthly.length === 0 ? <Empty text="Начислений нет" /> : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {monthly.map(p => (
              <PayRow key={p.id} payment={p} isAdmin={isAdmin} isCashier={isCashier} editMode={editMode}
                onSave={u => onSavePayment(p, u)} onDelete={() => onDeletePayment(p)} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── PayRow — одна строка платежа ─────────────────────────────────────────────

function PayRow({ payment: p, isDeposit, isAdmin, isCashier, editMode, onSave, onDelete }: {
  payment:Payment; isDeposit?:boolean; isAdmin:boolean; isCashier:boolean;
  editMode:boolean; onSave:(u:Partial<Payment>)=>Promise<boolean>; onDelete:()=>void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [managerAmt, setManagerAmt] = useState(String(p.managerAmount || ''));
  const [factAmt, setFactAmt] = useState(String(p.factAmount || ''));
  const [comment, setComment] = useState(p.comment ?? '');
  const [editAmount, setEditAmount] = useState(String(p.amount));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const today = new Date();
  const dueDate = p.month > 0 ? new Date(p.year, p.month - 1, 1) : null;
  const needsPenalty = !isDeposit && dueDate && !p.isFrozen &&
    ['Не оплачено','Просрочено','Частично оплачено'].includes(p.accountantStatus);
  const penalty = needsPenalty ? calcPenalty(p.amount - p.factAmount, dueDate!, today) : 0;
  const paid = p.accountantStatus === 'Оплачено';
  const overdue = p.accountantStatus === 'Просрочено';

  async function save(updates: Partial<Payment>) {
    setSaving(true);
    const ok = await onSave(updates);
    setSaving(false);
    if (ok) { setMsg('✓'); setTimeout(() => setMsg(''), 1500); }
  }

  async function managerSubmit() {
    const amt = Number(managerAmt);
    if (!amt) return;
    await save({ managerAmount: amt, managerDate: new Date().toISOString().slice(0,10), accountantStatus: 'На проверке', isFrozen: true });
    setExpanded(false);
  }

  async function cashierConfirm() {
    const amt = Number(factAmt) || Number(managerAmt) || p.managerAmount;
    const partial = amt < p.amount;
    await save({
      factAmount: amt, factDate: new Date().toISOString().slice(0,10),
      accountantStatus: partial ? 'Частично оплачено' : 'Оплачено',
      isFrozen: false, comment,
    });
    setExpanded(false);
  }

  async function cashierReject() {
    await save({ accountantStatus: 'Не оплачено', isFrozen: false, managerAmount: 0, managerDate: '' });
    setExpanded(false);
  }

  async function adminEditAmount() {
    const amt = Number(editAmount);
    if (!amt) return;
    await save({ amount: amt });
  }

  return (
    <div style={{ border:`1px solid ${overdue ? '#FFCDD2' : 'var(--border)'}`, borderRadius:8, background: paid ? '#FAFFFE' : overdue ? '#FFF8F8' : '#fff', overflow:'hidden' }}>
      {/* Main row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', cursor:'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <div>
          <div style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>{PERIOD_LABEL[p.periodKey] ?? p.periodKey}</div>
          {!isDeposit && p.year && <div style={{ fontSize:11, color:'var(--text-2)', marginTop:1 }}>{p.year}</div>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:14, fontWeight:700, color: paid ? '#2E7D32' : 'var(--text)' }}>{money(p.amount)}</div>
            {p.accountantStatus === 'Частично оплачено' && p.factAmount > 0 && (
              <div style={{ fontSize:11, color:'#1565C0' }}>оплачено {money(p.factAmount)}</div>
            )}
            {penalty > 0 && <div style={{ fontSize:11, color:'#C62828', fontWeight:600 }}>+{money(penalty)} пеня</div>}
          </div>
          {msg && <span style={{ fontSize:11, color:'#2E7D32', fontWeight:700 }}>{msg}</span>}
          <StatusBadge status={p.accountantStatus} size="sm" />
          {saving && <span style={{ fontSize:11, color:'var(--text-2)' }}>...</span>}
        </div>
      </div>

      {/* Manager info */}
      {p.managerAmount > 0 && !paid && (
        <div style={{ padding:'0 14px 10px', fontSize:11, color:'var(--text-2)' }}>
          Менеджер внёс: <strong>{money(p.managerAmount)}</strong>
          {p.managerDate && ` · ${new Date(p.managerDate).toLocaleDateString('ru-RU')}`}
          {p.hasReceipt && ' · 📎 чек'}
        </div>
      )}

      {/* Expanded actions */}
      {expanded && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'14px', background:'var(--bg)' }}>
          {/* Admin: edit amount */}
          {isAdmin && !paid && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', marginBottom:6, textTransform:'uppercase' }}>Изменить начисление (Админ)</div>
              <div style={{ display:'flex', gap:8 }}>
                <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                  style={{ flex:1, padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:13 }} />
                <button onClick={adminEditAmount} style={{ padding:'6px 14px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  Изменить
                </button>
              </div>
            </div>
          )}

          {/* Manager: внести оплату */}
          {!isCashier && !paid && p.accountantStatus !== 'На проверке' && p.accountantStatus !== 'На проверке (чек)' && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', marginBottom:6, textTransform:'uppercase' }}>Внести оплату</div>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <input type="number" value={managerAmt} onChange={e => setManagerAmt(e.target.value)}
                  placeholder={`Сумма (начислено: ${money(p.amount)})`}
                  style={{ flex:1, padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:13 }} />
              </div>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий (необязательно)"
                style={{ width:'100%', padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, marginBottom:8, boxSizing:'border-box' }} />
              <button onClick={managerSubmit} style={{ padding:'7px 18px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Отправить на проверку
              </button>
            </div>
          )}

          {/* Cashier: подтвердить/отклонить */}
          {(isCashier || isAdmin) && (p.accountantStatus === 'На проверке' || p.accountantStatus === 'На проверке (чек)') && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', marginBottom:6, textTransform:'uppercase' }}>
                Подтверждение кассира · менеджер внёс {money(p.managerAmount)}
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <input type="number" value={factAmt || String(p.managerAmount)} onChange={e => setFactAmt(e.target.value)}
                  placeholder="Фактическая сумма"
                  style={{ flex:1, padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:13 }} />
              </div>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий"
                style={{ width:'100%', padding:'6px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, marginBottom:8, boxSizing:'border-box' }} />
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={cashierConfirm} style={{ flex:1, padding:'7px', background:'#E8F5E9', color:'#2E7D32', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  ✓ Подтвердить
                </button>
                <button onClick={cashierReject} style={{ flex:1, padding:'7px', background:'#FFEBEE', color:'#C62828', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  ✗ Отклонить
                </button>
              </div>
            </div>
          )}

          {/* Change status directly (admin) */}
          {isAdmin && (
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', marginBottom:6, textTransform:'uppercase' }}>Статус</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {STATUS_CHAIN.map(s => (
                  <button key={s} onClick={() => save({ accountantStatus: s as any, isFrozen: s.includes('проверке') })}
                    style={{
                      padding:'4px 10px', border:'none', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer',
                      background: p.accountantStatus === s ? 'var(--accent)' : '#EEF2FF',
                      color: p.accountantStatus === s ? '#fff' : 'var(--accent)',
                    }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Delete (admin only) */}
          {isAdmin && editMode && (
            <button onClick={onDelete} style={{
              marginTop:8, width:'100%', padding:'6px', background:'#FFEBEE', color:'#C62828',
              border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:5,
            }}>
              <Trash2 size={13} /> Удалить запись
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TAB: История ──────────────────────────────────────────────────────────────

function TabHistory({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) return (
    <div style={{ textAlign:'center', padding:'40px 0' }}>
      <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
      <div style={{ color:'var(--text-2)', fontSize:13 }}>История изменений пуста</div>
    </div>
  );

  return (
    <div>
      <Section title={`История (${audit.length})`}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {audit.map(entry => (
            <div key={entry.id} style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{entry.action}</span>
                <span style={{ fontSize:11, color:'var(--text-2)' }}>{entry.createdAt?.slice(0,16).replace('T',' ')}</span>
              </div>
              {entry.field && (
                <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:3 }}>
                  <span style={{ fontWeight:600 }}>{entry.field}</span>
                </div>
              )}
              {(entry.oldValue || entry.newValue) && (
                <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
                  {entry.oldValue && <span style={{ background:'#FFEBEE', color:'#C62828', borderRadius:4, padding:'2px 6px' }}>
                    {entry.oldValue.length > 60 ? entry.oldValue.slice(0,60)+'...' : entry.oldValue}
                  </span>}
                  {entry.oldValue && entry.newValue && <span style={{ color:'var(--text-2)' }}>→</span>}
                  {entry.newValue && <span style={{ background:'#E8F5E9', color:'#2E7D32', borderRadius:4, padding:'2px 6px' }}>
                    {entry.newValue.length > 60 ? entry.newValue.slice(0,60)+'...' : entry.newValue}
                  </span>}
                </div>
              )}
              <div style={{ fontSize:10, color:'var(--text-2)', marginTop:5, fontWeight:500 }}>👤 {entry.userName}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function Tag({ label, color }: { label:string; color?:{bg:string;color:string} }) {
  return (
    <span style={{ background:color?.bg ?? '#EEF2FF', color:color?.color ?? 'var(--accent)', borderRadius:5, padding:'3px 9px', fontSize:11, fontWeight:600 }}>
      {label}
    </span>
  );
}

function PCell({ label, value, bold }: { label:string; value:string; bold?:boolean }) {
  return (
    <div>
      <div style={{ fontSize:10, color:'var(--text-2)', fontWeight:500, textTransform:'uppercase', letterSpacing:0.4 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:bold ? 700 : 500, color:'var(--text)', marginTop:2 }}>{value}</div>
    </div>
  );
}

function SCard({ label, value, color, bg }: { label:string; value:string; color?:string; bg?:string }) {
  return (
    <div style={{ flex:1, background:bg ?? 'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
      <div style={{ fontSize:15, fontWeight:700, color:color ?? 'var(--text)', marginTop:4 }}>{value}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-2)', fontSize:13 }}>Загрузка...</div>;
}

function Empty({ text }: { text:string }) {
  return <div style={{ textAlign:'center', padding:'30px 0', color:'var(--text-2)', fontSize:13 }}>{text}</div>;
}
