import React, { useEffect, useState } from 'react';
import { X, User, Users, Truck, CreditCard, Pencil, Check, History } from 'lucide-react';
import { Family, Child, Payment } from '../../types';
import { money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import { SCHOOL_NAME, ZONE_COLOR, normalizeZone, normalizeVehicle, zoneToNum, PERIOD_LABEL } from './constants';
import TabInfo      from './TabInfo';
import TabChildren  from './TabChildren';
import TabLogistics from './TabLogistics';
import TabFinance   from './TabFinance';
import TabHistory   from './TabHistory';

interface AuditEntry {
  id: string; familyId: string; userName: string;
  action: string; field: string; oldValue: string; newValue: string; createdAt: string;
}

interface Props {
  family: Family;
  onClose: () => void;
  userRole?: string;
  userName?: string;
}

type Tab = 'info' | 'children' | 'logistics' | 'finance' | 'history';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'info',      label: 'Основная',    icon: <User size={13} /> },
  { key: 'children',  label: 'Дети и цена', icon: <Users size={13} /> },
  { key: 'logistics', label: 'Логистика',   icon: <Truck size={13} /> },
  { key: 'finance',   label: 'Финансы',     icon: <CreditCard size={13} /> },
  { key: 'history',   label: 'История',     icon: <History size={13} /> },
];

export default function FamilyDrawer({ family, onClose, userRole = 'manager', userName = 'Менеджер' }: Props) {
  const [tab, setTab]               = useState<Tab>('info');
  const [children, setChildren]     = useState<Child[]>([]);
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [audit, setAudit]           = useState<AuditEntry[]>([]);
  const [loadingKids, setLoadingKids]       = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [editMode, setEditMode]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [savedFamily, setSavedFamily] = useState<Family>(family);
  const [saveMsg, setSaveMsg]       = useState('');

  const isAdmin   = userRole === 'admin' || userRole === 'director';
  const isCashier = userRole === 'cashier';

  useEffect(() => {
    setSavedFamily(family);
    setEditMode(false);
    loadChildren();
    loadPayments();
    loadAudit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  // ─── Загрузка данных ─────────────────────────────────────────────────────

  async function loadChildren() {
    setLoadingKids(true);
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
    setLoadingKids(false);
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
      const { data } = await supabase.from('audit_log').select('*').eq('family_id', family.id)
        .order('created_at', { ascending: false }).limit(50);
      if (data) {
        setAudit(data.map((r: any) => ({
          id: String(r.id), familyId: String(r.family_id),
          userName: r.user_name ?? 'Система', action: r.action ?? '',
          field: r.field ?? '', oldValue: r.old_value ?? '', newValue: r.new_value ?? '',
          createdAt: r.created_at ?? '',
        })));
      }
    } catch { /* таблица ещё не создана */ }
  }

  async function addAudit(action: string, field: string, oldVal: string, newVal: string) {
    try {
      await supabase.from('audit_log').insert({ family_id: family.id, user_name: userName, action, field, old_value: oldVal, new_value: newVal });
    } catch { /* таблица ещё не создана */ }
  }

  // ─── Обработчики ─────────────────────────────────────────────────────────

  async function handleSaveFamily(updated: Family) {
    setSaving(true);
    const { error } = await supabase.from('families').update({
      parent_name: updated.parentName, phone: updated.phone,
      phone_telegram: updated.phoneTelegram, second_phone: updated.secondPhone,
      contact_name: updated.contactName, contact_phone: updated.contactPhone,
      full_address: updated.fullAddress, comment: updated.comment,
      school_code: updated.schoolCode, vehicle_type: updated.vehicleType,
      zone: zoneToNum(updated.zone), transfer_number: updated.transferNumber,
      stop_number: updated.stopNumber, time_morning: updated.timeMorning,
      time_evening: updated.timeEvening, status: updated.status,
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

  async function handleSavePayment(p: Payment, updates: Partial<Payment>): Promise<boolean> {
    const { error } = await supabase.from('payments').update({
      amount:            updates.amount ?? p.amount,
      manager_amount:    updates.managerAmount ?? p.managerAmount,
      manager_date:      updates.managerDate ?? p.managerDate,
      has_receipt:       updates.hasReceipt ?? p.hasReceipt,
      accountant_status: updates.accountantStatus ?? p.accountantStatus,
      fact_amount:       updates.factAmount ?? p.factAmount,
      fact_date:         updates.factDate ?? p.factDate,
      is_frozen:         updates.isFrozen ?? p.isFrozen,
      comment:           updates.comment ?? p.comment,
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
    if (!window.confirm(`Удалить "${PERIOD_LABEL[p.periodKey]}"?`)) return;
    await supabase.from('payments').delete().eq('id', p.id);
    await addAudit('Удаление платежа', PERIOD_LABEL[p.periodKey] ?? p.periodKey, money(p.amount), '—');
    await loadPayments();
    await loadAudit();
  }

  async function handleAddPayment(periodKey: string, month: number, year: number, amount: number) {
    const { error } = await supabase.from('payments').insert({
      family_id: family.id, school_code: family.schoolCode, month, year, amount,
      manager_amount: 0, accountant_status: 'Не оплачено', fact_amount: 0,
      is_frozen: false, has_receipt: false,
    });
    if (!error) {
      await loadPayments();
      await addAudit('Добавление платежа', PERIOD_LABEL[periodKey] ?? periodKey, '—', money(amount));
      await loadAudit();
    }
  }

  // ─── Сводка долга для шапки ───────────────────────────────────────────────

  const totalDebt = payments
    .filter(p => p.periodKey !== 'deposit' && ['Не оплачено', 'Просрочено', 'Частично оплачено'].includes(p.accountantStatus))
    .reduce((s, p) => s + Math.max(0, p.amount - p.factAmount), 0);

  const statusLabel = { active: 'Активный', new: 'Новый', inactive: 'Неактивный', rejected: 'Отказ' }[savedFamily.status] ?? savedFamily.status;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 660, background: '#fff', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(49,46,129,0.13)', animation: 'slideIn 0.22s ease' }}>

        {/* HEADER */}
        <div style={{ background: 'var(--accent)', padding: '18px 22px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{savedFamily.parentName}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
                {savedFamily.phone}
                {savedFamily.phoneTelegram && <span style={{ marginLeft: 10 }}>TG: {savedFamily.phoneTelegram}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {saveMsg && <span style={{ fontSize: 12, color: '#A5D6A7', fontWeight: 600 }}>{saveMsg}</span>}
              <HeaderBtn onClick={() => setEditMode(e => !e)} active={editMode}>
                {editMode ? <Check size={16} /> : <Pencil size={15} />}
              </HeaderBtn>
              <HeaderBtn onClick={onClose}><X size={16} /></HeaderBtn>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <HChip label="Школа" value={SCHOOL_NAME[savedFamily.schoolCode] ?? savedFamily.schoolCode} />
            <HChip label="Зона" value={`Зона ${savedFamily.zone}`} chipStyle={{ background: ZONE_COLOR[savedFamily.zone]?.bg, color: ZONE_COLOR[savedFamily.zone]?.color }} />
            {totalDebt > 0
              ? <HChip label="Долг" value={money(totalDebt)} chipStyle={{ background: '#FFEBEE', color: '#C62828' }} />
              : <HChip label="Баланс" value="✓ Нет долга" chipStyle={{ background: '#E8F5E9', color: '#2E7D32' }} />
            }
            <HChip label="Статус" value={statusLabel} />
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: '#fff', flexShrink: 0, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '11px 4px 10px', border: 'none', whiteSpace: 'nowrap',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2, background: 'none',
              color: tab === t.key ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              {t.icon}{t.label}
              {t.key === 'history' && audit.length > 0 && (
                <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>{audit.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {tab === 'info'      && <TabInfo      family={savedFamily} editMode={editMode} saving={saving} onSave={handleSaveFamily} />}
          {tab === 'children'  && <TabChildren  children={children} loading={loadingKids} family={savedFamily} editMode={editMode} isAdmin={isAdmin} />}
          {tab === 'logistics' && <TabLogistics family={savedFamily} children={children} loading={loadingKids} editMode={editMode} saving={saving} onSave={handleSaveFamily} />}
          {tab === 'finance'   && <TabFinance   payments={payments} loading={loadingPayments} family={savedFamily} editMode={editMode} isAdmin={isAdmin} isCashier={isCashier} onSavePayment={handleSavePayment} onDeletePayment={handleDeletePayment} onAddPayment={handleAddPayment} />}
          {tab === 'history'   && <TabHistory   audit={audit} />}
        </div>
      </div>

      <style>{`@keyframes slideIn { from { transform:translateX(40px); opacity:0 } to { transform:translateX(0); opacity:1 } }`}</style>
    </>
  );
}

// ─── Мелкие компоненты шапки ─────────────────────────────────────────────────

function HeaderBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#fff' : 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
      width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: active ? 'var(--accent)' : '#fff', flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

function HChip({ label, value, chipStyle }: { label: string; value: string; chipStyle?: React.CSSProperties }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.13)', borderRadius: 8, padding: '5px 11px', ...chipStyle }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: chipStyle?.color ?? 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: chipStyle?.color ?? '#fff' }}>{value}</span>
    </div>
  );
}
