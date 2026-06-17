import React, { useEffect, useMemo, useState } from 'react';
import { Child, ChildStatus, Family, SchoolCode, VehicleType, Zone } from '../../types';
import { getPriceByZone, money } from '../../utils/pricing';
import { fetchV2Branches, updateV2Child, updateV2ChildRoute, V2BranchOption } from '../../services/crmV2Service';
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
  compactColumns?: boolean;
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

export default function TabChildren({ children, loading, isAdmin, compactColumns = false, onReload }: Props) {
  const [kids, setKids] = useState<KidState[]>([]);
  const [branches, setBranches] = useState<V2BranchOption[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setKids(children.map(toKidState));
  }, [children]);

  useEffect(() => {
    fetchV2Branches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const familyTotal = useMemo(() => kids.reduce((sum, kid) => sum + kid.finalPrice, 0), [kids]);

  if (loading) return <Spinner />;

  function buildKid(current: KidState, patch: Partial<KidState>) {
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
        const schoolCode = branch?.code
          ? normalizeBranchSchool(branch.code) as SchoolCode
          : next.branchCode
            ? normalizeBranchSchool(next.branchCode) as SchoolCode
            : 'KINGS';
        next.basePrice = getPriceByZone(schoolCode, next.zone, next.vehicleType);
      }
      next.finalPrice = calcFinalPrice(next);
    }
    return next;
  }

  function patchKid(id: string, patch: Partial<KidState>) {
    setKids(current => current.map(kid => kid.id === id ? buildKid(kid, patch) : kid));
  }

  async function commitKid(kid: KidState, patch: Partial<KidState> = {}) {
    const next = buildKid(kid, patch);
    setKids(current => current.map(item => item.id === kid.id ? next : item));
    setSavingId(kid.id);
    try {
      await saveKid(next);
      setMsg('Сохранено');
      setTimeout(() => setMsg(''), 1600);
    } catch (error: any) {
      setMsg(`Ошибка: ${error.message}`);
      setTimeout(() => setMsg(''), 6000);
    }
    setSavingId(null);
  }

  async function saveKid(kid: KidState) {
    const source = children.find(child => String(child.id) === kid.id);
    await updateV2Child(kid.id, {
      child_name: kid.childName,
      class_name: formatClassName(kid.cls),
      school_id: kid.schoolId ?? null,
      branch_id: kid.branchId ?? null,
      address: kid.address || null,
      zone: kid.zone,
      distance_km: kid.distanceKm === '' ? null : Number(kid.distanceKm),
      vehicle_type: kid.vehicleType,
      base_price: kid.basePrice,
      self_exit_allowed: kid.selfExitAllowed,
      status: kid.status,
      manual_discount_percent: isAdmin ? kid.manualDiscountPercent : undefined,
      manual_discount_amount: isAdmin ? kid.manualDiscountAmount : undefined,
      final_price: kid.finalPrice,
    });
    if (source) {
      await updateV2ChildRoute({
        child: {
          ...source,
          schoolId: kid.schoolId,
          branchId: kid.branchId,
        },
        vehicleType: kid.vehicleType,
        transferNumber: kid.transferNumber ? Number(kid.transferNumber) : undefined,
        stopNumber: kid.stopNumber ? Number(kid.stopNumber) : undefined,
        timeMorning: kid.timeMorning,
      });
    }
    onReload?.();
  }

  return (
    <div>
      {msg && (
        <div style={{
          background: msg.includes('Ошибка') ? '#FEE2E2' : '#F7F9FB',
          color: msg.includes('Ошибка') ? '#991B1B' : '#374151',
          borderRadius: 8,
          padding: '7px 12px',
          marginBottom: 8,
          fontSize: 12,
          fontWeight: 750,
        }}>
          {msg}
        </div>
      )}

      <TotalBar count={kids.length} amount={familyTotal} />

      <Section title={`Дети (${kids.length})`}>
        <div style={kidsGridStyle(kids.length, compactColumns)}>
          {kids.length === 0 && (
            <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--text-2)', fontSize: 12 }}>
              Детей нет
            </div>
          )}

          {kids.map((kid, index) => {
            const discountAmount = Math.max(0, kid.basePrice - kid.finalPrice);
            const saving = savingId === kid.id;
            return (
              <article key={kid.id} style={kidCardStyle}>
                <div style={kidHeaderStyle}>
                  <span style={kidIndexStyle}>{index + 1}</span>
                  <input
                    className="family-card-control"
                    value={kid.childName}
                    onChange={e => patchKid(kid.id, { childName: e.target.value })}
                    onBlur={e => commitKid(kid, { childName: e.currentTarget.value })}
                    placeholder="Имя ребёнка"
                    style={{ ...notionControlStyle, fontSize: 13, fontWeight: 850 }}
                  />
                  <span style={saveStateStyle}>{saving ? 'сохранение...' : CHILD_STATUS_LABEL[kid.status]}</span>
                </div>

                <div style={fieldsGridStyle(compactColumns)}>
                  <Field label="Класс" tone="soft">
                    <input
                      className="family-card-control"
                      value={kid.cls}
                      onChange={e => patchKid(kid.id, { cls: formatClassName(e.target.value) })}
                      onBlur={e => commitKid(kid, { cls: formatClassName(e.currentTarget.value) })}
                      style={notionControlStyle}
                    />
                  </Field>
                  <Field label="Статус" tone="soft">
                    <select
                      className="family-card-control"
                      value={kid.status}
                      onChange={e => commitKid(kid, { status: e.currentTarget.value as ChildStatus })}
                      style={notionSelectStyle}
                    >
                      {CHILD_STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Школа" tone="soft">
                    <select
                      className="family-card-control"
                      value={kid.branchId ?? ''}
                      onChange={e => commitKid(kid, { branchId: e.currentTarget.value })}
                      style={notionSelectStyle}
                    >
                      <option value="">—</option>
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.id}>{branch.shortName}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Зона" tone="soft">
                    <select
                      className="family-card-control"
                      value={kid.zone}
                      onChange={e => commitKid(kid, { zone: e.currentTarget.value as Zone })}
                      style={notionSelectStyle}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  </Field>
                  <Field label="Км" tone="clear">
                    <input
                      className="family-card-control"
                      type="number"
                      step="0.1"
                      value={kid.distanceKm}
                      onChange={e => patchKid(kid.id, { distanceKm: e.target.value })}
                      onBlur={e => commitKid(kid, { distanceKm: e.currentTarget.value })}
                      style={notionControlStyle}
                    />
                  </Field>
                  <Field label="Адрес" tone="clear">
                    <input
                      className="family-card-control"
                      value={kid.address}
                      onChange={e => patchKid(kid.id, { address: e.target.value })}
                      onBlur={e => commitKid(kid, { address: e.currentTarget.value })}
                      placeholder="—"
                      style={notionControlStyle}
                    />
                  </Field>
                  <Field label="Тип ТС" tone="clear">
                    <select
                      className="family-card-control"
                      value={kid.vehicleType}
                      onChange={e => commitKid(kid, { vehicleType: e.currentTarget.value as VehicleType })}
                      style={notionSelectStyle}
                    >
                      <option value="microbus">Микроавтобус</option>
                      <option value="minivan">Минивэн</option>
                      <option value="sedan">Седан</option>
                    </select>
                  </Field>
                  <Field label="Трансфер" tone="clear">
                    <select
                      className="family-card-control"
                      value={kid.transferNumber}
                      onChange={e => commitKid(kid, { transferNumber: e.currentTarget.value })}
                      style={notionSelectStyle}
                    >
                      <option value="">—</option>
                      {TRANSFER_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="Остановка" tone="clear">
                    <select
                      className="family-card-control"
                      value={kid.stopNumber}
                      onChange={e => commitKid(kid, { stopNumber: e.currentTarget.value })}
                      style={notionSelectStyle}
                    >
                      <option value="">—</option>
                      {STOP_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="Утро" tone="clear">
                    <input
                      className="family-card-control"
                      type="time"
                      value={kid.timeMorning}
                      onChange={e => patchKid(kid.id, { timeMorning: e.target.value })}
                      onBlur={e => commitKid(kid, { timeMorning: e.currentTarget.value })}
                      style={notionControlStyle}
                    />
                  </Field>
                  <Field label="Самовыход" tone="clear">
                    <label style={checkboxLineStyle}>
                      <input
                        type="checkbox"
                        checked={kid.selfExitAllowed}
                        onChange={e => commitKid(kid, { selfExitAllowed: e.currentTarget.checked })}
                      />
                      {kid.selfExitAllowed ? 'Да' : 'Нет'}
                    </label>
                  </Field>
                  {isAdmin && (
                    <>
                      <Field label="Скидка %" tone="soft">
                          <input
                            className="family-card-control"
                            type="number"
                          min={0}
                          max={100}
                          value={kid.manualDiscountPercent}
                          onChange={e => patchKid(kid.id, { manualDiscountPercent: Number(e.target.value || 0) })}
                          onBlur={e => commitKid(kid, { manualDiscountPercent: Number(e.currentTarget.value || 0) })}
                          style={notionControlStyle}
                        />
                      </Field>
                      <Field label="Скидка сом" tone="soft">
                          <input
                            className="family-card-control"
                            type="number"
                          min={0}
                          value={kid.manualDiscountAmount}
                          onChange={e => patchKid(kid.id, { manualDiscountAmount: Number(e.target.value || 0) })}
                          onBlur={e => commitKid(kid, { manualDiscountAmount: Number(e.currentTarget.value || 0) })}
                          style={notionControlStyle}
                        />
                      </Field>
                    </>
                  )}
                </div>

                <div style={priceLineStyle}>
                  <Price label="Цена" value={money(kid.basePrice)} />
                  <Price label="Скидка" value={discountAmount > 0 ? money(discountAmount) : '—'} />
                  <Price label="Сумма" value={money(kid.finalPrice)} accent />
                </div>
              </article>
            );
          })}
        </div>
      </Section>

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

function Field({ label, children, tone = 'soft' }: { label: string; children: React.ReactNode; tone?: 'soft' | 'clear' }) {
  return (
    <label style={fieldStyle(tone)}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Price({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={priceLabelStyle}>{label}</div>
      <div style={{ ...priceValueStyle, color: accent ? '#111827' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

function TotalBar({ count, amount }: { count: number; amount: number }) {
  return (
    <div style={totalBarStyle}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#374151' }}>Итого за семью / месяц</div>
        <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{count} детей</div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>{money(amount)}</div>
    </div>
  );
}

const kidCardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E8EEF1',
  borderRadius: 10,
  padding: '8px 10px',
};

const kidHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr) auto',
  gap: 8,
  alignItems: 'center',
  paddingBottom: 6,
  borderBottom: '1px solid #F0F3F5',
};

const kidIndexStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: '#FFEDD5',
  color: '#F59E0B',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 900,
};

const saveStateStyle: React.CSSProperties = {
  borderRadius: 999,
  background: '#F7F9FB',
  color: '#6B7280',
  padding: '3px 7px',
  fontSize: 10,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

function fieldsGridStyle(compactColumns: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: compactColumns ? '1fr' : 'repeat(2, minmax(220px, 1fr))',
    gap: compactColumns ? '0 10px' : '0 18px',
    paddingTop: 6,
  };
}

function fieldStyle(tone: 'soft' | 'clear'): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '112px minmax(0, 1fr)',
    gap: 10,
    alignItems: 'center',
    minHeight: 28,
    borderRadius: 7,
    padding: '0 7px',
    background: tone === 'soft' ? '#F8FAFC' : '#FFF8F1',
  };
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 750,
  color: '#8A94A3',
};

const notionControlStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 27,
  border: '1px solid transparent',
  borderRadius: 7,
  background: 'transparent',
  color: 'var(--text)',
  padding: '0 8px',
  fontSize: 12,
  fontWeight: 650,
  outline: 'none',
};

const notionSelectStyle: React.CSSProperties = {
  ...notionControlStyle,
  background: 'transparent',
  color: 'var(--text)',
};

const checkboxLineStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  height: 27,
  fontSize: 12,
  fontWeight: 650,
  color: 'var(--text)',
};

const priceLineStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
  borderTop: '1px solid #F0F3F5',
  marginTop: 6,
  paddingTop: 6,
};

const priceLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#8A94A3',
  textTransform: 'uppercase',
};

const priceValueStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 13,
  fontWeight: 850,
};

const totalBarStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E8EEF1',
  borderRadius: 10,
  padding: '7px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

function kidsGridStyle(count: number, compactColumns: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: compactColumns && count > 1 ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
    gap: 8,
  };
}
