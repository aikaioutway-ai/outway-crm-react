import React, { useEffect, useState } from 'react';
import { Contact, CreditCard, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Phone, Users, Clock, X } from 'lucide-react';
import { Family, Child, Charge, FamilyPayment, PaymentItem } from '../../types';
import { getFamilyPrice, money } from '../../utils/pricing';
import { PERIOD_LABEL, SCHOOL_NAME, VT_LABEL } from './constants';
import { formatName, formatPhone } from '../../utils/format';
import { addV2Audit, fetchV2Children, updateV2Family } from '../../services/crmV2Service';
import {
  confirmFamilyPayment, createChargesForPeriod, createFamilyPayment,
  deleteFamilyPayment, deleteCharge, fetchFinanceSnapshot,
  updateFamilyPayment, updateCharge,
} from '../../services/financeService';
import TabInfo from './TabInfo';
import TabChildren from './TabChildren';
import TabFinance from './TabFinance';
import TabHistory from './TabHistory';

interface AuditEntry {
  id: string; familyId: string; userName: string;
  action: string; field: string; oldValue: string; newValue: string; createdAt: string;
}
interface Props {
  family: Family; onClose: () => void; userRole?: string; userName?: string; initialTab?: Tab;
}
type Tab = 'overview' | 'finance' | 'children' | 'contacts' | 'history';

const TABS: { key: Tab; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Обзор', desc: 'главное по семье', icon: <LayoutDashboard size={15} /> },
  { key: 'finance', label: 'Финансы', desc: 'платежи и начисления', icon: <CreditCard size={15} /> },
  { key: 'children', label: 'Дети', desc: 'школа, класс, цена', icon: <Users size={15} /> },
  { key: 'contacts', label: 'Контакты', desc: 'родитель и телефоны', icon: <Contact size={15} /> },
  { key: 'history', label: 'История', desc: 'изменения и события', icon: <Clock size={15} /> },
];

export default function InlineFamilyCard({ family, onClose, userRole = 'manager', userName = 'Менеджер', initialTab = 'overview' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [children, setChildren] = useState<Child[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<FamilyPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([]);
  const [mainBalance, setMainBalance] = useState(0);
  const [depositBalance, setDepositBalance] = useState(0);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingKids, setLoadingKids] = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFamily, setSavedFamily] = useState<Family>(family);
  const [saveMsg, setSaveMsg] = useState('');
  const [sidebarHidden, setSidebarHidden] = useState(false);

  const isAdmin = userRole === 'admin' || userRole === 'director';
  const isCashier = userRole === 'cashier';

  useEffect(() => {
    setSavedFamily(family);
    setTab(initialTab);
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
    setChildren(next);
    setLoadingKids(false);
    return next;
  }
  async function loadFinance(kids = children) {
    setLoadingFinance(true);
    const snap = await fetchFinanceSnapshot(family.id, kids);
    setCharges(snap.charges);
    setPayments(snap.payments);
    setPaymentItems(snap.paymentItems);
    setMainBalance(snap.mainBalance ?? 0);
    setDepositBalance(snap.depositBalance ?? 0);
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
      await updateV2Family(family.id, updated);
      setSavedFamily(updated);
      setSaveMsg('Сохранено');
      setTimeout(() => setSaveMsg(''), 2000);
      await addAudit('Редактирование', 'family', JSON.stringify(family), JSON.stringify(updated));
      await loadAudit();
    } catch {
      setSaveMsg('Ошибка');
    }
    setSaving(false);
  }
  async function handleSaveCharge(charge: Charge, updates: Partial<Charge>): Promise<boolean> {
    try {
      await updateCharge(charge.id, updates);
      await loadFinance();
      await addAudit('Изменение начисления', PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth),
        `${charge.status} ${charge.amount}`, `${updates.status ?? charge.status} ${updates.amount ?? charge.amount}`);
      await loadAudit();
      return true;
    } catch { return false; }
  }
  async function handleSavePayment(payment: FamilyPayment, updates: Partial<FamilyPayment>): Promise<boolean> {
    try {
      await updateFamilyPayment(payment.id, { amount: updates.amount, paymentType: updates.paymentType,
        paymentDate: updates.paymentDate, actualPaymentDate: updates.actualPaymentDate,
        status: updates.status, comment: updates.comment });
      await addAudit('Изменение платежа', 'family_payment', JSON.stringify(payment), JSON.stringify(updates));
      await loadFinance();
      await loadAudit();
      return true;
    } catch { return false; }
  }
  async function handleDeletePayment(payment: FamilyPayment): Promise<boolean> {
    try {
      await deleteFamilyPayment(payment);
      await addAudit('Удаление платежа', 'family_payment', money(payment.amount), '-');
      await loadFinance();
      await loadAudit();
      return true;
    } catch { return false; }
  }
  async function handleDeleteCharge(charge: Charge) {
    if (!window.confirm('Удалить начисление?')) return;
    await deleteCharge(charge.id);
    await addAudit('Удаление', PERIOD_LABEL[String(charge.periodMonth)] ?? String(charge.periodMonth), money(charge.amount), '-');
    await loadFinance();
    await loadAudit();
  }
  async function handleAddCharges(month: number, year: number) {
    await createChargesForPeriod(family.id, children, month, year);
    await addAudit('Начисления', PERIOD_LABEL[String(month)] ?? String(month), '-', `${children.length} детей`);
    await loadFinance();
    await loadAudit();
  }
  async function handleCreatePayment(amount: number, paymentType: any, comment: string, paymentDate: string, receiptFile?: File | null): Promise<boolean> {
    try {
      await createFamilyPayment({ familyId: family.id, amount, paymentType, paymentDate, receiptFile, comment, createdBy: userName });
      await addAudit('Платёж', 'family_payment', '-', `${money(amount)} на проверке`);
      await loadFinance();
      await loadAudit();
      return true;
    } catch { return false; }
  }
  async function handleConfirmPayment(payment: FamilyPayment, actualPaymentDate: string): Promise<boolean> {
    try {
      await confirmFamilyPayment({ payment, charges, confirmedBy: userName, actualPaymentDate });
      await addAudit('Подтверждение', 'family_payment', payment.status, `${money(payment.amount)} подтверждено`);
      await loadFinance();
      await loadAudit();
      return true;
    } catch { return false; }
  }

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const totalPaid = charges.reduce((s, c) => s + c.paidAmount, 0);
  const primaryChild = children[0];
  const familyMonthlyPrice = children.length > 0
    ? getFamilyPrice(children.map(c => ({ schoolCode: c.schoolCode, zone: c.zone, vehicleType: c.vehicleType })))
    : savedFamily.monthlyPrice;
  const initials = (savedFamily.parentName ?? '?').trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const currentTab = TABS.find(item => item.key === tab) ?? TABS[0];

  return (
    <div style={modalStyle(sidebarHidden)}>
      <aside style={sidebarHidden ? sidebarRailStyle : sidebarStyle}>
        {sidebarHidden ? (
          <nav style={railNavStyle}>
            {TABS.map(item => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  title={item.label}
                  style={railButtonStyle(active)}
                >
                  {item.icon}
                  {item.key === 'history' && audit.length > 0 && <span style={railBadgeStyle}>{audit.length > 9 ? '9+' : audit.length}</span>}
                </button>
              );
            })}
          </nav>
        ) : (
        <>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
          <div style={avatarStyle}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 850, color: '#111827', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {formatName(savedFamily.parentName)}
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, minHeight: 14 }}>
              <Phone size={11} color="#7B8491" />
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {savedFamily.phone ? formatPhone(savedFamily.phone) : 'телефон не указан'}
              </span>
            </div>
            {saveMsg && <div style={{ fontSize: 10, color: saveMsg === 'Ошибка' ? '#DC2626' : '#059669', fontWeight: 800, marginTop: 3 }}>{saveMsg}</div>}
          </div>
        </div>

        <div style={profileStatusStyle}>
          <div style={{
            ...profileStatusRingStyle,
            background: totalDebt > 0 ? '#FEE2E2' : '#FFEDD5',
            color: totalDebt > 0 ? '#991B1B' : '#F59E0B',
          }}>
            {totalDebt > 0 ? '!' : '✓'}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 850, color: '#111827' }}>
              {totalDebt > 0 ? 'Есть долг' : 'Финансы в порядке'}
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: '#6B7280', fontWeight: 650 }}>
              {children.length} детей · {money(familyMonthlyPrice)} / мес
            </div>
          </div>
        </div>

        <nav style={{ display: 'grid', gap: 4 }}>
          {TABS.map(item => {
            const active = tab === item.key;
            return (
              <button key={item.key} onClick={() => setTab(item.key)} style={navButtonStyle(active)}>
                {active && <span style={activeLineStyle} />}
                <span style={{ color: active ? '#F59E0B' : '#98A2B3', display: 'grid', placeItems: 'center' }}>{item.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: active ? 850 : 750 }}>{item.label}</span>
                  <span style={{ display: 'block', marginTop: 1, fontSize: 10, fontWeight: 600, color: '#98A2B3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</span>
                </span>
                {item.key === 'history' && audit.length > 0 && (
                  <span style={navBadgeStyle}>{audit.length > 99 ? '99+' : audit.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={sideMetricsWrapStyle}>
          <SideMetric label="Долг" value={money(totalDebt)} alert={totalDebt > 0} />
          <SideMetric label="Баланс" value={money(mainBalance)} alert={mainBalance < 0} />
          <SideMetric label="/мес" value={money(familyMonthlyPrice)} />
          <SideMetric label="Оплачено" value={money(totalPaid)} />
        </div>
        </>
        )}
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header style={contentHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button
              onClick={() => setSidebarHidden(value => !value)}
              style={sidebarToggleStyle}
              title={sidebarHidden ? 'Показать меню' : 'Скрыть меню'}
            >
              {sidebarHidden ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>{currentTab.label}</div>
              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 650, color: '#7B8491' }}>{currentTab.desc}</div>
            </div>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>
            <X size={16} />
          </button>
        </header>

        <div style={contentBodyStyle}>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <DetailPanel title="Семья">
                  <DetailInput label="Родитель" tone="soft" value={savedFamily.parentName} onCommit={value => handleSaveFamily({ ...savedFamily, parentName: formatName(value) })} />
                  <DetailInput label="Телефон" tone="soft" value={savedFamily.phone} onCommit={value => handleSaveFamily({ ...savedFamily, phone: formatPhone(value) })} />
                  <DetailInput label="Адрес" tone="clear" value={savedFamily.fullAddress} onCommit={value => handleSaveFamily({ ...savedFamily, fullAddress: value })} />
                  <DetailInput label="Комментарий" tone="clear" value={savedFamily.comment ?? ''} placeholder="-" onCommit={value => handleSaveFamily({ ...savedFamily, comment: value })} />
                </DetailPanel>
                <DetailPanel title="Маршрут">
                  <DetailSelect
                    label="Школа"
                    tone="soft"
                    value={savedFamily.schoolCode}
                    options={Object.entries(SCHOOL_NAME).map(([value, label]) => ({ value, label }))}
                    onCommit={value => handleSaveFamily({ ...savedFamily, schoolCode: value as Family['schoolCode'] })}
                  />
                  <DetailSelect
                    label="Транспорт"
                    tone="soft"
                    value={savedFamily.vehicleType}
                    options={Object.entries(VT_LABEL).map(([value, label]) => ({ value, label }))}
                    onCommit={value => handleSaveFamily({ ...savedFamily, vehicleType: value as Family['vehicleType'] })}
                  />
                  <DetailInput
                    label="Трансфер"
                    tone="clear"
                    value={String(savedFamily.transferNumber ?? primaryChild?.transferNumber ?? '')}
                    type="number"
                    placeholder="-"
                    onCommit={value => handleSaveFamily({ ...savedFamily, transferNumber: value ? Number(value) : undefined })}
                  />
                  <DetailInput
                    label="Время"
                    tone="clear"
                    value={savedFamily.timeMorning ?? primaryChild?.timeMorning ?? ''}
                    type="time"
                    placeholder="-"
                    onCommit={value => handleSaveFamily({ ...savedFamily, timeMorning: value || undefined })}
                  />
                </DetailPanel>
              </div>

              <DetailPanel title={`Дети (${children.length})`}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {children.length === 0 && <div style={{ fontSize: 12, color: '#7B8491' }}>Детей нет</div>}
                  {children.map(child => (
                    <div key={child.id} style={childOverviewRowStyle}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 850, color: '#111827' }}>{child.childName || 'Без имени'}</div>
                        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 650, color: '#7B8491' }}>
                          {child.class ? `${child.class} кл.` : 'класс не указан'} · {child.branchShort || child.schoolCode} · {child.transferNumber ? `№${child.transferNumber}` : 'без трансфера'}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 850, color: '#111827' }}>{money(Number(child.finalPrice ?? 0))}</div>
                    </div>
                  ))}
                </div>
              </DetailPanel>
            </div>
          )}

          {tab === 'contacts' && <TabInfo family={savedFamily} saving={saving} onSave={handleSaveFamily} />}
          {tab === 'children' && <TabChildren children={children} loading={loadingKids} family={savedFamily} isAdmin={isAdmin} compactColumns={sidebarHidden} onReload={loadAll} />}
          {tab === 'finance' && (
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
          {tab === 'history' && <TabHistory audit={audit} />}
        </div>
      </section>
    </div>
  );
}

function SideMetric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 8,
      padding: '8px 10px',
      border: alert ? '1px solid #FECACA' : '1px solid #E8EEF1',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: 8,
    }}>
      <div style={{ fontSize: 10, color: '#8A94A3', textTransform: 'uppercase', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 850, color: alert ? '#B91C1C' : '#111827' }}>{value}</div>
    </div>
  );
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #E8EEF1', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#111827', marginBottom: 10 }}>{title}</div>
      {children}
    </section>
  );
}

function DetailInput({ label, value, onCommit, placeholder = '-', type = 'text', tone = 'soft' }: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: string;
  tone?: 'soft' | 'clear';
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <label style={detailFieldStyle(tone)}>
      <span style={detailLabelStyle}>{label}</span>
      <input
        className="family-card-control"
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={event => setLocal(event.target.value)}
        onBlur={event => onCommit(event.currentTarget.value)}
        style={detailControlStyle}
      />
    </label>
  );
}

function DetailSelect({ label, value, options, onCommit, tone = 'soft' }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onCommit: (value: string) => void;
  tone?: 'soft' | 'clear';
}) {
  return (
    <label style={detailFieldStyle(tone)}>
      <span style={detailLabelStyle}>{label}</span>
      <select
        className="family-card-control"
        value={value}
        onChange={event => onCommit(event.currentTarget.value)}
        style={detailControlStyle}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function modalStyle(sidebarHidden: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: sidebarHidden ? '56px minmax(0, 1fr)' : '286px minmax(0, 1fr)',
    background: '#fff',
    border: '1px solid #DDE7EB',
    borderRadius: 18,
    boxShadow: '0 28px 70px rgba(8,11,11,0.18)',
    height: 'min(720px, calc(100vh - 48px))',
    minHeight: 560,
    maxHeight: 'calc(100vh - 48px)',
    overflow: 'hidden',
    width: '100%',
    margin: 0,
  };
}

const sidebarStyle: React.CSSProperties = {
  borderRight: 'none',
  padding: '18px 0 18px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  background: '#fff',
  overflowY: 'auto',
};

const sidebarRailStyle: React.CSSProperties = {
  borderRight: 'none',
  padding: '82px 8px 12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: '#fff',
  overflowY: 'auto',
};

const railNavStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  width: '100%',
};

function railButtonStyle(active: boolean): React.CSSProperties {
  return {
    position: 'relative',
    width: 38,
    height: 38,
    border: active ? '1px solid #E5ECEF' : '1px solid transparent',
    borderRadius: 10,
    background: active ? '#F7F9FB' : 'transparent',
    color: active ? '#F59E0B' : '#98A2B3',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  };
}

const railBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  right: 3,
  top: 3,
  minWidth: 14,
  height: 14,
  borderRadius: 999,
  background: '#EEF2F5',
  color: '#475569',
  display: 'inline-grid',
  placeItems: 'center',
  fontSize: 8,
  fontWeight: 850,
};

const avatarStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 13,
  background: '#FFEDD5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 850,
  color: '#F59E0B',
  flexShrink: 0,
};

const profileStatusStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '44px 1fr',
  gap: 10,
  alignItems: 'center',
  background: '#fff',
  border: '1px solid #E8EEF1',
  borderRadius: 14,
  padding: 12,
  marginRight: 18,
};

const profileStatusRingStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: 16,
  fontWeight: 900,
};

const activeLineStyle: React.CSSProperties = {
  position: 'absolute',
  right: -1,
  top: 0,
  bottom: 0,
  width: 1,
  background: '#F7F9FB',
};

function navButtonStyle(active: boolean): React.CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '22px 1fr auto',
    alignItems: 'center',
    gap: 9,
    border: active ? '1px solid #E5ECEF' : '1px solid transparent',
    borderRightColor: active ? '#F7F9FB' : 'transparent',
    borderRadius: active ? '10px 0 0 10px' : 10,
    background: active ? '#F7F9FB' : 'transparent',
    color: active ? '#111827' : '#667085',
    padding: '10px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: 'none',
  };
}

const sideMetricsWrapStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 7,
  marginTop: 4,
  marginRight: 18,
};

const navBadgeStyle: React.CSSProperties = {
  minWidth: 18,
  height: 18,
  borderRadius: 999,
  background: '#EEF2F5',
  color: '#475569',
  display: 'inline-grid',
  placeItems: 'center',
  fontSize: 10,
  fontWeight: 850,
};

function detailFieldStyle(tone: 'soft' | 'clear'): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '120px minmax(0, 1fr)',
    gap: 12,
    minWidth: 0,
    padding: '4px 8px',
    minHeight: 34,
    borderBottom: '1px solid #F0F3F5',
    borderRadius: 7,
    background: tone === 'soft' ? '#F8FAFC' : '#FFF8F1',
    alignItems: 'center',
  };
}

const detailLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: '#7B8491',
};

const detailControlStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 28,
  border: '1px solid transparent',
  borderRadius: 7,
  background: 'transparent',
  color: '#111827',
  padding: '0 8px',
  fontSize: 13,
  fontWeight: 750,
  outline: 'none',
};

const contentHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid #E5ECEF',
  background: '#fff',
  flexShrink: 0,
  padding: '18px 22px',
};

const closeButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: '#fff',
  border: '1px solid #E5ECEF',
  borderRadius: 10,
  cursor: 'pointer',
  color: '#6B7280',
  padding: 0,
  flexShrink: 0,
  display: 'grid',
  placeItems: 'center',
};

const sidebarToggleStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: '#fff',
  border: '1px solid #E5ECEF',
  borderRadius: 10,
  cursor: 'pointer',
  color: '#6B7280',
  padding: 0,
  flexShrink: 0,
  display: 'grid',
  placeItems: 'center',
};

const contentBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '18px 22px',
  background: '#F7F9FB',
};

const childOverviewRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
  alignItems: 'center',
  padding: '9px 0',
  borderBottom: '1px solid #EDF0F2',
};
