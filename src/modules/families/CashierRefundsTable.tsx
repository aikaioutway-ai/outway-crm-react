import React, { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { DataTable, ColumnDef } from '../../core/tables/DataTable';
import '../../core/tables/DataTable.css';
import { RefundTableRow } from '../../services/crmV2Service';
import { useRefundsTable } from '../../hooks/useCrmQueries';
import { confirmFamilyRefund, rejectFamilyRefund } from '../../services/financeService';
import { money } from '../../utils/pricing';
import { CASHIER_PERIODS, SCHOOL_TABS } from './constants';

interface Props {
  schoolKey: string;
  periodKey: string;
  searchQuery?: string;
  confirmedBy?: string;
}

function refundDate(row: RefundTableRow): Date | null {
  const raw = row.requestedAt || row.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesPeriod(row: RefundTableRow, periodKey: string): boolean {
  if (periodKey === 'ALL') return CASHIER_PERIODS.some(period => matchesPeriod(row, period.key));
  const period = CASHIER_PERIODS.find(item => item.key === periodKey);
  const date = refundDate(row);
  if (!period || !date) return false;
  return date.getMonth() + 1 === period.month && date.getFullYear() === period.year;
}

function matchesSchool(row: RefundTableRow, schoolKey: string): boolean {
  const tab = SCHOOL_TABS.find(item => item.key === schoolKey);
  if (!tab || tab.key === 'ALL') return true;
  const branch = row.branchShort.toLowerCase();
  return branch === tab.key.toLowerCase() || branch === tab.label.toLowerCase();
}

export default function CashierRefundsTable({ schoolKey, periodKey, searchQuery = '', confirmedBy }: Props) {
  const { data: rows = [], isLoading } = useRefundsTable();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paymentMethodById, setPaymentMethodById] = useState<Record<string, 'cash' | 'cashless'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function confirm(row: RefundTableRow) {
    setBusyId(row.id);
    try {
      await confirmFamilyRefund({
        refund: { id: row.id, familyId: row.familyId, amount: row.amount, status: 'На проверке', requestedAt: row.requestedAt },
        confirmedBy,
        paymentMethod: paymentMethodById[row.id] ?? 'cashless',
      });
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(row: RefundTableRow) {
    const reason = window.prompt('Причина отказа:', '')?.trim();
    if (reason === undefined) return;
    setBusyId(row.id);
    try {
      await rejectFamilyRefund({ id: row.id, familyId: row.familyId, amount: row.amount, status: 'На проверке', requestedAt: row.requestedAt }, reason, confirmedBy);
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo((): ColumnDef<RefundTableRow>[] => [
    { key: 'parentName', label: 'Родитель', type: 'text', category: 'Возврат', width: 180, render: (val) => <span style={{ fontWeight: 700, fontSize: 13 }}>{val || '—'}</span> },
    { key: 'childrenNames', label: 'Дети', type: 'text', category: 'Возврат', width: 160, render: (val) => {
      const names = String(val || '').split(',').map(n => n.trim()).filter(Boolean);
      if (!names.length) return <span style={{ fontSize: 12, color: '#9AA7AE' }}>—</span>;
      return <span style={{ fontSize: 12, lineHeight: 1.5 }}>{names.join(', ')}</span>;
    }},
    { key: 'amount', label: 'Сумма', type: 'currency', category: 'Возврат', width: 120, render: (val) => <span style={{ fontWeight: 700, color: '#B91C1C' }}>{money(Number(val ?? 0))}</span> },
    { key: 'comment', label: 'Комментарий', type: 'text', category: 'Возврат', width: 200, sortable: false, filterable: false, render: (val) => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{val || '—'}</span> },
    { key: 'requestedAt', label: 'Дата заявки', type: 'text', category: 'Возврат', width: 120, sortable: false, filterable: false, render: (val) => <span style={{ fontSize: 12 }}>{val ? new Date(String(val)).toLocaleDateString('ru-RU') : '—'}</span> },
    {
      key: 'status', label: 'Подтверждение', type: 'text', category: 'Возврат', width: 230, sortable: false, filterable: false,
      render: (val, row) => {
        if (val === 'confirmed') {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, color: 'var(--success)', background: 'rgba(16,185,129,.1)' }}>
              ✓ Подтверждено
            </span>
          );
        }
        if (val === 'rejected') {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#991B1B', background: '#FEE2E2' }}>
              ✕ Отклонено
            </span>
          );
        }
        const busy = busyId === row.id;
        if (editingId !== row.id) {
          return (
            <button
              onClick={e => { e.stopPropagation(); setPaymentMethodById(prev => ({ ...prev, [row.id]: prev[row.id] || 'cashless' })); setEditingId(row.id); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text)', background: '#fff', cursor: 'pointer' }}
            >
              <Pencil size={12} /> На проверке
            </button>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
            <select
              disabled={busy}
              value={paymentMethodById[row.id] ?? 'cashless'}
              onChange={e => setPaymentMethodById(prev => ({ ...prev, [row.id]: e.target.value as 'cash' | 'cashless' }))}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 12, color: 'var(--text)', background: '#fff' }}
            >
              <option value="cashless">Перевод</option>
              <option value="cash">Наличные</option>
            </select>
            <button
              title="Подтвердить"
              disabled={busy}
              onClick={() => confirm(row)}
              style={{ border: 'none', borderRadius: 6, width: 26, height: 26, fontSize: 13, fontWeight: 800, color: '#fff', background: busy ? '#A7E4D3' : 'var(--success)', cursor: busy ? 'not-allowed' : 'pointer' }}
            >✓</button>
            <button
              title="Отклонить"
              disabled={busy}
              onClick={() => reject(row)}
              style={{ border: 'none', borderRadius: 6, width: 26, height: 26, fontSize: 13, fontWeight: 800, color: '#991B1B', background: '#FEE2E2', cursor: busy ? 'not-allowed' : 'pointer' }}
            >✕</button>
            <button
              title="Отмена"
              disabled={busy}
              onClick={() => setEditingId(null)}
              style={{ border: 'none', borderRadius: 6, width: 26, height: 26, fontSize: 12, fontWeight: 700, color: 'var(--text-2)', background: 'var(--surface-2)', cursor: busy ? 'not-allowed' : 'pointer' }}
            >×</button>
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [editingId, paymentMethodById, busyId]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().replace(/\s+/g, '');
    return rows.filter(row => {
      if (!matchesSchool(row, schoolKey)) return false;
      if (!matchesPeriod(row, periodKey)) return false;
      if (!q) return true;
      return [row.parentName, row.phone, row.childrenNames, row.branchShort].some(v => v.toLowerCase().replace(/\s+/g, '').includes(q));
    });
  }, [rows, schoolKey, periodKey, searchQuery]);

  return (
    <DataTable<RefundTableRow>
      key={`refunds_table_${schoolKey}`}
      columns={columns}
      data={filteredRows}
      rowKey="id"
      storageKey="cashier_refunds_table_v1"
      loading={isLoading}
      emptyText="Возвратов нет"
      canManageProperties={false}
    />
  );
}
