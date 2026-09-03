import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Download, File, FileCheck2, FileText, Image, LoaderCircle, Paperclip, ReceiptText, Trash2 } from 'lucide-react';
import { addB2BAttachment, B2BAttachment, deleteB2BAttachment, downloadB2BAttachment, listB2BAttachments } from '../../services/b2bAttachmentService';
import { B2BDocumentOrder, downloadB2BGeneratedDocument, generatedDocumentNumber } from '../../services/b2bDocumentService';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function AttachmentIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith('image/')) return <Image size={18} />;
  if (contentType.includes('pdf')) return <FileText size={18} />;
  return <File size={18} />;
}

export default function B2BOrderDocuments({ order }: { order: B2BDocumentOrder & { id: string } }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<B2BAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setAttachments(await listB2BAttachments(order.id)); }
    catch { setError('Не удалось загрузить вложения.'); }
    finally { setLoading(false); }
  }, [order.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const oversized = files.find(file => file.size > MAX_FILE_SIZE);
    if (oversized) {
      setError(`Файл «${oversized.name}» больше 20 МБ.`);
      event.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      for (const file of files) await addB2BAttachment(order.id, file);
      await refresh();
    } catch {
      setError('Не удалось прикрепить файл.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const remove = async (attachment: B2BAttachment) => {
    if (!window.confirm(`Удалить файл «${attachment.fileName}»?`)) return;
    await deleteB2BAttachment(attachment.id);
    await refresh();
  };

  return (
    <div className="b2b-documents-panel">
      <div className="b2b-generated-documents">
        <article>
          <span className="invoice"><ReceiptText size={21} /></span>
          <div><small>Создан автоматически</small><strong>Счёт на оплату</strong><p>№ {generatedDocumentNumber('invoice', order.number)} · {order.total.toLocaleString()} сом</p></div>
          <button type="button" onClick={() => downloadB2BGeneratedDocument('invoice', order)}><Download size={15} /> Скачать PDF</button>
        </article>
        <article>
          <span className="act"><FileCheck2 size={21} /></span>
          <div><small>Создан автоматически</small><strong>Акт выполненных услуг</strong><p>№ {generatedDocumentNumber('act', order.number)} · {order.total.toLocaleString()} сом</p></div>
          <button type="button" onClick={() => downloadB2BGeneratedDocument('act', order)}><Download size={15} /> Скачать PDF</button>
        </article>
      </div>

      <div className="b2b-attachments-head">
        <div><strong>Другие вложения</strong><span>Договоры, заявки, чеки, фотографии и другие файлы</span></div>
        <input ref={inputRef} hidden type="file" multiple onChange={upload} />
        <button className="b2b-secondary-button" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="spin" size={16} /> : <Paperclip size={16} />}{uploading ? 'Загрузка...' : 'Прикрепить файлы'}</button>
      </div>

      {error && <div className="b2b-form-error">{error}</div>}
      {loading ? <div className="b2b-attachments-empty"><LoaderCircle className="spin" size={22} /> Загрузка вложений...</div> : attachments.length === 0 ? (
        <div className="b2b-attachments-empty"><Paperclip size={23} /><strong>Вложений пока нет</strong><span>Можно добавить несколько файлов размером до 20 МБ каждый.</span></div>
      ) : (
        <div className="b2b-attachments-list">{attachments.map(attachment => (
          <div key={attachment.id}>
            <span className="file-icon"><AttachmentIcon contentType={attachment.contentType} /></span>
            <div><strong title={attachment.fileName}>{attachment.fileName}</strong><span>{fileSize(attachment.fileSize)} · {new Date(attachment.createdAt).toLocaleDateString('ru-RU')}</span></div>
            <button type="button" onClick={() => void downloadB2BAttachment(attachment)} aria-label={`Скачать ${attachment.fileName}`}><Download size={15} /></button>
            <button className="delete" type="button" onClick={() => remove(attachment)} aria-label={`Удалить ${attachment.fileName}`}><Trash2 size={15} /></button>
          </div>
        ))}</div>
      )}
    </div>
  );
}
