import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFamiliesTable } from '../../hooks/useCrmQueries';
import { FamilyListRow, updateV2RequestStage } from '../../services/crmV2Service';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import ManagerPeriodBar from './ManagerPeriodBar';
import { REQUEST_DAY_PERIODS, requestMatchesDay } from './NewRequestsDashboard';
import { isSchoolAllowed } from './constants';
import type { SchoolTier } from './SchoolTierTabs';
import { isRequestOnBoard, requestStage, requestStageUpdates, RequestStage, REQUEST_STAGES, WAITING_REASONS } from './requestWorkflow';
import './SchoolRequestsKanban.css';

export default function SchoolRequestsKanban({ schoolKey, allowedSchools, schoolTier, onOpen }: {
  schoolKey: string; allowedSchools?: string[]; schoolTier: SchoolTier; onOpen: (row: FamilyListRow) => void;
}) {
  const query = useFamiliesTable();
  const [day, setDay] = useState('ALL');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState<FamilyListRow | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (waiting) dialog.current?.showModal(); }, [waiting]);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (query.data ?? []).filter(row => {
      if (seen.has(row.rowId) || !isRequestOnBoard(row) || !isSchoolAllowed(row.branchFilter, allowedSchools, schoolTier) || (schoolKey !== 'ALL' && row.branchFilter !== schoolKey)) return false;
      seen.add(row.rowId);
      return true;
    });
  }, [query.data, schoolKey, allowedSchools, schoolTier]);
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    const now = new Date();
    for (const row of rows) if (requestStage(row) === 'new') for (const period of REQUEST_DAY_PERIODS) {
      if (requestMatchesDay(row.childCreatedAt, period.key, now)) result[period.key] = (result[period.key] ?? 0) + 1;
    }
    return result;
  }, [rows]);
  const visible = rows.filter(row => requestMatchesDay(row.childCreatedAt, day) && `${row.childName} ${row.parentName} ${row.phone}`.toLowerCase().includes(search.toLowerCase().trim()));
  const save = async (row: FamilyListRow, stage: RequestStage, waitingReason = '', waitingComment = '') => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await updateV2RequestStage(row.rowId, row.status, requestStageUpdates(stage, waitingReason, waitingComment));
      await query.refetch();
      setWaiting(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить этап.'); }
    finally { setSaving(false); }
  };
  const move = (row: FamilyListRow, stage: RequestStage) => {
    if (saving || stage === requestStage(row)) return;
    setError('');
    if (stage === 'waiting') { setReason(row.waitingReason ?? ''); setComment(row.waitingComment ?? ''); setWaiting(row); }
    else void save(row, stage);
  };
  return <div className="requests-workspace" aria-busy={saving}>
    <DashboardTopPanel><div className="requests-toolbar">
      <ManagerPeriodBar periodKey={day} onPeriodKeyChange={setDay} periods={REQUEST_DAY_PERIODS} allLabel="Все" useLabels periodCounts={counts} periodTitle={period => period.key === '11' ? 'Старше 10 дней' : `День ${period.label} с создания заявки`} />
      <input className="requests-search" aria-label="Поиск заявок" placeholder="Ребёнок, родитель, телефон" value={search} onChange={event => setSearch(event.target.value)} />
    </div></DashboardTopPanel>
    {error && !waiting && <div role="alert" className="requests-error">{error}</div>}
    {query.isPending ? <p role="status">Загрузка заявок…</p> : query.isError ? <div role="alert">Не удалось загрузить заявки. <button onClick={() => void query.refetch()}>Повторить</button></div> : <div className="requests-kanban">
      {REQUEST_STAGES.map(stage => {
        const cards = visible.filter(row => requestStage(row) === stage.key);
        return <section key={stage.key} className="requests-column" aria-label={stage.label}
          onDragOver={event => { if (!saving) event.preventDefault(); }} onDrop={event => {
            event.preventDefault(); const row = rows.find(item => item.rowId === event.dataTransfer.getData('text/plain')); if (row) move(row, stage.key);
          }}>
          <h2 style={{ borderTopColor: stage.color }}>{stage.label}<span>{cards.length}</span></h2>
          <div className="requests-cards">{cards.length === 0 && <p className="requests-empty">Нет заявок</p>}{cards.map(row => <article key={row.rowId} className="request-card" draggable={!saving} onDragStart={event => event.dataTransfer.setData('text/plain', row.rowId)}>
            <button className="request-card-title" onClick={() => onOpen(row)}>{row.childName || row.parentName}</button>
            <div className="request-card-muted">{row.childClass && `${row.childClass} · `}{row.branchShort || row.branchFilter}</div>
            <div>{row.parentName}</div><a href={`tel:${row.phone.replace(/[^+\d]/g, '')}`}>{row.phone}</a>
            {row.childCreatedAt && <div className="request-card-muted">Заявка от {new Date(row.childCreatedAt).toLocaleDateString('ru-RU', { timeZone: 'Asia/Bishkek' })}</div>}
            {stage.key === 'waiting' && <div className="request-waiting"><strong>{row.waitingReason}</strong><div>{row.waitingComment}</div></div>}
            <label className="request-card-muted">Этап<select aria-label={`Этап заявки ${row.childName || row.parentName}`} value={stage.key} disabled={saving} onChange={event => move(row, event.target.value as RequestStage)}>{REQUEST_STAGES.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
            <button className="ow-btn ow-btn--ghost" onClick={() => onOpen(row)}>Карточка / назначить трансфер</button>
          </article>)}</div>
        </section>;
      })}
    </div>}
    {waiting && <dialog ref={dialog} className="request-wait-dialog" aria-labelledby="request-wait-title" onCancel={event => { if (saving) event.preventDefault(); else setWaiting(null); }}>
      <form onSubmit={event => { event.preventDefault(); void save(waiting, 'waiting', reason, comment); }}>
        <h2 id="request-wait-title">Перевести в ожидание</h2><p>{waiting.childName || waiting.parentName}</p>
        <label>Причина ожидания<select autoFocus required value={reason} disabled={saving} onChange={event => setReason(event.target.value)}><option value="">Выберите причину</option>{WAITING_REASONS.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Комментарий<textarea required rows={4} value={comment} disabled={saving} onChange={event => setComment(event.target.value)} placeholder="Уточните ситуацию и следующий шаг" /></label>
        {error && <p role="alert" className="requests-error">{error}</p>}
        <div className="request-dialog-actions"><button type="button" className="ow-btn ow-btn--ghost" disabled={saving} onClick={() => setWaiting(null)}>Отмена</button><button className="ow-btn ow-btn--primary" disabled={saving || !reason || !comment.trim()}>{saving ? 'Сохранение…' : 'В ожидание'}</button></div>
      </form>
    </dialog>}
  </div>;
}
