import React, { useEffect, useMemo, useState } from 'react';
import { fetchPaymentsTable, getCachedPaymentsTable, PaymentTableRow } from '../../services/crmV2Service';
import { CASHIER_PERIODS, SCHOOL_TABS } from './constants';

interface CashierSchoolTransferDashboardProps {
  schoolKey: string;
  periodKey: string;
  rightReserveWidth?: number;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

const TRANSFER_COUNT = 15;

function paymentDate(row: PaymentTableRow): Date | null {
  const raw = row.actualPaymentDate || row.paymentDate || row.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesPeriod(row: PaymentTableRow, periodKey: string): boolean {
  const period = CASHIER_PERIODS.find(item => item.key === periodKey);
  const date = paymentDate(row);
  if (!period || !date) return false;
  return date.getMonth() + 1 === period.month && date.getFullYear() === period.year;
}

function isPending(row: PaymentTableRow): boolean {
  const status = String(row.status ?? '').toLowerCase();
  return status === 'pending' || status.includes('провер');
}

function rowMatchesSchool(row: PaymentTableRow, schoolKey: string): boolean {
  const tab = SCHOOL_TABS.find(item => item.key === schoolKey);
  if (!tab) return false;
  const branch = row.branchShort.toLowerCase();
  return branch === tab.key.toLowerCase() || branch === tab.label.toLowerCase();
}

export default function CashierSchoolTransferDashboard({ schoolKey, periodKey, rightReserveWidth = 78, selectedKey = '', onSelect }: CashierSchoolTransferDashboardProps) {
  const [rows, setRows] = useState<PaymentTableRow[] | null>(() => getCachedPaymentsTable());

  useEffect(() => {
    let cancelled = false;
    fetchPaymentsTable()
      .then(next => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setRows(prev => prev ?? []); });
    return () => { cancelled = true; };
  }, []);

  const schoolRows = useMemo(() => (
    (rows ?? []).filter(row => rowMatchesSchool(row, schoolKey) && matchesPeriod(row, periodKey) && isPending(row))
  ), [periodKey, rows, schoolKey]);

  if (rows === null) return null;

  const transferCells = Array.from({ length: TRANSFER_COUNT }, (_, i) => {
    const number = String(i + 1);
    const transferRows = schoolRows.filter(row => row.transferNumber === number);
    return {
      filterKey: number,
      label: `#${number}`,
      count: transferRows.length,
    };
  });

  const allCount = schoolRows.length;
  const noTransferCount = schoolRows.filter(row => !row.transferNumber).length;
  const cells = [
    ...transferCells,
    { filterKey: 'empty', label: '—', count: noTransferCount },
    { filterKey: '', label: '≡', count: allCount },
  ];

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      flexShrink: 0,
      padding: '10px 0 0',
      paddingRight: rightReserveWidth,
      transition: 'padding-right .18s ease',
    }}>
      {cells.map(cell => {
        const active = cell.count > 0;
        const isSelected = selectedKey === cell.filterKey;
        const activeColor = '#2DD4BF';
        return (
          <button
            key={cell.filterKey || 'all'}
            onClick={() => onSelect?.(isSelected ? '' : cell.filterKey)}
            title={active ? `На проверке: ${cell.count}` : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '8px 4px',
              borderRadius: 12,
              background: isSelected
                ? activeColor
                : active
                  ? '#fff'
                  : 'repeating-linear-gradient(-45deg, #F5FAFB 0, #F5FAFB 6px, #E7EFF2 6px, #E7EFF2 8px)',
              border: `1px solid ${isSelected || active ? activeColor : '#E1E8EA'}`,
              boxShadow: isSelected ? `0 0 10px ${activeColor}99` : 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{
              fontSize: 13,
              fontWeight: 800,
              color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}>
              {active ? cell.count : ''}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#fff' : active ? activeColor : '#AEB8C2' }}>
              {cell.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
