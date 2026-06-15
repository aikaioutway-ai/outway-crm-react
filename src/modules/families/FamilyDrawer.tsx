import React, { useEffect, useState } from 'react';
import { X, User, Users, CreditCard, History } from 'lucide-react';
import { Family, Child, Charge, FamilyPayment, PaymentItem } from '../../types';
import { getFamilyPrice, money } from '../../utils/pricing';
import { PERIOD_LABEL } from './constants';
import { formatName, formatPhone } from '../../utils/format';
import { addV2Audit, fetchV2Children, updateV2Family } from '../../services/crmV2Service';
import {
  confirmFamilyPayment,
  createChargesForPeriod,
  createFamilyPayment,
  deleteFamilyPayment,
  deleteCharge,
  fetchFinanceSnapshot,
  updateFamilyPayment,
  updateCharge,
} from '../../services/financeService';
import TabInfo      from './TabInfo';
import TabChildren  from './TabChildren';
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

type Tab = 'info' | 'children' | 'finance' | 'history';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'info',      label: 'Основная',    icon: <User size={13} /> },
  { key: 'children',  label: 'Дети', icon: <Users size={13} /> },
  { key: 'finance',   label: 'Финансы',     icon: <CreditCard size={13} /> },
  { key: 'history',   label: 'История',     icon: <History size={13} /> },
];

export default function FamilyDrawer({ family, onClose, userRole = 'manager', userName = 'Менеджер' }: Props) {
  const [tab, setTab]               = useState<Tab>('info');
  const [children, setChildren]     = useState<Child[]>([]);
  const [charges, setCharges]       = useState<Charge[]>([]);
  const [payments, setPayments]     = useState<FamilyPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([]);
  const [mainBalance, setMainBalance] = useState(0);
  const [depositBalance, setDepositBalance] = useState(0);
  const [audit, setAudit]           = useState<AuditEntry[]>([]);
  const [loadingKids, setLoadingKids]         = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [savedFamily, setSavedFamily] = useState<Family>(family);
  const [saveMsg, setSaveMsg]       = useState('');

  const isAdmin   = userRole === 'admin' || userRole === 'director';
  const isCashier = userRole === 'cashier';

  useEffect(() => {
    setSavedFamily(family);
    loadAll();
    loadAudit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  async function loadAll() {
    const loadedChildren = await loadChildren();
    await loadFinance(loadedChildren);
  }

  async function loadChildren(): Promise<Child[]> {
    setLoadingKids(true);
    const next = await fetchV2Children(family);
    setChildren(next);
    setLoadingKids(false);
    return next;
  }

  async function loadFinance(loadedChildren = children) {
    setLoadingFinance(true);
    const snapshot = await fetchFinanceSnapshot(family.id, loadedChildren);
    setCharges(snapshot.charges);
    setPayments(snapshot.payments);
    setPaymentItems(snapshot.paymentItems);
    setMainBalance(snapshot.mainBalance ?? 0);
    setDepositBalance(snapshot.depositBalance ?? 0);
    setLoadingFinance(false);
  }

  async function loadAudit() {
    try {
      const { supabase } = await import('../../services/supabase');
      const { data } = await supabase.from('v2_audit_log').select('*').eq('entity_id', family.id)
        .order('created_at', { ascending: false }).limit(50);
      if (data) {
        setAudit(data.map((r: any) => ({
          id: String(r.id), familyId: String(r.entity_id),
          userName: r.actor_name ?? 'Система', action: r.action ?? '',
          field: r.entity_type ?? '', oldValue: JSON.stringify(r.old_value ?? ''), newValue: JSON.stringify(r.new_value ?? ''),
          createdAt: r.created_at ?? '',
        })));
      }
    } catch { /* таблица ещё не создана */ }
  }

  async function addAudit(action: string, field: string, oldVal: string, newVal: string) {
    try {
      await addV2Audit({
        actorName: userName,
        action,
        entityType: field,
        entityId: family.id,
        oldValue: oldVal,
        newValue: newVal,
      });
    } catch { /* таблица ещё не создана */ }
  }

  async function handleSaveFamily(updated: Family) {
    setSaving(true);
    try {
      await updateV2Family(family.id, updated);
      setSavedFamily(updated);
      setSaveMsg('Сохранено ✓');
      setTimeout(() => setSaveMsg(''), 2000);
      await addAudit('Редактирование семьи', 'family', JSON.stringify(family), JSON.stringify(updated));
      await loadAudit();
    } catch {
      setSaveMsg('Ошибка сохранения');
    }
    setSaving(false);
  }

  async function handleSaveCharge(charge: Charge, updates: Partial<Charge>): Promise<boolean> {
    try {
      await updateCharge(charge.id, updates);
      await loadFinance();
      await addAudit('Изменение начисления', PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth),
        `статус: ${charge.status}, сумма: ${charge.amount}`,
        `статус: ${updates.status ?? charge.status}, сумма: ${updates.amount ?? charge.amount}`);
      await loadAudit();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSavePayment(payment: FamilyPayment, updates: Partial<FamilyPayment>): Promise<boolean> {
    try {
      await updateFamilyPayment(payment.id, {
        amount: updates.amount,
        paymentType: updates.paymentType,
        paymentDate: updates.paymentDate,
        actualPaymentDate: updates.actualPaymentDate,
        status: updates.status,
        comment: updates.comment,
      });
      await addAudit('Изменение платежа', 'family_payment', JSON.stringify(payment), JSON.stringify(updates));
      await loadFinance();
      await loadAudit();
      return true;
    } catch {
      return false;
    }
  }

  async function handleDeletePayment(payment: FamilyPayment): Promise<boolean> {
    try {
      await deleteFamilyPayment(payment);
      await addAudit('Удаление платежа', 'family_payment', money(payment.amount), '—');
      await loadFinance();
      await loadAudit();
      return true;
    } catch {
      return false;
    }
  }

  async function handleDeleteCharge(charge: Charge) {
    if (!window.confirm('Удалить начисление?')) return;
    await deleteCharge(charge.id);
    await addAudit('Удаление начисления', PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth), money(charge.amount), '—');
    await loadFinance();
    await loadAudit();
  }

  async function handleAddCharges(month: number, year: number) {
    await createChargesForPeriod(family.id, children, month, year);
    await addAudit('Добавление начислений', PERIOD_LABEL[String(month)] ?? String(month), '—', `${children.length} детей`);
    await loadFinance();
    await loadAudit();
  }

  async function handleCreatePayment(amount: number, paymentType: any, comment: string, paymentDate: string, receiptFile?: File | null): Promise<boolean> {
    try {
      await createFamilyPayment({
        familyId: family.id,
        amount,
        paymentType,
        paymentDate,
        receiptFile,
        comment,
        createdBy: userName,
      });
      await addAudit('Внесение платежа', 'family_payment', '—', `${money(amount)} на проверке`);
      await loadFinance();
      await loadAudit();
      return true;
    } catch {
      return false;
    }
  }

  async function handleConfirmPayment(payment: FamilyPayment, actualPaymentDate: string): Promise<boolean> {
    try {
      await confirmFamilyPayment({ payment, charges, confirmedBy: userName, actualPaymentDate });
      await addAudit('Подтверждение платежа', 'family_payment', payment.status, `${money(payment.amount)} подтверждено, факт дата ${actualPaymentDate}`);
      await loadFinance();
      await loadAudit();
      return true;
    } catch {
      return false;
    }
  }

  // Долг по платежам (исключая депозит)
  const totalDebt = payments
    ? charges.reduce((s, c) => s + c.debtAmount, 0)
    : 0;

  // Правильная цена семьи = getFamilyPrice от детей
  const familyMonthlyPrice = children.length > 0
    ? getFamilyPrice(children.map(c => ({ schoolCode: c.schoolCode, zone: c.zone, vehicleType: c.vehicleType })))
    : savedFamily.monthlyPrice;
  const totalCharged = charges.reduce((s, c) => s + c.amount + c.penaltyAmount, 0);
  const totalPaid = charges.reduce((s, c) => s + c.paidAmount, 0);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 400 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 700,
        background: '#fff', zIndex: 401, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(49,46,129,0.18)', animation: 'slideIn 0.2s ease',
      }}>

        {/* ─── HEADER ─── */}
        <div style={{ background: 'var(--accent)', padding: '12px 20px 0', flexShrink: 0 }}>
          {/* Top row: name + actions */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: -0.3, lineHeight: 1.15 }}>
                {formatName(savedFamily.parentName)}
              </div>
              <div style={{ marginTop: 3, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {savedFamily.phone && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                    📞 {formatPhone(savedFamily.phone)}
                  </span>
                )}
                {savedFamily.phoneTelegram && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                    ✈ {savedFamily.phoneTelegram}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
              {saveMsg && <span style={{ fontSize: 12, color: '#A5D6A7', fontWeight: 600 }}>{saveMsg}</span>}
              <HeaderBtn onClick={onClose}><X size={16} /></HeaderBtn>
            </div>
          </div>

          {/* Chips row — stretched */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 0 }}>
            <HeaderChip
              label="НАЧИСЛЕНО"
              value={money(totalCharged)}
            />
            <HeaderChip
              label="ПЛАТЕЖИ"
              value={money(totalPaid)}
              chipBg="#D1FAE5"
              chipColor="#065F46"
            />
            <HeaderChip
              label="ДОЛГ"
              value={money(totalDebt)}
              chipBg={totalDebt > 0 ? '#FFEBEE' : '#E8F5E9'}
              chipColor={totalDebt > 0 ? '#C62828' : '#1B5E20'}
            />
            <HeaderChip
              label="БАЛАНС"
              value={money(mainBalance)}
              sub={familyMonthlyPrice > 0 ? `${money(familyMonthlyPrice)}/мес` : undefined}
              chipBg={mainBalance < 0 ? '#FFEBEE' : 'rgba(255,255,255,0.13)'}
              chipColor={mainBalance < 0 ? '#C62828' : undefined}
            />
          </div>

          {/* TABS */}
          <div style={{ display: 'flex', marginTop: 10 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '7px 4px 6px', border: 'none', whiteSpace: 'nowrap',
                borderBottom: tab === t.key ? '2px solid #fff' : '2px solid transparent',
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', background: '#FAFBFF' }}>
          {tab === 'info'      && <TabInfo      family={savedFamily} saving={saving} onSave={handleSaveFamily} />}
          {tab === 'children'  && <TabChildren  children={children} loading={loadingKids} family={savedFamily} isAdmin={isAdmin} onReload={loadAll} />}
          {tab === 'finance'   && <TabFinance
            charges={charges}
            payments={payments}
            paymentItems={paymentItems}
            loading={loadingFinance}
            family={savedFamily}
            children={children}
            mainBalance={mainBalance}
            depositBalance={depositBalance}
            isAdmin={isAdmin}
            isCashier={isCashier}
            onSaveCharge={handleSaveCharge}
            onDeleteCharge={handleDeleteCharge}
            onAddCharges={handleAddCharges}
            onCreatePayment={handleCreatePayment}
            onConfirmPayment={handleConfirmPayment}
            onSavePayment={handleSavePayment}
            onDeletePayment={handleDeletePayment}
          />}
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
      width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      borderRadius: 8, padding: '8px 12px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: chipColor ? chipColor + 'AA' : 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.65 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: chipColor ?? '#fff', lineHeight: 1.15 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, fontWeight: 500, color: chipColor ? chipColor + '99' : 'rgba(255,255,255,0.5)', marginTop: 0 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
