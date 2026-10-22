import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { iconButtonStyle, noteStyle, overlayStyle, panelStyle, secondaryButtonStyle } from './ChildDiscountModal';

export interface AccrualDialogState {
  title: string;
  message: string;
  /** Без confirmLabel окно только сообщает (результат или ошибка). */
  confirmLabel?: string;
  /** Поле суммы в окне (например, «Поставить сумму выбранным»); его значение уходит в onConfirm. */
  amountInput?: { label: string };
  /** Действие после подтверждения; возвращённый текст показывается как результат. */
  onConfirm?: (amountText: string) => Promise<string | void>;
}

/** Окно CRM вместо window.confirm/alert: встроенный браузер может их молча блокировать. */
export default function AccrualDialog({ dialog, onClose }: { dialog: AccrualDialogState; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [amountText, setAmountText] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Окно открывается по Enter из ячейки таблицы. Фокус ставим на само окно, а не на кнопку,
  // иначе тот же Enter сразу «нажмёт» её. Подтверждение — только кликом, Esc закрывает.
  // Окно с полем суммы открывается кнопкой, там фокус сразу в поле.
  useEffect(() => { (amountRef.current ?? panelRef.current)?.focus(); }, []);

  async function confirm() {
    if (!dialog.onConfirm) return;
    setError('');
    setRunning(true);
    try {
      const text = await dialog.onConfirm(amountText);
      if (text) setResult(text);
      else onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Не удалось выполнить действие');
    } finally {
      setRunning(false);
    }
  }

  const done = !dialog.confirmLabel || Boolean(result);
  return (
    <div className="ow-overlay" style={overlayStyle} onClick={running ? undefined : onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ow-modal"
        style={{ ...panelStyle, outline: 'none' }}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => { if (event.key === 'Escape' && !running) onClose(); }}
        role="dialog"
        aria-label={dialog.title}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{dialog.title}</div>
          <button type="button" onClick={onClose} disabled={running} style={iconButtonStyle} aria-label="Закрыть"><X size={16} /></button>
        </div>

        <div style={{ ...noteStyle, whiteSpace: 'pre-line' }}>{result || dialog.message}</div>

        {dialog.amountInput && !result && (
          <label style={{ display: 'grid', gap: 4, marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            {dialog.amountInput.label}
            <input
              ref={amountRef}
              inputMode="decimal"
              value={amountText}
              disabled={running}
              onChange={event => setAmountText(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !running) confirm(); }}
              style={{ height: 32, border: '1px solid #DDE9EC', borderRadius: 8, padding: '0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text)', outline: 'none' }}
            />
          </label>
        )}

        {error && <div style={{ color: '#B91C1C', fontSize: 12, fontWeight: 600, margin: '10px 0 0' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          {done ? (
            <button type="button" onClick={onClose} style={{ ...secondaryButtonStyle, background: '#1A7F80', color: '#fff', border: 'none' }}>Готово</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={running} style={{ ...secondaryButtonStyle, color: 'var(--text)' }}>Отмена</button>
              <button type="button" onClick={confirm} disabled={running} style={{ ...secondaryButtonStyle, background: '#1A7F80', color: '#fff', border: 'none' }}>
                {running ? 'Выполняем...' : dialog.confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
