import React, { useEffect, useState } from 'react';
import { X, CreditCard } from 'lucide-react';
import { Family, Payment } from '../../types';
import { money } from '../../utils/pricing';
import { supabase } from '../../services/supabase';
import StatusBadge from '../../core/cards/StatusBadge';
import { PERIOD_LABEL, PERIOD_ORDER } from './constants';

interface Props {
  family: Family;
  onClose: () => void;
  userRole?: string;
  userName?: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Оплачено':           { bg: '#D1FAE5', color: '#065F46' },
  'Частично оплачено':  { bg: '#FEF3C7', color: '#92400E' },
  'На проверке':        { bg: '#DBEAFE', color: '#1E40AF' },
  'На проверке (чек)':  { bg: '#E0E7FF', color: '#3730A3' },
  'Просрочено':         { bg: '#FEE2E2', color: '#991B1B' },
  'Не оплачено':        { bg: '#F3F4F6', color: '#374151' },
};

export default function PaymentModal({ family, onClose, userRole = 'manager', userName = 'Менеджер' }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managerAmt, setManagerAmt] = useState('');
  const [comment, setComment]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState('');

  const isAdmin   = userRole === 'admin' || userRole === 'director';
  const isCashier = userRole === 'cashier';

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('payments').select('*').eq('family_id', family.id);
    if (data) {
      setPayments(data.map((r: any) => ({
        id: String(r.id), familyId: String(r.family_id),
        schoolCode: r.school_code || family.schoolCode,
        periodKey: (r.month === 0 ? 'deposit' : String(r.month)) as any,
        month: Number(r.month), year: Number(r.year),
        amount: Number(r.amount ?? 0), managerAmount: Number(r.manager_amount ?? 0),
        managerDate: r.manager_date ?? '', hasReceipt: Boolean(r.has_receipt),
        accountantStatus: r.accountant_status ?? 'Не оплачено',
        factAmount: Number(r.fact_amount ?? 0), factDate: r.fact_date ?? '',
        isFrozen: Boolean(r.is_frozen), comment: r.comment ?? '',
      })));
    }
    setLoading(false);
  }

  const sorted = [...payments].sort((a, b) => PERIOD_ORDER.indexOf(a.periodKey) - PERIOD_ORDER.indexOf(b.periodKey));
  const unpaid = sorted.filter(p => !['Оплачено'].includes(p.accountantStatus));
  const selected = payments.find(p => p.id === selectedId);

  async function handleSubmit() {
    if (!selected || !managerAmt) return;
    setSaving(true);
    await supabase.from('payments').update({
      manager_amount: Number(managerAmt),
      manager_date: new Date().toISOString().slice(0, 10),
      accountant_status: 'На проверке',
      is_frozen: true,
      comment,
    }).eq('id', selected.id);

    try {
      await supabase.from('audit_log').insert({
        family_id: family.id, user_name: userName,
        action: 'Внесение оплаты', field: PERIOD_LABEL[selected.periodKey] ?? selected.periodKey,
        old_value: `Не оплачено, сумма: ${selected.amount}`,
        new_value: `На проверке, внесено: ${managerAmt}`,
      });
    } catch { /* ignore */ }

    setSaving(false);
    setMsg('Отправлено на проверку ✓');
    setSelectedId(null);
    setManagerAmt('');
    setComment('');
    await load();
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 520, maxHeight: '85vh',
        background: '#fff', zIndex: 501, borderRadius: 14,
        boxShadow: '0 16px 50px rgba(49,46,129,0.2)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ background: 'var(--accent)', padding: '18px 22px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={16} color="#fff" />
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Внести оплату</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{family.parentName}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>

          {msg && (
            <div style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
              {msg}
            </div>
          )}

          {loading && <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-2)' }}>Загрузка...</div>}

          {!loading && (
            <>
              {/* Список периодов */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                Выберите период
              </div>
              {unpaid.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-2)', fontSize: 13 }}>Нет неоплаченных периодов 🎉</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {unpaid.map(p => {
                  const sc = STATUS_COLORS[p.accountantStatus] ?? STATUS_COLORS['Не оплачено'];
                  const isSelected = selectedId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => { setSelectedId(isSelected ? null : p.id); setManagerAmt(String(p.amount)); }}
                      style={{
                        padding: '12px 14px', borderRadius: 9, cursor: 'pointer',
                        border: `2px solid ${isSelected ? 'var(--accent)' : sc.bg}`,
                        background: isSelected ? '#EEF2FF' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{PERIOD_LABEL[p.periodKey] ?? p.periodKey}</div>
                        {p.year > 0 && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{p.year}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
                          {money(p.amount)}
                        </div>
                        <div style={{ background: sc.bg, color: sc.color, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {p.accountantStatus}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Форма оплаты */}
              {selected && (
                <div style={{ background: '#F8F9FF', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>
                    Оплата: {PERIOD_LABEL[selected.periodKey]} · начислено {money(selected.amount)}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                      Сумма оплаты
                    </div>
                    <input
                      type="number"
                      value={managerAmt}
                      onChange={e => setManagerAmt(e.target.value)}
                      placeholder={String(selected.amount)}
                      style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--accent)', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                      Комментарий
                    </div>
                    <input
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Необязательно"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={saving || !managerAmt}
                    style={{
                      width: '100%', padding: '11px', background: 'var(--accent)', color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', opacity: saving || !managerAmt ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Отправка...' : 'Отправить на проверку →'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
