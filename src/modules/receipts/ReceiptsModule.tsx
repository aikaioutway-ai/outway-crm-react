import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, RotateCcw, Search, Trash2 } from 'lucide-react';
import FilterableTable from '../../core/tables/FilterableTable';
import { useIncomingReceipts } from '../../hooks/useCrmQueries';
import { QK } from '../../services/queryClient';
import {
  canSubmitIncomingReceipt,
  deleteIncomingReceipt,
  fetchIncomingReceiptFileUrl,
  IncomingReceiptFilter,
  IncomingReceiptRow,
  OTHER_FILES_RETENTION_DAYS,
  ReceiptScope,
  submitIncomingReceipt,
} from '../../services/incomingReceiptService';
import { formatName, formatPhone } from '../../utils/format';
import { money } from '../../utils/pricing';
import ReceiptModal from '../families/ReceiptModal';
import ReceiptReviewModal from './ReceiptReviewModal';
import './ReceiptsModule.css';

const FILTERS: { key: IncomingReceiptFilter; label: string }[] = [
  { key: 'review', label: 'Нужно разобрать' },
  { key: 'submitted', label: 'Отправлены' },
  { key: 'duplicates', label: 'Дубли' },
  { key: 'all', label: 'Все' },
  { key: 'other', label: 'Другие файлы' },
];

const EMPTY_TEXT: Record<IncomingReceiptFilter, string> = {
  review: 'Новых чеков для разбора нет.',
  submitted: 'Отправленных на проверку чеков пока нет.',
  duplicates: 'Дублей не найдено.',
  other: `Других файлов нет. Фото и документы без чека хранятся ${OTHER_FILES_RETENTION_DAYS} дней.`,
  all: 'Чеки из групп WhatsApp пока не поступали.',
};

const ERROR_TEXT: Record<string, string> = {
  ocr_failed: 'Чек не распознан, заполните вручную',
  ocr_and_storage_failed: 'Файл не сохранился',
  download_failed: 'Файл не скачался из WhatsApp',
  missing_download_url: 'WhatsApp не передал файл',
  storage_failed: 'Файл не сохранился',
  processing_failed: 'Ошибка обработки',
  duplicate_check_failed: 'Дубли не проверены, проверка пройдёт при отправке',
};

function matchHint(receipt: IncomingReceiptRow): string {
  if (receipt.matchStatus === 'multiple') return `Номер есть у нескольких семей (${receipt.familyMatchCount ?? 2})`;
  if (receipt.matchStatus === 'none') return 'Номера нет в CRM';
  if (receipt.matchStatus === 'no_phone') return 'Номер отправителя скрыт';
  if (receipt.matchStatus === 'lookup_failed') return 'Поиск семьи не выполнился';
  return '';
}

const dateLabel = (value: string | null) => value ? value.split('-').reverse().join('.') : '—';

export default function ReceiptsModule({ sessionToken, userName, allowedSchools, onOpenFamily, scope, title = 'Чеки', toolbar, canDelete = false }: {
  sessionToken?: string;
  userName?: string;
  allowedSchools?: string[];
  onOpenFamily: (familyId: string) => Promise<void>;
  /** ПКМ по строке → «Удалить навсегда» (только руководство). */
  canDelete?: boolean;
  scope?: ReceiptScope;
  /** Заголовок над списком, например «← Трансферы · Трансфер 12». */
  title?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<IncomingReceiptFilter>('review');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [editing, setEditing] = useState<IncomingReceiptRow | null>(null);
  const [preview, setPreview] = useState<{ url: string; pdf: boolean; subtitle: string; other: boolean } | null>(null);
  const [menu, setMenu] = useState<{ receipt: IncomingReceiptRow; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true); };
  }, [menu]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const transferId = scope?.transferId;
  const unassigned = scope?.unassigned;
  useEffect(() => { setPage(0); }, [transferId, unassigned, scope?.schoolKey, scope?.dateFrom, scope?.dateTo]);
  const receipts = useIncomingReceipts(sessionToken, { filter, search, page, ...scope });
  const rows = receipts.data?.rows ?? [];
  const total = receipts.data?.counts[filter] ?? 0;
  const pageSize = receipts.data?.pageSize ?? 50;
  const refresh = () => queryClient.invalidateQueries({ queryKey: QK.incomingReceiptsAll });

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId('');
    }
  }

  const openReceipt = (receipt: IncomingReceiptRow) => run(receipt.id, async () => {
    const url = await fetchIncomingReceiptFileUrl(sessionToken, receipt.id);
    setPreview({ url, pdf: receipt.mimeType === 'application/pdf', subtitle: receipt.chatName ?? 'Группа WhatsApp', other: receipt.kind === 'other' });
  });

  const remove = (receipt: IncomingReceiptRow) => {
    setMenu(null);
    const what = receipt.kind === 'other' ? 'Файл' : 'Чек';
    if (!window.confirm(`${what} из группы «${receipt.chatName ?? 'WhatsApp'}» будет удалён навсегда вместе с файлом. Вернуть его будет нельзя. Удалить?`)) return;
    void run(receipt.id, async () => {
      try {
        await deleteIncomingReceipt(sessionToken, receipt.id);
      } finally {
        await refresh();
      }
    });
  };

  const submit = (receipt: IncomingReceiptRow) => run(receipt.id, async () => {
    try {
      await submitIncomingReceipt(sessionToken, receipt, userName);
    } finally {
      await refresh();
    }
  });

  function action(receipt: IncomingReceiptRow) {
    const busy = busyId === receipt.id;
    const openFamily = (familyId: string) => void run(receipt.id, () => onOpenFamily(familyId));
    if (receipt.kind === 'submitted') {
      return <div className="receipts-action">
        <button type="button" className="receipts-link" onClick={() => openFamily(receipt.familyId!)}>Отправлен</button>
        {receipt.submittedBy && <small>{receipt.submittedBy}</small>}
      </div>;
    }
    const duplicate = receipt.kind === 'duplicates';
    return <div className="receipts-action receipts-action--row">
      {duplicate ? <button type="button" className="ow-btn ow-btn--sm receipts-primary receipts-warning" disabled={busy || !receipt.duplicateFamilyId}
        title={receipt.duplicateFamilyId ? 'Открыть платёж' : 'Платёж удалён'} onClick={() => openFamily(receipt.duplicateFamilyId!)}>Дубль</button>
        : <button type="button" className="ow-btn ow-btn--sm receipts-primary" disabled={busy || !receipt.hasFile || receipt.status === 'received'}
          onClick={() => canSubmitIncomingReceipt(receipt) ? void submit(receipt) : setEditing(receipt)}>{busy ? 'Отправляем…' : 'На проверку'}</button>}
      {canDelete && !receipt.paymentId && <button type="button" className="receipts-icon receipts-delete" aria-label="Удалить чек" title="Удалить" disabled={busy} onClick={() => remove(receipt)}><Trash2 size={13} aria-hidden="true" /> Удалить</button>}
    </div>;
  }

  return <div className="receipts-module">
    <header className="receipts-head">
      <h1 className="ow-page-title receipts-title">{title}</h1>
      {toolbar}
      <div role="tablist" aria-label="Статус чеков" className="ow-seg">
        {FILTERS.map(item => <button key={item.key} type="button" role="tab" className="ow-seg-btn" aria-selected={filter === item.key}
          onClick={() => { setFilter(item.key); setPage(0); setActionError(''); }}>
          {item.label}{receipts.data ? ` ${receipts.data.counts[item.key]}` : ''}
        </button>)}
      </div>
      <label className="receipts-search">
        <Search size={14} aria-hidden="true" />
        <input aria-label="Поиск чеков" value={searchInput} placeholder="Группа, телефон, родитель" onChange={event => setSearchInput(event.target.value)} />
      </label>
    </header>

    {actionError && <div role="alert" className="receipts-alert">{actionError}</div>}

    <div className="receipts-table-wrap">
      {receipts.isLoading ? <div className="receipts-state">Загружаем чеки…</div>
        : receipts.isError ? <div className="receipts-state" role="alert">
          <span>{receipts.error instanceof Error ? receipts.error.message : 'Не удалось загрузить чеки'}</span>
          <button type="button" className="ow-btn ow-btn--sm" onClick={() => void receipts.refetch()}><RotateCcw size={13} aria-hidden="true" /> Повторить</button>
        </div>
        : !rows.length ? <div className="receipts-state">{search ? 'По этому запросу чеков нет.' : EMPTY_TEXT[filter]}</div>
        : <FilterableTable className="receipts-table">
          <thead><tr>
            <th>Группа</th><th>Отправитель</th><th>Чек</th><th>Сумма</th><th>Дата</th>
            <th>Комментарий</th><th>Семья / дети</th><th>Действия</th>
          </tr></thead>
          <tbody>{rows.map(receipt => <tr key={receipt.id} onContextMenu={canDelete && !receipt.paymentId ? event => {
            event.preventDefault();
            event.stopPropagation();
            setMenu({ receipt, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)), y: Math.min(event.clientY, window.innerHeight - 60) });
          } : undefined}>
            <td>{receipt.chatName ?? '—'}</td>
            <td>
              <div>{receipt.senderPhone ? formatPhone(receipt.senderPhone) : 'Номер скрыт'}</div>
              {receipt.senderName && <small>{receipt.senderName}</small>}
            </td>
            <td>{receipt.hasFile
              ? <button type="button" className="receipts-link" disabled={busyId === receipt.id} onClick={() => void openReceipt(receipt)}><FileText size={13} aria-hidden="true" /> Открыть</button>
              : '—'}</td>
            <td className="receipts-money">{receipt.amount ? money(receipt.amount) : '—'}</td>
            <td>{dateLabel(receipt.receiptDate)}</td>
            <td className="receipts-caption" title={receipt.caption ?? undefined}>{receipt.caption ?? '—'}</td>
            <td className="receipts-family">
              {receipt.familyId
                ? <>
                  <button type="button" className="receipts-link" onClick={() => void run(receipt.id, () => onOpenFamily(receipt.familyId!))}>{formatName(receipt.parentName) || receipt.familyId}</button>
                  {receipt.children.length > 0 && <small>{receipt.children.map(child => formatName(child.name)).join(', ')}</small>}
                </>
                : <><button type="button" className="ow-btn ow-btn--sm" disabled={busyId === receipt.id} onClick={() => setEditing(receipt)}>Выбрать семью</button>{matchHint(receipt) && <small>{matchHint(receipt)}</small>}</>}
              {receipt.familyId && receipt.kind !== 'submitted' && <button type="button" className="ow-btn ow-btn--sm" disabled={busyId === receipt.id} onClick={() => setEditing(receipt)}>Выбрать семью</button>}
              {receipt.error && ERROR_TEXT[receipt.error] && <small className="receipts-danger">{ERROR_TEXT[receipt.error]}</small>}
            </td>
            <td>{action(receipt)}</td>
          </tr>)}</tbody>
        </FilterableTable>}
    </div>

    {total > pageSize && <footer className="receipts-pages">
      <button type="button" className="ow-btn ow-btn--sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Назад</button>
      <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} из {total}</span>
      <button type="button" className="ow-btn ow-btn--sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(value => value + 1)}>Вперёд</button>
    </footer>}

    {menu && createPortal(<div className="dt-ctx-menu" role="menu" aria-label="Действия с чеком" style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 10000 }} onClick={event => event.stopPropagation()}>
      <button type="button" role="menuitem" className="dt-ctx-item receipts-delete" onClick={() => remove(menu.receipt)}>
        <Trash2 size={14} aria-hidden="true" /> Удалить навсегда
      </button>
    </div>, document.body)}
    {editing && <ReceiptReviewModal receipt={editing} sessionToken={sessionToken} allowedSchools={allowedSchools}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
    {preview && <ReceiptModal receiptUrl={preview.url} pdf={preview.pdf} title={preview.other ? 'Файл из WhatsApp' : 'Чек из WhatsApp'} subtitle={preview.subtitle} onClose={() => setPreview(null)} />}
  </div>;
}
