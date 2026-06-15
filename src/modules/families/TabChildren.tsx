import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Save, Trash2, X } from 'lucide-react';
import { Child, ChildStatus, Family, SchoolCode, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import { deleteV2Child, fetchV2Branches, updateV2Child, updateV2ChildRoute, V2BranchOption } from '../../services/crmV2Service';
import { VT_LABEL } from './constants';
import { Section, Spinner } from './DrawerUI';
import { formatClassName } from '../../utils/format';

interface KidState {
  id: string;
  childName: string;
  cls: string;
  schoolId?: string;
  branchId?: string;
  branchCode?: string;
  branchShort?: string;
  address: string;
  zone: Zone;
  distanceKm: string;
  vehicleType: VehicleType;
  transferNumber: string;
  stopNumber: string;
  timeMorning: string;
  selfExitAllowed: boolean;
  status: ChildStatus;
  basePrice: number;
  siblingDiscountPercent: number;
  manualDiscountPercent: number;
  manualDiscountAmount: number;
  finalPrice: number;
}

interface Props {
  children: Child[];
  loading: boolean;
  family: Family;
  isAdmin: boolean;
  onReload?: () => void;
}

const TRANSFER_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);
const STOP_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);
const CHILD_STATUS_OPTIONS: { value: ChildStatus; label: string }[] = [
  { value: 'new', label: 'Новый' },
  { value: 'waiting', label: 'Ожидание' },
  { value: 'boarded', label: 'Посажен' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'paused', label: 'Пауза' },
];
const CHILD_STATUS_LABEL: Record<ChildStatus, string> = {
  new: 'Новый',
  waiting: 'Ожидание',
  boarded: 'Посажен',
  rejected: 'Отказ',
  paused: 'Пауза',
};
const CHILD_STATUS_TONE: Record<ChildStatus, 'blue' | 'yellow' | 'green' | 'red' | 'gray'> = {
  new: 'blue',
  waiting: 'yellow',
  boarded: 'green',
  rejected: 'red',
  paused: 'gray',
};

export default function TabChildren({ children, loading, isAdmin, onReload }: Props) {
  const [kids, setKids] = useState<KidState[]>([]);
  const [branches, setBranches] = useState<V2BranchOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KidState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setKids(children.map(toKidState));
  }, [children]);

  useEffect(() => {
    fetchV2Branches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const familyTotal = useMemo(() => kids.reduce((sum, kid) => sum + kid.finalPrice, 0), [kids]);
  const editingSource = children.find(child => String(child.id) === editingId);

  if (loading) return <Spinner />;

  function startEdit(kid: KidState) {
    setEditingId(kid.id);
    setDraft({ ...kid });
    setMsg('');
  }

  function closeEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function patchDraft(patch: Partial<KidState>) {
    setDraft(current => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (
        patch.vehicleType !== undefined ||
        patch.zone !== undefined ||
        patch.branchId !== undefined ||
        patch.manualDiscountPercent !== undefined ||
        patch.manualDiscountAmount !== undefined ||
        patch.basePrice !== undefined ||
        patch.siblingDiscountPercent !== undefined
      ) {
        if (patch.vehicleType !== undefined || patch.zone !== undefined || patch.branchId !== undefined) {
          const branch = branches.find(item => item.id === next.branchId);
          next.branchCode = branch?.code ?? next.branchCode;
          next.branchShort = branch?.shortName ?? next.branchShort;
          next.schoolId = branch?.schoolId ?? next.schoolId;
          const schoolCode = branch?.code ? (normalizeBranchSchool(branch.code) as SchoolCode) : (next.branchCode ? normalizeBranchSchool(next.branchCode) as SchoolCode : 'KINGS');
          next.basePrice = getPriceByZone(schoolCode, next.zone, next.vehicleType);
        }
        next.finalPrice = calcFinalPrice(next);
      }
      return next;
    });
  }

  async function saveDraft() {
    if (!draft || !editingSource) return;
    setSaving(true);
    try {
      await updateV2Child(draft.id, {
        child_name: draft.childName,
        class_name: formatClassName(draft.cls),
        school_id: draft.schoolId ?? null,
        branch_id: draft.branchId ?? null,
        address: draft.address || null,
        zone: draft.zone,
        distance_km: draft.distanceKm === '' ? null : Number(draft.distanceKm),
        vehicle_type: draft.vehicleType,
        base_price: draft.basePrice,
        self_exit_allowed: draft.selfExitAllowed,
        status: draft.status,
        manual_discount_percent: isAdmin ? draft.manualDiscountPercent : undefined,
        manual_discount_amount: isAdmin ? draft.manualDiscountAmount : undefined,
        final_price: draft.finalPrice,
      });
      await updateV2ChildRoute({
        child: {
          ...editingSource,
          schoolId: draft.schoolId,
          branchId: draft.branchId,
        },
        vehicleType: draft.vehicleType,
        transferNumber: draft.transferNumber ? Number(draft.transferNumber) : undefined,
        stopNumber: draft.stopNumber ? Number(draft.stopNumber) : undefined,
        timeMorning: draft.timeMorning,
      });
      setMsg('Сохранено');
      setTimeout(() => setMsg(''), 2000);
      closeEdit();
      onReload?.();
    } catch (error: any) {
      setMsg(`Ошибка: ${error.message}`);
      setTimeout(() => setMsg(''), 6000);
    }
    setSaving(false);
  }

  async function deleteKid(kid: KidState) {
    if (!window.confirm(`Удалить ${kid.childName}?`)) return;
    await deleteV2Child(kid.id);
    setKids(current => current.filter(item => item.id !== kid.id));
    if (editingId === kid.id) closeEdit();
    onReload?.();
  }

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.includes('Ошибка') ? '#FEE2E2' : '#D1FAE5',
          color: msg.includes('Ошибка') ? '#991B1B' : '#065F46',
          borderRadius: 8,
          padding: '7px 12px',
          marginBottom: 8,
          fontSize: 12,
          fontWeight: 700,
        }}>
          {msg}
        </div>
      )}

      {!draft && (
        <>
          <Section title={`Дети (${kids.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {kids.length === 0 && (
                <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--text-2)', fontSize: 12 }}>
                  Детей нет
                </div>
              )}

              {kids.map((kid, index) => {
                const discountAmount = Math.max(0, kid.basePrice - kid.finalPrice);
                return (
                  <div key={kid.id} style={{
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '9px 12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8,
                    alignItems: 'center',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'var(--accent-l)',
                          color: 'var(--accent)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                        }}>
                          {index + 1}
                        </span>
                        <b style={{ fontSize: 13, color: 'var(--text)' }}>{kid.childName || 'Без имени'}</b>
                        <SmallTag>{kid.cls ? `${kid.cls} кл.` : 'класс не указан'}</SmallTag>
                        <SmallTag>{VT_LABEL[kid.vehicleType] ?? kid.vehicleType}</SmallTag>
                        <SmallTag tone={CHILD_STATUS_TONE[kid.status]}>{CHILD_STATUS_LABEL[kid.status]}</SmallTag>
                        {kid.selfExitAllowed && <SmallTag tone="green">Самовыход</SmallTag>}
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: 7,
                        marginTop: 7,
                      }}>
                        <Info label="Трансфер" value={kid.transferNumber ? `№${kid.transferNumber}` : '—'} />
                        <Info label="Остановка" value={kid.stopNumber || '—'} />
                        <Info label="Утро" value={kid.timeMorning || '—'} />
                        <Info label="Сумма" value={money(kid.finalPrice)} accent />
                      </div>

                      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-2)' }}>
                        Цена: {money(kid.basePrice)} · Скидка: {discountAmount > 0 ? money(discountAmount) : '—'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(kid)} title="Редактировать" style={iconBtnStyle}>
                        <Pencil size={14} />
                      </button>
                      {isAdmin && (
                        <button onClick={() => deleteKid(kid)} title="Удалить" style={{ ...iconBtnStyle, background: '#FEE2E2', color: '#991B1B' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <TotalBar count={kids.length} amount={familyTotal} />
        </>
      )}

      {draft && (
        <Section title="Редактирование ребёнка">
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{draft.childName || 'Ребёнок'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>Данные, логистика и стоимость</div>
              </div>
              <button onClick={closeEdit} style={{ ...iconBtnStyle, background: '#F3F4F6', color: 'var(--text)' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, marginBottom: 8 }}>
              <Field label="ФИО">
                <input value={draft.childName} onChange={e => patchDraft({ childName: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Класс">
                <input value={draft.cls} onChange={e => patchDraft({ cls: formatClassName(e.target.value) })} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
              <Field label="Статус ребёнка">
                <select value={draft.status} onChange={e => patchDraft({ status: e.target.value as ChildStatus })} style={inputStyle}>
                  {CHILD_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 95px 90px', gap: 8, marginBottom: 8 }}>
              <Field label="Школа">
                <select value={draft.branchId ?? ''} onChange={e => patchDraft({ branchId: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.shortName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Зона">
                <select value={draft.zone} onChange={e => patchDraft({ zone: e.target.value as Zone })} style={inputStyle}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </Field>
              <Field label="Км">
                <input type="number" step="0.1" value={draft.distanceKm} onChange={e => patchDraft({ distanceKm: e.target.value })} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
              <Field label="Адрес">
                <input value={draft.address} onChange={e => patchDraft({ address: e.target.value })} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 115px', gap: 8, marginBottom: 8 }}>
              <Field label="Тип ТС">
                <select value={draft.vehicleType} onChange={e => patchDraft({ vehicleType: e.target.value as VehicleType })} style={inputStyle}>
                  <option value="microbus">Микроавтобус</option>
                  <option value="minivan">Минивэн</option>
                  <option value="sedan">Седан</option>
                </select>
              </Field>
              <Field label="Трансфер">
                <select value={draft.transferNumber} onChange={e => patchDraft({ transferNumber: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {TRANSFER_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Остановка">
                <select value={draft.stopNumber} onChange={e => patchDraft({ stopNumber: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {STOP_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Время утро">
                <input type="time" value={draft.timeMorning} onChange={e => patchDraft({ timeMorning: e.target.value })} style={inputStyle} />
              </Field>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={draft.selfExitAllowed}
                onChange={e => patchDraft({ selfExitAllowed: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              Самостоятельный выход
            </label>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr',
              gap: 8,
              marginBottom: 8,
            }}>
              {isAdmin ? (
                <>
                  <Field label="Ручная скидка %">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.manualDiscountPercent}
                      onChange={e => patchDraft({ manualDiscountPercent: Number(e.target.value || 0) })}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Ручная скидка сом">
                    <input
                      type="number"
                      min={0}
                      value={draft.manualDiscountAmount}
                      onChange={e => patchDraft({ manualDiscountAmount: Number(e.target.value || 0) })}
                      style={inputStyle}
                    />
                  </Field>
                </>
              ) : (
                <div style={{ background: '#F8F9FF', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 4 }}>Скидка</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {draft.basePrice > draft.finalPrice ? money(draft.basePrice - draft.finalPrice) : '—'}
                  </div>
                </div>
              )}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              borderTop: '1px solid var(--border)',
              paddingTop: 9,
              marginBottom: 10,
            }}>
              <Price label="Цена" value={money(draft.basePrice)} />
              <Price label="Скидка" value={draft.basePrice > draft.finalPrice ? money(draft.basePrice - draft.finalPrice) : '—'} />
              <Price label="Сумма" value={money(draft.finalPrice)} accent />
            </div>

            <button onClick={saveDraft} disabled={saving} style={{
              width: '100%',
              border: 'none',
              borderRadius: 8,
              background: saving ? '#C7D2FE' : 'var(--accent)',
              color: '#fff',
              padding: '9px 12px',
              fontSize: 13,
              fontWeight: 800,
              cursor: saving ? 'default' : 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
            }}>
              <Save size={15} /> {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

function toKidState(child: Child): KidState {
  return {
    id: String(child.id),
    childName: child.childName,
    cls: formatClassName(child.class),
    schoolId: child.schoolId,
    branchId: child.branchId,
    branchCode: child.branchCode,
    branchShort: child.branchShort,
    address: child.address ?? '',
    zone: child.zone,
    distanceKm: child.distanceKm == null ? '' : String(child.distanceKm),
    vehicleType: child.vehicleType,
    transferNumber: child.transferNumber ? String(child.transferNumber) : '',
    stopNumber: child.stopNumber ? String(child.stopNumber) : '',
    timeMorning: child.timeMorning ?? '',
    selfExitAllowed: child.selfExitAllowed,
    status: child.status ?? 'new',
    basePrice: Number(child.basePrice ?? child.finalPrice ?? 0),
    siblingDiscountPercent: Number(child.siblingDiscountPercent ?? 0),
    manualDiscountPercent: Number(child.manualDiscountPercent ?? 0),
    manualDiscountAmount: Number(child.manualDiscountAmount ?? 0),
    finalPrice: Number(child.finalPrice ?? 0),
  };
}

function normalizeBranchSchool(branchCode: string): string {
  if (branchCode === 'GEN #2' || branchCode === 'GEN2') return 'GENIUS';
  if (branchCode === 'GEN #4' || branchCode === 'GEN4') return 'GENIUS4';
  if (branchCode === 'EPS') return 'EPSILON';
  if (branchCode === 'LA') return 'LIGHT';
  if (branchCode === 'BKG') return 'BILIM';
  if (branchCode === 'KNG') return 'KINGS';
  if (branchCode === 'ERU') return 'ERUDIT';
  if (branchCode === 'TIS') return 'TENSAY';
  if (branchCode === 'EDI') return 'EDISON';
  if (branchCode.startsWith('ING')) return 'INDIGO';
  if (branchCode.startsWith('GEN')) return 'GENIUS';
  if (branchCode === 'AES_KAS') return 'AES';
  return branchCode;
}

function calcFinalPrice(kid: KidState): number {
  let price = kid.basePrice;
  if (kid.siblingDiscountPercent) {
    price = Math.round(price * (1 - kid.siblingDiscountPercent / 100));
  }
  if (kid.manualDiscountPercent) {
    price = Math.round(price * (1 - kid.manualDiscountPercent / 100));
  }
  if (kid.manualDiscountAmount) {
    price = Math.max(0, price - kid.manualDiscountAmount);
  }
  return price;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.35 }}>{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

function Price({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

function SmallTag({ children, tone }: { children: React.ReactNode; tone?: 'green' | 'blue' | 'yellow' | 'red' | 'gray' }) {
  const colors = {
    green: { bg: '#D1FAE5', color: '#065F46' },
    blue: { bg: '#DBEAFE', color: '#1E40AF' },
    yellow: { bg: '#FEF3C7', color: '#92400E' },
    red: { bg: '#FEE2E2', color: '#991B1B' },
    gray: { bg: '#F3F4F6', color: '#374151' },
  }[tone ?? 'blue'];
  return (
    <span style={{
      background: colors.bg,
      color: colors.color,
      borderRadius: 5,
      padding: '2px 6px',
      fontSize: 10,
      fontWeight: 800,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function TotalBar({ count, amount }: { count: number; amount: number }) {
  return (
    <div style={{
      background: 'var(--accent)',
      borderRadius: 8,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.76)' }}>Итого за семью / месяц</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.56)', marginTop: 1 }}>{count} детей</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{money(amount)}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 12,
  color: 'var(--text)',
  background: '#fff',
  boxSizing: 'border-box',
};

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 7,
  background: 'var(--accent)',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};
