import React, { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, LayoutDashboard, MapPin, Phone, Clock, X, Trash2 } from 'lucide-react';
import { Family, Child, Charge, FamilyPayment, PaymentItem, VehicleType, Zone } from '../../types';
import { getFamilyPrice, getPriceByZone, money } from '../../utils/pricing';
import { PERIOD_LABEL } from './constants';
import { formatName, formatPhone } from '../../utils/format';
import { addV2Audit, createV2Child, deleteV2Child, fetchV2Branches, fetchV2Children, updateV2Child, updateV2ChildRoute, updateV2Family, V2BranchOption } from '../../services/crmV2Service';
import {
  confirmFamilyPayment, unconfirmFamilyPayment, createChargesForPeriod, createFamilyPayment,
  deleteFamilyPayment, deleteCharge, fetchFinanceSnapshot,
  updateFamilyPayment, updateCharge,
} from '../../services/financeService';
import TabFinance from './TabFinance';
import TabHistory from './TabHistory';
import NotionSelect from '../../core/selects/NotionSelect';

interface AuditEntry {
  id: string; familyId: string; userName: string;
  action: string; field: string; oldValue: string; newValue: string; createdAt: string;
}
interface Props {
  family: Family; onClose: () => void; userRole?: string; userName?: string; initialTab?: Tab; onUpdated?: () => void;
}
type Tab = 'overview' | 'finance' | 'history';

const TABS: { key: Tab; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Основная', desc: 'контакт, адрес, дети', icon: <LayoutDashboard size={15} /> },
  { key: 'finance', label: 'Финансы', desc: 'платежи и начисления', icon: <CreditCard size={15} /> },
  { key: 'history', label: 'История', desc: 'изменения и события', icon: <Clock size={15} /> },
];

const ZONE_OPTIONS = ['A', 'B', 'C'].map(value => ({ value, label: value }));
const VEHICLE_TYPE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'microbus', label: 'Микроавтобус' },
  { value: 'minivan', label: 'Минивэн' },
  { value: 'sedan', label: 'Седан' },
];
const TRANSFER_OPTIONS = [{ value: '', label: '-' }, ...Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `№ ${i + 1}` }))];
const STOP_OPTIONS = [{ value: '', label: '-' }, ...Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))];
const DISCOUNT_PERCENT_OPTIONS = Array.from({ length: 21 }, (_, i) => {
  const value = String(i * 5);
  return { value, label: i === 0 ? '-' : `${value}%` };
});

export default function InlineFamilyCard({ family, onClose, userRole = 'manager', userName = 'Менеджер', initialTab = 'overview', onUpdated }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [children, setChildren] = useState<Child[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<FamilyPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([]);
  const [mainBalance, setMainBalance] = useState(0);
  const [depositBalance, setDepositBalance] = useState(0);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [branches, setBranches] = useState<V2BranchOption[]>([]);
  const [, setLoadingKids] = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [financeLoaded, setFinanceLoaded] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [, setSaving] = useState(false);
  const [savedFamily, setSavedFamily] = useState<Family>(family);
  const [saveMsg, setSaveMsg] = useState('');
  const [childActionBusy, setChildActionBusy] = useState(false);

  const isAdmin = userRole === 'admin' || userRole === 'director' || userRole === 'gen_director';
  const isCashier = userRole === 'cashier';

  useEffect(() => {
    setSavedFamily(family);
    setTab(initialTab);
    setFinanceLoaded(false);
    setAuditLoaded(false);
    loadChildren();
    fetchV2Branches().then(setBranches).catch(() => setBranches([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);
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
    setFinanceLoaded(true);
  }
  async function loadAudit() {
    try {
      const { supabase } = await import('../../services/supabase');
      const { data } = await supabase.from('v2_audit_log').select('*').eq('entity_id', family.id)
        .order('created_at', { ascending: false }).limit(50);
      if (data) {
        const filtered = userRole === 'gen_director'
          ? data.filter((r: any) => (r.actor_role ?? '') !== 'admin')
          : data;
        setAudit(filtered.map((r: any) => ({
          id: String(r.id), familyId: String(r.entity_id),
          userName: r.actor_name ?? 'Система', action: r.action ?? '',
          field: r.entity_type ?? '', oldValue: JSON.stringify(r.old_value ?? ''),
          newValue: JSON.stringify(r.new_value ?? ''), createdAt: r.created_at ?? '',
        })));
      }
      setAuditLoaded(true);
    } catch { setAuditLoaded(true); }
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
      onUpdated?.();
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
  async function handleCreatePayment(amount: number, paymentType: any, comment: string, paymentDate: string, receiptFile?: File | null, receiptCode?: string): Promise<boolean> {
    try {
      await createFamilyPayment({ familyId: family.id, amount, paymentType, paymentDate, receiptFile, receiptCode, comment, createdBy: userName });
      try {
        await addAudit('Платёж', 'family_payment', '-', `${money(amount)} на проверке`);
      } catch (error) {
        console.error('Payment audit save failed', error);
      }
      await loadFinance();
      await loadAudit();
      onUpdated?.();
      return true;
    } catch (error) {
      console.error('Payment save failed', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось внести платёж');
      return false;
    }
  }
  async function handleConfirmPayment(payment: FamilyPayment, actualPaymentDate: string): Promise<boolean> {
    try {
      await confirmFamilyPayment({ payment, charges, confirmedBy: userName, actualPaymentDate });
      await addAudit('Подтверждение', 'family_payment', payment.status, `${money(payment.amount)} подтверждено`);
      await loadFinance();
      await loadAudit();
      onUpdated?.();
      return true;
    } catch { return false; }
  }

  async function handleUnconfirmPayment(payment: FamilyPayment): Promise<boolean> {
    try {
      await unconfirmFamilyPayment(payment);
      await addAudit('Отмена подтверждения', 'family_payment', payment.status, `${money(payment.amount)} откатано`);
      await loadFinance();
      await loadAudit();
      onUpdated?.();
      return true;
    } catch { return false; }
  }
  async function handleSaveChild(child: Child, patch: Partial<Child>): Promise<boolean> {
    try {
      const nextChild = { ...child, ...patch };
      const dbPatch: Record<string, unknown> = {};
      const shouldReprice = 'zone' in patch || 'vehicleType' in patch || 'basePrice' in patch || 'manualDiscountPercent' in patch || 'manualDiscountAmount' in patch;

      if ('childName' in patch) dbPatch.child_name = nextChild.childName;
      if ('class' in patch) dbPatch.class_name = nextChild.class;
      if ('branchId' in patch) dbPatch.branch_id = nextChild.branchId ?? null;
      if ('schoolId' in patch) dbPatch.school_id = nextChild.schoolId ?? null;
      if ('zone' in patch) dbPatch.zone = nextChild.zone;
      if ('selfExitAllowed' in patch) dbPatch.self_exit_allowed = Boolean(nextChild.selfExitAllowed);

      if (shouldReprice) {
        const basePrice = ('zone' in patch || 'vehicleType' in patch)
          ? getPriceByZone(nextChild.schoolCode, nextChild.zone as Zone, nextChild.vehicleType as VehicleType)
          : Math.max(0, Number(nextChild.basePrice || 0));
        const discountPercent = clampToStep(Number(nextChild.manualDiscountPercent || 0), 0, 100, 5);
        const percentAmount = Math.round(basePrice * discountPercent / 100);
        const maxManualAmount = Math.max(0, basePrice - percentAmount);
        const manualAmount = clampToStep(Number(nextChild.manualDiscountAmount || 0), 0, maxManualAmount, 100);
        const finalPrice = Math.max(0, basePrice - percentAmount - manualAmount);

        nextChild.basePrice = basePrice;
        nextChild.manualDiscountPercent = discountPercent;
        nextChild.manualDiscountAmount = manualAmount;
        nextChild.finalPrice = finalPrice;
        dbPatch.base_price = basePrice;
        dbPatch.manual_discount_percent = discountPercent;
        dbPatch.manual_discount_amount = manualAmount;
        dbPatch.final_price = finalPrice;
      } else if ('finalPrice' in patch) {
        nextChild.finalPrice = Math.max(0, Number(nextChild.finalPrice || 0));
        dbPatch.final_price = nextChild.finalPrice;
      }

      if ('vehicleType' in patch || 'transferNumber' in patch || 'stopNumber' in patch || 'timeMorning' in patch) {
        await updateV2ChildRoute({
          child: nextChild,
          vehicleType: nextChild.vehicleType as VehicleType,
          transferNumber: nextChild.transferNumber,
          stopNumber: nextChild.stopNumber,
          timeMorning: nextChild.timeMorning,
        });
        delete dbPatch.vehicle_type;
      }

      if (Object.keys(dbPatch).length > 0) {
        await updateV2Child(child.id, dbPatch);
      }

      setChildren(prev => prev.map(item => item.id === child.id ? nextChild : item));
      await addAudit('Редактирование ребёнка', 'child', JSON.stringify(child), JSON.stringify(nextChild));
      await loadFinance(children.map(item => item.id === child.id ? nextChild : item));
      onUpdated?.();
      return true;
    } catch {
      return false;
    }
  }

  function nextChildName() {
    const base = 'Новый ребёнок';
    const names = new Set(children.map(child => child.childName.trim().toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let index = children.length + 1;
    while (names.has(`${base} ${index}`.toLowerCase())) index++;
    return `${base} ${index}`;
  }

  async function handleAddChild() {
    if (childActionBusy) return;
    const template = children[children.length - 1];
    const schoolCode = (template?.schoolCode || savedFamily.schoolCode || 'KINGS') as any;
    const zone = (template?.zone || savedFamily.zone || 'A') as Zone;
    const vehicleType = (template?.vehicleType || savedFamily.vehicleType || 'microbus') as VehicleType;
    const basePrice = getPriceByZone(schoolCode, zone, vehicleType);
    setChildActionBusy(true);
    try {
      const created = await createV2Child(savedFamily, {
        childName: nextChildName(),
        class: '',
        schoolCode,
        schoolId: template?.schoolId,
        branchId: template?.branchId ?? savedFamily.branchId,
        branchCode: template?.branchCode ?? savedFamily.branchCode,
        branchShort: template?.branchShort ?? savedFamily.branchShort,
        branchName: template?.branchName ?? savedFamily.branchName,
        address: template?.address ?? savedFamily.fullAddress,
        zone,
        vehicleType,
        basePrice,
        finalPrice: basePrice,
        status: 'new',
      });
      const next = [...children, created];
      setChildren(next);
      await loadFinance(next);
      await addAudit('Добавлен ребёнок', 'child', '-', created.childName);
      await loadAudit();
      onUpdated?.();
    } catch (error: any) {
      window.alert('Не удалось добавить ребёнка: ' + (error?.message ?? String(error)));
    } finally {
      setChildActionBusy(false);
    }
  }

  async function handleDeleteChild(child: Child) {
    if (childActionBusy) return;
    if (!window.confirm(`Удалить ребёнка "${child.childName || 'Без имени'}"?`)) return;
    setChildActionBusy(true);
    try {
      await deleteV2Child(String(child.id));
      const next = children.filter(item => item.id !== child.id);
      setChildren(next);
      await loadFinance(next);
      await addAudit('Удалён ребёнок', 'child', child.childName, '-');
      await loadAudit();
      onUpdated?.();
    } catch (error: any) {
      window.alert('Не удалось удалить ребёнка: ' + (error?.message ?? String(error)));
    } finally {
      setChildActionBusy(false);
    }
  }

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const totalPaid = charges.reduce((s, c) => s + c.paidAmount, 0);
  const totalCharged = charges.reduce((s, c) => s + c.amount, 0);
  const pendingAmount = payments.filter(p => p.status === 'На проверке').reduce((s, p) => s + p.amount, 0);
  const depositCharge = charges.find(c => c.chargeType === 'deposit');
  const depositPaid = depositCharge ? depositCharge.debtAmount <= 0 : false;
  const primaryChild = children[0];
  const familyMonthlyPrice = children.length > 0
    ? getFamilyPrice(children.map(c => ({ schoolCode: c.schoolCode, zone: c.zone, vehicleType: c.vehicleType })))
    : savedFamily.monthlyPrice;
  const initials = (savedFamily.parentName ?? '?').trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const coordinatesText = savedFamily.latitude && savedFamily.longitude
    ? `${savedFamily.latitude.toFixed(6)}, ${savedFamily.longitude.toFixed(6)}`
    : primaryChild?.latitude && primaryChild?.longitude
      ? `${primaryChild.latitude.toFixed(6)}, ${primaryChild.longitude.toFixed(6)}`
      : '-';
  const mapUrl = savedFamily.latitude && savedFamily.longitude
    ? `https://yandex.com/maps/?ll=${savedFamily.longitude},${savedFamily.latitude}&z=16&pt=${savedFamily.longitude},${savedFamily.latitude},pm2rdm`
    : primaryChild?.latitude && primaryChild?.longitude
      ? `https://yandex.com/maps/?ll=${primaryChild.longitude},${primaryChild.latitude}&z=16&pt=${primaryChild.longitude},${primaryChild.latitude},pm2rdm`
      : '';

  return (
    <div style={modalStyle()}>
      <style>{`
        .family-detail-rows > .family-detail-row:nth-child(odd) { background: #F7FBFB; }
        .family-detail-rows > .family-detail-row:nth-child(even) { background: #FFFFFF; }
        .family-detail-rows > .family-detail-row:hover { background: #EAF6F6; }
        .family-child-table tbody tr:nth-child(odd) td { background: #F7FBFB; }
        .family-child-table tbody tr:nth-child(even) td { background: #FFFFFF; }
        .family-child-table tbody tr:hover td { background: #EAF6F6; }
      `}</style>
      <aside style={sidebarRailStyle}>
          <nav style={railNavStyle}>
            {TABS.filter(item => {
              if (item.key === 'history') return userRole === 'admin' || userRole === 'gen_director';
              return true;
            }).map(item => {
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
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header style={contentHeaderStyle}>
          <div style={headerInfoStyle}>
            <div style={avatarStyle}>{initials}</div>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#111827', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatName(savedFamily.parentName)}
              </div>
              <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, color: '#374151', fontSize: 11, fontWeight: 750 }}>
                <Phone size={11} color="#7B8491" />
                <span>{savedFamily.phone ? formatPhone(savedFamily.phone) : 'телефон не указан'}</span>
              </div>
              <div style={{ marginTop: 2, fontSize: 10, color: '#9CA3AF', fontWeight: 600, userSelect: 'all', cursor: 'text' }}>
                ID: {family.id}
              </div>
            </div>
            <div style={headerMetricsStyle}>
              <SideMetric label="/мес" value={money(familyMonthlyPrice)} />
              {depositCharge && (
                <SideMetric
                  label="Депозит"
                  value={depositPaid ? money(depositCharge.amount) : `${money(depositCharge.paidAmount)} / ${money(depositCharge.amount)}`}
                  alert={!depositPaid}
                />
              )}
              <SideMetric label="Платежи" value={money(totalPaid)} />
              {pendingAmount > 0 && <SideMetric label="На проверке" value={money(pendingAmount)} pending />}
              <SideMetric label="Баланс" value={money(mainBalance)} alert={mainBalance < 0} />
              <div style={{ width: 10, flexShrink: 0 }} />
              <SideMetric label="Начислено" value={money(totalCharged)} />
              <SideMetric label="Оплачено" value={money(totalPaid)} />
              {totalDebt > 0 && <SideMetric label="Долг" value={money(totalDebt)} alert />}
            </div>
            {saveMsg && <div style={{ fontSize: 10, color: saveMsg === 'Ошибка' ? '#DC2626' : '#059669', fontWeight: 800 }}>{saveMsg}</div>}
          </div>
          <button onClick={onClose} style={closeButtonStyle}>
            <X size={16} />
          </button>
        </header>

        <div style={contentBodyStyle}>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <DetailPanel title="Контакт">
                  <DetailInput label="Родитель" tone="soft" value={savedFamily.parentName} onCommit={value => handleSaveFamily({ ...savedFamily, parentName: formatName(value) })} />
                  <DetailInput label="Телефон 1" tone="soft" value={savedFamily.phone} onCommit={value => handleSaveFamily({ ...savedFamily, phone: formatPhone(value) })} />
                  <DetailInput label="Телефон 2" tone="soft" value={savedFamily.secondPhone ?? ''} placeholder="-" onCommit={value => handleSaveFamily({ ...savedFamily, secondPhone: formatPhone(value) })} />
                  <DetailInput label="Telegram" tone="soft" value={savedFamily.phoneTelegram ?? ''} placeholder="-" onCommit={value => handleSaveFamily({ ...savedFamily, phoneTelegram: value })} />
                </DetailPanel>
                <DetailPanel title="Доп. контакт">
                  <DetailInput label="Имя" tone="soft" value={savedFamily.contactName ?? ''} placeholder="-" onCommit={value => handleSaveFamily({ ...savedFamily, contactName: formatName(value) })} />
                  <DetailInput label="Телефон" tone="soft" value={savedFamily.contactPhone ?? ''} placeholder="-" onCommit={value => handleSaveFamily({ ...savedFamily, contactPhone: formatPhone(value) })} />
                </DetailPanel>
                <DetailPanel title="Адрес">
                  <DetailInput label="Адрес" tone="clear" value={savedFamily.fullAddress} onCommit={value => handleSaveFamily({ ...savedFamily, fullAddress: value })} />
                  <DetailValue label="Координаты" value={coordinatesText} />
                  <DetailMapLink label="Яндекс" url={mapUrl} />
                  <DetailInput label="Комментарий" tone="clear" value={savedFamily.comment ?? ''} placeholder="-" onCommit={value => handleSaveFamily({ ...savedFamily, comment: value })} />
                </DetailPanel>
              </div>

              <DetailPanel title={`Дети (${children.length})`}>
                <ChildrenOverviewTable children={children} branches={branches} onSaveChild={handleSaveChild} onAddChild={handleAddChild} onDeleteChild={handleDeleteChild} busy={childActionBusy} />
              </DetailPanel>
            </div>
          )}

          {tab === 'finance' && (
            <TabFinanceLazy
              loaded={financeLoaded}
              onLoad={() => loadFinance()}
              charges={charges} payments={payments} paymentItems={paymentItems}
              loading={loadingFinance} family={savedFamily} children={children}
              mainBalance={mainBalance} depositBalance={depositBalance}
              isAdmin={isAdmin} isCashier={isCashier} userRole={userRole as any}
              onSaveCharge={handleSaveCharge} onDeleteCharge={handleDeleteCharge}
              onAddCharges={handleAddCharges} onCreatePayment={handleCreatePayment}
              onConfirmPayment={handleConfirmPayment} onUnconfirmPayment={handleUnconfirmPayment} onSavePayment={handleSavePayment}
              onDeletePayment={handleDeletePayment}
            />
          )}
          {tab === 'history' && (
            <TabHistoryLazy loaded={auditLoaded} onLoad={loadAudit} audit={audit} />
          )}
        </div>
      </section>
    </div>
  );
}

function SideMetric({ label, value, alert, pending }: { label: string; value: string; alert?: boolean; pending?: boolean }) {
  return (
    <div style={{
      background: pending ? '#FFFBEB' : '#FFFFFF',
      borderRadius: 8,
      padding: '6px 9px',
      border: alert ? '1px solid #FECACA' : pending ? '1px solid #FDE68A' : '1px solid #E8EEF1',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: 7,
    }}>
      <div style={{ fontSize: 9, color: pending ? '#92400E' : '#8A94A3', textTransform: 'uppercase', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 850, color: alert ? '#B91C1C' : pending ? '#92400E' : '#111827' }}>{value}</div>
    </div>
  );
}

function TabFinanceLazy({ loaded, onLoad, ...props }: { loaded: boolean; onLoad: () => void } & React.ComponentProps<typeof TabFinance>) {
  useEffect(() => { if (!loaded) onLoad(); }, [loaded, onLoad]);
  if (!loaded) return <div style={{ padding: 40, textAlign: 'center', color: '#8A94A3', fontSize: 13 }}>Загрузка финансов...</div>;
  return <TabFinance {...props} />;
}

function TabHistoryLazy({ loaded, onLoad, audit }: { loaded: boolean; onLoad: () => void; audit: AuditEntry[] }) {
  useEffect(() => { if (!loaded) onLoad(); }, [loaded, onLoad]);
  if (!loaded) return <div style={{ padding: 40, textAlign: 'center', color: '#8A94A3', fontSize: 13 }}>Загрузка истории...</div>;
  return <TabHistory audit={audit} />;
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #E8EEF1', borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#111827', marginBottom: 8 }}>{title}</div>
      <div className="family-detail-rows">
        {children}
      </div>
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
    <label className="family-detail-row" style={detailFieldStyle(tone)}>
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

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="family-detail-row" style={detailFieldStyle('soft')}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={{ ...detailControlStyle, display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '-'}
      </span>
    </div>
  );
}

function DetailMapLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="family-detail-row" style={detailFieldStyle('soft')}>
      <span style={detailLabelStyle}>{label}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            ...detailControlStyle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#237F81',
            textDecoration: 'none',
          }}
        >
          <MapPin size={13} />
          <span>Открыть карту</span>
          <ExternalLink size={12} />
        </a>
      ) : (
        <span style={{ ...detailControlStyle, display: 'flex', alignItems: 'center', color: '#98A2B3' }}>-</span>
      )}
    </div>
  );
}

function ChildrenOverviewTable({
  children,
  branches,
  onSaveChild,
  onAddChild,
  onDeleteChild,
  busy,
}: {
  children: Child[];
  branches: V2BranchOption[];
  onSaveChild: (child: Child, patch: Partial<Child>) => Promise<boolean>;
  onAddChild: () => void;
  onDeleteChild: (child: Child) => void;
  busy?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: '#7B8491', fontWeight: 750 }}>{children.length ? `${children.length} детей` : 'Детей нет'}</span>
        <button type="button" onClick={onAddChild} disabled={busy} style={smallAddChildBtnStyle}>
          {busy ? '...' : '+ Добавить ребёнка'}
        </button>
      </div>
      {children.length === 0 ? (
        <div style={{ fontSize: 12, color: '#7B8491', padding: '12px 0' }}>Добавьте первого ребёнка</div>
      ) : (
        <div style={{ border: '1px solid #E8EEF1', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={childMatrixLabelHeadStyle}>Поле</th>
                {children.map((child, index) => (
                  <th key={child.id} style={childMatrixChildHeadStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={childCardIndexStyle}>{index + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <EditableText value={child.childName} onCommit={value => onSaveChild(child, { childName: formatName(value) })} strong />
                      </div>
                      <button type="button" onClick={() => onDeleteChild(child)} disabled={busy} title="Удалить" style={deleteChildBtnStyle}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                {

                  label: 'Школа',
                  render: (child: Child) => (
                    <EditableSelect
                      value={child.branchId ?? ''}
                      options={branches.map(b => ({ value: b.id, label: b.shortName || b.code }))}
                      onCommit={value => {
                        const branch = branches.find(b => b.id === value);
                        if (!branch) return Promise.resolve(false);
                        return onSaveChild(child, { branchId: branch.id, schoolId: branch.schoolId, branchCode: branch.code, branchShort: branch.shortName, branchName: branch.name, schoolCode: branch.code as Child['schoolCode'] });
                      }}
                    />
                  ),
                },
                { label: 'Класс', render: (child: Child) => <EditableText value={child.class} onCommit={value => onSaveChild(child, { class: value })} /> },
                { label: 'Зона', render: (child: Child) => <EditableSelect value={child.zone} options={ZONE_OPTIONS} onCommit={value => onSaveChild(child, { zone: value as Zone })} width={52} panelWidth={120} /> },
                { label: 'Тип ТС', render: (child: Child) => <EditableSelect value={child.vehicleType} options={VEHICLE_TYPE_OPTIONS} onCommit={value => onSaveChild(child, { vehicleType: value as VehicleType })} width={116} panelWidth={190} /> },
                { label: 'Трансфер', render: (child: Child) => <EditableSelect value={child.transferNumber ? String(child.transferNumber) : ''} options={TRANSFER_OPTIONS} onCommit={value => onSaveChild(child, { transferNumber: value ? Number(value) : undefined })} width={64} panelWidth={130} /> },
                { label: 'Остановка', render: (child: Child) => <EditableSelect value={child.stopNumber ? String(child.stopNumber) : ''} options={STOP_OPTIONS} onCommit={value => onSaveChild(child, { stopNumber: value ? Number(value) : undefined })} width={60} panelWidth={120} /> },
                { label: 'Утро', render: (child: Child) => <EditableText type="time" value={child.timeMorning ?? ''} onCommit={value => onSaveChild(child, { timeMorning: value || undefined })} /> },
                {
                  label: 'Самовыход',
                  render: (child: Child) => (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 650, color: 'var(--text)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={child.selfExitAllowed} onChange={e => void onSaveChild(child, { selfExitAllowed: e.currentTarget.checked })} />
                      {child.selfExitAllowed ? 'Да' : 'Нет'}
                    </label>
                  ),
                },
                { label: 'Скидка %', render: (child: Child) => <EditableSelect value={String(child.manualDiscountPercent || child.siblingDiscountPercent || 0)} options={DISCOUNT_PERCENT_OPTIONS} onCommit={value => onSaveChild(child, { manualDiscountPercent: Number(value || 0) })} width={58} panelWidth={120} /> },
                { label: 'Скидка сом', render: (child: Child) => <EditableNumber value={child.manualDiscountAmount || undefined} onCommit={value => onSaveChild(child, { manualDiscountAmount: value ?? 0 })} step={100} min={0} max={Math.max(0, Number(child.basePrice || child.finalPrice || 0))} /> },
                { label: 'Цена', render: (child: Child) => <span style={{ fontSize: 12, fontWeight: 750 }}>{money(Number(child.basePrice || child.finalPrice || 0))}</span> },
                { label: 'Итого', render: (child: Child) => <span style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{money(Number(child.finalPrice || 0))}</span> },
              ] as { label: string; render: (c: Child) => React.ReactNode }[]).map((row, rowIndex) => (
                <tr key={row.label}>
                  <td style={{ ...childMatrixLabelCellStyle, background: rowIndex % 2 === 0 ? '#F8FAFC' : '#fff' }}>{row.label}</td>
                  {children.map(child => (
                    <td key={child.id} style={{ ...childMatrixValueCellStyle, background: rowIndex % 2 === 0 ? '#FAFCFC' : '#fff' }}>{row.render(child)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EditableText({
  value,
  onCommit,
  type = 'text',
  strong,
}: {
  value: string;
  onCommit: (value: string) => Promise<boolean>;
  type?: string;
  strong?: boolean;
}) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => setLocal(value ?? ''), [value]);
  return (
    <input
      type={type}
      value={local}
      onChange={event => setLocal(event.currentTarget.value)}
      onBlur={() => {
        if (local !== (value ?? '')) void onCommit(local);
      }}
      style={childTableControlStyle(strong)}
    />
  );
}

function EditableNumber({
  value,
  onCommit,
  prefix,
  suffix,
  strong,
  step,
  min,
  max,
}: {
  value?: number;
  onCommit: (value: number | undefined) => Promise<boolean>;
  prefix?: string;
  suffix?: string;
  strong?: boolean;
  step?: number;
  min?: number;
  max?: number;
}) {
  const stringValue = value == null || Number.isNaN(value) ? '' : String(value);
  const [local, setLocal] = useState(stringValue);
  useEffect(() => setLocal(stringValue), [stringValue]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {prefix && <span style={{ color: '#98A2B3', fontSize: 10, fontWeight: 850 }}>{prefix}</span>}
      <input
        type="number"
        value={local}
        step={step}
        min={min}
        max={max}
        onChange={event => setLocal(event.currentTarget.value)}
        onBlur={() => {
          const parsed = local === '' ? undefined : clampNumber(Number(local), min, max, step);
          const nextLocal = parsed == null ? '' : String(parsed);
          if (nextLocal !== local) setLocal(nextLocal);
          if (nextLocal !== stringValue) void onCommit(parsed);
        }}
        style={{ ...childTableControlStyle(strong), width: 58 }}
      />
      {suffix && <span style={{ color: '#98A2B3', fontSize: 10, fontWeight: 850 }}>{suffix}</span>}
    </div>
  );
}

function EditableSelect({
  value,
  options,
  onCommit,
  width,
  panelWidth,
}: {
  value: string;
  options: { value: string; label: string }[];
  onCommit: (value: string) => Promise<boolean>;
  width?: number;
  panelWidth?: number;
}) {
  return (
    <NotionSelect
      value={value}
      options={options}
      onChange={nextValue => {
        if (nextValue !== value) void onCommit(nextValue);
      }}
      variant="inline"
      width={width ?? '100%'}
      panelWidth={panelWidth}
    />
  );
}

function clampNumber(value: number, min?: number, max?: number, step?: number): number {
  if (!Number.isFinite(value)) return min ?? 0;
  const lower = min ?? Number.NEGATIVE_INFINITY;
  const upper = max ?? Number.POSITIVE_INFINITY;
  const stepped = step && Number.isFinite(step) && step > 0 ? Math.round(value / step) * step : value;
  return Math.min(upper, Math.max(lower, stepped));
}

function clampToStep(value: number, min: number, max: number, step: number): number {
  return clampNumber(value, min, max, step);
}

function modalStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '76px minmax(0, 1fr)',
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

const sidebarRailStyle: React.CSSProperties = {
  borderRight: 'none',
  padding: '96px 0 12px 10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
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
    width: '100%',
    height: 42,
    border: '1px solid transparent',
    borderRight: active ? 'none' : '1px solid transparent',
    borderRadius: active ? '12px 0 0 12px' : 12,
    background: active ? 'var(--active-bg)' : 'transparent',
    color: active ? '#31A4A5' : '#98A2B3',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    boxShadow: active ? 'inset 3px 0 0 #31A4A5' : 'none',
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
  width: 36,
  height: 36,
  borderRadius: 12,
  background: '#D7EEEE',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 850,
  color: '#237F81',
  flexShrink: 0,
};

function detailFieldStyle(_tone: 'soft' | 'clear'): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '104px minmax(0, 1fr)',
    gap: 10,
    minWidth: 0,
    padding: '3px 8px',
    minHeight: 29,
    borderBottom: '1px solid #F0F3F5',
    borderRadius: 7,
    background: 'transparent',
    alignItems: 'center',
  };
}

const detailLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#7B8491',
};

const detailControlStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 24,
  border: '1px solid transparent',
  borderRadius: 7,
  background: 'transparent',
  color: '#111827',
  padding: '0 8px',
  fontSize: 12,
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
  padding: '10px 22px',
};

const headerInfoStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  flexWrap: 'wrap',
};

const headerMetricsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
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

const contentBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '14px 22px',
  background: 'var(--active-bg)',
};

const smallAddChildBtnStyle: React.CSSProperties = {
  height: 30,
  border: 'none',
  borderRadius: 9,
  background: '#31A4A5',
  color: '#fff',
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 850,
  cursor: 'pointer',
};

const deleteChildBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid #F5C8C8',
  borderRadius: 8,
  background: '#FFF5F5',
  color: '#C62828',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const childMatrixLabelHeadStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: '#F7FBFB',
  borderBottom: '1px solid #E8EEF1',
  fontSize: 10,
  fontWeight: 850,
  color: '#667085',
  textAlign: 'left',
  width: 100,
};

const childMatrixChildHeadStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: '#F7FBFB',
  borderBottom: '1px solid #E8EEF1',
  borderLeft: '1px solid #E8EEF1',
  fontSize: 11,
  fontWeight: 750,
  color: '#374151',
  textAlign: 'left',
};

const childMatrixLabelCellStyle: React.CSSProperties = {
  padding: '0 10px',
  height: 32,
  fontSize: 11,
  fontWeight: 750,
  color: '#8A94A3',
  borderBottom: '1px solid #F0F3F5',
  background: '#F8FAFC',
  whiteSpace: 'nowrap',
};

const childMatrixValueCellStyle: React.CSSProperties = {
  padding: '0 8px',
  height: 32,
  borderBottom: '1px solid #F0F3F5',
  borderLeft: '1px solid #E8EEF1',
};

const childCardIndexStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: '#D7EEEE',
  color: '#237F81',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 900,
  flexShrink: 0,
};

function childTableControlStyle(strong?: boolean): React.CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    height: 24,
    border: '1px solid transparent',
    borderRadius: 6,
    background: 'transparent',
    color: '#111827',
    padding: '0 4px',
    fontSize: 11,
    fontWeight: strong ? 850 : 750,
    outline: 'none',
  };
}
