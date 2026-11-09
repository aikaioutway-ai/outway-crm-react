import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface Props { question: string; childName: string; onDone: (comment: string | null) => void; }

function TransferCommentDialog({ question, childName, onDone }: Props) {
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { field.current?.focus(); }, []);
  const submit = () => { if (text.trim()) onDone(text.trim()); };
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onDone(null); }}
      style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15, 23, 42, .4)' }}>
      <form role="dialog" aria-modal="true" aria-labelledby="transfer-comment-title"
        onSubmit={event => { event.preventDefault(); submit(); }}
        onKeyDown={event => { if (event.key === 'Escape') onDone(null); }}
        style={{ width: 'min(440px, 100%)', boxSizing: 'border-box', background: 'var(--surface, #fff)', color: 'var(--text, #17222f)', border: '1px solid var(--border, #E1E8EA)', borderRadius: 14, padding: 22, boxShadow: '0 20px 50px rgba(15, 23, 42, .25)' }}>
        <h2 id="transfer-comment-title" style={{ margin: '0 0 4px', fontSize: 17 }}>{question}</h2>
        {childName && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2, #64748B)' }}>{childName}</p>}
        <label style={{ display: 'block', margin: '16px 0', fontSize: 13, fontWeight: 600 }}>
          Комментарий (обязательно)
          <textarea ref={field} required rows={4} value={text} onChange={event => setText(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }}
            placeholder="Что случилось и что дальше"
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 8, border: '1px solid var(--border, #E1E8EA)', borderRadius: 8, font: 'inherit', fontWeight: 400, background: 'var(--surface, #fff)', color: 'inherit' }} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="ow-btn ow-btn--ghost" onClick={() => onDone(null)}>Отмена</button>
          <button type="submit" className="ow-btn" disabled={!text.trim()}
            style={{ background: 'var(--accent, #2F7D7A)', color: '#fff', borderColor: 'transparent', opacity: text.trim() ? 1 : .5 }}>Сохранить</button>
        </div>
      </form>
    </div>
  );
}

/** Окно обязательного комментария к трансферу. Отмена — null, тогда ничего не сохраняем. */
export function askTransferComment(question: string, childName = ''): Promise<string | null> {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (comment: string | null) => {
      root.unmount();
      host.remove();
      resolve(comment);
    };
    root.render(<TransferCommentDialog question={question} childName={childName} onDone={done} />);
  });
}

/** «Асылбек · 09.11 14:20: текст» — кто и когда оставил комментарий. */
export function formatTransferComment(comment?: string | null, by?: string | null, at?: string | null): string {
  if (!comment) return '';
  const when = at ? new Date(at).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const who = [by, when].filter(Boolean).join(' · ');
  return who ? `${who}: ${comment}` : comment;
}
