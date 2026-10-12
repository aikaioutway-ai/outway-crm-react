import React, { useEffect, useState } from 'react';

export const TRANSFERS_PER_PAGE = 15;

export function transferCellCount(numbers: Array<string | number | null | undefined>, selectedKey = ''): number {
  const max = [...numbers, selectedKey].reduce<number>((highest, value) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > highest ? number : highest;
  }, 0);
  return Math.max(1, Math.ceil(max / TRANSFERS_PER_PAGE)) * TRANSFERS_PER_PAGE;
}

export default function TransferBarPages({ scopeKey, selectedKey = '', counts, children }: {
  scopeKey: string;
  selectedKey?: string;
  counts: number[];
  children: React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    const selected = Number(selectedKey);
    setPage(Number.isSafeInteger(selected) && selected > 0 ? Math.floor((selected - 1) / TRANSFERS_PER_PAGE) : 0);
  }, [scopeKey, selectedKey]);
  const pageCount = Math.max(1, Math.ceil(counts.length / TRANSFERS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * TRANSFERS_PER_PAGE;
  const cells = React.Children.toArray(children);
  const arrow = (direction: -1 | 1) => {
    const disabled = direction < 0 ? currentPage === 0 : currentPage === pageCount - 1;
    const hidden = (direction < 0 ? counts.slice(0, start) : counts.slice(start + TRANSFERS_PER_PAGE)).reduce((sum, count) => sum + count, 0);
    const first = (currentPage + direction) * TRANSFERS_PER_PAGE + 1;
    return (
      <button
        type="button"
        aria-label={direction < 0 ? 'Предыдущие трансферы' : 'Следующие трансферы'}
        title={disabled ? undefined : `Трансферы ${first}–${first + TRANSFERS_PER_PAGE - 1} · записей: ${hidden}`}
        disabled={disabled}
        onClick={() => setPage(currentPage + direction)}
        style={{ flex: '0 0 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '8px 0', borderRadius: 12, background: '#fff', border: `1px solid ${disabled ? '#E1E8EA' : '#2DD4BF'}`, color: disabled ? '#C7D0D6' : '#2DD4BF', cursor: disabled ? 'default' : 'pointer' }}
      >
        <span style={{ fontSize: 16, fontWeight: 800 }}>{direction < 0 ? '‹' : '›'}</span>
        {!disabled && hidden > 0 && <span style={{ fontSize: 10, fontWeight: 800 }}>{hidden}</span>}
      </button>
    );
  };
  return <>
    {pageCount > 1 && arrow(-1)}
    {cells.slice(start, start + TRANSFERS_PER_PAGE)}
    {pageCount > 1 && arrow(1)}
    {cells.slice(counts.length)}
  </>;
}
