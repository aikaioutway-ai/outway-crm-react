import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MAX_TRANSFER_NUMBER } from '../../modules/families/constants';

export const TRANSFERS_PER_PAGE = 15;

export function transferCellCount(_numbers?: Array<string | number | null | undefined>, _selectedKey = ''): number {
  return MAX_TRANSFER_NUMBER;
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
        className={`ow-transfer-arrow${hidden > 0 && !disabled ? ' has-more' : ''}`}
      >
        {direction < 0 ? <ChevronLeft size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        {!disabled && hidden > 0 && <span>{hidden}</span>}
      </button>
    );
  };
  return <>
    {pageCount > 1 && arrow(-1)}
    {cells.slice(start, Math.min(start + TRANSFERS_PER_PAGE, counts.length))}
    {pageCount > 1 && arrow(1)}
    {cells.slice(counts.length)}
  </>;
}
