import React, { useEffect, useState } from 'react';
import { User, Users, CreditCard, History, X } from 'lucide-react';
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
type Tab = 'info' | 'children' | 'finance' | 'history';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'info',     label: 'Основная', icon: <User size={12} /> },
  { key: 'children', label: 'Дети',     icon: <Users size={12} /> },
  { key: 'finance',  label: 'Финансы',  icon: <CreditCard size={12} /> },
  { key: 'history',  label: 'История',  icon: <History size={12} /> },
];

export default function InlineFamilyCard({ family, onClose, userRole = 'manager', userName = 'Менеджер' }: Props) {
  const [tab, setTab]                   = useState<Tab>('info');
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
    setSavedFamily(family);
    setTab('info');
    loadAll();
    loadAudit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  async function loadAll() {
    const kids = await loadChildren();
    await loadFinance(kids);
  }
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
  async function addAudit(action: string, field: string, oldVal: string, newVal: string) {
    try { await addV2Audit({ actorName: userName, action, entityType: field, entityId: family.id, oldValue: oldVal, newValue: newVal }); } catch {}
  }
  async function handleSaveFamily(updated: Family) {
    setSaving(true);
    try {
      await updateV2Family(family.id, updated); setSavedFamily(updated);
      setSaveMsg('Сохранено ✓'); setTimeout(() => setSaveMsg(''), 2000);
      await addAudit('Редактирование семьи', 'family', JSON.stringify(family), JSON.stringify(updated));
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
    await addAudit('Удаление начисления', PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth), money(charge.amount), '—');
    await loadFinance(); await loadAudit();
  }
  async function handleAddCharges(month: number, year: number) {
    await createChargesForPeriod(family.id, children, month, year);
    await addAudit('Добавление начислений', PERIOD_LABEL[String(month)] ?? String(month), '—', `${children.length} детей`);
    await loadFinance(); await loadAudit();
  }
  async function handleCreatePayment(amount: number, paymentType: any, comment: string, paymentDate: string, receiptFile?: File | null): Promise<boolean> {
    try {
      await createFamilyPayment({ familyId: family.id, amount, paymentType, paymentDate, receiptFile, comment, createdBy: userName });
      await addAudit('Внесение платежа', 'family_payment', '—', `${money(amount)} на проверке`);
      await loadFinance(); await loadAudit(); return true;
    } catch { return false; }
  }
  async function handleConfirmPayment(payment: FamilyPayment, actualPaymentDate: string): Promise<boolean> {
    try {
      await confirmFamilyPayment({ payment, charges, confirmedBy: userName, actualPaymentDate });
      await addAudit('Подтверждение платежа', 'family_payment', payment.status, `${money(payment.amount)} подтверждено`);
      await loadFinance(); await loadAudit(); return true;
    } catch { return false; }
  }

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const familyMonthlyPrice = children.length > 0
    ? getFamilyPrice(children.map(c => ({ schoolCode: c.schoolCode, zone: c.zone, vehicleType: c.vehicleType })))
    : savedFamily.monthlyPrice;
  const totalCharged = charges.reduce((s, c) => s + c.amount + c.penaltyAmount, 0);
  const totalPaid    = charges.reduce((s, c) => s + c.paidAmount, 0);

  return (
    <div style={{ background: '#F8F9FF', borderTop: '2px solid #312E81' }}>

      {/* ─── КОМПАКТНЫЙ ХЕДЕР ─── */}
      <div style={{
        background: '#312E81',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* Имя + телефон */}
        <div style={{ minWidth: 0, flex: '0 0 220px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatName(savedFamily.parentName)}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>
            {formatPhone(savedFamily.phone)}
            {saveMsg && <span style={{ marginLeft: 8, color: '#A5D6A7' }}>{saveMsg}</span>}
          </div>
        </div>

        {/* Финансовые чипы — компактные */}
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <MiniChip label="Начислено" value={money(totalCharged)} />
          <MiniChip label="Оплачено"  value={money(totalPaid)}    color="#6EE7B7" />
          <MiniChip
            label="Долг" value={money(totalDebt)}
            color={totalDebt > 0 ? '#FCA5A5' : '#6EE7B7'}
          />
          <MiniChip
            label="Баланс" value={money(mainBalance)}
            sub={familyMonthlyPrice > 0 ? `${money(familyMonthlyPrice)}/мес` : undefined}
            color={mainBalance < 0 ? '#FCA5A5' : 'rgba(255,255,255,0.9)'}
          />
        </div>

        {/* Табы */}
        <div style={{ display: 'flex', gap: 2, flex: '0 0 auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '5px 10px', border: 'none', borderRadius: 6,
              background: tab === t.key ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 11, fontWeight: tab === t.key ? 700 : 400,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              borderBottom: tab === t.key ? '2px solid #fff' : '2px solid transparent',
              transition: 'all 0.15s',
            }}>
              {t.icon}{t.label}
              {t.key === 'history' && audit.length > 0 && (
                <span style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, fontSize: 9, padding: '1px 4px', fontWeight: 700 }}>
                  {audit.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Закрыть */}
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6,
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff', flexShrink: 0,
        }}>
          <X size={14} />
        </button>
      </div>

      {/* ─── КОНТЕНТ ─── */}
      <div style={{ padding: '12px 16px', maxHeight: 460, overflowY: 'auto' }}>
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
  );
}

function MiniChip({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 10px',
      display: 'flex', flexDirection: 'column', gap: 1, minWidth: 90,
    }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: color ?? 'rgba(255,255,255,0.9)', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{sub}</div>}
    </div>
  );
}
