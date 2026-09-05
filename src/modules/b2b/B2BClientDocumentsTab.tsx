import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Download, File, FileCheck2, FileText, Image, LoaderCircle, Paperclip, Scale, Trash2 } from 'lucide-react';
import { addB2BAttachment, B2BAttachment, deleteB2BAttachment, downloadB2BAttachment, listB2BAttachments } from '../../services/b2bAttachmentService';
import { B2BClientRecord, B2BOrderRecord } from '../../services/b2bDataService';
import { B2BPaymentRecord, formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { B2BReconciliationTransaction, downloadB2BGeneratedDocument, downloadB2BReconciliation } from '../../services/b2bDocumentService';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
const money = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
const localDateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = new Date();
const TODAY = localDateInput(today);
const YEAR_START = `${today.getFullYear()}-01-01`;

function isoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

interface B2BClientDocumentsTabProps {
  client: B2BClientRecord;
  orders: B2BOrderRecord[];
  payments: B2BPaymentRecord[];
  onOpenOrder?: (orderId: string) => void;
}

export default function B2BClientDocumentsTab({ client, orders, payments, onOpenOrder }: B2BClientDocumentsTabProps) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '');
  const [dateFrom, setDateFrom] = useState(YEAR_START);
  const [dateTo, setDateTo] = useState(TODAY);
  const [attachments, setAttachments] = useState<B2BAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const order = orders.find(item => item.id === orderId) ?? orders[0];

  const refresh = async (selectedOrderId: string) => {
    if (!selectedOrderId) return setAttachments([]);
    setLoading(true);
    try { setAttachments(await listB2BAttachments(selectedOrderId)); setError(''); }
    catch (refreshError) { setError(refreshError instanceof Error ? refreshError.message : 'Не удалось загрузить вложения.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (order?.id) void refresh(order.id); }, [order?.id]);

  const reconciliation = useMemo(() => {
    const accountingOrders = orders
      .filter(item => item.status !== 'cancelled')
      .map(item => ({ item, date: isoDate(item.departureDate || item.requestDate) }))
      .filter(entry => entry.date);
    const confirmedPayments = payments
      .filter(payment => payment.status === 'confirmed')
      .map(payment => ({ payment, date: isoDate(payment.paymentDate) }))
      .filter(entry => entry.date);
    const openingDebit = accountingOrders.filter(entry => entry.date < dateFrom).reduce((sum, entry) => sum + entry.item.total, 0);
    const openingCredit = confirmedPayments.filter(entry => entry.date < dateFrom).reduce((sum, entry) => sum + entry.payment.amount, 0);
    const openingBalance = openingDebit - openingCredit;
    const rawTransactions = [
      ...accountingOrders.filter(entry => entry.date >= dateFrom && entry.date <= dateTo).map(entry => ({
        date: entry.date, sort: 0, orderId: entry.item.id, document: entry.item.number,
        description: `Транспортные услуги: ${entry.item.routeFrom} → ${entry.item.routeTo}`,
        debit: entry.item.total, credit: 0,
      })),
      ...confirmedPayments.filter(entry => entry.date >= dateFrom && entry.date <= dateTo).map(entry => ({
        date: entry.date, sort: 1, orderId: entry.payment.orderId, document: `Оплата · ${entry.payment.orderNumber}`,
        description: `${formatB2BPaymentMethod(entry.payment.method)}${entry.payment.comment ? ` · ${entry.payment.comment}` : ''}`,
        debit: 0, credit: entry.payment.amount,
      })),
    ].sort((left, right) => left.date.localeCompare(right.date) || left.sort - right.sort);
    let balance = openingBalance;
    const transactions: Array<B2BReconciliationTransaction & { orderId: string }> = rawTransactions.map(transaction => {
      balance += transaction.debit - transaction.credit;
      return { ...transaction, balance };
    });
    const debitTotal = transactions.reduce((sum, transaction) => sum + transaction.debit, 0);
    const creditTotal = transactions.reduce((sum, transaction) => sum + transaction.credit, 0);
    return { openingBalance, debitTotal, creditTotal, closingBalance: openingBalance + debitTotal - creditTotal, transactions };
  }, [dateFrom, dateTo, orders, payments]);

  const reconciliationDocument = {
    clientName: client.orgName || client.companyName || client.contactName,
    clientInn: client.inn,
    clientAddress: client.legalAddress,
    dateFrom,
    dateTo,
    ...reconciliation,
  };

  const setCurrentMonth = () => {
    setDateFrom(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`);
    setDateTo(TODAY);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || !order) return;
    const oversized = files.find(file => file.size > MAX_FILE_SIZE);
    if (oversized) return setError(`Файл «${oversized.name}» больше 20 МБ.`);
    setUploading(true); setError('');
    try { for (const file of files) await addB2BAttachment(order.id, file); await refresh(order.id); }
    catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Не удалось прикрепить файл.'); }
    finally { setUploading(false); }
  };

  const remove = async (attachment: B2BAttachment) => {
    if (!order || !window.confirm(`Удалить файл «${attachment.fileName}»?`)) return;
    try { await deleteB2BAttachment(attachment.id); await refresh(order.id); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : 'Не удалось удалить файл.'); }
  };

  return <div className="b2b-client-documents-tab">
    <section className="b2b-reconciliation-card">
      <div className="b2b-reconciliation-head"><div><span><Scale size={19} /></span><div><strong>Акт сверки</strong><small>Взаиморасчёты с клиентом за выбранный период</small></div></div><button type="button" className="b2b-primary-button" disabled={dateFrom > dateTo} onClick={() => void downloadB2BReconciliation(reconciliationDocument)}><Download size={15} />Скачать PDF</button></div>
      <div className="b2b-reconciliation-period">
        <CalendarRange size={18} />
        <label><span>С даты</span><input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
        <label><span>По дату</span><input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
        <div><button type="button" onClick={setCurrentMonth}>Текущий месяц</button><button type="button" onClick={() => { setDateFrom(YEAR_START); setDateTo(TODAY); }}>Текущий год</button></div>
      </div>
      {dateFrom > dateTo ? <div className="b2b-form-error">Начальная дата не может быть позже конечной.</div> : <>
        <div className="b2b-reconciliation-summary"><article><span>Сальдо на начало</span><strong>{money(reconciliation.openingBalance)}</strong></article><article className="debit"><span>Начислено</span><strong>{money(reconciliation.debitTotal)}</strong></article><article className="credit"><span>Оплачено</span><strong>{money(reconciliation.creditTotal)}</strong></article><article className={reconciliation.closingBalance > 0 ? 'debt' : 'closing'}><span>Сальдо на конец</span><strong>{money(reconciliation.closingBalance)}</strong></article></div>
        <div className="b2b-reconciliation-table-wrap"><table className="b2b-reconciliation-table"><thead><tr><th>Дата</th><th>Документ</th><th>Операция</th><th className="number">Начислено</th><th className="number">Оплачено</th><th className="number">Сальдо</th></tr></thead><tbody><tr className="opening"><td colSpan={5}>Сальдо на начало периода</td><td className="number">{money(reconciliation.openingBalance)}</td></tr>{reconciliation.transactions.map((transaction, index) => <tr key={`${transaction.date}-${transaction.document}-${index}`}><td>{displayDate(transaction.date)}</td><td><button type="button" className="b2b-client-order-link" onClick={() => onOpenOrder?.(transaction.orderId)}>{transaction.document}</button></td><td>{transaction.description}</td><td className="number debit">{transaction.debit ? money(transaction.debit) : '—'}</td><td className="number credit">{transaction.credit ? money(transaction.credit) : '—'}</td><td className="number balance">{money(transaction.balance)}</td></tr>)}{!reconciliation.transactions.length && <tr><td colSpan={6} className="empty">За выбранный период операций нет</td></tr>}</tbody></table></div>
      </>}
    </section>

    {order ? <>
      <div className="b2b-client-document-toolbar"><label><span>Документы по заказу</span><select value={order.id} onChange={event => setOrderId(event.target.value)}>{orders.map(item => <option key={item.id} value={item.id}>{item.number} · {item.routeFrom} → {item.routeTo}</option>)}</select></label><strong>{order.total.toLocaleString()} сом</strong></div>
      <div className="b2b-client-generated-docs"><button type="button" onClick={() => void downloadB2BGeneratedDocument('invoice', order)}><FileText size={19} /><span><small>PDF</small><b>Счёт на оплату</b></span><Download size={15} /></button><button type="button" onClick={() => void downloadB2BGeneratedDocument('act', order)}><FileCheck2 size={19} /><span><small>PDF</small><b>Акт выполненных услуг</b></span><Download size={15} /></button></div>
      <div className="b2b-client-attachments-head"><div><strong>Вложения к заказу</strong><span>Заявки, договоры, чеки и другие файлы</span></div><input ref={inputRef} hidden type="file" multiple onChange={upload} /><button className="b2b-secondary-button" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="spin" size={15} /> : <Paperclip size={15} />}{uploading ? 'Загрузка…' : 'Добавить вложение'}</button></div>
      {error && <div className="b2b-form-error">{error}</div>}
      {loading ? <div className="b2b-client-attachment-empty"><LoaderCircle className="spin" size={20} />Загрузка…</div> : attachments.length ? <div className="b2b-client-attachment-list">{attachments.map(attachment => { const Icon = attachment.contentType.startsWith('image/') ? Image : attachment.contentType.includes('pdf') ? FileText : File; return <article key={attachment.id}><span><Icon size={17} /></span><div><strong>{attachment.fileName}</strong><small>{sizeLabel(attachment.fileSize)} · {new Date(attachment.createdAt).toLocaleDateString('ru-RU')}</small></div><button type="button" onClick={() => void downloadB2BAttachment(attachment)} title="Скачать"><Download size={15} /></button><button className="delete" type="button" onClick={() => void remove(attachment)} title="Удалить"><Trash2 size={15} /></button></article>; })}</div> : <div className="b2b-client-attachment-empty"><Paperclip size={22} /><strong>Вложений пока нет</strong><span>Добавьте файлы к выбранному заказу.</span></div>}
    </> : <div className="b2b-client-tab-empty compact"><FileText size={28} /><strong>Документов по заказам пока нет</strong><span>Счёт, акт выполненных услуг и вложения появятся после создания заказа.</span></div>}
  </div>;
}
