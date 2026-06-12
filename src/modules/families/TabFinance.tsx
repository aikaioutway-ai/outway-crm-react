import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Family, Payment } from '../../types';
import { calcPenalty, money } from '../../utils/pricing';
import StatusBadge from '../../core/cards/StatusBadge';
import { PERIOD_LABEL, PERIOD_ORDER, ALL_PERIODS } from './constants';
import { Section, SummaryCard, Spinner, Empty } from './DrawerUI';

const STATUS_CHAIN = ['Не оплачено', 'Просрочено', 'На проверке', 'На проверке (чек)', 'Частично оплачено', 'Оплачено'];

// ─── PayRow ──────────────────────────────────────────────────────────────────

function PayRow({ payment: p, isDeposit, isAdmin, isCashier, editMode, onSave, onDelete }: {
  payment: Payment;
  isDeposit?: boolean;
  isAdmin: boolean;
  isCashier: boolean;
  editMode: boolean;
  onSave: (u: Partial<Payment>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [managerAmt, setManagerAmt] = useState(String(p.managerAmount || ''));
  const [factAmt, setFactAmt]     = useState(String(p.factAmount || ''));
  const [comment, setComment]     = useState(p.comment ?? '');
  const [editAmount, setEditAmount] = useState(String(p.amount));
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');

  const dueDate = p.month > 0 ? new Date(p.year, p.month - 1, 1) : null;
  const needsPenalty = !isDeposit && dueDate && !p.isFrozen &&
    ['Не оплачено', 'Просрочено', 'Частично оплачено'].includes(p.accountantStatus);
  const penalty = needsPenalty ? calcPenalty(p.amount - p.factAmount, dueDate!, new Date()) : 0;
  const paid    = p.accountantStatus === 'Оплачено';
  const overdue = p.accountantStatus === 'Просрочено';

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

  const inReview = p.accountantStatus === 'На проверке' || p.accountantStatus === 'На проверке (чек)';

  return (
    <div style={{ border: `1px solid ${overdue ? '#FFCDD2' : 'var(--border)'}`, borderRadius: 8, background: paid ? '#FAFFFE' : overdue ? '#FFF8F8' : '#fff', overflow: 'hidden' }}>

      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{PERIOD_LABEL[p.periodKey] ?? p.periodKey}</div>
          {!isDeposit && p.year && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{p.year}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: paid ? '#2E7D32' : 'var(--text)' }}>{money(p.amount)}</div>
            {p.accountantStatus === 'Частично оплачено' && p.factAmount > 0 && (
              <div style={{ fontSize: 11, color: '#1565C0' }}>оплачено {money(p.factAmount)}</div>
            )}
            {penalty > 0 && <div style={{ fontSize: 11, color: '#C62828', fontWeight: 600 }}>+{money(penalty)} пеня</div>}
          </div>
          {msg && <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 700 }}>{msg}</span>}
          <StatusBadge status={p.accountantStatus} size="sm" />
          {saving && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>...</span>}
        </div>
      </div>

      {/* Manager info */}
      {p.managerAmount > 0 && !paid && (
        <div style={{ padding: '0 14px 10px', fontSize: 11, color: 'var(--text-2)' }}>
          Менеджер внёс: <strong>{money(p.managerAmount)}</strong>
          {p.managerDate && ` · ${new Date(p.managerDate).toLocaleDateString('ru-RU')}`}
          {p.hasReceipt && ' · 📎 чек'}
        </div>
      )}

      {/* Expanded actions */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px', background: 'var(--bg)' }}>

          {/* Admin: edit amount */}
          {isAdmin && !paid && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase' }}>Изменить начисление (Админ)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
                <button onClick={() => save({ amount: Number(editAmount) })}
                  style={{ padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Изменить
                </button>
              </div>
            </div>
          )}

          {/* Manager: внести оплату */}
          {!isCashier && !paid && !inReview && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase' }}>Внести оплату</div>
              <input type="number" value={managerAmt} onChange={e => setManagerAmt(e.target.value)}
                placeholder={`Сумма (начислено: ${money(p.amount)})`}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий"
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <button onClick={managerSubmit}
                style={{ padding: '7px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Отправить на проверку
              </button>
            </div>
          )}

          {/* Cashier: подтвердить/отклонить */}
          {(isCashier || isAdmin) && inReview && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase' }}>
                Подтверждение · менеджер внёс {money(p.managerAmount)}
              </div>
              <input type="number" value={factAmt || String(p.managerAmount)} onChange={e => setFactAmt(e.target.value)}
                placeholder="Фактическая сумма"
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий"
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cashierConfirm} style={{ flex: 1, padding: '7px', background: '#E8F5E9', color: '#2E7D32', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓ Подтвердить</button>
                <button onClick={cashierReject} style={{ flex: 1, padding: '7px', background: '#FFEBEE', color: '#C62828', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✗ Отклонить</button>
              </div>
            </div>
          )}

          {/* Admin: прямое изменение статуса */}
          {isAdmin && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase' }}>Статус</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS_CHAIN.map(s => (
                  <button key={s} onClick={() => save({ accountantStatus: s as any, isFrozen: s.includes('проверке') })}
                    style={{ padding: '4px 10px', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: p.accountantStatus === s ? 'var(--accent)' : '#EEF2FF', color: p.accountantStatus === s ? '#fff' : 'var(--accent)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Admin: удалить */}
          {isAdmin && editMode && (
            <button onClick={onDelete} style={{ marginTop: 8, width: '100%', padding: '6px', background: '#FFEBEE', color: '#C62828', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Trash2 size={13} /> Удалить запись
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TabFinance ───────────────────────────────────────────────────────────────

interface Props {
  payments: Payment[];
  loading: boolean;
  family: Family;
  editMode: boolean;
  isAdmin: boolean;
  isCashier: boolean;
  onSavePayment: (p: Payment, updates: Partial<Payment>) => Promise<boolean>;
  onDeletePayment: (p: Payment) => void;
  onAddPayment: (periodKey: string, month: number, year: number, amount: number) => void;
}

export default function TabFinance({ payments, loading, family, editMode, isAdmin, isCashier, onSavePayment, onDeletePayment, onAddPayment }: Props) {
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriodKey, setNewPeriodKey] = useState('9');
  const [newAmount, setNewAmount]       = useState('');

  if (loading) return <Spinner />;

  const sorted  = [...payments].sort((a, b) => PERIOD_ORDER.indexOf(a.periodKey) - PERIOD_ORDER.indexOf(b.periodKey));
  const deposit = sorted.find(p => p.periodKey === 'deposit');
  const monthly = sorted.filter(p => p.periodKey !== 'deposit');

  const totalCharged = monthly.reduce((s, p) => s + p.amount, 0);
  const totalPaid    = monthly.reduce((s, p) => s + p.factAmount, 0);
  const totalDebt    = Math.max(0, totalCharged - totalPaid);

  const existingKeys = new Set<string>(payments.map(p => p.periodKey));
  const availablePeriods = ALL_PERIODS.filter(p => !existingKeys.has(p.key));

  function handleAdd() {
    const period = ALL_PERIODS.find(p => p.key === newPeriodKey);
    if (!period) return;
    onAddPayment(period.key, period.month, period.year, Number(newAmount) || 0);
    setAddingPeriod(false);
    setNewAmount('');
  }

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <SummaryCard label="Начислено" value={money(totalCharged)} />
        <SummaryCard label="Оплачено"  value={money(totalPaid)} color="#2E7D32" />
        {totalDebt > 0
          ? <SummaryCard label="Долг" value={money(totalDebt)} color="#C62828" bg="#FFEBEE" />
          : <SummaryCard label="Баланс" value="✓ Чисто" color="#2E7D32" bg="#E8F5E9" />
        }
      </div>

      {deposit && (
        <Section title="Депозит">
          <PayRow payment={deposit} isDeposit isAdmin={isAdmin} isCashier={isCashier} editMode={editMode}
            onSave={u => onSavePayment(deposit, u)} onDelete={() => onDeletePayment(deposit)} />
        </Section>
      )}

      <Section
        title={`Периоды (${monthly.length})`}
        action={editMode && availablePeriods.length > 0 ? (
          <button onClick={() => setAddingPeriod(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={11} /> Добавить
          </button>
        ) : undefined}
      >
        {addingPeriod && (
          <div style={{ background: '#EEF2FF', borderRadius: 8, padding: '12px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>Период</div>
              <select value={newPeriodKey} onChange={e => setNewPeriodKey(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)' }}>
                {availablePeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>Сумма (сом)</div>
              <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="6000"
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', width: 120 }} />
            </div>
            <button onClick={handleAdd} style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Создать</button>
            <button onClick={() => setAddingPeriod(false)} style={{ padding: '7px 12px', background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Отмена</button>
          </div>
        )}

        {monthly.length === 0
          ? <Empty text="Начислений нет" />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {monthly.map(p => (
                <PayRow key={p.id} payment={p} isAdmin={isAdmin} isCashier={isCashier} editMode={editMode}
                  onSave={u => onSavePayment(p, u)} onDelete={() => onDeletePayment(p)} />
              ))}
            </div>
          )
        }
      </Section>
    </div>
  );
}

