import React, { useEffect, useState } from 'react';
import { X, User, Users, Truck, CreditCard } from 'lucide-react';
import { Family, Child, Payment } from '../../types';
import { getPriceByZone, getFamilyPrice, calcPenalty, money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import StatusBadge from '../../core/cards/StatusBadge';

// ─── helpers ─────────────────────────────────────────────────────────────────

const SCHOOL_NAME: Record<string, string> = {
  KINGS: 'Kings', LIGHT: 'Light Academy', BILIM: 'Bilim KG',
  AES: 'AES', KAS: 'KAS', EPSILON: 'Epsilon',
  GENIUS: 'Genius', GENIUS4: 'Genius 4', NOVA: 'Nova',
  INDIGO: 'Indigo', ERUDIT: 'Erudit', TENSAY: 'Tensay', EDISON: 'Edison',
};

const VT_LABEL: Record<string, string> = {
  microbus: 'Микроавтобус', minibus: 'Микроавтобус',
  minivan: 'Минивэн', sedan: 'Седан',
};

const ZONE_COLOR: Record<string, { bg: string; color: string }> = {
  A: { bg: '#E8F5E9', color: '#1B5E20' },
  B: { bg: '#EDE7F6', color: '#311B92' },
  C: { bg: '#E3F2FD', color: '#0D47A1' },
};

const PERIOD_LABEL: Record<string, string> = {
  deposit: 'Депозит',
  '9': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь',
  '1': 'Январь', '2': 'Февраль', '3': 'Март', '4': 'Апрель', '5': 'Май',
};

const PERIOD_ORDER = ['deposit','9','10','11','12','1','2','3','4','5'];

// ─── types ───────────────────────────────────────────────────────────────────

interface Props {
  family: Family;
  onClose: () => void;
}

type Tab = 'info' | 'children' | 'logistics' | 'finance';

// ─── component ───────────────────────────────────────────────────────────────

export default function FamilyDrawer({ family, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('info');
  const [children, setChildren] = useState<Child[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);

  useEffect(() => {
    loadChildren();
    loadPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  async function loadChildren() {
    setLoadingChildren(true);
    const { data } = await supabase
      .from('children')
      .select('*')
      .eq('family_id', family.id);
    if (data) {
      setChildren(data.map((r: any) => ({
        id: r.id,
        familyId: r.family_id,
        childName: r.child_name,
        class: r.class,
        selfExitAllowed: r.self_exit_allowed ?? false,
        routeSource: r.route_source,
        transferNumber: r.transfer_number,
        schoolCode: r.school_code,
        zone: Number(r.zone) === 1 ? 'A' : Number(r.zone) === 2 ? 'B' : 'C',
        vehicleType: (() => {
          const vt = r.vehicle_type ?? 'microbus';
          if (vt === 'minibus' || vt === 'bus' || vt === 'mini-bus') return 'microbus';
          return vt;
        })(),
      })));
    }
    setLoadingChildren(false);
  }

  async function loadPayments() {
    setLoadingPayments(true);
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('family_id', family.id);
    if (data) {
      setPayments(data.map((r: any) => ({
        id: r.id,
        familyId: r.family_id,
        schoolCode: r.school_code,
        periodKey: r.month === 0 ? 'deposit' : String(r.month) as any,
        month: r.month,
        year: r.year,
        amount: r.amount ?? 0,
        managerAmount: r.manager_amount ?? 0,
        managerDate: r.manager_date ?? '',
        hasReceipt: r.has_receipt ?? false,
        accountantStatus: r.accountant_status ?? 'Не оплачено',
        factAmount: r.fact_amount ?? 0,
        factDate: r.fact_date ?? '',
        isFrozen: r.is_frozen ?? false,
        comment: r.comment ?? '',
      })));
    }
    setLoadingPayments(false);
  }

  // ── header stats ──
  const totalDebt = payments
    .filter(p => p.accountantStatus === 'Не оплачено' || p.accountantStatus === 'Просрочено' || p.accountantStatus === 'Частично оплачено')
    .filter(p => p.periodKey !== 'deposit')
    .reduce((s, p) => s + (p.amount - p.factAmount), 0);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.18)',
          zIndex: 400,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 620,
        background: '#fff',
        zIndex: 401,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(49,46,129,0.13)',
        animation: 'slideIn 0.22s ease',
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background: 'var(--accent)',
          padding: '18px 22px 16px',
          flexShrink: 0,
        }}>
          {/* top row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                {family.parentName}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
                {family.phone}
                {family.phoneTelegram && (
                  <span style={{ marginLeft: 10, opacity: 0.8 }}>TG: {family.phoneTelegram}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none', borderRadius: 8,
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff', flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* stat chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <HeaderChip label="Школа" value={SCHOOL_NAME[family.schoolCode] ?? family.schoolCode} />
            <HeaderChip
              label="Зона"
              value={`Зона ${family.zone}`}
              chipStyle={{ background: ZONE_COLOR[family.zone]?.bg, color: ZONE_COLOR[family.zone]?.color, fontWeight: 700 }}
            />
            {totalDebt > 0 ? (
              <HeaderChip label="Долг" value={money(totalDebt)} chipStyle={{ background: '#FFEBEE', color: '#C62828' }} />
            ) : (
              <HeaderChip label="Баланс" value="✓ Нет долга" chipStyle={{ background: '#E8F5E9', color: '#2E7D32' }} />
            )}
            <HeaderChip label="Статус" value={
              family.status === 'active' ? 'Активный' :
              family.status === 'new' ? 'Новый' :
              family.status === 'inactive' ? 'Неактивный' : 'Отказ'
            } />
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{
          display: 'flex',
          borderBottom: '2px solid var(--border)',
          background: '#fff',
          flexShrink: 0,
        }}>
          {([
            { key: 'info',      label: 'Основная информация', icon: <User size={13} /> },
            { key: 'children',  label: 'Дети и цена',         icon: <Users size={13} /> },
            { key: 'logistics', label: 'Логистика',           icon: <Truck size={13} /> },
            { key: 'finance',   label: 'Финансы',             icon: <CreditCard size={13} /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: '11px 4px 10px',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2,
                background: 'none',
                color: tab === t.key ? 'var(--accent)' : 'var(--text-2)',
                fontSize: 12,
                fontWeight: tab === t.key ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {tab === 'info' && <TabInfo family={family} />}
          {tab === 'children' && <TabChildren children={children} loading={loadingChildren} />}
          {tab === 'logistics' && <TabLogistics family={family} children={children} loading={loadingChildren} />}
          {tab === 'finance' && <TabFinance payments={payments} loading={loadingPayments} family={family} />}

        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ─── HeaderChip ──────────────────────────────────────────────────────────────

function HeaderChip({
  label, value, chipStyle,
}: {
  label: string;
  value: string;
  chipStyle?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.13)',
      borderRadius: 8, padding: '5px 11px',
      ...chipStyle,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 600,
        color: chipStyle ? (chipStyle.color as string) : 'rgba(255,255,255,0.65)',
        textTransform: 'uppercase', letterSpacing: 0.5,
        display: 'block', marginBottom: 1,
      }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: chipStyle ? (chipStyle.color as string) : '#fff',
      }}>{value}</span>
    </div>
  );
}

// ─── Section helpers ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
        textTransform: 'uppercase', letterSpacing: 0.8,
        marginBottom: 12,
        paddingBottom: 7,
        borderBottom: '1px solid var(--border)',
      }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', marginBottom: 9, gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

// ─── TAB: Основная информация ────────────────────────────────────────────────

function TabInfo({ family }: { family: Family }) {
  return (
    <div>
      <Section title="Родитель">
        <Field label="ФИО" value={family.parentName} />
        <Field label="Телефон" value={family.phone} />
        <Field label="Telegram" value={family.phoneTelegram} />
        <Field label="Второй телефон" value={family.secondPhone} />
      </Section>

      {(family.contactName || family.contactPhone) && (
        <Section title="Дополнительный контакт">
          <Field label="Имя контакта" value={family.contactName} />
          <Field label="Телефон контакта" value={family.contactPhone} />
        </Section>
      )}

      <Section title="Адрес и маршрут">
        <Field label="Полный адрес" value={family.fullAddress} />
        <Field label="Расстояние" value={family.distanceKm ? `${family.distanceKm} км` : undefined} />
        <Field label="Зона" value={`Зона ${family.zone} (${
          family.zone === 'A' ? 'до 3.3 км' :
          family.zone === 'B' ? '3.3 – 6.3 км' : 'свыше 6.3 км'
        })`} />
        <Field label="Тип транспорта" value={VT_LABEL[family.vehicleType] ?? family.vehicleType} />
        <Field label="Номер трансфера" value={family.transferNumber ? `Трансфер №${family.transferNumber}` : undefined} />
      </Section>

      <Section title="Прочее">
        <Field label="Школа" value={SCHOOL_NAME[family.schoolCode] ?? family.schoolCode} />
        <Field label="Дата заявки" value={family.createdAt ? new Date(family.createdAt).toLocaleDateString('ru-RU') : undefined} />
        {family.comment && (
          <div style={{
            marginTop: 4,
            background: 'var(--bg)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.5,
            fontWeight: 500,
          }}>
            {family.comment}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── TAB: Дети и цена ────────────────────────────────────────────────────────

function TabChildren({ children, loading }: { children: Child[]; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!children.length) return <Empty text="Детей нет" />;

  return (
    <div>
      <Section title={`Дети (${children.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {children.map((kid, i) => {
            const base = getPriceByZone(kid.schoolCode, kid.zone, kid.vehicleType);
            const discount = i > 0;
            const price = discount ? Math.round(base * 0.95) : base;

            return (
              <div key={kid.id} style={{
                background: 'var(--bg)',
                borderRadius: 10,
                padding: '14px 16px',
                border: '1px solid var(--border)',
              }}>
                {/* name row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--accent-l)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: 'var(--accent)',
                    }}>{i + 1}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{kid.childName}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>{kid.class} класс</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{money(price)}</div>
                    {discount && (
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#2E7D32' }}>скидка 5%</div>
                    )}
                  </div>
                </div>

                {/* detail row */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Tag label={VT_LABEL[kid.vehicleType] ?? kid.vehicleType} />
                  <Tag label={`Зона ${kid.zone}`} color={ZONE_COLOR[kid.zone]} />
                  <Tag label={SCHOOL_NAME[kid.schoolCode] ?? kid.schoolCode} />
                  {kid.transferNumber && <Tag label={`Трансфер №${kid.transferNumber}`} />}
                  {kid.selfExitAllowed && <Tag label="Самовыход ✓" color={{ bg: '#E8F5E9', color: '#2E7D32' }} />}
                </div>

                {/* price breakdown */}
                <div style={{
                  marginTop: 10, paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                  display: 'flex', gap: 16,
                }}>
                  <PriceCell label="Базовая цена" value={money(base)} />
                  {discount && <PriceCell label="Скидка" value="−5%" highlight />}
                  <PriceCell label="Итого" value={money(price)} bold />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Family total */}
      <div style={{
        background: 'var(--accent)',
        borderRadius: 10,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Итого за семью / месяц</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            {children.length} {children.length === 1 ? 'ребёнок' : 'детей'}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
          {money(getFamilyPrice(children.map(k => ({
            schoolCode: k.schoolCode, zone: k.zone, vehicleType: k.vehicleType,
          }))))}
        </div>
      </div>
    </div>
  );
}

// ─── TAB: Логистика ──────────────────────────────────────────────────────────

function TabLogistics({ family, children, loading }: { family: Family; children: Child[]; loading: boolean }) {
  if (loading) return <Spinner />;

  return (
    <div>
      <Section title="Маршрут семьи">
        <Field label="Тип транспорта" value={VT_LABEL[family.vehicleType] ?? family.vehicleType} />
        <Field label="Номер трансфера" value={family.transferNumber ? `№${family.transferNumber}` : undefined} />
        <Field label="Номер остановки" value={family.stopNumber ? `Остановка ${family.stopNumber}` : undefined} />
        <Field label="Время утро" value={family.timeMorning} />
        <Field label="Время вечер" value={family.timeEvening} />
        <Field label="Адрес" value={family.fullAddress} />
      </Section>

      {children.length > 0 && (
        <Section title="Дети в маршруте">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['ФИО', 'Тип ТС', 'Трансфер', 'Остановка', 'Время утро'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', fontSize: 11, fontWeight: 700,
                    color: 'var(--text-2)', padding: '8px 10px',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((kid, i) => (
                <tr key={kid.id} style={{
                  background: i % 2 === 0 ? '#fff' : 'var(--bg)',
                  borderTop: '1px solid var(--border)',
                }}>
                  <td style={{ padding: '10px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    <div>{kid.childName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{kid.class} кл.</div>
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                    {VT_LABEL[kid.vehicleType] ?? kid.vehicleType}
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                    {kid.transferNumber ? `№${kid.transferNumber}` : '—'}
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                    {family.stopNumber ? `${family.stopNumber}` : '—'}
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                    {family.timeMorning ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

// ─── TAB: Финансы ────────────────────────────────────────────────────────────

function TabFinance({ payments, loading, family }: { payments: Payment[]; loading: boolean; family: Family }) {
  if (loading) return <Spinner />;

  const sorted = [...payments].sort((a, b) =>
    PERIOD_ORDER.indexOf(a.periodKey) - PERIOD_ORDER.indexOf(b.periodKey)
  );

  const deposit = sorted.find(p => p.periodKey === 'deposit');
  const monthly = sorted.filter(p => p.periodKey !== 'deposit');

  const totalCharged = monthly.reduce((s, p) => s + p.amount, 0);
  const totalPaid = monthly.reduce((s, p) => s + p.factAmount, 0);
  const totalDebt = totalCharged - totalPaid;

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <SummaryCard label="Начислено" value={money(totalCharged)} />
        <SummaryCard label="Оплачено" value={money(totalPaid)} color="#2E7D32" />
        {totalDebt > 0
          ? <SummaryCard label="Долг" value={money(totalDebt)} color="#C62828" bg="#FFEBEE" />
          : <SummaryCard label="Баланс" value="✓ Чисто" color="#2E7D32" bg="#E8F5E9" />
        }
      </div>

      {/* Deposit */}
      {deposit && (
        <Section title="Депозит">
          <PaymentRow payment={deposit} isDeposit />
        </Section>
      )}

      {/* Monthly */}
      <Section title={`Периоды (${monthly.length})`}>
        {monthly.length === 0 && <Empty text="Начислений нет" />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {monthly.map(p => <PaymentRow key={p.id} payment={p} />)}
        </div>
      </Section>
    </div>
  );
}

function PaymentRow({ payment: p, isDeposit }: { payment: Payment; isDeposit?: boolean }) {
  const today = new Date();
  const dueDate = p.month > 0 ? new Date(p.year, p.month - 1, 1) : null;
  const penalty = (!isDeposit && dueDate && (
    p.accountantStatus === 'Не оплачено' ||
    p.accountantStatus === 'Просрочено' ||
    p.accountantStatus === 'Частично оплачено'
  ) && !p.isFrozen)
    ? calcPenalty(p.amount - p.factAmount, dueDate, today)
    : 0;

  const paid = p.accountantStatus === 'Оплачено';
  const partial = p.accountantStatus === 'Частично оплачено';
  const overdue = p.accountantStatus === 'Просрочено';

  return (
    <div style={{
      border: `1px solid ${overdue ? '#FFCDD2' : 'var(--border)'}`,
      borderRadius: 8,
      padding: '12px 14px',
      background: paid ? '#FAFFFE' : overdue ? '#FFF8F8' : '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
            {PERIOD_LABEL[p.periodKey] ?? p.periodKey}
          </div>
          {!isDeposit && p.year && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{p.year}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: paid ? '#2E7D32' : 'var(--text)' }}>
              {money(p.amount)}
            </div>
            {partial && p.factAmount > 0 && (
              <div style={{ fontSize: 11, color: '#1565C0' }}>оплачено {money(p.factAmount)}</div>
            )}
            {penalty > 0 && (
              <div style={{ fontSize: 11, color: '#C62828', fontWeight: 600 }}>+{money(penalty)} пеня</div>
            )}
          </div>
          <StatusBadge status={p.accountantStatus} size="sm" />
        </div>
      </div>
      {p.managerAmount > 0 && p.accountantStatus !== 'Оплачено' && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: '1px dashed var(--border)',
          fontSize: 11, color: 'var(--text-2)', fontWeight: 500,
        }}>
          Менеджер внёс: <strong>{money(p.managerAmount)}</strong>
          {p.managerDate && ` · ${new Date(p.managerDate).toLocaleDateString('ru-RU')}`}
          {p.hasReceipt && ' · 📎 чек'}
        </div>
      )}
      {p.comment && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic' }}>
          {p.comment}
        </div>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Tag({ label, color }: { label: string; color?: { bg: string; color: string } }) {
  return (
    <span style={{
      background: color?.bg ?? '#EEF2FF',
      color: color?.color ?? 'var(--accent)',
      borderRadius: 5, padding: '3px 9px',
      fontSize: 11, fontWeight: 600,
    }}>{label}</span>
  );
}

function PriceCell({ label, value, highlight, bold }: {
  label: string; value: string; highlight?: boolean; bold?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: highlight ? '#2E7D32' : 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bg }: {
  label: string; value: string; color?: string; bg?: string;
}) {
  return (
    <div style={{
      flex: 1, background: bg ?? 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-2)', fontSize: 13 }}>
      Загрузка...
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-2)', fontSize: 13 }}>
      {text}
    </div>
  );
}
