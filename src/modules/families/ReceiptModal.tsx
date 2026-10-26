import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FamilyPayment } from '../../types';
import { fetchFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import type { ReceiptPage } from './pdfReceipt';
import './ReceiptModal.css';

type Props = {
  receiptUrl: string;
  title?: string;
  subtitle?: string;
  /** PDF определяется по ссылке; для локального файла (blob:) его тип передают явно. */
  pdf?: boolean;
  /** Без paymentId окно показывает только чек: платёж ещё не сохранён. */
  paymentId?: string;
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: (payment: FamilyPayment) => void;
};

export function isPdfReceipt(url: string): boolean {
  return /\.pdf(?:[?#]|$)/i.test(url);
}

function PdfPage({ page }: { page: ReceiptPage }) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const resize = () => setScale(Math.min(container.clientWidth / page.width, container.clientHeight / page.height));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    layer.current?.replaceChildren(page.textLayer);
    return () => { observer.disconnect(); page.textLayer.remove(); };
  }, [page]);
  return <div className="receipt-pdf-host" ref={host}>
    <div className="receipt-pdf-page" style={{ width: page.width, height: page.height, transform: `translate(-50%, -50%) scale(${scale})` }}>
      <img src={page.image} alt="Чек платежа" draggable={false} />
      <div ref={layer} />
    </div>
  </div>;
}

function ReceiptDocument({ url, pdf }: { url: string; pdf: boolean }) {
  const [pages, setPages] = useState<ReceiptPage[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!pdf) return;
    let current = true;
    import('./pdfReceipt')
      .then(module => module.renderPdfPages(url))
      .then(result => { if (current) setPages(result); })
      .catch(() => { if (current) setError('Не удалось показать PDF'); });
    return () => { current = false; };
  }, [pdf, url]);

  if (!pdf) return <img src={url} alt="Чек платежа" />;
  if (error) return <div className="receipt-modal-placeholder">{error} · <a href={url} target="_blank" rel="noreferrer">Открыть файл</a></div>;
  if (!pages) return <div className="receipt-modal-placeholder" role="status">Загрузка чека…</div>;
  const page = Math.min(pageIndex, pages.length - 1);
  return <>
    <PdfPage page={pages[page]} />
    {pages.length > 1 && <div className="receipt-modal-pager">
      <button type="button" aria-label="Предыдущая страница" disabled={page === 0} onClick={() => setPageIndex(page - 1)}><ChevronLeft size={16} /></button>
      <span>{page + 1} / {pages.length}</span>
      <button type="button" aria-label="Следующая страница" disabled={page === pages.length - 1} onClick={() => setPageIndex(page + 1)}><ChevronRight size={16} /></button>
    </div>}
  </>;
}

export default function ReceiptModal({ receiptUrl, title = 'Чек платежа', subtitle, pdf = isPdfReceipt(receiptUrl), paymentId, canEdit = false, onClose, onSaved }: Props) {
  const [payment, setPayment] = useState<FamilyPayment | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!paymentId) return;
    let current = true;
    fetchFamilyPayment(paymentId).then(value => { if (current) setPayment(value); }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить платёж'); });
    return () => { current = false; };
  }, [paymentId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const change = (key: keyof FamilyPayment, value: string) => {
    setSaved(false);
    setPayment(previous => previous ? { ...previous, [key]: value } : previous);
  };
  const field = (key: keyof FamilyPayment, label: string, type = 'text') => <label>{label}<input type={type} value={String(payment?.[key] ?? '')} onChange={event => change(key, event.target.value)} disabled={!canEdit || saving} maxLength={key === 'receiptCardLast4' ? 4 : undefined} inputMode={key === 'receiptCardLast4' ? 'numeric' : undefined} step={type === 'time' ? 1 : undefined}/></label>;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentId || !payment || !canEdit || saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateFamilyPayment(paymentId, {
        receiptCode: payment.receiptCode ?? '', receiptBank: payment.receiptBank ?? '',
        receiptTime: payment.receiptTime ?? '', receiptCardLast4: payment.receiptCardLast4 ?? '',
        paymentDate: payment.paymentDate.slice(0, 10), paymentOrderNumber: payment.paymentOrderNumber ?? '', comment: payment.comment ?? '',
      });
      const persisted = await fetchFamilyPayment(paymentId);
      setPayment(persisted); onSaved?.(persisted); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить платёж'); }
    finally { setSaving(false); }
  }
  // Окно открывается из ячеек таблиц: события не должны доходить до строки и открывать карточку.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return createPortal(<div className="ow-overlay receipt-modal-overlay" onClick={stop} onDoubleClick={stop} onKeyDown={stop} onContextMenu={stop} onMouseDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <section className={`ow-modal receipt-modal${paymentId ? '' : ' is-view-only'}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="receipt-modal-document"><ReceiptDocument key={receiptUrl} url={receiptUrl} pdf={pdf} /></div>
      {paymentId && <div className="receipt-modal-side">
        <header><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><button type="button" aria-label="Закрыть просмотр чека" onClick={onClose}><X size={18}/></button></header>
        {!payment && !error && <p role="status" className="receipt-modal-note">Загрузка реквизитов…</p>}
        {payment && <form onSubmit={save}>
          <div className="receipt-modal-summary">Сумма: <strong>{payment.amount.toLocaleString('ru-RU')} сом</strong> · {payment.status}</div>
          <div className="receipt-modal-fields">
            {field('paymentDate', 'Дата операции', 'date')}
            {field('receiptTime', 'Время операции', 'time')}
            {field('receiptBank', 'Банк отправителя')}
            {field('receiptCardLast4', 'Последние 4 цифры карты')}
            {field('receiptCode', 'Код чека')}
            {field('paymentOrderNumber', '№ платёжного поручения')}
            <label className="receipt-modal-comment">Комментарий<textarea value={payment.comment ?? ''} onChange={event => change('comment', event.target.value)} disabled={!canEdit || saving}/></label>
          </div>
          {canEdit && <button className="receipt-modal-save" disabled={saving} type="submit">{saving ? 'Сохранение…' : 'Сохранить изменения'}</button>}
          {saved && <p role="status" className="receipt-modal-note">Изменения сохранены</p>}
        </form>}
        {error && <p className="receipt-modal-error" role="alert">{error}</p>}
      </div>}
      {!paymentId && <button type="button" className="receipt-modal-close" aria-label="Закрыть просмотр чека" onClick={onClose}><X size={18}/></button>}
    </section>
  </div>, document.body);
}
