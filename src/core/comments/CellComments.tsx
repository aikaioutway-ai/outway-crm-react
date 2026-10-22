import { createCommentRequestId } from './commentRequestId';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Pencil, Trash2, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addCellComment, callCellComments, mutateCellComment, readCellComments } from '../../services/cellCommentService';
import { CellTarget, cellTargetFromElement, cellTargetKey } from './commentIdentity';
import './CellComments.css';

type Selection = { target: CellTarget; label: string };
export default function CellComments({ token }: { token?: string }) {
  const [hover, setHover] = useState<(Selection & { top: number; left: number }) | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => { setSelected(null); setHover(null); }, [token]);
  useEffect(() => {
    if (!token) return;
    const show = (event: MouseEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (!element || element.closest('.cell-comment-trigger')) return;
      const hit = cellTargetFromElement(element);
      if (!hit) { setHover(null); return; }
      const cell = element.closest<HTMLElement>('td, [data-comment-cell]')!;
      const rect = cell.getBoundingClientRect();
      trigger.current = cell;
      setHover({ ...hit, top: Math.max(4, rect.top + (rect.height - 22) / 2), left: Math.min(window.innerWidth - 32, rect.right - 28) });
    };
    const clear = () => setHover(null);
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey && event.key === 'Enter' && event.target instanceof HTMLElement) {
        const hit = cellTargetFromElement(event.target);
        if (hit) { event.preventDefault(); event.stopPropagation(); trigger.current = event.target; setSelected(hit); setHover(null); }
      }
    };
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('mouseover', show);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => { document.removeEventListener('keydown', keyboard, true); document.removeEventListener('mouseover', show); window.removeEventListener('scroll', clear, true); window.removeEventListener('resize', clear); };
  }, [token]);
  // One batched request for visible identities, including portalled record cards.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let request = 0;
    let controller: Promise<unknown> | undefined;
    const scan = async () => {
      const version = ++request;
      const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-comment-table] td, [data-comment-table] [data-comment-cell]')).filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      });
      const targets = new Map<string, CellTarget>();
      elements.forEach(element => { const hit = cellTargetFromElement(element); if (hit) targets.set(cellTargetKey(hit.target), hit.target); });
      const entries = Array.from(targets.values());
      const counts: Record<string, number> = {};
      try {
        for (let offset = 0; offset < entries.length; offset += 200) {
          if (cancelled || version !== request) return;
          const result = await callCellComments<{ counts: Record<string, number> }>(token, { action: 'counts', targets: entries.slice(offset, offset + 200) });
          Object.assign(counts, result.counts);
        }
        if (cancelled || version !== request) return;
        observer.disconnect();
        elements.forEach(element => {
          const hit = cellTargetFromElement(element);
          const count = hit && counts[cellTargetKey(hit.target)];
          element.classList.toggle('cell-has-comments', Boolean(count));
          if (hit) { element.tabIndex = 0; element.setAttribute('aria-keyshortcuts', 'Alt+Enter'); if (!element.title) element.title = 'Alt+Enter — комментарии к ячейке'; }
          element.setAttribute('aria-description', count ? `Комментариев: ${count}. Alt+Enter — открыть` : 'Alt+Enter — добавить комментарий');
          if (count) element.dataset.commentCount = String(count); else delete element.dataset.commentCount;
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-comment-context', 'data-comment-row'] });
      } catch { /* The discussion shows actionable errors; table data remains usable. */ }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { controller = scan(); }, 350); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-comment-context', 'data-comment-row'] });
    schedule();
    const interval = setInterval(schedule, 60000);
    window.addEventListener('cell-comments-changed', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(interval); observer.disconnect(); window.removeEventListener('cell-comments-changed', schedule); window.removeEventListener('scroll', schedule, true); void controller; };
  }, [token]);
  return token ? createPortal(<>
    {hover && !selected && <button type="button" className="cell-comment-trigger" style={{ top: hover.top, left: hover.left }} title="Комментарии к ячейке" aria-label={`Комментарии: ${hover.label}`} onClick={event => { event.stopPropagation(); setSelected(hover); setHover(null); }}><MessageSquare size={15}/></button>}
    {selected && <CommentDiscussion key={cellTargetKey(selected.target)} token={token} selection={selected} onClose={() => { setSelected(null); trigger.current?.focus(); }}/>}
  </>, document.body) : null;
}

function CommentDiscussion({ token, selection, onClose }: { token: string; selection: Selection; onClose: () => void }) {
  const client = useQueryClient();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requestId = useRef(createCommentRequestId());
  const input = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const key = ['cell-comments', token, cellTargetKey(selection.target)];
  const query = useQuery({ queryKey: key, queryFn: () => readCellComments(token, selection.target), refetchInterval: 30000, retry: 1 });
  const [older, setOlder] = useState<Awaited<ReturnType<typeof readCellComments>> | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const comments = [...(query.data?.comments || []), ...(older?.comments || [])];
  const mutate = async (comment: (typeof comments)[number], action: 'edit' | 'delete') => {
    if (sending) return;
    setSending(true); setError('');
    try {
      const result = await mutateCellComment(token, selection.target, comment, action, action === 'edit' ? editBody.trim() : undefined);
      setEditingId(null); setDeletingId(null);
      setOlder(current => current ? { ...current, comments: action === 'delete' ? current.comments.filter(item => item.id !== comment.id) : current.comments.map(item => item.id === comment.id ? result.comment || item : item) } : null);
      await client.invalidateQueries({queryKey: key});
      window.dispatchEvent(new Event('cell-comments-changed'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось изменить комментарий'); }
    finally { setSending(false); }
  };
  useEffect(() => { input.current?.focus(); }, []);
  const submit = async () => {
    if (!body.trim() || sending) return;
    setSending(true); setError('');
    try {
      await addCellComment(token, selection.target, body.trim(), requestId.current);
      requestId.current = createCommentRequestId(); setBody('');
      await client.invalidateQueries({ queryKey: key });
      window.dispatchEvent(new Event('cell-comments-changed'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось отправить комментарий'); }
    finally { setSending(false); input.current?.focus(); }
  };
  return <div className="cell-comment-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !sending) onClose(); }}>
    <div ref={dialog} className="cell-comment-dialog" role="dialog" aria-modal="true" aria-labelledby="cell-comment-title" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape' && !sending) onClose();
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><div><h2 id="cell-comment-title">Комментарии</h2><p>{selection.label}</p></div><button type="button" aria-label="Закрыть комментарии" disabled={sending} onClick={onClose}><X size={19}/></button></header>
      <div className="cell-comment-messages" aria-live="polite">
        {query.isPending && <p>Загрузка комментариев…</p>}
        {query.error && <div role="alert">{query.error.message}<button type="button" onClick={() => void query.refetch()}>Повторить</button></div>}
        {query.data && !comments.length && <p className="cell-comment-empty">Пока нет комментариев. Начните обсуждение этой ячейки.</p>}
        {comments.map(comment => <article key={comment.id}>
          <div><strong>{comment.author_name}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString('ru-RU')}</time></div>
          {editingId === comment.id ? <div className="cell-comment-editor"><textarea autoFocus aria-label="Изменить комментарий" value={editBody} maxLength={5000} disabled={sending} onChange={event => setEditBody(event.target.value)}/><button type="button" disabled={sending || !editBody.trim()} onClick={() => void mutate(comment,'edit')}>Сохранить</button><button type="button" disabled={sending} onClick={() => setEditingId(null)}>Отмена</button></div> : <p>{comment.body}</p>}
          {comment.can_edit && editingId !== comment.id && <div className="cell-comment-actions">
            {deletingId === comment.id ? <><span>Удалить комментарий?</span><button type="button" disabled={sending} onClick={() => void mutate(comment,'delete')}>Да, удалить</button><button type="button" disabled={sending} onClick={() => setDeletingId(null)}>Отмена</button></> : <><button type="button" disabled={sending} aria-label="Редактировать комментарий" onClick={() => {setEditingId(comment.id); setEditBody(comment.body); setDeletingId(null);}}><Pencil size={12}/>Изменить</button><button type="button" disabled={sending} aria-label="Удалить комментарий" onClick={() => {setDeletingId(comment.id);setEditingId(null);}}><Trash2 size={12}/>Удалить</button></>}
          </div>}
        </article>)}
        {(older?.hasMore ?? query.data?.hasMore) && <button type="button" disabled={loadingOlder} onClick={async () => {
          setLoadingOlder(true);
          try { const page = await readCellComments(token, selection.target, `${comments[comments.length - 1]?.created_at}|${comments[comments.length - 1]?.id}`); setOlder(current => ({ comments: [...(current?.comments || []), ...page.comments], hasMore: page.hasMore })); }
          catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить историю'); }
          finally { setLoadingOlder(false); }
        }}>Ранее</button>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <textarea ref={input} aria-label="Комментарий к ячейке" placeholder="Напишите комментарий…" maxLength={5000} value={body} disabled={sending || !query.data} onChange={event => { setBody(event.target.value); requestId.current = createCommentRequestId(); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit(); } }}/>
        {error && <p role="alert" className="cell-comment-error">{error}</p>}
        <button className="cell-comment-send" type="submit" disabled={sending || !query.data || !body.trim()}>{sending ? 'Отправка…' : 'Отправить'}</button>
      </form>
    </div>
  </div>;
}
