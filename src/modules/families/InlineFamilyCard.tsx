import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CreditCard, ExternalLink, LayoutDashboard, MapPin, MessageCircle, Phone, Clock, X, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { Family, Child, Charge, FamilyPayment, PaymentItem, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import { PERIOD_LABEL } from './constants';
import { formatName, formatPhone, whatsAppLink } from '../../utils/format';
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
  { value: 'microbus', label: 'Микроавт.' },
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
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [branches, setBranches] = useState<V2BranchOption[]>([]);
  const [, setLoadingKids] = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [financeLoaded, setFinanceLoaded] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [savedFamily, setSavedFamily] = useState<Family>(family);
  const [draftFamily, setDraftFamily] = useState<Family>(family);
  const [draftChildren, setDraftChildren] = useState<Child[]>([]);
  const [deletedChildIds, setDeletedChildIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const isAdmin = userRole === 'admin' || userRole === 'director' || userRole === 'gen_director';
  const isCashier = userRole === 'cashier';

  const activeFamilyIdRef = useRef(family.id);

  useEffect(() => {
    activeFamilyIdRef.current = family.id;
    setSavedFamily(family);
    setDraftFamily(family);
    setEditing(false);
    setDeletedChildIds(new Set());
    setTab(initialTab);
    setFinanceLoaded(false);
    setAuditLoaded(false);
    loadChildren();
    fetchV2Branches().then(next => { if (activeFamilyIdRef.current === family.id) setBranches(next); }).catch(() => setBranches([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);
  async function loadChildren(): Promise<Child[]> {
    setLoadingKids(true);
    const requestedFamilyId = family.id;
    const next = await fetchV2Children(family);
    if (activeFamilyIdRef.current === requestedFamilyId) {
      setChildren(next);
      setDraftChildren(next.map(child => ({ ...child })));
      setLoadingKids(false);
    }
    return next;
  }
  async function loadFinance(kids = children) {
    setLoadingFinance(true);
    const snap = await fetchFinanceSnapshot(family.id, kids);
    setCharges(snap.charges);
    setPayments(snap.payments);
    setPaymentItems(snap.paymentItems);
    setMainBalance(snap.mainBalance ?? 0);
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
    // audit logging failures must not block the save flow
    try { await addV2Audit({ actorName: userName, action, entityType: field, entityId: family.id, oldValue: o, newValue: n }); } catch { /* noop */ }
  }
  async function handleSaveFamily(updated: Family): Promise<boolean> {
    try {
      await updateV2Family(family.id, updated);
      setSavedFamily(updated);
      setSaveMsg('Сохранено');
      setTimeout(() => setSaveMsg(''), 2000);
      await addAudit('Редактирование', 'family', JSON.stringify(family), JSON.stringify(updated));
      await loadAudit();
      onUpdated?.();
      return true;
    } catch {
      setSaveMsg('Ошибка');
      return false;
    }
  }

  function beginEditing() {
    setDraftFamily({ ...savedFamily });
    setDraftChildren(children.map(child => ({ ...child })));
    setDeletedChildIds(new Set());
    setEditing(true);
    setSaveMsg('');
  }

  function cancelEditing() {
    setDraftFamily({ ...savedFamily });
    setDraftChildren(children.map(child => ({ ...child })));
    setDeletedChildIds(new Set());
    setEditing(false);
  }

  function patchDraftChild(child: Child, patch: Partial<Child>): Promise<boolean> {
    setDraftChildren(current => current.map(item => item.id === child.id ? { ...item, ...patch } : item));
    return Promise.resolve(true);
  }

  function addDraftChild() {
    const template = draftChildren[draftChildren.length - 1];
    const schoolCode = (template?.schoolCode || draftFamily.schoolCode || 'AES') as Child['schoolCode'];
    const zone = (template?.zone || draftFamily.zone || 'A') as Zone;
    const vehicleType = (template?.vehicleType || draftFamily.vehicleType || 'microbus') as VehicleType;
    const basePrice = getPriceByZone(schoolCode, zone, vehicleType);
    setDraftChildren(current => [...current, {
      id: `draft-${Date.now()}`,
      familyId: family.id,
      childName: 'Новый ребёнок',
      class: '',
      selfExitAllowed: false,
      schoolCode,
      schoolId: template?.schoolId,
      branchId: template?.branchId ?? draftFamily.branchId,
      branchCode: template?.branchCode ?? draftFamily.branchCode,
      branchShort: template?.branchShort ?? draftFamily.branchShort,
      branchName: template?.branchName ?? draftFamily.branchName,
      zone,
      vehicleType,
      basePrice,
      finalPrice: basePrice,
      status: 'new',
    }]);
  }

  function deleteDraftChild(child: Child) {
    setDraftChildren(current => current.filter(item => item.id !== child.id));
    if (!child.id.startsWith('draft-')) {
      setDeletedChildIds(current => new Set(current).add(child.id));
    }
  }

  async function saveAllChanges() {
    if (savingAll) return;
    setSavingAll(true);
    setSaveMsg('');
    try {
      if (JSON.stringify(draftFamily) !== JSON.stringify(savedFamily)) {
        const ok = await handleSaveFamily(draftFamily);
        if (!ok) throw new Error('family-save-failed');
      }

      for (const childId of Array.from(deletedChildIds)) await deleteV2Child(childId);

      for (const draft of draftChildren) {
        if (draft.id.startsWith('draft-')) {
          await createV2Child(draftFamily, {
            childName: formatName(draft.childName),
            class: draft.class,
            schoolCode: draft.schoolCode,
            schoolId: draft.schoolId,
            branchId: draft.branchId,
            branchCode: draft.branchCode,
            branchShort: draft.branchShort,
            branchName: draft.branchName,
            zone: draft.zone,
            vehicleType: draft.vehicleType,
            basePrice: draft.basePrice,
            finalPrice: draft.finalPrice,
            status: draft.status,
          });
          continue;
        }
        const original = children.find(child => child.id === draft.id);
        if (!original || JSON.stringify(original) === JSON.stringify(draft)) continue;
        const ok = await handleSaveChild(original, draft);
        if (!ok) throw new Error('child-save-failed');
      }

      const nextChildren = await loadChildren();
      if (financeLoaded) await loadFinance(nextChildren);
      await addAudit('Сохранение карточки', 'family', 'Черновик', 'Изменения сохранены');
      await loadAudit();
      setDeletedChildIds(new Set());
      setEditing(false);
      setSaveMsg('Сохранено');
      setTimeout(() => setSaveMsg(''), 2200);
      onUpdated?.();
    } catch {
      setSaveMsg('Ошибка сохранения');
    } finally {
      setSavingAll(false);
    }
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
      if ('status' in patch) dbPatch.status = nextChild.status ?? 'new';

      if (shouldReprice) {
        const basePrice = ('zone' in patch || 'vehicleType' in patch)
          ? getPriceByZone(nextChild.schoolCode, nextChild.zone as Zone, nextChild.vehicleType as VehicleType)
          : Math.max(0, Number(nextChild.basePrice || 0));
        const discountPercent = clampToStep(Number(nextChild.manualDiscountPercent || nextChild.siblingDiscountPercent || 0), 0, 100, 5);
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

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const totalPaid = charges.reduce((s, c) => s + c.paidAmount, 0);
  const totalCharged = charges.reduce((s, c) => s + c.amount, 0);
  const pendingAmount = payments.filter(p => p.status === 'На проверке').reduce((s, p) => s + p.amount, 0);
  const depositCharge = charges.find(c => c.chargeType === 'deposit');
  const depositPaid = depositCharge ? depositCharge.debtAmount <= 0 : false;
  const cardFamily = editing ? draftFamily : savedFamily;
  const cardChildren = editing ? draftChildren : children;
  const primaryChild = cardChildren[0];
  const familyMonthlyPrice = cardChildren.length > 0
    ? cardChildren.reduce((sum, c) => sum + Number(c.finalPrice || 0), 0)
    : cardFamily.monthlyPrice;
  const initials = (cardFamily.parentName ?? '?').trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const headerWaLink = whatsAppLink(cardFamily.phone);
  const coordinatesText = cardFamily.latitude && cardFamily.longitude
    ? `${cardFamily.latitude.toFixed(6)}, ${cardFamily.longitude.toFixed(6)}`
    : primaryChild?.latitude && primaryChild?.longitude
      ? `${primaryChild.latitude.toFixed(6)}, ${primaryChild.longitude.toFixed(6)}`
      : '-';
  const mapUrl = cardFamily.latitude && cardFamily.longitude
    ? `https://yandex.com/maps/?ll=${cardFamily.longitude},${cardFamily.latitude}&z=16&pt=${cardFamily.longitude},${cardFamily.latitude},pm2rdm`
    : primaryChild?.latitude && primaryChild?.longitude
      ? `https://yandex.com/maps/?ll=${primaryChild.longitude},${primaryChild.latitude}&z=16&pt=${primaryChild.longitude},${primaryChild.latitude},pm2rdm`
      : '';

  return (
    <div style={modalStyle()}>
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
                {formatName(cardFamily.parentName)}
              </div>
              <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, color: '#374151', fontSize: 11, fontWeight: 750 }}>
                <Phone size={11} color="#7B8491" />
                {headerWaLink ? (
                  <a href={headerWaLink} target="_blank" rel="noreferrer" title="Написать в WhatsApp"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#374151', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#159A6A')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                  >
                    <span>{formatPhone(cardFamily.phone)}</span>
                    <MessageCircle size={11} color="#25D366" />
                  </a>
                ) : (
                  <span>{cardFamily.phone ? formatPhone(cardFamily.phone) : 'телефон не указан'}</span>
                )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editing ? (
              <>
                <button type="button" onClick={cancelEditing} disabled={savingAll} style={secondaryHeaderButtonStyle}>
                  <RotateCcw size={14} /> Отмена
                </button>
                <button type="button" onClick={saveAllChanges} disabled={savingAll} style={editHeaderButtonStyle}>
                  <Check size={15} /> {savingAll ? 'Сохранение…' : 'Сохранить'}
                </button>
              </>
            ) : (
              <button type="button" onClick={beginEditing} style={editHeaderButtonStyle}>
                <Pencil size={14} /> Редактировать
              </button>
            )}
            <button type="button" aria-label="Закрыть карточку" onClick={onClose} style={closeButtonStyle}><X size={16} /></button>
          </div>
        </header>

        <div style={contentBodyStyle}>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <DetailPanel title="Контакт" accent="var(--accent)">
                  <DetailInput editing={editing} label="Родитель" tone="soft" value={cardFamily.parentName} onCommit={value => setDraftFamily(current => ({ ...current, parentName: formatName(value) }))} />
                  <DetailInput editing={editing} label="Телефон 1" tone="soft" whatsapp value={cardFamily.phone} onCommit={value => setDraftFamily(current => ({ ...current, phone: formatPhone(value) }))} />
                  <DetailInput editing={editing} label="Телефон 2" tone="soft" whatsapp value={cardFamily.secondPhone ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, secondPhone: formatPhone(value) }))} />
                  <DetailInput editing={editing} label="Telegram" tone="soft" value={cardFamily.phoneTelegram ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, phoneTelegram: value }))} />
                </DetailPanel>
                <DetailPanel title="Доп. контакт" accent="var(--warning)">
                  <DetailInput editing={editing} label="Имя" tone="soft" value={cardFamily.contactName ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, contactName: formatName(value) }))} />
                  <DetailInput editing={editing} label="Телефон" tone="soft" whatsapp value={cardFamily.contactPhone ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, contactPhone: formatPhone(value) }))} />
                </DetailPanel>
                <DetailPanel title="Адрес" accent="var(--success)">
                  <DetailInput editing={editing} label="Адрес" tone="clear" value={cardFamily.fullAddress} onCommit={value => setDraftFamily(current => ({ ...current, fullAddress: value }))} />
                  <DetailValue label="Координаты" value={coordinatesText} />
                  <DetailMapLink label="Яндекс" url={mapUrl} />
                  <DetailInput editing={editing} label="Комментарий" tone="clear" value={cardFamily.comment ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, comment: value }))} />
                </DetailPanel>
              </div>

              <DetailPanel title={`Дети (${cardChildren.length})`}>
                <ChildrenOverviewTable children={cardChildren} branches={branches} editing={editing} onSaveChild={patchDraftChild} onAddChild={addDraftChild} onDeleteChild={deleteDraftChild} busy={savingAll} />
              </DetailPanel>
            </div>
          )}

          {tab === 'finance' && (
            <TabFinanceLazy
              loaded={financeLoaded}
              onLoad={() => loadFinance()}
              charges={charges} payments={payments} paymentItems={paymentItems}
              loading={loadingFinance} family={savedFamily} children={children}
              isAdmin={isAdmin} isCashier={isCashier} userRole={userRole as any}
              onSaveCharge={handleSaveCharge} onDeleteCharge={handleDeleteCharge}
              onAddCharges={handleAddCharges} onCreatePayment={handleCreatePayment}
              onConfirmPayment={handleConfirmPayment} onUnconfirmPayment={handleUnconfirmPayment} onSavePayment={handleSavePayment}
              onDeletePayment={handleDeletePayment}
              readOnly={!editing}
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
      background: pending ? '#FFFBEB' : '#F5FAFB',
      borderRadius: 8,
      padding: '5px 9px',
      border: alert ? '1px solid #FECACA' : pending ? '1px solid #FDE68A' : '1px solid transparent',
    }}>
      <div style={{ fontSize: 9, color: pending ? '#92400E' : '#8A94A3', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.02em' }}>{label}</div>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: alert ? '#B91C1C' : pending ? '#92400E' : '#111827', marginTop: 1 }}>{value}</div>
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

function DetailPanel({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <section style={{
      background: '#fff',
      border: 'none',
      borderTop: accent ? `3px solid ${accent}` : 'none',
      borderRadius: 14,
      padding: 14,
      boxShadow: '0 5px 18px rgba(43, 72, 89, .055)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#111827', marginBottom: 8 }}>{title}</div>
      <div className="family-detail-rows">
        {children}
      </div>
    </section>
  );
}

function DetailInput({ label, value, onCommit, placeholder = '-', type = 'text', tone = 'soft', editing = false, whatsapp = false }: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: string;
  tone?: 'soft' | 'clear';
  editing?: boolean;
  whatsapp?: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const waHref = whatsapp ? whatsAppLink(value) : null;
  return (
    <label className="family-detail-row" style={detailFieldStyle(tone)}>
      <span style={detailLabelStyle}>{label}</span>
      {editing ? (
        <input
          className="family-card-control"
          type={type}
          value={local}
          placeholder={placeholder}
          onChange={event => setLocal(event.target.value)}
          onBlur={event => onCommit(event.currentTarget.value)}
          style={{ ...detailControlStyle, background: '#F8FAFC', borderColor: '#DDE7EB' }}
        />
      ) : waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          title="Написать в WhatsApp"
          onClick={event => event.stopPropagation()}
          style={{ ...detailControlStyle, display: 'inline-flex', alignItems: 'center', gap: 5, paddingLeft: 0, color: '#159A6A', textDecoration: 'none' }}
        >
          <span>{value || placeholder}</span>
          <MessageCircle size={12} color="#25D366" />
        </a>
      ) : (
        <span style={{ ...detailControlStyle, display: 'flex', alignItems: 'center', paddingLeft: 0 }}>{value || placeholder}</span>
      )}
    </label>
  );
}

function ReadOnlyValue({ value }: { value?: string }) {
  return <span style={{ color: '#17222F', fontSize: 12, fontWeight: 750 }}>{value || '-'}</span>;
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

const CHILD_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  boarded:  { bg: '#D1FAE5', color: '#065F46' },
  waiting:  { bg: '#FEF9C3', color: '#92400E' },
  new:      { bg: '#EFF6FF', color: '#1E40AF' },
  paused:   { bg: '#F3F4F6', color: '#374151' },
  rejected: { bg: '#FEE2E2', color: '#991B1B' },
};
const CHILD_STATUS_OPTIONS_INLINE = [
  { value: 'new', label: 'Новый' },
  { value: 'waiting', label: 'Ожидание' },
  { value: 'boarded', label: 'Посажен' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'paused', label: 'Пауза' },
];

function ChildCard({
  child,
  index,
  branches,
  onSaveChild,
  onDeleteChild,
  busy,
  editing,
}: {
  child: Child;
  index: number;
  branches: V2BranchOption[];
  onSaveChild: (child: Child, patch: Partial<Child>) => Promise<boolean>;
  onDeleteChild: (child: Child) => void;
  busy?: boolean;
  editing?: boolean;
}) {
  // новый ребёнок (ещё не сохранён) сразу открыт — его нужно заполнить
  const [manuallyExpanded, setManuallyExpanded] = React.useState(() => child.id.startsWith('draft-'));
  const expanded = manuallyExpanded;
  const s = child.status ?? 'new';
  const col = CHILD_STATUS_COLORS[s] ?? CHILD_STATUS_COLORS.new;
  const basePrice = Number(child.basePrice || child.finalPrice || 0);
  const finalPrice = Number(child.finalPrice || 0);
  const hasDiscount = basePrice > finalPrice;
  const vehicleLabel = VEHICLE_TYPE_OPTIONS.find(item => item.value === child.vehicleType)?.label ?? child.vehicleType;
  const summary = `${child.branchShort || child.schoolCode || '—'} · ${child.class || '—'} · ${child.zone} · ${vehicleLabel}`;

  return (
    <article style={{ background: '#fff', border: '1px solid #EEF3F4', borderRadius: 13, boxShadow: '0 3px 12px rgba(43, 72, 89, .045)', overflow: 'hidden' }}>
      {/* Свёрнутая строка — всегда видна, клик разворачивает карточку */}
      <div
        onClick={() => setManuallyExpanded(v => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setManuallyExpanded(v => !v); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer' }}
      >
        <span style={childCardIndexStyle}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 850, color: '#111827' }}>{formatName(child.childName) || 'Без имени'}</span>
          <span style={{ fontSize: 11, color: '#8A94A3', fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
        </div>
        <span style={{ background: col.bg, color: col.color, borderRadius: 999, fontSize: 10.5, fontWeight: 750, padding: '4px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {CHILD_STATUS_OPTIONS_INLINE.find(item => item.value === s)?.label ?? s}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
          {hasDiscount && <span style={{ fontSize: 10.5, color: '#9CA3AF', textDecoration: 'line-through' }}>{money(basePrice)}</span>}
          <span style={{ fontSize: 13.5, fontWeight: 900, color: '#111827' }}>{money(finalPrice)}</span>
        </div>
        {editing && (
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onDeleteChild(child); }}
            disabled={busy}
            title="Удалить"
            style={{ ...deleteChildBtnStyle, width: 24, height: 24, flexShrink: 0 }}
          >
            <Trash2 size={12} />
          </button>
        )}
        <ChevronDown size={16} color="#8A94A3" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </div>

      {/* Развёрнутая часть — все поля, только когда карточка раскрыта */}
      {expanded && (
        <div style={{ padding: '2px 14px 14px', borderTop: '1px solid #F1F5F9' }}>
          {editing && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 0' }} onClick={event => event.stopPropagation()}>
              <EditableText value={child.childName} onCommit={value => onSaveChild(child, { childName: formatName(value) })} strong />
              <EditableSelect value={s} options={CHILD_STATUS_OPTIONS_INLINE} onCommit={value => onSaveChild(child, { status: value as Child['status'] })} width={110} panelWidth={140} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, paddingTop: 10 }} onClick={event => event.stopPropagation()}>
            {[
              {
                label: 'Школа',
                content: (
                  editing ? <EditableSelect
                    value={child.branchId ?? ''}
                    options={branches.map(b => ({ value: b.id, label: b.shortName || b.code }))}
                    onCommit={value => {
                      const branch = branches.find(b => b.id === value);
                      if (!branch) return Promise.resolve(false);
                      return onSaveChild(child, { branchId: branch.id, schoolId: branch.schoolId, branchCode: branch.code, branchShort: branch.shortName, branchName: branch.name, schoolCode: branch.code as Child['schoolCode'] });
                    }}
                  /> : <ReadOnlyValue value={child.branchShort || child.schoolCode} />
                ),
              },
              {
                label: 'Класс',
                content: editing ? <EditableText value={child.class} onCommit={value => onSaveChild(child, { class: value })} /> : <ReadOnlyValue value={child.class} />,
              },
              {
                label: 'Зона / ТС',
                content: (
                  editing ? <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <EditableSelect value={child.zone} options={ZONE_OPTIONS} onCommit={value => onSaveChild(child, { zone: value as Zone })} width={40} panelWidth={120} />
                    <span style={{ color: '#C4C9D4', fontSize: 10 }}>·</span>
                    <EditableSelect value={child.vehicleType} options={VEHICLE_TYPE_OPTIONS} onCommit={value => onSaveChild(child, { vehicleType: value as VehicleType })} width={90} panelWidth={190} />
                  </div> : <ReadOnlyValue value={`${child.zone} · ${vehicleLabel}`} />
                ),
              },
              {
                label: 'Трансфер',
                content: editing ? <EditableSelect value={child.transferNumber ? String(child.transferNumber) : ''} options={TRANSFER_OPTIONS} onCommit={value => onSaveChild(child, { transferNumber: value ? Number(value) : undefined })} width={60} panelWidth={130} /> : <ReadOnlyValue value={child.transferNumber ? `№ ${child.transferNumber}` : '-'} />,
              },
              {
                label: 'Остановка',
                content: editing ? <EditableSelect value={child.stopNumber ? String(child.stopNumber) : ''} options={STOP_OPTIONS} onCommit={value => onSaveChild(child, { stopNumber: value ? Number(value) : undefined })} width={58} panelWidth={120} /> : <ReadOnlyValue value={child.stopNumber ? String(child.stopNumber) : '-'} />,
              },
              {
                label: 'Утро',
                content: editing ? <EditableText type="time" value={child.timeMorning ?? ''} onCommit={value => onSaveChild(child, { timeMorning: value || undefined })} /> : <ReadOnlyValue value={child.timeMorning || '-'} />,
              },
              {
                label: 'Самовыход',
                content: editing ? (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>
                    <input type="checkbox" checked={child.selfExitAllowed} onChange={e => void onSaveChild(child, { selfExitAllowed: e.currentTarget.checked })} />
                    {child.selfExitAllowed ? 'Да' : 'Нет'}
                  </label>
                ) : <ReadOnlyValue value={child.selfExitAllowed ? 'Да' : 'Нет'} />,
              },
              {
                label: 'Скидка %',
                content: editing ? <EditableSelect value={String(child.manualDiscountPercent || child.siblingDiscountPercent || 0)} options={DISCOUNT_PERCENT_OPTIONS} onCommit={value => onSaveChild(child, { manualDiscountPercent: Number(value || 0) })} width={58} panelWidth={120} /> : <ReadOnlyValue value={`${child.manualDiscountPercent || child.siblingDiscountPercent || 0}%`} />,
              },
              {
                label: 'Скидка сом',
                content: editing ? <EditableNumber value={child.manualDiscountAmount || undefined} onCommit={value => onSaveChild(child, { manualDiscountAmount: value ?? 0 })} step={100} min={0} max={Math.max(0, basePrice)} /> : <ReadOnlyValue value={money(child.manualDiscountAmount || 0)} />,
              },
            ].map(({ label, content }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: 7, padding: '5px 8px' }}>
                <div style={{ fontSize: 10, color: '#8A94A3', fontWeight: 750, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12 }}>{content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function ChildrenOverviewTable({
  children,
  branches,
  onSaveChild,
  onAddChild,
  onDeleteChild,
  busy,
  editing,
}: {
  children: Child[];
  branches: V2BranchOption[];
  onSaveChild: (child: Child, patch: Partial<Child>) => Promise<boolean>;
  onAddChild: () => void;
  onDeleteChild: (child: Child) => void;
  busy?: boolean;
  editing?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid #E8EEF1' }}>
        <span style={{ fontSize: 12, color: '#7B8491', fontWeight: 750 }}>{children.length ? `${children.length} детей` : 'Детей нет'}</span>
        {editing && <button type="button" onClick={onAddChild} disabled={busy} style={smallAddChildBtnStyle}>
          {busy ? '...' : '+ Добавить ребёнка'}
        </button>}
      </div>
      {children.length === 0 ? (
        <div style={{ fontSize: 12, color: '#7B8491', padding: '12px 0' }}>Добавьте первого ребёнка</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, paddingTop: 4 }}>
          {children.map((child, index) => (
            <ChildCard
              key={child.id}
              child={child}
              index={index}
              branches={branches}
              onSaveChild={onSaveChild}
              onDeleteChild={onDeleteChild}
              busy={busy}
              editing={editing}
            />
          ))}
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
    gridTemplateColumns: '64px minmax(0, 1fr)',
    background: '#fff',
    border: 'none',
    borderRadius: 20,
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
  borderRight: '1px solid #EEF2F3',
  padding: '82px 0 12px 8px',
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

const editHeaderButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 13px',
  border: 'none',
  borderRadius: 10,
  background: '#31A4A5',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 11,
  fontWeight: 850,
  cursor: 'pointer',
  boxShadow: '0 5px 14px rgba(49, 164, 165, .2)',
};

const secondaryHeaderButtonStyle: React.CSSProperties = {
  ...editHeaderButtonStyle,
  background: '#F4F7F8',
  color: '#667085',
  boxShadow: 'none',
};

const contentBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '14px 22px',
  background: '#F6F9FA',
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
