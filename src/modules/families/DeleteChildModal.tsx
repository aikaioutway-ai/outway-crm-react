import { useState } from 'react';
import { X } from 'lucide-react';
import { iconButtonStyle, inputStyle, labelStyle, noteStyle, overlayStyle, panelStyle, secondaryButtonStyle } from './ChildDiscountModal';

/** Удаление ребёнка администратором: запись уходит из CRM, копия остаётся в истории базы. */
export default function DeleteChildModal({ childName, familyId, onClose, onDelete }: {
  childName: string;
  familyId: string;
  onClose: () => void;
  onDelete: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!reason.trim()) {
      setError('Укажите причину');
      return;
    }
    setDeleting(true);
    try {
      await onDelete(reason.trim());
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="ow-overlay" style={overlayStyle} onClick={onClose}>
      <div className="ow-modal" style={panelStyle} onClick={event => event.stopPropagation()} role="dialog" aria-label="Удалить ребёнка">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Удалить из CRM</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{childName || 'Без имени'} · {familyId}</div>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Закрыть"><X size={16} /></button>
        </div>

        <div style={noteStyle}>
          Запись исчезнет из CRM, но копия останется в истории базы. Если ребёнок последний в семье — семья тоже уйдёт из CRM.
        </div>

        <label style={labelStyle}>Причина
          <textarea
            autoFocus
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={2}
            placeholder="Например: дубль FAM-001958"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        {error && <div style={{ color: '#B91C1C', fontSize: 12, fontWeight: 600, margin: '10px 0 0' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={deleting} style={{ ...secondaryButtonStyle, color: 'var(--text)' }}>Отмена</button>
          <button type="button" onClick={submit} disabled={deleting} style={{ ...secondaryButtonStyle, background: '#B91C1C', color: '#fff', border: 'none' }}>
            {deleting ? 'Удаляем...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}
