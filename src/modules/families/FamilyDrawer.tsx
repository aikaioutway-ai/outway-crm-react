import React, { useEffect, useState } from 'react';
import { X, User, Users, Truck, CreditCard, Pencil, Check, History } from 'lucide-react';
import { Family, Child, Payment } from '../../types';
import { getFamilyPrice, money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import { SCHOOL_NAME, ZONE_COLOR, normalizeZone, normalizeVehicle, zoneToNum, PERIOD_LABEL } from './constants';
import { formatName, formatPhone } from '../../utils/format';
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
  const [loadingKids, setLoadingKids]         = useState(true);
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

  async function loadChildren() {
    setLoadingKids(true);
    const { data } = await supabase.from('children').select('*').eq('family_id', family.id);
    if (data) {
      setChildren(data.map((r: any) => ({
        id: r.id, familyId: r.family_id, childName: r.child_name,
        class: r.class, selfExitAllowed: r.self_exit_allowed ?? false,
        routeSource: r.route_source, transferNumber: r.transfer_number,
        stopNumber: r.stop_number,
        schoolCode: r.school_code || family.schoolCode,
        zone: normalizeZone(r.zone, family.zone) as any,
        vehicleType: normalizeVehicle(r.vehicle_type) as any,
        timeMorning: r.time_morning,
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
      status: updated.status,
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

  // Долг по платежам (исключая депозит)
  const totalDebt = payments
    .filter(p => p.periodKey !== 'deposit' && ['Не оплачено', 'Просрочено', 'Частично оплачено'].includes(p.accountantStatus))
    .reduce((s, p) => s + Math.max(0, p.amount - p.factAmount), 0);

  // Правильная цена семьи = getFamilyPrice от детей
  const familyMonthlyPrice = children.length > 0
    ? getFamilyPrice(children.map(c => ({ schoolCode: c.schoolCode, zone: c.zone, vehicleType: c.vehicleType })))
    : savedFamily.monthlyPrice;

  const statusLabel = { active: 'Активный', new: 'Новый', inactive: 'Неактивный', rejected: 'Отказ' }[savedFamily.status] ?? savedFamily.status;
  const statusColor: Record<string, { bg: string; color: string }> = {
    active:   { bg: '#D1FAE5', color: '#065F46' },
    new:      { bg: '#DBEAFE', color: '#1E40AF' },
    inactive: { bg: '#F3F4F6', color: '#4B5563' },
    rejected: { bg: '#FEE2E2', color: '#991B1B' },
  };
  const sc = statusColor[savedFamily.status] ?? { bg: 'rgba(255,255,255,0.15)', color: '#fff' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 400 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 700,
        background: '#fff', zIndex: 401, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(49,46,129,0.18)', animation: 'slideIn 0.2s ease',
      }}>

        {/* ─── HEADER ─── */}
        <div style={{ background: 'var(--accent)', padding: '20px 24px 0', flexShrink: 0 }}>
          {/* Top row: name + actions */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: -0.3, lineHeight: 1.2 }}>
                {formatName(savedFamily.parentName)}
              </div>
              <div style={{ marginTop: 5, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {savedFamily.phone && (
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                    📞 {formatPhone(savedFamily.phone)}
                  </span>
                )}
                {savedFamily.phoneTelegram && (
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                    ✈ {savedFamily.phoneTelegram}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
              {saveMsg && <span style={{ fontSize: 12, color: '#A5D6A7', fontWeight: 600 }}>{saveMsg}</span>}
              <HeaderBtn onClick={() => setEditMode(e => !e)} active={editMode}>
                {editMode ? <Check size={16} /> : <Pencil size={15} />}
              </HeaderBtn>
              <HeaderBtn onClick={onClose}><X size={16} /></HeaderBtn>
            </div>
          </div>

          {/* Chips row — stretched */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 0 }}>
            <HeaderChip
              label="ШКОЛА"
              value={SCHOOL_NAME[savedFamily.schoolCode] ?? savedFamily.schoolCode}
              icon="🏫"
            />
            <HeaderChip
              label="ЗОНА"
              value={`Зона ${savedFamily.zone}`}
              sub={savedFamily.distanceKm ? `${savedFamily.distanceKm} км` : undefined}
              icon="📍"
              chipBg={ZONE_COLOR[savedFamily.zone]?.bg}
              chipColor={ZONE_COLOR[savedFamily.zone]?.color}
            />
            <HeaderChip
              label={totalDebt > 0 ? 'ДОЛГ' : 'БАЛАНС'}
              value={totalDebt > 0 ? money(totalDebt) : '✓ Нет долга'}
              sub={familyMonthlyPrice > 0 ? `${money(familyMonthlyPrice)}/мес` : undefined}
              icon={totalDebt > 0 ? '⚠' : '✓'}
              chipBg={totalDebt > 0 ? '#FFEBEE' : '#E8F5E9'}
              chipColor={totalDebt > 0 ? '#C62828' : '#1B5E20'}
            />
            <HeaderChip
              label="СТАТУС"
              value={statusLabel}
              icon="●"
              chipBg={sc.bg}
              chipColor={sc.color}
            />
          </div>

          {/* TABS */}
          <div style={{ display: 'flex', marginTop: 16 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '10px 4px 9px', border: 'none', whiteSpace: 'nowrap',
                borderBottom: tab === t.key ? '3px solid #fff' : '3px solid transparent',
                background: 'none',
                color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.55)',
                fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'color 0.15s',
              }}>
                {t.icon}{t.label}
                {t.key === 'history' && audit.length > 0 && (
                  <span style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: 10, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>{audit.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ─── CONTENT ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', background: '#FAFBFF' }}>
          {tab === 'info'      && <TabInfo      family={savedFamily} editMode={editMode} saving={saving} onSave={handleSaveFamily} />}
          {tab === 'children'  && <TabChildren  children={children} loading={loadingKids} family={savedFamily} editMode={editMode} isAdmin={isAdmin} onReload={loadChildren} />}
          {tab === 'logistics' && <TabLogistics family={savedFamily} children={children} loading={loadingKids} editMode={editMode} saving={saving} onSave={handleSaveFamily} onSaveChildren={async (updatedKids) => { for (const k of updatedKids) { await supabase.from('children').update({ transfer_number: k.transferNumber, stop_number: (k as any).stopNumber, time_morning: (k as any).timeMorning }).eq('id', k.id); } await loadChildren(); }} />}
          {tab === 'finance'   && <TabFinance   payments={payments} loading={loadingPayments} family={savedFamily} children={children} editMode={editMode} isAdmin={isAdmin} isCashier={isCashier} onSavePayment={handleSavePayment} onDeletePayment={handleDeletePayment} onAddPayment={handleAddPayment} />}
          {tab === 'history'   && <TabHistory   audit={audit} />}
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { transform:translateX(40px); opacity:0 } to { transform:translateX(0); opacity:1 } }
      `}</style>
    </>
  );
}

function HeaderBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#fff' : 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
      width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: active ? 'var(--accent)' : '#fff', flexShrink: 0,
      transition: 'background 0.15s',
    }}>
      {children}
    </button>
  );
}

function HeaderChip({ label, value, sub, icon, chipBg, chipColor }: {
  label: string; value: string; sub?: string; icon?: string;
  chipBg?: string; chipColor?: string;
}) {
  return (
    <div style={{
      background: chipBg ?? 'rgba(255,255,255,0.13)',
      borderRadius: 10, padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: chipColor ? chipColor + 'AA' : 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: chipColor ?? '#fff', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, fontWeight: 500, color: chipColor ? chipColor + '99' : 'rgba(255,255,255,0.5)', marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
