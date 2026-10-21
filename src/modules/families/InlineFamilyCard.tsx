import './InlineFamilyCard.css';
import { VEHICLE_COLOR } from '../../core/dashboard/TransferCell';
import TaskButton from '../tasks/TaskButton';
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CreditCard, ExternalLink, FileText, GraduationCap, LayoutDashboard, MapPin, MessageCircle, Phone, Clock, Plus, Search, X, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { Family, Child, Charge, FamilyPayment, PaymentItem, Refund, VehicleType, Zone } from '../../types';
import { applyChildPricingPatch, canManageDiscounts, changedChildPatch, getPriceByZone, getSiblingDiscountPercent, getZoneByDistance, money, supportsTeacherPrice, TEACHER_MONTHLY_PRICE } from '../../utils/pricing';
import { PERIOD_LABEL, isSchoolVisible } from './constants';
import { formatName, formatPhone, whatsAppLink } from '../../utils/format';
import { formatPhoneDisplay } from './familiesRowHelpers';
import { addV2Audit, createV2Child, deleteV2Child, fetchV2Branches, fetchV2Children, updateV2Child, updateV2ChildRoute, updateV2Family, V2BranchOption } from '../../services/crmV2Service';
import {
  confirmFamilyPayment, unconfirmFamilyPayment, createChargesForPeriod, createFamilyPayment,
  deleteFamilyPayment, deleteCharge, fetchFinanceSnapshot,
  updateFamilyPayment, updateCharge,
  requestFamilyRefund, confirmFamilyRefund, rejectFamilyRefund,
} from '../../services/financeService';
import TabFinance from './TabFinance';
import ChildDiscountModal, { ChildDiscountInput } from './ChildDiscountModal';
import { setChildDiscountChoice, setChildDiscount, setChildrenFixedPrice } from '../../services/discountService';
import TabHistory from './TabHistory';
import NotionSelect from '../../core/selects/NotionSelect';
import { createCustomFamilyDocument, createDefaultFamilyDocuments, FamilyDocument, fetchFamilyDocuments, saveFamilyDocuments } from '../../services/familyDocumentService';
import { GeocodingCandidate, geocodeAddress, getDrivingRoute, reverseGeocode } from '../../services/addressGeocoding';
import { loadYandexMaps } from '../../utils/yandexMaps';

interface AuditEntry {
  id: string; familyId: string; userName: string;
  action: string; field: string; oldValue: string; newValue: string; createdAt: string;
}
interface Props {
  initialChildId?: string;
  family: Family; onClose: () => void; userRole?: string; userName?: string; initialTab?: Tab; onUpdated?: () => void;
  sessionToken?: string;
}
type Tab = 'children' | 'overview' | 'documents' | 'finance' | 'charges' | 'refunds' | 'history';

const TABS: { key: Tab; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Обзор', desc: 'Контакты и адрес', icon: <LayoutDashboard size={15} /> },
  { key: 'children', label: 'Дети', desc: 'Школа, перевозка и стоимость', icon: <GraduationCap size={16} /> },
  { key: 'charges', label: 'Начисления', desc: 'Стоимость услуг и скидки', icon: <FileText size={16} /> },
  { key: 'finance', label: 'Платежи и чеки', desc: 'Поступления, чеки и возвраты', icon: <CreditCard size={16} /> },
  { key: 'documents', label: 'Документы', desc: 'договоры и файлы', icon: <FileText size={15} /> },
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

function formatInlineDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
}

export default function InlineFamilyCard({ family, onClose, userRole = 'manager', userName = 'Менеджер', initialTab = 'overview', initialChildId, onUpdated, sessionToken }: Props) {
  const [tab, setTab] = useState<Tab>(initialChildId && initialTab === 'overview' ? 'children' : initialTab);
  const [children, setChildren] = useState<Child[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [discountChild, setDiscountChild] = useState<Child | null>(null);
  const [payments, setPayments] = useState<FamilyPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
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
  const [savedDocuments, setSavedDocuments] = useState<FamilyDocument[]>(createDefaultFamilyDocuments());
  const [draftDocuments, setDraftDocuments] = useState<FamilyDocument[]>(createDefaultFamilyDocuments());
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [addressModalOpen, setAddressModalOpen] = useState(false);

  const isAdmin = userRole === 'admin' || userRole === 'director' || userRole === 'gen_director';
  const isCashier = userRole === 'cashier';
  const isManager = userRole === 'manager';
  const canManageDiscount = canManageDiscounts(userRole);

  const activeFamilyIdRef = useRef(family.id);

  useEffect(() => {
    activeFamilyIdRef.current = family.id;
    setSavedFamily(family);
    setDraftFamily(family);
    setEditing(false);
    setDeletedChildIds(new Set());
    setTab(initialChildId && initialTab === 'overview' ? 'children' : initialTab);
    setFinanceLoaded(false);
    setAuditLoaded(false);
    void loadChildren().catch(() => {
      if (activeFamilyIdRef.current === family.id) setLoadingKids(false);
    });
    // Balance and finance totals load immediately with the card instead of
    // waiting until the user opens the Finance tab.
    void loadFinance().catch(() => {
      if (activeFamilyIdRef.current === family.id) setFinanceLoaded(false);
    });
    loadDocuments();
    fetchV2Branches().then(next => { if (activeFamilyIdRef.current === family.id) setBranches(next); }).catch(() => setBranches([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  // The card is mounted immediately with a lightweight table-row preview.
  // The full family (including its comment) arrives shortly afterwards with
  // the same id, so the id-only effect above cannot observe that update.
  useEffect(() => {
    if (activeFamilyIdRef.current !== family.id || editing) return;
    setSavedFamily(family);
    setDraftFamily(family);
  // Updating an open draft from a background refresh would discard edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family]);

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
  async function loadDocuments(): Promise<FamilyDocument[]> {
    const requestedFamilyId = family.id;
    setLoadingDocuments(true);
    try {
      const next = await fetchFamilyDocuments(requestedFamilyId);
      if (activeFamilyIdRef.current === requestedFamilyId) {
        setSavedDocuments(next);
        setDraftDocuments(next.map(document => ({ ...document, scanFile: null })));
      }
      return next;
    } finally {
      if (activeFamilyIdRef.current === requestedFamilyId) setLoadingDocuments(false);
    }
  }
  async function loadFinance(kids?: Child[]) {
    const requestedFamilyId = family.id;
    setLoadingFinance(true);
    try {
      const snap = await fetchFinanceSnapshot(requestedFamilyId, kids);
      if (activeFamilyIdRef.current !== requestedFamilyId) return;
      setCharges(snap.charges);
      setPayments(snap.payments);
      setPaymentItems(snap.paymentItems);
      setRefunds(snap.refunds);
      setMainBalance(snap.mainBalance ?? 0);
      setFinanceLoaded(true);
    } finally {
      if (activeFamilyIdRef.current === requestedFamilyId) setLoadingFinance(false);
    }
  }
  async function loadAudit() {
    try {
      const { supabase } = await import('../../services/supabase');
      const requestedFamilyId = family.id;
      const data: any[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('v2_audit_log').select('*').eq('entity_id', requestedFamilyId)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
        if (result.error) throw result.error;
        data.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 500) break;
      }
      if (activeFamilyIdRef.current !== requestedFamilyId) return;
      if (data) {
        setAudit(data.map((r: any) => ({
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
    setDraftDocuments(savedDocuments.map(document => ({ ...document, scanFile: null })));
    setEditing(true);
    setSaveMsg('');
  }

  function cancelEditing() {
    setDraftFamily({ ...savedFamily });
    setDraftChildren(children.map(child => ({ ...child })));
    setDeletedChildIds(new Set());
    setDraftDocuments(savedDocuments.map(document => ({ ...document, scanFile: null })));
    setEditing(false);
  }

  function patchDraftChild(child: Child, patch: Partial<Child>): Promise<boolean> {
    setDraftChildren(current => current.map(item => item.id === child.id ? applyChildPricingPatch(item, patch) : item));
    return Promise.resolve(true);
  }

  function applyAddressPlan(point: GeocodingCandidate, plans: AddressRoutePlan[]) {
    const byChildId = new Map(plans.map(plan => [plan.childId, plan]));
    setDraftChildren(current => current.map(child => {
      const plan = byChildId.get(child.id);
      if (!plan || plan.distanceKm == null || !plan.zone) return child;
      return applyChildPricingPatch(child, {
        address: point.address,
        latitude: point.latitude,
        longitude: point.longitude,
        distanceKm: plan.distanceKm,
        zone: plan.zone,
      });
    }));
    const primaryPlan = plans.find(plan => plan.childId === draftChildren[0]?.id) ?? plans[0];
    setDraftFamily(current => ({
      ...current,
      fullAddress: point.address,
      latitude: point.latitude,
      longitude: point.longitude,
      distanceKm: primaryPlan?.distanceKm,
      zone: primaryPlan?.zone ?? current.zone,
    }));
    setAddressModalOpen(false);
    setSaveMsg('Адрес пересчитан · нажмите «Сохранить»');
  }

  async function toggleTeacherPricing() {
    const eligible = children.filter(child => supportsTeacherPrice(child));
    if (!eligible.length) return;
    const active = eligible.every(child => child.fixedPrice != null);
    const reason = window.prompt(active ? 'Причина отмены цены учителя:' : 'Причина цены учителя:', active ? '' : 'Цена учителя')?.trim();
    if (!reason) return;
    try {
      await setChildrenFixedPrice(sessionToken, {
        childIds: eligible.map(child => child.id),
        fixedPrice: active ? null : TEACHER_MONTHLY_PRICE,
        reason,
      });
      await refreshAfterDiscountChange();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось изменить цену учителя');
    }
  }

  async function refreshAfterDiscountChange() {
    const nextChildren = await loadChildren();
    await loadFinance(nextChildren);
    await loadAudit();
    onUpdated?.();
  }

  async function saveChildDiscount(child: Child, input: ChildDiscountInput) {
    await setChildDiscount(sessionToken, { childId: child.id, ...input });
    await refreshAfterDiscountChange();
  }

  function addDraftChild() {
    const template = draftChildren[draftChildren.length - 1];
    const schoolCode = (template?.schoolCode || draftFamily.schoolCode || 'AES') as Child['schoolCode'];
    const zone = (template?.zone || draftFamily.zone || 'A') as Zone;
    const vehicleType = (template?.vehicleType || draftFamily.vehicleType || 'microbus') as VehicleType;
    const basePrice = getPriceByZone(schoolCode, zone, vehicleType);
    // draftChildren в этот момент — уже существующие + добавленные в этой сессии дети,
    // до вставки нового — это и есть порядковый номер нового ребёнка в семье.
    const siblingDiscountPercent = getSiblingDiscountPercent(draftChildren.length);
    const finalPrice = Math.round(basePrice * (1 - siblingDiscountPercent / 100));
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
      siblingDiscountPercent,
      finalPrice,
      status: 'new',
    }]);
  }

  function deleteDraftChild(child: Child) {
    setDraftChildren(current => current.filter(item => item.id !== child.id));
    if (!child.id.startsWith('draft-')) {
      setDeletedChildIds(current => new Set(current).add(child.id));
    }
  }

  function patchDraftDocument(index: number, patch: Partial<FamilyDocument>) {
    setDraftDocuments(current => current.map((document, itemIndex) => itemIndex === index ? { ...document, ...patch } : document));
  }

  function addDraftDocument() {
    setDraftDocuments(current => [...current, createCustomFamilyDocument(current.length)]);
  }

  function deleteDraftDocument(index: number) {
    setDraftDocuments(current => current.filter((document, itemIndex) => document.isDefault || itemIndex !== index));
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
            siblingDiscountPercent: draft.siblingDiscountPercent,
            finalPrice: draft.finalPrice,
            status: draft.status,
          });
          continue;
        }
        const original = children.find(child => child.id === draft.id);
        if (!original || JSON.stringify(original) === JSON.stringify(draft)) continue;
        const ok = await handleSaveChild(original, changedChildPatch(original, draft));
        if (!ok) throw new Error('child-save-failed');
      }

      const nextDocuments = await saveFamilyDocuments(family.id, draftDocuments);
      setSavedDocuments(nextDocuments);
      setDraftDocuments(nextDocuments.map(document => ({ ...document, scanFile: null })));

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
      await deleteFamilyPayment(payment, sessionToken);
      await loadFinance();
      await loadAudit();
      onUpdated?.();
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось удалить платёж');
      return false;
    }
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
  async function handleCreatePayment(amount: number, paymentType: any, comment: string, paymentDate: string, receiptFile?: File | null, receiptCode?: string, paymentOrderNumber?: string): Promise<boolean> {
    try {
      await createFamilyPayment({ familyId: family.id, amount, paymentType, paymentOrderNumber, paymentDate, receiptFile, receiptCode, comment, createdBy: userName });
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

  async function handleCreateRefund(amount: number, comment: string): Promise<boolean> {
    try {
      await requestFamilyRefund({ familyId: family.id, amount, comment, requestedBy: userName });
      try {
        await addAudit('Возврат', 'family_refund', '-', `${money(amount)} на проверке`);
      } catch (error) {
        console.error('Refund audit save failed', error);
      }
      await loadFinance();
      await loadAudit();
      onUpdated?.();
      return true;
    } catch (error) {
      console.error('Refund save failed', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось оформить возврат');
      return false;
    }
  }

  async function handleConfirmRefund(refund: Refund, paymentMethod: 'cash' | 'cashless', paymentOrderNumber?: string): Promise<boolean> {
    try {
      await confirmFamilyRefund({ refund, confirmedBy: userName, paymentMethod, paymentOrderNumber });
      await addAudit('Подтверждение возврата', 'family_refund', refund.status, `${money(refund.amount)} подтверждено`);
      await loadFinance();
      await loadAudit();
      onUpdated?.();
      return true;
    } catch (error) {
      console.error('Refund confirm failed', error);
      window.alert(error instanceof Error ? error.message : 'Не удалось подтвердить возврат');
      return false;
    }
  }

  async function handleRejectRefund(refund: Refund, reason: string): Promise<boolean> {
    try {
      await rejectFamilyRefund(refund, reason, userName);
      await addAudit('Отклонение возврата', 'family_refund', refund.status, reason || '-');
      await loadFinance();
      await loadAudit();
      onUpdated?.();
      return true;
    } catch (error) {
      console.error('Refund reject failed', error);
      return false;
    }
  }

  async function handleSaveChild(child: Child, patch: Partial<Child>): Promise<boolean> {
    try {
      if ('discountOverridePercent' in patch) {
        if (!canManageDiscount) throw new Error('Нет доступа к изменению скидки');
        await setChildDiscountChoice(sessionToken, child.id, patch.discountOverridePercent ?? null);
      }
      const nextChild = applyChildPricingPatch(child, patch);
      const dbPatch: Record<string, unknown> = {};
      const shouldReprice = 'schoolCode' in patch || 'zone' in patch || 'vehicleType' in patch || 'basePrice' in patch || 'siblingDiscountPercent' in patch || 'manualDiscountPercent' in patch || 'manualDiscountAmount' in patch || 'teacherPrice' in patch;

      if ('childName' in patch) dbPatch.child_name = nextChild.childName;
      if ('class' in patch) dbPatch.class_name = nextChild.class;
      if ('branchId' in patch) dbPatch.branch_id = nextChild.branchId ?? null;
      if ('schoolId' in patch) dbPatch.school_id = nextChild.schoolId ?? null;
      if ('address' in patch) dbPatch.address = nextChild.address?.trim() || null;
      if ('latitude' in patch) dbPatch.latitude = nextChild.latitude ?? null;
      if ('longitude' in patch) dbPatch.longitude = nextChild.longitude ?? null;
      if ('zone' in patch) dbPatch.zone = nextChild.zone;
      if ('distanceKm' in patch) dbPatch.distance_km = nextChild.distanceKm ?? null;
      if ('selfExitAllowed' in patch) dbPatch.self_exit_allowed = Boolean(nextChild.selfExitAllowed);
      if ('status' in patch) dbPatch.status = nextChild.status ?? 'new';

      // Итоговую цену и скидки считает база (триггер v2_children_pricing_guard);
      // скидки меняются только через discount-api.
      if (shouldReprice) dbPatch.base_price = nextChild.basePrice;

      if ('vehicleType' in patch || 'transferNumber' in patch || 'stopNumber' in patch || 'timeMorning' in patch) {
        await updateV2ChildRoute({
          child: nextChild,
          vehicleType: nextChild.vehicleType as VehicleType,
          transferNumber: nextChild.transferNumber,
          stopNumber: nextChild.stopNumber,
          timeMorning: nextChild.timeMorning,
          source: 'family_card',
          actorName: userName,
        });
        delete dbPatch.vehicle_type;
        delete dbPatch.base_price;
      }

      if (Object.keys(dbPatch).length > 0) {
        await updateV2Child(child.id, dbPatch);
      }

      const routeChanged = 'vehicleType' in patch || 'transferNumber' in patch || 'stopNumber' in patch || 'timeMorning' in patch;
      const savedChildren = routeChanged || shouldReprice || 'status' in patch || 'discountOverridePercent' in patch
        ? await fetchV2Children(family)
        : children.map(item => item.id === child.id ? nextChild : item);
      setChildren(savedChildren);
      await addAudit('Редактирование ребёнка', 'child', JSON.stringify(child), JSON.stringify(nextChild));
      await loadFinance(savedChildren);
      onUpdated?.();
      return true;
    } catch {
      return false;
    }
  }

  const totalDebt = charges.reduce((s, c) => s + c.debtAmount, 0);
  const pendingAmount = payments.filter(p => p.status === 'На проверке').reduce((s, p) => s + p.amount, 0);
  const cardFamily = editing ? draftFamily : savedFamily;
  const cardChildren = editing ? draftChildren : children;
  const cardDocuments = editing ? draftDocuments : savedDocuments;
  const teacherPricingAvailable = children.length > 0 && children.some(supportsTeacherPrice);
  const teacherPricingActive = teacherPricingAvailable && children.filter(supportsTeacherPrice).every(child => child.fixedPrice != null);
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
    <div className="family-card" style={modalStyle()}>

      <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header className="family-card-header">
          <div style={headerInfoStyle}>
            <div className="family-card-avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="family-card-eyebrow">Карточка клиента</div>
              <div className="family-card-title">
                {formatName(cardFamily.parentName)}
              </div>
              <div className="family-card-subline">
                <Phone size={13} aria-hidden="true" />
                {headerWaLink ? (
                  <a href={headerWaLink} target="_blank" rel="noreferrer" title="Написать в WhatsApp"
                    className="family-card-wa-link"
                  >
                    <span>{formatPhoneDisplay(formatPhone(cardFamily.phone))}</span>
                    <MessageCircle size={13} color="#25D366" aria-hidden="true" />
                  </a>
                ) : (
                  <span>{cardFamily.phone ? formatPhoneDisplay(formatPhone(cardFamily.phone)) : 'телефон не указан'}</span>
                )}
              </div>
              <div className="family-card-id">
                ID: {family.id}
              </div>
            </div>
            {saveMsg && <div role="status" className={`family-card-save-msg${saveMsg === 'Ошибка' ? ' is-error' : ''}`}>{saveMsg}</div>}
          </div>
          <div className="family-card-header-actions">
            <TaskButton target={{type:'family',id:family.id,label:cardFamily.parentName}} />
            {canManageDiscount && teacherPricingAvailable && !editing && (
              <button type="button" onClick={toggleTeacherPricing} disabled={savingAll} style={teacherPriceButtonStyle(teacherPricingActive)} title={`Постоянная цена ${money(TEACHER_MONTHLY_PRICE)}`}>
                <GraduationCap size={14} /> {teacherPricingActive ? `Учитель · ${money(TEACHER_MONTHLY_PRICE)}` : 'Учитель'}
              </button>
            )}
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
            <div className="family-card-metrics">
              <SideMetric label="Баланс счёта" value={financeLoaded ? money(mainBalance) : '…'} alert={financeLoaded && mainBalance < 0} />
              <SideMetric label="Стоимость в месяц" value={money(familyMonthlyPrice)} />
              <SideMetric label="Задолженность" value={financeLoaded ? money(totalDebt) : '…'} alert={totalDebt > 0} />
              <SideMetric label="Платежи на проверке" value={financeLoaded ? money(pendingAmount) : '…'} pending={pendingAmount > 0} />
            </div>
        </header>

      <div className="family-card-navigation">
          <nav aria-label="Разделы карточки клиента" className="family-card-tabs">
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
                  className={`family-card-tab ${active ? 'is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.icon}<span>{item.label}</span>{item.key === 'children' && <span className="family-card-tab-count">{cardChildren.length}</span>}
                  {item.key === 'history' && audit.length > 0 && <span className="family-card-tab-count">{audit.length > 9 ? '9+' : audit.length}</span>}
                </button>
              );
            })}
          </nav>
      </div>

        <div className="family-card-body" style={contentBodyStyle}>
          <div className="family-card-section-heading"><div><h2>{TABS.find(item => item.key === tab)?.label}</h2><p>{TABS.find(item => item.key === tab)?.desc}</p></div>{editing && <span className="family-card-editing">Режим редактирования</span>}</div>
          {tab === 'overview' && (
            <div className="family-card-overview">
              <div className="family-card-contacts">
                <DetailPanel title="Контакт" accent="var(--accent)">
                  <DetailInput editing={editing} label="Родитель" tone="soft" value={cardFamily.parentName} onCommit={value => setDraftFamily(current => ({ ...current, parentName: formatName(value) }))} />
                  <DetailInput editing={editing} label="Телефон 1" tone="soft" whatsapp value={cardFamily.phone} onCommit={value => setDraftFamily(current => ({ ...current, phone: formatPhone(value) }))} />
                  <DetailInput editing={editing} label="Телефон 2" tone="soft" whatsapp value={cardFamily.secondPhone ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, secondPhone: formatPhone(value) }))} />
                  <DetailInput editing={editing} label="Telegram" tone="soft" value={cardFamily.phoneTelegram ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, phoneTelegram: value }))} />
                  <h3 className="family-additional-contact-title">Доп. контакт</h3>
                  <DetailInput editing={editing} label="Имя" tone="soft" value={cardFamily.contactName ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, contactName: formatName(value) }))} />
                  <DetailInput editing={editing} label="Телефон" tone="soft" whatsapp value={cardFamily.contactPhone ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, contactPhone: formatPhone(value) }))} />
                </DetailPanel>
                <DetailPanel title="Адрес" accent="var(--success)">
                  <DetailValue label="Адрес" value={cardFamily.fullAddress || '-'} />
                  <DetailValue label="Координаты" value={coordinatesText} />
                  <DetailMapLink label="Яндекс" url={mapUrl} />
                  {editing && (
                    <button type="button" onClick={() => setAddressModalOpen(true)} style={addressChangeButtonStyle}>
                      <MapPin size={13} /> Изменить и пересчитать
                    </button>
                  )}
                  <DetailInput editing={editing} liveCommit multiline label="Комментарий" tone="clear" value={cardFamily.comment ?? ''} placeholder="-" onCommit={value => setDraftFamily(current => ({ ...current, comment: value }))} />
                </DetailPanel>
              </div>

            </div>
          )}
          {tab === 'children' && (
              <DetailPanel title={`Дети (${cardChildren.length})`}>
                <ChildrenOverviewTable focusChildId={initialChildId} children={cardChildren} branches={branches} editing={editing} isAdmin={isAdmin} canManageDiscount={canManageDiscount} onEditDiscount={canManageDiscount && !editing ? setDiscountChild : undefined} onSaveChild={patchDraftChild} onAddChild={addDraftChild} onDeleteChild={deleteDraftChild} busy={savingAll} />
              </DetailPanel>
          )}

          {tab === 'documents' && (
            <FamilyDocumentsTab
              documents={cardDocuments}
              editing={editing}
              loading={loadingDocuments}
              onPatch={patchDraftDocument}
              onAdd={addDraftDocument}
              onDelete={deleteDraftDocument}
            />
          )}

          {(tab === 'finance' || tab === 'charges' || tab === 'refunds') && (
            <TabFinanceLazy
              mode={tab === 'finance' ? 'payments' : tab}
              loaded={financeLoaded}
              onLoad={() => loadFinance()}
              charges={charges} payments={payments} paymentItems={paymentItems} refunds={refunds}
              loading={loadingFinance} family={savedFamily} children={children}
              isAdmin={isAdmin} isCashier={isCashier} isManager={isManager} userRole={userRole as any}
              onSaveCharge={handleSaveCharge} onDeleteCharge={handleDeleteCharge}
              onAddCharges={handleAddCharges} onCreatePayment={handleCreatePayment}
              onConfirmPayment={handleConfirmPayment} onUnconfirmPayment={handleUnconfirmPayment} onSavePayment={handleSavePayment}
              onDeletePayment={handleDeletePayment}
              onCreateRefund={handleCreateRefund} onConfirmRefund={handleConfirmRefund} onRejectRefund={handleRejectRefund}
              readOnly={!editing && !isCashier}
            />
          )}
          {tab === 'history' && (
            <TabHistoryLazy loaded={auditLoaded} onLoad={loadAudit} audit={audit} />
          )}
        </div>
      </section>
      {discountChild && (
        <ChildDiscountModal
          child={discountChild}
          onClose={() => setDiscountChild(null)}
          onSave={input => saveChildDiscount(discountChild, input)}
        />
      )}
      {addressModalOpen && (
        <AddressChangeModal
          initialAddress={draftFamily.fullAddress}
          initialPoint={draftFamily.latitude != null && draftFamily.longitude != null ? {
            address: draftFamily.fullAddress,
            latitude: Number(draftFamily.latitude),
            longitude: Number(draftFamily.longitude),
          } : null}
          children={draftChildren}
          branches={branches}
          onClose={() => setAddressModalOpen(false)}
          onApply={applyAddressPlan}
        />
      )}
    </div>
  );
}

export interface AddressRoutePlan {
  childId: string;
  childName: string;
  branchName: string;
  oldDistanceKm?: number;
  oldZone: Zone;
  oldPrice: number;
  distanceKm?: number;
  durationMinutes?: number;
  routeCoordinates?: number[][];
  zone?: Zone;
  price?: number;
  error?: string;
}

const ADDRESS_TYPE_OPTIONS = ['Микрорайон', 'Жилмассив', 'Улица', 'Проспект', 'Переулок', 'ЖК', 'Село', 'Другое'];
const BISHKEK_CENTER = [42.8746, 74.5698];

interface AddressFields {
  type: string;
  name: string;
  street: string;
  house: string;
}

function buildAddressQuery(fields: AddressFields): string {
  return [fields.house, fields.street, fields.name, 'Бишкек']
    .map(value => value.trim())
    .filter(Boolean)
    .join(', ');
}

export function AddressChangeModal({ initialAddress, initialPoint, children, branches, onClose, onApply }: {
  initialAddress: string;
  initialPoint?: GeocodingCandidate | null;
  children: Child[];
  branches: V2BranchOption[];
  onClose: () => void;
  onApply: (point: GeocodingCandidate, plans: AddressRoutePlan[]) => void;
}) {
  const [query, setQuery] = useState(initialAddress);
  const [addressFields, setAddressFields] = useState<AddressFields>({ type: 'Микрорайон', name: '', street: '', house: '' });
  const [candidates, setCandidates] = useState<GeocodingCandidate[]>([]);
  const [point, setPoint] = useState<GeocodingCandidate | null>(initialPoint ?? null);
  const [plans, setPlans] = useState<AddressRoutePlan[]>([]);
  const [busy, setBusy] = useState<'search' | 'route' | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(initialPoint ? 'Текущий адрес показан на карте. Укажите новый адрес.' : 'Укажите новый адрес и выберите найденный вариант.');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);
  const placemarkRef = useRef<any>(null);
  const routeObjectsRef = useRef<any[]>([]);
  const routeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadYandexMaps().then(ymaps => {
      if (cancelled || !mapContainerRef.current) return;
      ymapsRef.current = ymaps;
      const center = initialPoint ? [initialPoint.latitude, initialPoint.longitude] : BISHKEK_CENTER;
      const map = new ymaps.Map(mapContainerRef.current, {
        center,
        zoom: initialPoint ? 15 : 12,
        controls: ['zoomControl'],
      });
      mapRef.current = map;

      const childBranchIds = new Set(children.map(child => child.branchId).filter(Boolean));
      const childBranchCodes = new Set(children.map(child => child.branchCode).filter(Boolean));
      branches
        .filter(branch => childBranchIds.has(branch.id) || childBranchCodes.has(branch.code))
        .filter(branch => branch.latitude != null && branch.longitude != null)
        .forEach(branch => {
          const schoolMarker = new ymaps.Placemark(
            [Number(branch.latitude), Number(branch.longitude)],
            { hintContent: branch.shortName || branch.name || 'Школа' },
            { preset: 'islands#darkOrangeEducationIcon' },
          );
          map.geoObjects.add(schoolMarker);
        });

      map.events?.add?.('click', async (event: any) => {
        const coordinates = event.get?.('coords');
        if (!Array.isArray(coordinates)) return;
        try {
          setBusy('route');
          setError('');
          setStatus('Проверяем выбранную точку…');
          const nextPoint = await reverseGeocode(Number(coordinates[0]), Number(coordinates[1]));
          await choosePoint(nextPoint);
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : 'Не удалось проверить точку');
          setBusy(null);
        }
      });
      if (initialPoint) showPointOnMap(initialPoint, false);
    }).catch(nextError => {
      if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить карту');
    });

    return () => {
      cancelled = true;
      routeRequestRef.current?.abort();
      mapRef.current?.destroy?.();
      mapRef.current = null;
      ymapsRef.current = null;
      placemarkRef.current = null;
      routeObjectsRef.current = [];
    };
  // The map lives for the lifetime of this modal; prop changes do not recreate it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateAddressFields(patch: Partial<AddressFields>) {
    setAddressFields(current => {
      const next = { ...current, ...patch };
      setQuery(buildAddressQuery(next));
      return next;
    });
    setCandidates([]);
    setPlans([]);
    setError('');
    setStatus('Нажмите «Найти адрес» и выберите точный вариант.');
  }

  function showPointOnMap(nextPoint: GeocodingCandidate, center = true) {
    const ymaps = ymapsRef.current;
    const map = mapRef.current;
    if (!ymaps || !map) return;
    const coordinates = [nextPoint.latitude, nextPoint.longitude];
    if (!placemarkRef.current) {
      const placemark = new ymaps.Placemark(coordinates, { hintContent: nextPoint.address }, {
        preset: 'islands#blueHomeIcon',
        draggable: true,
      });
      placemark.events?.add?.('dragend', async () => {
        const moved = placemark.geometry.getCoordinates();
        const latitude = Number(moved?.[0]);
        const longitude = Number(moved?.[1]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        try {
          setBusy('route');
          setError('');
          setStatus('Проверяем новую точку…');
          const draggedPoint = await reverseGeocode(latitude, longitude);
          await choosePoint(draggedPoint);
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : 'Не удалось проверить точку');
          setBusy(null);
        }
      });
      map.geoObjects.add(placemark);
      placemarkRef.current = placemark;
    } else {
      placemarkRef.current.geometry.setCoordinates(coordinates);
      placemarkRef.current.properties?.set?.('hintContent', nextPoint.address);
    }
    if (center) map.setCenter(coordinates, 15);
  }

  function showRoutesOnMap(nextPoint: GeocodingCandidate, nextPlans: AddressRoutePlan[]) {
    const ymaps = ymapsRef.current;
    const map = mapRef.current;
    if (!ymaps || !map) return;
    routeObjectsRef.current.forEach(route => map.geoObjects.remove(route));
    routeObjectsRef.current = [];
    if (ymaps.Polyline) {
      nextPlans.forEach((plan, index) => {
        if (!plan.routeCoordinates?.length) return;
        const routeLine = new ymaps.Polyline(plan.routeCoordinates, {}, {
          strokeColor: index === 0 ? '#2D8B57' : '#1A7F80',
          strokeWidth: 6,
          strokeOpacity: .9,
        });
        map.geoObjects.add(routeLine);
        routeObjectsRef.current.push(routeLine);
      });
      const bounds = map.geoObjects.getBounds?.();
      if (bounds) map.setBounds?.(bounds, { checkZoomRange: true, zoomMargin: 42 });
      return;
    }
    if (!ymaps.multiRouter?.MultiRoute) return;
    const used = new Set<string>();
    children.forEach((child, index) => {
      const branch = branches.find(item => item.id === child.branchId)
        ?? branches.find(item => item.code === child.branchCode);
      if (!branch || branch.latitude == null || branch.longitude == null || used.has(branch.id)) return;
      used.add(branch.id);
      const route = new ymaps.multiRouter.MultiRoute({
        referencePoints: [
          [nextPoint.latitude, nextPoint.longitude],
          [Number(branch.latitude), Number(branch.longitude)],
        ],
        params: { routingMode: 'auto' },
      }, {
        boundsAutoApply: index === 0,
        routeActiveStrokeColor: index === 0 ? '#2D8B57' : '#1A7F80',
        routeActiveStrokeWidth: 6,
        wayPointVisible: false,
      });
      map.geoObjects.add(route);
      routeObjectsRef.current.push(route);
    });
  }

  async function calculateRoutes(nextPoint: GeocodingCandidate) {
    routeRequestRef.current?.abort();
    const controller = new AbortController();
    routeRequestRef.current = controller;
    setBusy('route');
    const nextPlans = await Promise.all(children.map(async child => {
      const branch = branches.find(item => item.id === child.branchId)
        ?? branches.find(item => item.code === child.branchCode);
      const base: AddressRoutePlan = {
        childId: child.id,
        childName: child.childName,
        branchName: branch?.shortName || branch?.name || child.branchShort || child.branchName || 'Школа не указана',
        oldDistanceKm: child.distanceKm,
        oldZone: child.zone,
        oldPrice: Number(child.finalPrice || 0),
      };
      if (branch?.latitude == null || branch?.longitude == null) {
        return { ...base, error: 'У филиала нет координат' };
      }
      try {
        const route = await getDrivingRoute(nextPoint, {
          latitude: Number(branch.latitude),
          longitude: Number(branch.longitude),
        }, controller.signal);
        const distanceKm = route.distanceKm;
        const zone = getZoneByDistance(distanceKm);
        const repriced = applyChildPricingPatch(child, { zone });
        return { ...base, distanceKm, durationMinutes: route.durationMinutes, routeCoordinates: route.coordinates, zone, price: Number(repriced.finalPrice || 0) };
      } catch (nextError) {
        if (controller.signal.aborted) return { ...base, error: 'Расчёт отменён' };
        return { ...base, error: nextError instanceof Error ? nextError.message : 'Маршрут не найден' };
      }
    }));
    if (!controller.signal.aborted) {
      setPlans(nextPlans);
      showRoutesOnMap(nextPoint, nextPlans);
      setStatus(nextPlans.every(plan => !plan.error) ? 'Адрес выбран, маршрут построен.' : 'Адрес выбран, но часть маршрутов не рассчитана.');
      setBusy(null);
    }
  }

  async function searchAddress(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || query.trim().toLowerCase() === 'бишкек') {
      setError('Заполните улицу или название адреса и дом.');
      return;
    }
    setBusy('search');
    setError('');
    setStatus(`Ищем: ${query}`);
    setPlans([]);
    try {
      const found = await geocodeAddress(query);
      setCandidates(found);
      if (found.length === 0) {
        setError('Адрес не найден. Уточните улицу и дом.');
        setStatus('');
      } else {
        setStatus('Выберите найденный вариант.');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Ошибка поиска адреса');
    } finally {
      setBusy(null);
    }
  }

  async function choosePoint(candidate: GeocodingCandidate) {
    setPoint(candidate);
    setQuery(candidate.address);
    setCandidates([]);
    setError('');
    setStatus('Получаем маршрут и новую стоимость…');
    showPointOnMap(candidate);
    try {
      await calculateRoutes(candidate);
    } catch (nextError) {
      setBusy(null);
      setError(nextError instanceof Error ? nextError.message : 'Ошибка расчёта маршрута');
    }
  }

  async function chooseCandidate(candidate: GeocodingCandidate) {
    await choosePoint(candidate);
  }

  const canApply = Boolean(point)
    && plans.length === children.length
    && plans.length > 0
    && plans.every(plan => !plan.error && plan.distanceKm != null && plan.zone);

  return (
    <div onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }} className="ow-overlay" style={addressModalOverlayStyle}>
      <section className="ow-modal" role="dialog" aria-modal="true" aria-labelledby="address-change-title" style={addressModalCardStyle}>
        <header style={addressModalHeaderStyle}>
          <div>
            <h2 id="address-change-title" style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>Смена адреса</h2>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-2)' }}>Как в форме заявки: укажите адрес, выберите точку и проверьте маршрут.</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="Закрыть" style={closeButtonStyle}><X size={17} /></button>
        </header>

        <div style={addressModalBodyStyle}>
          <div style={addressModalFormPaneStyle}>
            <form onSubmit={searchAddress} style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Адрес проживания</div>
              <div style={addressFieldGridStyle}>
                <label style={addressFieldLabelStyle}>Тип адреса
                  <select value={addressFields.type} onChange={event => updateAddressFields({ type: event.target.value })} style={addressSearchInputStyle}>
                    {ADDRESS_TYPE_OPTIONS.map(option => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label style={addressFieldLabelStyle}>Название
                  <input value={addressFields.name} onChange={event => updateAddressFields({ name: event.target.value })} placeholder="Например: 7 микрорайон" style={addressSearchInputStyle} />
                </label>
                <label style={addressFieldLabelStyle}>Улица
                  <input autoFocus value={addressFields.street} onChange={event => updateAddressFields({ street: event.target.value })} placeholder="Например: Аалы Токомбаева" style={addressSearchInputStyle} />
                </label>
                <label style={addressFieldLabelStyle}>Дом
                  <input value={addressFields.house} onChange={event => updateAddressFields({ house: event.target.value })} placeholder="21/2" style={addressSearchInputStyle} />
                </label>
              </div>
              <label style={addressFieldLabelStyle}>Строка поиска
                <div style={addressQueryPreviewStyle}>{query || 'Бишкек'}</div>
              </label>
              <button type="submit" disabled={Boolean(busy)} style={{ ...addressPrimaryButtonStyle, width: '100%' }}>
                <Search size={15} /> {busy === 'search' ? 'Ищем адрес…' : 'Найти адрес'}
              </button>
            </form>

            {status && <div style={addressStatusStyle}>{busy === 'route' ? 'Считаем маршрут…' : status}</div>}
            {error && <div style={addressErrorStyle}><AlertTriangle size={15} /> {error}</div>}

            {candidates.length > 0 && (
              <div style={addressCandidatesStyle}>
                <div style={{ padding: '9px 12px 5px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'none' }}>Выберите точный адрес</div>
                {candidates.map((candidate, index) => (
                  <button key={`${candidate.latitude}-${candidate.longitude}-${index}`} type="button" onClick={() => chooseCandidate(candidate)} style={addressCandidateButtonStyle}>
                    <MapPin size={15} color="#1A7F80" />
                    <span>{candidate.address}</span>
                  </button>
                ))}
              </div>
            )}

            {point && (
              <div style={addressPointSummaryStyle}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <MapPin size={18} color="#1A7F80" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1F2937', lineHeight: 1.45 }}>{point.address}</div>
                    <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-2)' }}>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid #E5ECEF', fontSize: 11, lineHeight: 1.45, color: 'var(--text-2)' }}>
                  Точку можно выбрать кликом по карте или перетащить маркер.
                </div>
              </div>
            )}

            {plans.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Расчёт стоимости</div>
                {plans.map(plan => (
                  <article key={plan.childId} style={addressPlanCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <b>{plan.childName}</b><span style={{ color: 'var(--text-2)' }}>{plan.branchName}</span>
                    </div>
                    {plan.error ? <div style={{ marginTop: 8, color: '#B42318' }}>{plan.error}</div> : (
                      <div style={addressPlanMetricsStyle}>
                        <span>Расстояние<b>{plan.oldDistanceKm != null ? `${plan.oldDistanceKm} → ` : ''}{plan.distanceKm} км</b></span>
                        <span>В пути<b>{plan.durationMinutes ? `${plan.durationMinutes} мин` : '—'}</b></span>
                        <span>Зона<b>{plan.oldZone} → {plan.zone}</b></span>
                        <span>Стоимость<b style={{ color: plan.price !== plan.oldPrice ? '#B45309' : '#146566' }}>{money(plan.oldPrice)} → {money(plan.price ?? 0)}</b></span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative', minWidth: 0, minHeight: 360 }}>
            <div ref={mapContainerRef} style={addressMapStyle} />
            <div style={addressMapHintStyle}>Кликните по карте или перетащите маркер</div>
          </div>
        </div>

        <footer style={addressModalFooterStyle}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Старые оплаты и начисления не изменяются.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} disabled={Boolean(busy)} style={addressSecondaryButtonStyle}>Отмена</button>
            <button type="button" onClick={() => point && onApply(point, plans)} disabled={!canApply || Boolean(busy)} style={{ ...addressPrimaryButtonStyle, opacity: canApply && !busy ? 1 : .5 }}>
              <Check size={15} /> Применить к карточке
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function FamilyDocumentsTab({ documents, editing, loading, onPatch, onAdd, onDelete }: {
  documents: FamilyDocument[];
  editing: boolean;
  loading: boolean;
  onPatch: (index: number, patch: Partial<FamilyDocument>) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>Загрузка документов...</div>;
  const readyCount = documents.filter(document => Boolean(document.scanUrl || document.scanFile)).length;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section style={{ background: '#fff', borderRadius: 14, padding: '13px 15px', boxShadow: '0 5px 18px rgba(43, 72, 89, .055)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>Документы клиента</div>
          <div style={{ marginTop: 3, color: 'var(--text-2)', fontSize: 11, fontWeight: 600 }}>{readyCount} из {documents.length} файлов добавлено</div>
        </div>
        {editing && <button type="button" onClick={onAdd} style={{ height: 34, padding: '0 12px', border: '1px solid #A9D7D8', borderRadius: 10, background: '#F1FAFA', color: '#146566', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={14} /> Добавить документ</button>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {documents.map((document, index) => {
          const hasFile = Boolean(document.scanFile || document.scanUrl);
          return (
            <article key={document.documentKey} style={{ position: 'relative', background: '#fff', border: '1px solid #E4ECEF', borderRadius: 14, padding: 14, boxShadow: '0 4px 14px rgba(43, 72, 89, .045)', display: 'grid', gap: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingRight: document.isDefault || !editing ? 0 : 34 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: hasFile ? '#E4F6F3' : '#FFF4E8', color: hasFile ? '#146566' : '#B45309', display: 'grid', placeItems: 'center', flexShrink: 0 }}><FileText size={16} /></span>
                {editing ? (
                  <input value={document.title} onChange={event => onPatch(index, { title: event.currentTarget.value })} aria-label="Название документа" style={{ width: '100%', minWidth: 0, height: 32, border: '1px solid #DDE7EB', borderRadius: 8, padding: '0 9px', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, outline: 'none' }} />
                ) : (
                  <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.title}</div>
                )}
                {!document.isDefault && editing && <button type="button" onClick={() => onDelete(index)} title="Удалить документ" style={{ position: 'absolute', right: 12, top: 16, width: 28, height: 28, border: '1px solid #F1CACA', borderRadius: 8, background: '#FFF7F7', color: '#B42318', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Trash2 size={13} /></button>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4 }}><span style={{ color: 'var(--text-2)', fontSize: 11.5, fontWeight: 600, textTransform: 'none' }}>Номер</span>{editing ? <input value={document.number} onChange={event => onPatch(index, { number: event.currentTarget.value })} placeholder="Не указан" style={familyDocumentControlStyle} /> : <span style={familyDocumentValueStyle}>{document.number || '—'}</span>}</label>
                <label style={{ display: 'grid', gap: 4 }}><span style={{ color: 'var(--text-2)', fontSize: 11.5, fontWeight: 600, textTransform: 'none' }}>Дата</span>{editing ? <input type="date" value={document.issuedAt} onChange={event => onPatch(index, { issuedAt: event.currentTarget.value })} style={familyDocumentControlStyle} /> : <span style={familyDocumentValueStyle}>{document.issuedAt ? new Date(`${document.issuedAt}T00:00:00`).toLocaleDateString('ru-RU') : '—'}</span>}</label>
              </div>

              {editing ? (
                <label style={{ height: 36, border: `1px dashed ${hasFile ? '#8EC9C4' : '#D4E0E4'}`, borderRadius: 10, background: hasFile ? '#F3FBFA' : '#FAFCFC', color: hasFile ? '#146566' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {document.scanFile ? document.scanFile.name : document.scanUrl ? 'Заменить файл' : 'Добавить файл'}
                  <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={event => onPatch(index, { scanFile: event.currentTarget.files?.[0] ?? null })} style={{ display: 'none' }} />
                </label>
              ) : document.scanUrl ? (
                <a href={document.scanUrl} target="_blank" rel="noreferrer" style={{ height: 34, borderRadius: 9, background: '#F1FAFA', color: '#146566', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', fontSize: 11, fontWeight: 600 }}><ExternalLink size={13} /> Открыть документ</a>
              ) : (
                <div style={{ height: 34, borderRadius: 9, background: '#FAF6F1', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>Файл не добавлен</div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

const familyDocumentControlStyle: React.CSSProperties = { width: '100%', height: 32, border: '1px solid #DDE7EB', borderRadius: 8, background: '#F8FAFC', padding: '0 8px', color: 'var(--text)', fontSize: 11.5, fontWeight: 600, outline: 'none' };
const familyDocumentValueStyle: React.CSSProperties = { height: 32, borderRadius: 8, background: '#F8FAFC', padding: '0 9px', color: '#344054', display: 'flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600 };

function SideMetric({ label, value, alert, pending }: { label: string; value: string; alert?: boolean; pending?: boolean }) {
  return (
    <div className={`family-card-metric${alert ? ' is-alert' : ''}${pending ? ' is-pending' : ''}`}>
      <div className="family-card-metric-label">{label}</div>
      <div className="family-card-metric-value">{value}</div>
    </div>
  );
}

function TabFinanceLazy({ loaded, onLoad, ...props }: { loaded: boolean; onLoad: () => void } & React.ComponentProps<typeof TabFinance>) {
  useEffect(() => { if (!loaded) onLoad(); }, [loaded, onLoad]);
  if (!loaded) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>Загрузка финансов...</div>;
  return <TabFinance {...props} />;
}

function TabHistoryLazy({ loaded, onLoad, audit }: { loaded: boolean; onLoad: () => void; audit: AuditEntry[] }) {
  useEffect(() => { if (!loaded) onLoad(); }, [loaded, onLoad]);
  if (!loaded) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>Загрузка истории...</div>;
  return <TabHistory audit={audit} />;
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <section className="family-card-panel">
      <div className="family-card-panel-title">{title}</div>
      <div className="family-detail-rows">
        {children}
      </div>
    </section>
  );
}

function DetailInput({ label, value, onCommit, placeholder = '-', type = 'text', tone = 'soft', editing = false, whatsapp = false, liveCommit = false, multiline = false }: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: string;
  tone?: 'soft' | 'clear';
  editing?: boolean;
  whatsapp?: boolean;
  liveCommit?: boolean;
  multiline?: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const waHref = whatsapp ? whatsAppLink(value) : null;
  return (
    <label className="family-detail-row" style={detailFieldStyle(tone)}>
      <span style={detailLabelStyle}>{label}</span>
      {multiline ? (
        editing ? <textarea
          className="family-card-control"
          aria-label={label}
          value={local}
          placeholder={placeholder}
          onChange={event => { setLocal(event.target.value); if (liveCommit) onCommit(event.target.value); }}
          onBlur={event => { if (!liveCommit) onCommit(event.currentTarget.value); }}
          style={{ ...detailControlStyle, height: 72, resize: 'vertical', minHeight: 54, maxHeight: 160, padding: 8 }}
        /> : <span tabIndex={0} aria-label={label} style={{ ...detailControlStyle, display: 'block', height: 'auto', maxHeight: 72, overflowY: 'auto', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', paddingLeft: 0 }}>{value || placeholder}</span>
      ) : editing ? (
        <input
          className="family-card-control"
          type={type}
          value={local}
          placeholder={placeholder}
          onChange={event => {
            setLocal(event.target.value);
            if (liveCommit) onCommit(event.target.value);
          }}
          onBlur={event => { if (!liveCommit) onCommit(event.currentTarget.value); }}
          style={{ ...detailControlStyle, background: '#F8FAFC', borderColor: 'var(--border)' }}
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
          <span>{formatPhoneDisplay(value) || placeholder}</span>
          <MessageCircle size={12} color="#25D366" />
        </a>
      ) : (
        <span style={{ ...detailControlStyle, display: 'flex', alignItems: 'center', paddingLeft: 0 }}>{value || placeholder}</span>
      )}
    </label>
  );
}

function childDiscountLabel(child: Child): string {
  if (child.fixedPrice != null) return `Фикс. цена ${money(Number(child.fixedPrice))}`;
  if (child.discountOverridePercent != null) return child.discountOverridePercent === 0 ? 'Без скидки · 0%' : `${child.discountOverridePercent}%`;
  const percent = Number(child.manualDiscountPercent || 0);
  const amount = Number(child.manualDiscountAmount || 0);
  if (percent > 0 || amount > 0) {
    const parts = [percent > 0 ? `${percent}%` : '', amount > 0 ? money(amount) : ''].filter(Boolean).join(' + ');
    const from = child.discountValidFrom ? ` с ${child.discountValidFrom.slice(0, 7)}` : '';
    const to = child.discountValidTo ? ` по ${child.discountValidTo.slice(0, 7)}` : '';
    return `${parts}${from}${to}`;
  }
  return child.siblingApplied ? 'Семейная 5%' : '—';
}

function ReadOnlyValue({ value }: { value?: string }) {
  return <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{value || '—'}</span>;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="family-detail-row" style={detailFieldStyle('soft')}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={{ ...detailControlStyle, display: 'flex', alignItems: 'center', height: 'auto', minHeight: 24, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
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
            color: '#146566',
            textDecoration: 'none',
          }}
        >
          <MapPin size={13} />
          <span>Открыть карту</span>
          <ExternalLink size={12} />
        </a>
      ) : (
        <span style={{ ...detailControlStyle, display: 'flex', alignItems: 'center', color: 'var(--text-3)' }}>-</span>
      )}
    </div>
  );
}

const CHILD_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  boarded:  { bg: '#E7F5EE', color: '#0F6B48' },
  waiting:  { bg: '#FDF3DD', color: '#8A5A00' },
  new:      { bg: '#EAF1FD', color: '#2952A3' },
  paused:   { bg: '#EEF1F4', color: '#4A5563' },
  rejected: { bg: '#FBEAEA', color: '#A12C2C' },
}
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
  isAdmin,
  onEditDiscount,
  canManageDiscount,
}: {
  child: Child;
  index: number;
  branches: V2BranchOption[];
  onSaveChild: (child: Child, patch: Partial<Child>) => Promise<boolean>;
  onDeleteChild: (child: Child) => void;
  busy?: boolean;
  editing?: boolean;
  isAdmin?: boolean;
  onEditDiscount?: (child: Child) => void;
  canManageDiscount?: boolean;
}) {
  // новый ребёнок (ещё не сохранён) сразу открыт — его нужно заполнить
  const expanded = true;
  const s = child.status ?? 'new';
  const col = CHILD_STATUS_COLORS[s] ?? CHILD_STATUS_COLORS.new;
  const basePrice = Number(child.basePrice || child.finalPrice || 0);
  const finalPrice = Number(child.finalPrice || 0);
  const hasDiscount = basePrice > finalPrice;
  const vehicleLabel = VEHICLE_TYPE_OPTIONS.find(item => item.value === child.vehicleType)?.label ?? child.vehicleType;

  return (
    <article className="family-child-card" style={{ background: '#fff', border: '1px solid #EEF3F4', borderRadius: 13, boxShadow: '0 3px 12px rgba(43, 72, 89, .045)', overflow: 'hidden' }}>
      {/* Свёрнутая строка — всегда видна, клик разворачивает карточку */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}
      >
        <span style={childCardIndexStyle}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{formatName(child.childName) || 'Без имени'}</span>
          <TaskButton compact target={{type:'child',id:child.id,label:child.childName,familyId:child.familyId}} />
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            CRM: {formatInlineDate(child.createdAt)} · Посадка: {formatInlineDate(child.transferAssignedAt)}
          </span>

        </div>
        <span style={{ background: col.bg, color: col.color, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '4px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {CHILD_STATUS_OPTIONS_INLINE.find(item => item.value === s)?.label ?? s}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
          {hasDiscount && <span style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'line-through' }}>{money(basePrice)}</span>}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{money(finalPrice)}</span>
        </div>
        {onEditDiscount && !child.id.startsWith('draft-') && (
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onEditDiscount(child); }}
            title="Постоянная скидка"
            style={discountButtonStyle}
          >
            Скидка
          </button>
        )}
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
                    options={branches.filter(branch=>isSchoolVisible(branch.shortName || branch.code) && isSchoolVisible(branch.name)).map(b => ({ value: b.id, label: b.shortName || b.code }))}
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
                label: 'Расстояние (км)',
                content: editing && isAdmin
                  ? <EditableNumber value={child.distanceKm ?? undefined} onCommit={value => onSaveChild(child, { distanceKm: value ?? 0 })} step={0.1} min={0} />
                  : <ReadOnlyValue value={child.distanceKm != null ? `${child.distanceKm} км` : '-'} />,
              },
              {
                label: 'Зона / ТС',
                content: (
                  editing ? <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <EditableSelect value={child.zone} options={ZONE_OPTIONS} onCommit={value => onSaveChild(child, { zone: value as Zone })} width={40} panelWidth={120} />
                    <span style={{ color: '#C4C9D4', fontSize: 11 }}>·</span>
                    <EditableSelect value={child.vehicleType} options={VEHICLE_TYPE_OPTIONS} onCommit={value => onSaveChild(child, { vehicleType: value as VehicleType })} width={90} panelWidth={190} />
                  </div> : <ReadOnlyValue value={`${child.zone} · ${vehicleLabel}`} />
                ),
              },
              {
                label: 'Трансфер',
                content: editing ? <EditableSelect value={child.transferNumber ? String(child.transferNumber) : ''} options={TRANSFER_OPTIONS} onCommit={value => onSaveChild(child, { transferNumber: value ? Number(value) : undefined })} width={60} panelWidth={130} /> : child.transferNumber ? <span className="family-transfer-badge" style={{ background: VEHICLE_COLOR[child.vehicleType] || VEHICLE_COLOR.microbus }}>№ {child.transferNumber}</span> : <ReadOnlyValue value="—" />,
              },
              {
                label: 'Остановка',
                content: editing ? <EditableSelect value={child.stopNumber ? String(child.stopNumber) : ''} options={STOP_OPTIONS} onCommit={value => onSaveChild(child, { stopNumber: value ? Number(value) : undefined })} width={58} panelWidth={120} /> : <ReadOnlyValue value={child.stopNumber ? String(child.stopNumber) : '-'} />,
              },
              {
                label: 'Цена (сом)',
                content: editing && isAdmin
                  ? <EditableNumber value={basePrice || undefined} onCommit={value => onSaveChild(child, { basePrice: value ?? 0 })} step={100} min={0} />
                  : <ReadOnlyValue value={money(basePrice)} />,
              },
              {
                label: 'Скидка',
                content: editing && canManageDiscount && !child.id.startsWith('draft-') && child.fixedPrice == null ? (
                  <select
                    aria-label={`Скидка для ${child.childName}`}
                    value={child.discountOverridePercent == null ? (Number(child.manualDiscountPercent || 0) > 0 || Number(child.manualDiscountAmount || 0) > 0 ? 'custom' : 'auto') : String(child.discountOverridePercent)}
                    disabled={busy}
                    onChange={event => void onSaveChild(child, { discountOverridePercent: event.target.value === 'auto' ? null : Number(event.target.value) })}
                    style={{ width: '100%', border: '1px solid #D5E3E7', borderRadius: 5, background: '#fff', color: 'var(--text)', fontSize: 12, fontWeight: 600, padding: '3px 5px' }}
                  >
                    {child.discountOverridePercent == null && (Number(child.manualDiscountPercent || 0) > 0 || Number(child.manualDiscountAmount || 0) > 0) && <option value="custom" disabled>{childDiscountLabel(child)}</option>}
                    <option value="auto">Автоматически</option>
                    {Array.from({ length: 11 }, (_, index) => index * 5).map(percent => <option key={percent} value={percent}>{percent}%</option>)}
                  </select>
                ) : <ReadOnlyValue value={childDiscountLabel(child)} />,
              },
              {
                label: 'Итого',
                content: <ReadOnlyValue value={money(finalPrice)} />,
              },
            ].filter(({ label }) => editing || (label !== 'Итого' && (label !== 'Цена (сом)' || hasDiscount))).map(({ label, content }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: 7, padding: '5px 8px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
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
  focusChildId,
  branches,
  onSaveChild,
  onAddChild,
  onDeleteChild,
  busy,
  editing,
  isAdmin,
  onEditDiscount,
  canManageDiscount,
}: {
  children: Child[];
  focusChildId?: string;
  branches: V2BranchOption[];
  onSaveChild: (child: Child, patch: Partial<Child>) => Promise<boolean>;
  onAddChild: () => void;
  onDeleteChild: (child: Child) => void;
  busy?: boolean;
  editing?: boolean;
  isAdmin?: boolean;
  onEditDiscount?: (child: Child) => void;
  canManageDiscount?: boolean;
}) {
  const focusedRow = useRef<HTMLTableRowElement>(null);
  const [detailChildId, setDetailChildId] = useState<string | null>(null);
  useEffect(() => { if (focusChildId) focusedRow.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focusChildId, children.length]);
  return (
    <div>
      <div className="family-children-toolbar">
        <span>{children.length ? 'Все дети семьи' : 'Детей пока нет'}</span>
        {editing && <button type="button" onClick={onAddChild} disabled={busy} style={smallAddChildBtnStyle}>+ Добавить ребёнка</button>}
      </div>
      {children.length === 0 ? <p>Добавьте первого ребёнка в режиме редактирования.</p> : (
        <div className="family-children-table-wrap">
          <table className="family-children-table">
            <thead><tr>{['Ребёнок', 'Школа / класс', 'Транспорт', 'Трансфер', 'Остановка', 'Статус', 'В месяц', ''].map((label, index) => <th scope="col" key={index}>{label}</th>)}</tr></thead>
            <tbody>{children.map((child, index) => (
              <React.Fragment key={child.id}>
              <tr ref={child.id === focusChildId ? focusedRow : undefined} className={child.id === focusChildId ? 'is-focused' : ''}>
                <td>{editing ? <EditableText value={child.childName} onCommit={value => onSaveChild(child, { childName: formatName(value) })} strong /> : <strong>{formatName(child.childName)}</strong>}</td>
                <td><span>{child.branchShort || child.schoolCode}</span><span className="family-children-secondary">{child.class ? (/класс/i.test(child.class) ? child.class : `${child.class} класс`) : 'Класс не указан'}</span></td>
                <td>{VEHICLE_TYPE_OPTIONS.find(option => option.value === child.vehicleType)?.label || '—'}<span className="family-children-secondary">Зона {child.zone}</span></td>
                <td>{editing ? <EditableSelect value={String(child.transferNumber || '')} options={TRANSFER_OPTIONS} onCommit={value => onSaveChild(child, { transferNumber: value ? Number(value) : undefined })} /> : child.transferNumber ? <span className="family-transfer-badge" style={{ background: VEHICLE_COLOR[child.vehicleType] || VEHICLE_COLOR.microbus }}>№ {child.transferNumber}</span> : '—'}</td>
                <td>{editing ? <EditableSelect value={String(child.stopNumber || '')} options={STOP_OPTIONS} onCommit={value => onSaveChild(child, { stopNumber: value ? Number(value) : undefined })} /> : child.stopNumber || '—'}</td>
                <td>{editing ? <EditableSelect value={child.status || 'new'} options={CHILD_STATUS_OPTIONS_INLINE} onCommit={value => onSaveChild(child, { status: value as Child['status'] })} /> : <span className="family-children-status" style={{ color: (CHILD_STATUS_COLORS[child.status || 'new'] || CHILD_STATUS_COLORS.new).color, background: (CHILD_STATUS_COLORS[child.status || 'new'] || CHILD_STATUS_COLORS.new).bg }}>{CHILD_STATUS_OPTIONS_INLINE.find(option => option.value === (child.status || 'new'))?.label || '—'}</span>}</td>
                <td className="family-children-price"><strong>{money(Number(child.finalPrice || 0))}</strong>{childDiscountLabel(child) !== '—' && <span className="family-children-secondary">{childDiscountLabel(child)}</span>}</td>
                <td><div style={{ display: 'flex', gap: 6 }}><button type="button" className="family-children-action" onClick={() => setDetailChildId(detailChildId === child.id ? null : child.id)} aria-expanded={detailChildId === child.id}>{detailChildId === child.id ? 'Скрыть' : editing ? 'Настроить' : 'Подробнее'}</button>{!editing && onEditDiscount && <button type="button" className="family-children-action" onClick={() => onEditDiscount(child)}>Скидка</button>}</div></td>
              </tr>
              {detailChildId === child.id && <tr className="family-child-detail-row"><td colSpan={8}>
                <ChildCard child={child} index={index} branches={branches} onSaveChild={onSaveChild} onDeleteChild={onDeleteChild} busy={busy} editing={editing} isAdmin={isAdmin} canManageDiscount={canManageDiscount} onEditDiscount={onEditDiscount} />
              </td></tr>}
              </React.Fragment>
            ))}</tbody>
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
      {prefix && <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>{prefix}</span>}
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
      {suffix && <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>{suffix}</span>}
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

function modalStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-lg)',
    height: 'min(900px, calc(100vh - 48px))',
    minHeight: 0,
    maxHeight: 'calc(100vh - 48px)',
    overflow: 'hidden',
    width: '100%',
    margin: 0,
  };
}

function detailFieldStyle(_tone: 'soft' | 'clear'): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '120px minmax(0, 1fr)',
    gap: 12,
    minWidth: 0,
    padding: '6px 0',
    minHeight: 36,
    borderBottom: '1px solid #EEF1F4',
    borderRadius: 0,
    background: 'transparent',
    alignItems: 'center',
  };
}

const detailLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 400,
  color: 'var(--text-2)',
};

const detailControlStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 30,
  border: '1px solid transparent',
  borderRadius: 7,
  background: 'transparent',
  color: 'var(--text)',
  padding: '0 9px',
  fontSize: 13.5,
  fontWeight: 500,
  outline: 'none',
};

const headerInfoStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  flexWrap: 'wrap',
};

const closeButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  color: 'var(--text-2)',
  padding: 0,
  flexShrink: 0,
  display: 'grid',
  placeItems: 'center',
};

const editHeaderButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  border: '1px solid var(--accent-h)',
  borderRadius: 8,
  background: 'var(--accent)',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-xs)',
  whiteSpace: 'nowrap',
};

const secondaryHeaderButtonStyle: React.CSSProperties = {
  ...editHeaderButtonStyle,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};

const addressChangeButtonStyle: React.CSSProperties = {
  minHeight: 32,
  margin: '6px 0',
  padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-xs)',
};

const addressModalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(23, 34, 47, .32)',
  backdropFilter: 'blur(2px)',
};

const addressModalCardStyle: React.CSSProperties = {
  width: 'min(1160px, 100%)',
  height: 'min(760px, calc(100vh - 48px))',
  maxHeight: 'calc(100vh - 48px)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  overflow: 'hidden',
  borderRadius: 18,
  background: '#fff',
  boxShadow: '0 28px 80px rgba(15, 23, 42, .24)',
};

const addressModalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '17px 18px',
  borderBottom: '1px solid #E5ECEF',
};

const addressSearchInputStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  height: 40,
  border: '1px solid #CDD7DB',
  borderRadius: 10,
  padding: '0 12px',
  outline: 'none',
  color: 'var(--text)',
  fontSize: 13,
  fontWeight: 600,
};

const addressModalBodyStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '420px minmax(0, 1fr)',
  overflow: 'hidden',
  background: '#F3F8F8',
};

const addressModalFormPaneStyle: React.CSSProperties = {
  minWidth: 0,
  overflowY: 'auto',
  padding: 18,
  display: 'grid',
  alignContent: 'start',
  gap: 12,
  borderRight: '1px solid #DDE7E9',
  background: '#F1F8F7',
};

const addressFieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

const addressFieldLabelStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 6,
  color: '#475467',
  fontSize: 11,
  fontWeight: 600,
};

const addressQueryPreviewStyle: React.CSSProperties = {
  minHeight: 40,
  padding: '9px 12px',
  display: 'flex',
  alignItems: 'center',
  border: '1px solid #DCE6E8',
  borderRadius: 10,
  background: '#fff',
  color: '#1F2937',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.35,
};

const addressPrimaryButtonStyle: React.CSSProperties = {
  minHeight: 40,
  border: 'none',
  borderRadius: 10,
  padding: '0 15px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  background: '#1A7F80',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const addressSecondaryButtonStyle: React.CSSProperties = {
  ...addressPrimaryButtonStyle,
  border: '1px solid #DCE4E7',
  background: '#fff',
  color: 'var(--text-2)',
};

const addressCandidatesStyle: React.CSSProperties = {
  display: 'grid',
  overflow: 'hidden',
  border: '1px solid #DDE6E8',
  borderRadius: 11,
  background: '#fff',
};

const addressCandidateButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 38,
  border: 'none',
  borderTop: '1px solid #EEF2F3',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  background: '#fff',
  color: '#344054',
  textAlign: 'left',
  fontSize: 12,
  cursor: 'pointer',
};

const addressErrorStyle: React.CSSProperties = {
  minHeight: 36,
  padding: '8px 11px',
  border: '1px solid #F5C2C2',
  borderRadius: 9,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#FFF5F5',
  color: '#B42318',
  fontSize: 11,
  fontWeight: 600,
};

const addressStatusStyle: React.CSSProperties = {
  minHeight: 34,
  padding: '8px 11px',
  border: '1px solid #CDE5E2',
  borderRadius: 9,
  background: '#F4FBFA',
  color: '#146566',
  fontSize: 11,
  fontWeight: 600,
};

const addressMapStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 360,
  overflow: 'hidden',
  background: '#EEF3F4',
};

const addressMapHintStyle: React.CSSProperties = {
  position: 'absolute',
  left: 14,
  bottom: 14,
  zIndex: 2,
  padding: '8px 11px',
  border: '1px solid rgba(255,255,255,.8)',
  borderRadius: 10,
  background: 'rgba(255,255,255,.92)',
  boxShadow: '0 6px 18px rgba(15, 23, 42, .12)',
  color: '#475467',
  fontSize: 11,
  fontWeight: 600,
  pointerEvents: 'none',
};

const addressPointSummaryStyle: React.CSSProperties = {
  padding: 12,
  border: '1px solid #DCE5E8',
  borderRadius: 13,
  background: '#F8FBFB',
};

const addressPlanCardStyle: React.CSSProperties = {
  padding: 11,
  border: '1px solid #DCE6E8',
  borderRadius: 11,
  background: '#fff',
  color: '#344054',
  fontSize: 11,
};

const addressPlanMetricsStyle: React.CSSProperties = {
  marginTop: 9,
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
};

const addressTableCellStyle: React.CSSProperties = {
  padding: '9px 12px',
  whiteSpace: 'nowrap',
};

const addressModalFooterStyle: React.CSSProperties = {
  minHeight: 64,
  padding: '11px 18px',
  borderTop: '1px solid #E5ECEF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  background: '#FBFCFC',
};

const discountButtonStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  borderRadius: 7,
  padding: '3px 9px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
};

function teacherPriceButtonStyle(active: boolean): React.CSSProperties {
  return {
    ...secondaryHeaderButtonStyle,
    border: `1px solid ${active ? '#E3B341' : 'var(--border)'}`,
    background: active ? '#FFF7E0' : 'var(--surface)',
    color: active ? '#8A5A00' : 'var(--text)',
  };
}

const contentBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px 28px',
  background: 'var(--bg)',
};

const smallAddChildBtnStyle: React.CSSProperties = {
  height: 32,
  border: '1px solid var(--accent-h)',
  borderRadius: 8,
  background: 'var(--accent)',
  color: '#fff',
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-xs)',
};

const deleteChildBtnStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--danger)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const childCardIndexStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 6,
  background: 'var(--surface-3)',
  color: 'var(--text-2)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0,
};

function childTableControlStyle(strong?: boolean): React.CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    height: 28,
    border: '1px solid transparent',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text)',
    padding: '0 6px',
    fontSize: 13,
    fontWeight: strong ? 600 : 400,
    outline: 'none',
  };
}
