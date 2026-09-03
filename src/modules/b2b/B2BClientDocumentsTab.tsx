import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Download, File, FileCheck2, FileText, Image, LoaderCircle, Paperclip, Trash2 } from 'lucide-react';
import { addB2BAttachment, B2BAttachment, deleteB2BAttachment, downloadB2BAttachment, listB2BAttachments } from '../../services/b2bAttachmentService';
import { B2BOrderRecord } from '../../services/b2bDataService';
import { downloadB2BGeneratedDocument } from '../../services/b2bDocumentService';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

export default function B2BClientDocumentsTab({ orders }: { orders: B2BOrderRecord[] }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '');
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

  if (!order) return <div className="b2b-client-tab-empty"><FileText size={28} /><strong>Документов пока нет</strong><span>Счёт, акт и вложения появятся после создания заказа.</span></div>;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const oversized = files.find(file => file.size > MAX_FILE_SIZE);
    if (oversized) return setError(`Файл «${oversized.name}» больше 20 МБ.`);
    setUploading(true); setError('');
    try { for (const file of files) await addB2BAttachment(order.id, file); await refresh(order.id); }
    catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Не удалось прикрепить файл.'); }
    finally { setUploading(false); }
  };

  const remove = async (attachment: B2BAttachment) => {
    if (!window.confirm(`Удалить файл «${attachment.fileName}»?`)) return;
    try { await deleteB2BAttachment(attachment.id); await refresh(order.id); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : 'Не удалось удалить файл.'); }
  };

  return <div className="b2b-client-documents-tab">
    <div className="b2b-client-document-toolbar"><label><span>Заказ</span><select value={order.id} onChange={event => setOrderId(event.target.value)}>{orders.map(item => <option key={item.id} value={item.id}>{item.number} · {item.routeFrom} → {item.routeTo}</option>)}</select></label><strong>{order.total.toLocaleString()} сом</strong></div>
    <div className="b2b-client-generated-docs"><button type="button" onClick={() => void downloadB2BGeneratedDocument('invoice', order)}><FileText size={19} /><span><small>PDF</small><b>Счёт на оплату</b></span><Download size={15} /></button><button type="button" onClick={() => void downloadB2BGeneratedDocument('act', order)}><FileCheck2 size={19} /><span><small>PDF</small><b>Акт выполненных услуг</b></span><Download size={15} /></button></div>
    <div className="b2b-client-attachments-head"><div><strong>Вложения к заказу</strong><span>Заявки, договоры, чеки и другие файлы</span></div><input ref={inputRef} hidden type="file" multiple onChange={upload} /><button className="b2b-secondary-button" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="spin" size={15} /> : <Paperclip size={15} />}{uploading ? 'Загрузка…' : 'Добавить вложение'}</button></div>
    {error && <div className="b2b-form-error">{error}</div>}
    {loading ? <div className="b2b-client-attachment-empty"><LoaderCircle className="spin" size={20} />Загрузка…</div> : attachments.length ? <div className="b2b-client-attachment-list">{attachments.map(attachment => { const Icon = attachment.contentType.startsWith('image/') ? Image : attachment.contentType.includes('pdf') ? FileText : File; return <article key={attachment.id}><span><Icon size={17} /></span><div><strong>{attachment.fileName}</strong><small>{sizeLabel(attachment.fileSize)} · {new Date(attachment.createdAt).toLocaleDateString('ru-RU')}</small></div><button type="button" onClick={() => void downloadB2BAttachment(attachment)} title="Скачать"><Download size={15} /></button><button className="delete" type="button" onClick={() => void remove(attachment)} title="Удалить"><Trash2 size={15} /></button></article>; })}</div> : <div className="b2b-client-attachment-empty"><Paperclip size={22} /><strong>Вложений пока нет</strong><span>Добавьте файлы к выбранному заказу.</span></div>}
  </div>;
}
