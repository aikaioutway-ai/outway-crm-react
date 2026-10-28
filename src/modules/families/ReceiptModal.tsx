import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, X } from 'lucide-react';
import { FamilyPayment } from '../../types';
import { fetchFamilyChildNames, fetchFamilyPayment, updateFamilyPayment } from '../../services/financeService';
import { receiptDownloadName } from './receiptFileName';
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

function receiptFileName(url: string): string {
  const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() ?? '');
  return name || 'receipt';
}

// Хранилище отдаёт файл «на скачивание» по параметру download; локальный blob: скачивается атрибутом ссылки.
function receiptDownloadUrl(url: string, fileName: string): string {
  if (url.startsWith('blob:')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;
}

function ReceiptActions({ url, fileName = receiptFileName(url) }: { url: string; fileName?: string }) {
  return <>
    <a href={receiptDownloadUrl(url, fileName)} download={fileName} aria-label="Скачать чек" title="Скачать"><Download size={17}/></a>
    <a href={url} target="_blank" rel="noreferrer" aria-label="Открыть чек в новой вкладке" title="Открыть в новой вкладке"><ExternalLink size={17}/></a>
  </>;
}

function ReceiptDocument({ url, pdf }: { url: string; pdf: boolean }) {
  if (!pdf) return <img src={url} alt="Чек платежа" />;
  const source = `${url.split('#')[0]}#view=Fit&toolbar=0&navpanes=0`;
  return <iframe className="receipt-modal-pdf" src={source} title="PDF-чек платежа" />;
}

export default function ReceiptModal({ receiptUrl, title = 'Чек платежа', subtitle, pdf = isPdfReceipt(receiptUrl), paymentId, canEdit = false, onClose, onSaved }: Props) {
  const [payment, setPayment] = useState<FamilyPayment | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [childNames, setChildNames] = useState<string[]>([]);
  useEffect(() => {
    if (!paymentId) return;
    let current = true;
    fetchFamilyPayment(paymentId).then(value => {
      if (!current) return;
      setPayment(value);
      fetchFamilyChildNames(value.familyId).then(names => { if (current) setChildNames(names); }).catch(() => { /* без имён останется исходное название файла */ });
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить платёж'); });
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
        <header><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><div className="receipt-modal-actions"><ReceiptActions url={receiptUrl} fileName={payment ? receiptDownloadName({ childNames, parentName: subtitle, amount: payment.amount, originalName: receiptFileName(receiptUrl) }) : undefined}/><button type="button" aria-label="Закрыть просмотр чека" onClick={onClose}><X size={18}/></button></div></header>
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
      {!paymentId && <div className="receipt-modal-actions receipt-modal-close"><ReceiptActions url={receiptUrl}/><button type="button" aria-label="Закрыть просмотр чека" onClick={onClose}><X size={18}/></button></div>}
    </section>
  </div>, document.body);
}
