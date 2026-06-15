import React, { useEffect, useState } from 'react';
import { X, Phone, CreditCard, Users, Clock, Info } from 'lucide-react';
import { Family, Child, Charge, FamilyPayment, PaymentItem } from '../../types';
import { getFamilyPrice, money } from '../../utils/pricing';
import { PERIOD_LABEL } from './constants';
import { formatName, formatPhone } from '../../utils/format';
import { addV2Audit, fetchV2Children, updateV2Family } from '../../services/crmV2Service';
import {
  confirmFamilyPayment, createChargesForPeriod, createFamilyPayment,
  deleteFamilyPayment, deleteCharge, fetchFinanceSnapshot,
  updateFamilyPayment, updateCharge,
} from '../../services/financeService';
import TabInfo     from './TabInfo';
import TabChildren from './TabChildren';
import TabFinance  from './TabFinance';
import TabHistory  from './TabHistory';

interface AuditEntry {
  id: string; familyId: string; userName: string;
  action: string; field: string; oldValue: string; newValue: string; createdAt: string;
}
interface Props {
  family: Family; onClose: () => void; userRole?: string; userName?: string;
}
type Tab = 'finance' | 'children' | 'info' | 'history';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'finance',  label: 'Финансы', icon: <CreditCard size={11} /> },
  { key: 'children', label: 'Дети',    icon: <Users size={11} /> },
  { key: 'info',     label: 'Инфо',    icon: <Info size={11} /> },
  { key: 'history',  label: 'История', icon: <Clock size={11} /> },
];

export default function InlineFamilyCard({ family, onClose, userRole = 'manager', userName = 'Менеджер' }: Props) {
  const [tab, setTab]                   = useState<Tab>('finance');
  const [children, setChildren]         = useState<Child[]>([]);
  const [charges, setCharges]           = useState<Charge[]>([]);
  const [payments, setPayments]         = useState<FamilyPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([]);
  const [mainBalance, setMainBalance]   = useState(0);
  const [depositBalance, setDepositBalance] = useState(0);
  const [audit, setAudit]               = useState<AuditEntry[]>([]);
  const [loadingKids, setLoadingKids]   = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [savedFamily, setSavedFamily]   = useState<Family>(family);
  const [saveMsg, setSaveMsg]           = useState('');

  const isAdmin   = userRole === 'admin' || userRole === 'director';
  const isCashier = userRole === 'cashier';

  useEffect(() => {
    setSavedFamily(family); setTab('finance');
    loadAll(); loadAudit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  async function loadAll() { const k = await loadChildren(); await loadFinance(k); }
  async function loadChildren(): Promise<Child[]> {
    setLoadingKids(true);
    const next = await fetchV2Children(family);
    setChildren(next); setLoadingKids(false); return next;
  }
  async function loadFinance(kids = children) {
    setLoadingFinance(true);
    const snap = await fetchFinanceSnapshot(family.id, kids);
    setCharges(snap.charges); setPayments(snap.payments);
    setPaymentItems(snap.paymentItems);
    setMainBalance(snap.mainBalance ?? 0); setDepositBalance(snap.depositBalance ?? 0);
    setLoadingFinance(false);
  }
  async function loadAudit() {
    try {
      const { supabase } = await import('../../services/supabase');
      const { data } = await supabase.from('v2_audit_log').select('*').eq('entity_id', family.id)
        .order('created_at', { ascending: false }).limit(50);
      if (data) setAudit(data.map((r: any) => ({
        id: String(r.id), familyId: String(r.entity_id),
        userName: r.actor_name ?? 'Система', action: r.action ?? '',
        field: r.entity_type ?? '', oldValue: JSON.stringify(r.old_value ?? ''),
        newValue: JSON.stringify(r.new_value ?? ''), createdAt: r.created_at ?? '',
      })));
    } catch {}
  }
  async function addAudit(action: string, field: string, o: string, n: string) {
    try { await addV2Audit({ actorName: userName, action, entityType: field, entityId: family.id, oldValue: o, newValue: n }); } catch {}
  }
  async function handleSaveFamily(updated: Family) {
    setSaving(true);
    try {
      await updateV2Family(family.id, updated); setSavedFamily(updated);
      setSaveMsg('Сохранено ✓'); setTimeout(() => setSaveMsg(''), 2000);
      await addAudit('Редактирование', 'family', JSON.stringify(family), JSON.stringify(updated));
      await loadAudit();
    } catch { setSaveMsg('Ошибка'); }
    setSaving(false);
  }
  async function handleSaveCharge(charge: Charge, updates: Partial<Charge>): Promise<boolean> {
    try {
      await updateCharge(charge.id, updates); await loadFinance();
      await addAudit('Изменение начисления', PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth),
        `${charge.status} ${charge.amount}`, `${updates.status ?? charge.status} ${updates.amount ?? charge.amount}`);
      await loadAudit(); return true;
    } catch { return false; }
  }
  async function handleSavePayment(payment: FamilyPayment, updates: Partial<FamilyPayment>): Promise<boolean> {
    try {
      await updateFamilyPayment(payment.id, { amount: updates.amount, paymentType: updates.paymentType,
        paymentDate: updates.paymentDate, actualPaymentDate: updates.actualPaymentDate,
        status: updates.status, comment: updates.comment });
      await addAudit('Изменение платежа', 'family_payment', JSON.stringify(payment), JSON.stringify(updates));
      await loadFinance(); await loadAudit(); return true;
    } catch { return false; }
  }
  async function handleDeletePayment(payment: FamilyPayment): Promise<boolean> {
    try {
      await deleteFamilyPayment(payment);
      await addAudit('Удаление платежа', 'family_payment', money(payment.amount), '—');
      await loadFinance(); await loadAudit(); return true;
    } catch { return false; }
  }
  async function handleDeleteCharge(charge: Charge) {
    if (!window.confirm('Удалить начисление?')) return;
    await deleteCharge(charge.id);
    await addAudit('Удаление', PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth), money(charge.amount), '—');
    await loadFinance(); await loadAudit();
  }
  async function handleAddCharges(month: number, year: number) {
    await createChargesForPeriod(family.id, children, month, year);
    await addAudit('Начисления', PERIOD_LABEL[String(month)] ?? String(month), '—', `${children.length} детей`);
    await loadFinance(); await loadAudit();
  }
  async function handleCreatePayment(amount: number, paymentType: any, comment: string, paymentDate: string, receiptFile?: File | null): Promise<boolean> {
    try {
      await createFamilyPayment({ familyId: family.id, amount, paymentType, paymentDate, receiptFile, comment, createdBy: userName });
      await addAudit('Платёж', 'family_payment', '—', `${money(amount)} на проверке`);
      await loadFinance(); await loadAudit(); return true;
    } catch { return false; }
  }
  async function handleConfirmPayment(payment: FamilyPayment, actualPaymentDate: string): Promise<boolean> {
    try {
      await confirmFamilyPayment({ payment, charges, confirmedBy: userName, actualPaymentDate });
      await addAudit('Подтверждение', 'family_payment', payment.status, `${money(payment.amount)} подтверждено`);
      await loadFinance(); await loadAudit(); return true;
    } catch { return false; }
  }

  const totalDebt    = charges.reduce((s, c) => s + c.debtAmount, 0);
  const totalCharged = charges.reduce((s, c) => s + c.amount + c.penaltyAmount, 0);
  const totalPaid    = charges.reduce((s, c) => s + c.paidAmount, 0);
  const familyMonthlyPrice = children.length > 0
    ? getFamilyPrice(children.map(c => ({ schoolCode: c.schoolCode, zone: c.zone, vehicleType: c.vehicleType })))
    : savedFamily.monthlyPrice;

  const initials = (savedFamily.parentName ?? '?').trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px 1fr',
      background: '#fff',
      borderTop: '3px solid #312E81',
      borderBottom: '2px solid #E5E7EB',
      boxShadow: '0 4px 16px rgba(49,46,129,0.10)',
      maxHeight: 400,
    }}>

      {/* ─── ЛЕВАЯ УЗКАЯ ПАНЕЛЬ ─── */}
      <div style={{
        borderRight: '1px solid #E5E7EB',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: '#FAFAFA',
        overflowY: 'auto',
      }}>

        {/* Аватар + имя + закрыть */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: '#312E81',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
              {formatName(savedFamily.parentName)}
            </div>
            {saveMsg && <div style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>{saveMsg}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9CA3AF', padding: 2, flexShrink: 0,
          }}>
            <X size={13} />
          </button>
        </div>

        {/* Телефон */}
        {savedFamily.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={10} color="#9CA3AF" />
            <span style={{ fontSize: 11, color: '#374151', fontWeight: 500 }}>{formatPhone(savedFamily.phone)}</span>
          </div>
        )}

        {/* Дети */}
        {children.length > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
              Дети · {children.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {children.map((ch, i) => (
                <div key={ch.id} style={{
                  padding: '5px 8px', background: '#F3F4F6',
                  borderRadius: 6, borderLeft: '2px solid #312E81',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{ch.childName}</div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
                    {ch.schoolCode} · Зона {ch.zone}{i > 0 ? ' · −5%' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Финансовый дайджест — 4 маленьких метрики */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 'auto' }}>
          {[
            { label: 'Начислено', val: money(totalCharged), color: '#374151' },
            { label: 'Оплачено',  val: money(totalPaid),    color: '#059669' },
            { label: 'Долг',      val: money(totalDebt),    color: totalDebt > 0 ? '#DC2626' : '#059669', highlight: totalDebt > 0 },
            { label: '/мес',      val: money(familyMonthlyPrice), color: '#374151' },
          ].map(m => (
            <div key={m.label} style={{
              background: m.highlight ? '#FEF2F2' : '#F3F4F6',
              borderRadius: 6, padding: '5px 7px',
              border: m.highlight ? '1px solid #FECACA' : 'none',
            }}>
              <div style={{ fontSize: 8, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: m.color, marginTop: 1 }}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── ПРАВАЯ ПАНЕЛЬ ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Таб-бар */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E5E7EB',
          background: '#fff',
          flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '7px 14px',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid #312E81' : '2px solid transparent',
              marginBottom: -1,
              background: 'none',
              color: tab === t.key ? '#312E81' : '#6B7280',
              fontSize: 11, fontWeight: tab === t.key ? 700 : 400,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              whiteSpace: 'nowrap',
            }}>
              {t.icon} {t.label}
              {t.key === 'history' && audit.length > 0 && (
                <span style={{
                  background: '#EEF2FF', color: '#312E81',
                  borderRadius: 8, fontSize: 9, padding: '1px 5px', fontWeight: 700,
                }}>
                  {audit.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Контент */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
          {tab === 'info'     && <TabInfo     family={savedFamily} saving={saving} onSave={handleSaveFamily} />}
          {tab === 'children' && <TabChildren children={children} loading={loadingKids} family={savedFamily} isAdmin={isAdmin} onReload={loadAll} />}
          {tab === 'finance'  && (
            <TabFinance
              charges={charges} payments={payments} paymentItems={paymentItems}
              loading={loadingFinance} family={savedFamily} children={children}
              mainBalance={mainBalance} depositBalance={depositBalance}
              isAdmin={isAdmin} isCashier={isCashier}
              onSaveCharge={handleSaveCharge} onDeleteCharge={handleDeleteCharge}
              onAddCharges={handleAddCharges} onCreatePayment={handleCreatePayment}
              onConfirmPayment={handleConfirmPayment} onSavePayment={handleSavePayment}
              onDeletePayment={handleDeletePayment}
            />
          )}
          {tab === 'history'  && <TabHistory audit={audit} />}
        </div>
      </div>
    </div>
  );
}
