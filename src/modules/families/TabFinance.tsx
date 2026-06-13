import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Family, Payment, Child } from '../../types';
import { calcPenalty, getFamilyPrice, money } from '../../utils/pricing';
import StatusBadge from '../../core/cards/StatusBadge';
import { PERIOD_LABEL, PERIOD_ORDER, ALL_PERIODS } from './constants';
import { Section, Spinner, Empty } from './DrawerUI';

type PayStatus = Payment['accountantStatus'];

const STATUS_CHAIN: PayStatus[] = [
  'Не оплачено', 'Просрочено', 'На проверке', 'На проверке (чек)', 'Частично оплачено', 'Оплачено',
];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Оплачено':           { bg: '#D1FAE5', color: '#065F46' },
  'Частично оплачено':  { bg: '#FEF3C7', color: '#92400E' },
  'На проверке':        { bg: '#DBEAFE', color: '#1E40AF' },
  'На проверке (чек)':  { bg: '#E0E7FF', color: '#3730A3' },
  'Просрочено':         { bg: '#FEE2E2', color: '#991B1B' },
  'Не оплачено':        { bg: '#F3F4F6', color: '#374151' },
};

// ─── PayRow ─────────────────────────────────────────────────────────────────

function PayRow({ payment: p, isDeposit, isAdmin, isCashier, onSave, onDelete }: {
  payment: Payment; isDeposit?: boolean;
  isAdmin: boolean; isCashier: boolean;
  onSave: (u: Partial<Payment>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [managerAmt, setManagerAmt] = useState(String(p.managerAmount || ''));
  const [factAmt, setFactAmt]       = useState(String(p.factAmount || ''));
  const [comment, setComment]       = useState(p.comment ?? '');
  const [editAmount, setEditAmount] = useState(String(p.amount));
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState('');

  const dueDate = p.month > 0 ? new Date(p.year, p.month - 1, 1) : null;
  const needsPenalty = !isDeposit && dueDate && !p.isFrozen &&
    ['Не оплачено', 'Просрочено', 'Частично оплачено'].includes(p.accountantStatus);
  const penalty = needsPenalty ? calcPenalty(p.amount - p.factAmount, dueDate!, new Date()) : 0;
  const paid    = p.accountantStatus === 'Оплачено';
  const inReview = p.accountantStatus === 'На проверке' || p.accountantStatus === 'На проверке (чек)';
  const sc = STATUS_COLORS[p.accountantStatus] ?? STATUS_COLORS['Не оплачено'];
  const debt = Math.max(0, p.amount - p.factAmount);

  async function save(updates: Partial<Payment>) {
    setSaving(true);
    const ok = await onSave(updates);
    setSaving(false);
    if (ok) { setMsg('✓'); setTimeout(() => setMsg(''), 1500); }
  }

  async function managerSubmit() {
    const amt = Number(managerAmt);
    if (!amt) return;
    await save({ managerAmount: amt, managerDate: new Date().toISOString().slice(0, 10), accountantStatus: 'На проверке', isFrozen: true });
    setExpanded(false);
  }

  async function cashierConfirm() {
    const amt = Number(factAmt) || p.managerAmount;
    await save({ factAmount: amt, factDate: new Date().toISOString().slice(0, 10), accountantStatus: amt < p.amount ? 'Частично оплачено' : 'Оплачено', isFrozen: false, comment });
    setExpanded(false);
  }

  async function cashierReject() {
    await save({ accountantStatus: 'Не оплачено', isFrozen: false, managerAmount: 0, managerDate: '' });
    setExpanded(false);
  }

  return (
    <div style={{
      border: `1px solid ${sc.bg}`,
      borderLeft: `3px solid ${sc.color}`,
      borderRadius: 10, background: '#fff',
      overflow: 'hidden', marginBottom: 6,
    }}>
      {/* Main row */}
      <div
        style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', gap: 10 }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{PERIOD_LABEL[p.periodKey] ?? p.periodKey}</div>
          {!isDeposit && p.year && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{p.year}</div>}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: paid ? '#065F46' : 'var(--text)' }}>{money(p.amount)}</div>
          {p.factAmount > 0 && p.factAmount < p.amount && (
            <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>оплач. {money(p.factAmount)}</div>
          )}
          {penalty > 0 && (
            <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 600 }}>+{money(penalty)} пеня</div>
          )}
        </div>

        {msg && <span style={{ fontSize: 12, color: '#065F46', fontWeight: 700 }}>{msg}</span>}

        <div style={{
          background: sc.bg, color: sc.color,
          borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          {p.accountantStatus}
        </div>

        {saving
          ? <div style={{ width: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-2)' }}>...</div>
          : expanded
            ? <ChevronUp size={14} color="var(--text-2)" />
            : <ChevronDown size={14} color="var(--text-2)" />
        }
      </div>

      {/* Manager info strip */}
      {p.managerAmount > 0 && !paid && (
        <div style={{ padding: '0 14px 10px', fontSize: 11, color: 'var(--text-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ background: '#EEF2FF', borderRadius: 4, padding: '2px 7px', color: 'var(--accent)', fontWeight: 600 }}>
            Менеджер: {money(p.managerAmount)}
          </span>
          {p.managerDate && <span>{new Date(p.managerDate).toLocaleDateString('ru-RU')}</span>}
          {p.hasReceipt && <span>📎 чек</span>}
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${sc.bg}`, padding: 16, background: '#FAFBFF' }}>

          {/* Admin: edit amount */}
          {isAdmin && !paid && (
            <div style={{ marginBottom: 14 }}>
              <Label>Изменить начисление (Админ)</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                  style={inputStyle} />
                <ActionBtn color="var(--accent)" onClick={() => save({ amount: Number(editAmount) })}>
                  Изменить
                </ActionBtn>
              </div>
            </div>
          )}

          {/* Manager: внести оплату */}
          {!isCashier && !paid && !inReview && (
            <div style={{ marginBottom: 14 }}>
              <Label>Внести оплату</Label>
              <input type="number" value={managerAmt} onChange={e => setManagerAmt(e.target.value)}
                placeholder={`Начислено: ${money(p.amount)}${debt < p.amount ? `, остаток: ${money(debt)}` : ''}`}
                style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий"
                style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
              <ActionBtn color="var(--accent)" onClick={managerSubmit} full>
                Отправить на проверку →
              </ActionBtn>
            </div>
          )}

          {/* Cashier: подтвердить/отклонить */}
          {(isCashier || isAdmin) && inReview && (
            <div style={{ marginBottom: 14 }}>
              <Label>Подтверждение кассира · менеджер внёс {money(p.managerAmount)}</Label>
              <input type="number" value={factAmt || String(p.managerAmount)} onChange={e => setFactAmt(e.target.value)}
                placeholder="Фактическая сумма"
                style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий"
                style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionBtn color="#065F46" bg="#D1FAE5" onClick={cashierConfirm} full>✓ Подтвердить</ActionBtn>
                <ActionBtn color="#991B1B" bg="#FEE2E2" onClick={cashierReject} full>✗ Отклонить</ActionBtn>
              </div>
            </div>
          )}

          {/* Admin: статусы */}
          {isAdmin && (
            <div style={{ marginBottom: 10 }}>
              <Label>Установить статус</Label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {STATUS_CHAIN.map(s => {
                  const c = STATUS_COLORS[s];
                  const active = p.accountantStatus === s;
                  return (
                    <button key={s} onClick={() => save({ accountantStatus: s, isFrozen: s.includes('проверке') })}
                      style={{ padding: '4px 10px', border: `1px solid ${active ? c.color : 'transparent'}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: active ? c.bg : '#F3F4F6', color: active ? c.color : 'var(--text-2)' }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Admin: удалить */}
          {isAdmin && (
            <button onClick={onDelete} style={{ marginTop: 8, width: '100%', padding: '8px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Trash2 size={13} /> Удалить запись
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TabFinance ──────────────────────────────────────────────────────────────

interface Props {
  payments: Payment[];
  loading: boolean;
  family: Family;
  children: Child[];
  editMode: boolean;
  isAdmin: boolean;
  isCashier: boolean;
  onSavePayment: (p: Payment, updates: Partial<Payment>) => Promise<boolean>;
  onDeletePayment: (p: Payment) => void;
  onAddPayment: (periodKey: string, month: number, year: number, amount: number) => void;
}

export default function TabFinance({ payments, loading, family, children, editMode, isAdmin, isCashier, onSavePayment, onDeletePayment, onAddPayment }: Props) {
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriodKey, setNewPeriodKey] = useState('9');
  const [newAmount, setNewAmount]       = useState('');

  if (loading) return <Spinner />;

  // Правильная цена семьи — считается от детей
  const correctFamilyPrice = children.length > 0
    ? getFamilyPrice(children.map(c => ({ schoolCode: c.schoolCode, zone: c.zone, vehicleType: c.vehicleType })))
    : family.monthlyPrice;

  const sorted  = [...payments].sort((a, b) => PERIOD_ORDER.indexOf(a.periodKey) - PERIOD_ORDER.indexOf(b.periodKey));
  const deposit = sorted.find(p => p.periodKey === 'deposit');
  const monthly = sorted.filter(p => p.periodKey !== 'deposit');

  const totalCharged = monthly.reduce((s, p) => s + p.amount, 0);
  const totalPaid    = monthly.reduce((s, p) => s + p.factAmount, 0);
  const totalDebt    = Math.max(0, totalCharged - totalPaid);
  const pendingCount = monthly.filter(p => p.accountantStatus === 'На проверке' || p.accountantStatus === 'На проверке (чек)').length;

  const existingKeys   = new Set<string>(payments.map(p => p.periodKey));
  const availablePeriods = ALL_PERIODS.filter(p => !existingKeys.has(p.key));

  function handleAdd() {
    const period = ALL_PERIODS.find(p => p.key === newPeriodKey);
    if (!period) return;
    // Используем правильную цену семьи
    const amount = Number(newAmount) || correctFamilyPrice;
    onAddPayment(period.key, period.month, period.year, amount);
    setAddingPeriod(false);
    setNewAmount('');
  }

  return (
    <div>
      {/* ─── Сводка ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <SummaryTile label="Начислено" value={money(totalCharged)} sub={`${monthly.length} периодов`} />
        <SummaryTile label="Оплачено" value={money(totalPaid)} color="#065F46" bg="#D1FAE5" />
        {totalDebt > 0
          ? <SummaryTile label="Долг" value={money(totalDebt)} color="#991B1B" bg="#FEE2E2" />
          : <SummaryTile label="Баланс" value="✓ Чисто" color="#065F46" bg="#D1FAE5" />
        }
      </div>

      {/* Цена семьи */}
      <div style={{ background: 'var(--accent)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Ежемесячное начисление
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            {children.length} {children.length === 1 ? 'ребёнок' : 'детей'} · по тарифу
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{money(correctFamilyPrice)}</div>
      </div>

      {pendingCount > 0 && (
        <div style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          ⏳ {pendingCount} платёж{pendingCount > 1 ? 'а' : ''} ожидают подтверждения кассира
        </div>
      )}

      {/* ─── Депозит ─── */}
      {deposit && (
        <Section title="Депозит">
          <PayRow payment={deposit} isDeposit isAdmin={isAdmin} isCashier={isCashier}
            onSave={u => onSavePayment(deposit, u)} onDelete={() => onDeletePayment(deposit)} />
        </Section>
      )}

      {/* ─── Периоды ─── */}
      <Section
        title={`Начисления (${monthly.length})`}
        action={
          <button onClick={() => setAddingPeriod(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 12px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
            <Plus size={11} /> Добавить
          </button>
        }
      >
        {addingPeriod && (
          <div style={{ background: '#EEF2FF', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>Новое начисление</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4, fontWeight: 600 }}>Период</div>
                <select value={newPeriodKey} onChange={e => setNewPeriodKey(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, color: 'var(--text)', background: '#fff' }}>
                  {availablePeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4, fontWeight: 600 }}>
                  Сумма (авто: {money(correctFamilyPrice)})
                </div>
                <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                  placeholder={String(correctFamilyPrice)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, color: 'var(--text)', background: '#fff', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionBtn color="var(--accent)" onClick={handleAdd} full>Создать</ActionBtn>
              <ActionBtn color="var(--text-2)" bg="#F3F4F6" onClick={() => setAddingPeriod(false)} full>Отмена</ActionBtn>
            </div>
          </div>
        )}

        {monthly.length === 0
          ? <Empty text="Начислений нет" />
          : monthly.map(p => (
            <PayRow key={p.id} payment={p} isAdmin={isAdmin} isCashier={isCashier}
              onSave={u => onSavePayment(p, u)} onDelete={() => onDeletePayment(p)} />
          ))
        }
      </Section>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7,
  fontSize: 13, color: 'var(--text)', background: '#fff', boxSizing: 'border-box',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 }}>
      {children}
    </div>
  );
}

function ActionBtn({ children, onClick, color, bg, full }: { children: React.ReactNode; onClick: () => void; color: string; bg?: string; full?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', border: 'none', borderRadius: 7,
      background: bg ?? color, color: bg ? color : '#fff',
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
      width: full ? '100%' : undefined,
    }}>
      {children}
    </button>
  );
}

function SummaryTile({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color?: string; bg?: string }) {
  return (
    <div style={{ background: bg ?? '#F3F4F6', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: color ? color + 'AA' : 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? 'var(--text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
