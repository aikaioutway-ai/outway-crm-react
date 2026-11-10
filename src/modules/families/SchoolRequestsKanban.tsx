import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Phone } from 'lucide-react';
import { useLogisticsTable } from '../../hooks/useCrmQueries';
import { FamilyListRow, updateV2ChildRoute } from '../../services/crmV2Service';
import { queryClient, QK } from '../../services/queryClient';
import { DashboardTopPanel } from '../../core/dashboard/DashboardUI';
import { askTransferComment, formatTransferComment } from '../../core/dashboard/askTransferComment';
import TransferNumberBadge from '../../core/dashboard/TransferNumberBadge';
import ManagerPeriodBar from './ManagerPeriodBar';
import { REQUEST_DAY_PERIODS, requestMatchesDay } from './NewRequestsDashboard';
import { isSchoolAllowed, schoolTabsForTier, transferChoiceValue, transferCommentPrompt } from './constants';
import SchoolKpiChip from './SchoolKpiChip';
import { optimisticTransferPatch } from './familiesRowHelpers';
import type { SchoolTier } from './SchoolTierTabs';
import type { VehicleType } from '../../types';
import { isRequestOnBoard, isRequestOverdue, neighborStage, OVERDUE_DAYS, REQUEST_STAGES, requestStage, RequestStage, stageLabel, stageSince, stageTransferChoice } from './requestWorkflow';
import { useRememberedScroll } from '../../hooks/useRememberedScroll';
import './SchoolRequestsKanban.css';

/** Колонка помнит, докуда её пролистали, — после перехода на другую вкладку школы и обратно. */
function RequestCards({ scrollKey, children }: { scrollKey: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useRememberedScroll(ref, scrollKey, true);
  return <div ref={ref} className="requests-cards">{children}</div>;
}

function daysSince(value: string | null | undefined): string {
  if (!value) return '';
  const days = Math.floor((Date.now() - Date.parse(value)) / 86400000);
  if (Number.isNaN(days) || days < 0) return '';
  return days === 0 ? 'сегодня' : `${days} дн.`;
}

/** Одна и та же строка лежит в кэше логистики и общей таблицы — меняем в обоих. */
function patchCachedRow(rowId: string, patch: Partial<FamilyListRow>) {
  for (const key of [QK.logisticsTable, QK.familiesTable]) {
    queryClient.setQueryData(key, (rows: FamilyListRow[] | undefined) => rows?.map((row: FamilyListRow) => row.rowId === rowId ? { ...row, ...patch } : row));
  }
}

export default function SchoolRequestsKanban({ schoolKey, allowedSchools, schoolTier, onOpen, actorName, canEdit = false }: {
  schoolKey: string; allowedSchools?: string[]; schoolTier: SchoolTier; onOpen: (row: FamilyListRow) => void; actorName?: string;
  /** Переносить карточки могут только логисты и админ; остальные смотрят. */
  canEdit?: boolean;
}) {
  // Без денег: доске нужны только дети, трансферы и комментарии.
  const query = useLogisticsTable();
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [day, setDay] = useState('ALL');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<RequestStage | null>(null);
  const [flash, setFlash] = useState('');
  const [dragging, setDragging] = useState('');

  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (query.data ?? []).filter(row => {
      if (seen.has(row.rowId) || row.rowId.endsWith('_empty') || !isRequestOnBoard(row)
        || !isSchoolAllowed(row.branchFilter, allowedSchools, schoolTier) || (schoolKey !== 'ALL' && row.branchFilter !== schoolKey)) return false;
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

  const needle = search.toLowerCase().trim();
  const now = Date.now();
  const overdueCount = rows.filter(row => isRequestOverdue(row, now)).length;
  const visible = rows.filter(row => requestMatchesDay(row.childCreatedAt, day)
    && (!onlyOverdue || isRequestOverdue(row, now))
    && `${row.childName} ${row.parentName} ${row.phone} ${row.streetAddress} ${row.branchShort}`.toLowerCase().includes(needle));

  /** Перенос = смена трансфера: «—», «!», «?» или «Х». Показываем сразу, сохраняем в фоне. */
  const move = async (row: FamilyListRow, to: RequestStage) => {
    if (!canEdit || busy.has(row.rowId) || to === requestStage(row)) return;
    const choice = stageTransferChoice(to);
    const question = transferCommentPrompt(row.status, choice);
    const comment = question ? await askTransferComment(question, row.childName || row.parentName) : null;
    if (question && !comment) return;
    const optimistic = optimisticTransferPatch(row, choice, comment, actorName) as Partial<FamilyListRow>;
    const previous = Object.fromEntries(Object.keys(optimistic).map(field => [field, (row as any)[field] ?? null])) as Partial<FamilyListRow>;
    setBusy(current => new Set(current).add(row.rowId));
    patchCachedRow(row.rowId, optimistic);
    setFlash(row.rowId);
    try {
      await updateV2ChildRoute({
        comment,
        child: {
          id: row.rowId, familyId: row.familyId, childName: row.childName, class: row.childClass, selfExitAllowed: false,
          schoolCode: row.schoolCode as any, schoolId: row.schoolId ?? undefined, branchId: row.branchId ?? undefined,
          zone: row.zone as any, vehicleType: row.vehicleType as VehicleType,
        },
        vehicleType: row.vehicleType as VehicleType,
        transferNumber: choice,
        stopNumber: row.stopNumber ? Number(row.stopNumber) : undefined,
        timeMorning: row.timeMorning ?? undefined,
        source: 'transfer_move',
        actorName,
      });
    } catch (error) {
      patchCachedRow(row.rowId, previous);
      window.alert(`«${row.childName || row.parentName}» не перенесён: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(current => { const next = new Set(current); next.delete(row.rowId); return next; });
    }
  };

  const renderCard = (row: FamilyListRow, stage: RequestStage) => {
    const prev = neighborStage(stage, -1);
    const next = neighborStage(stage, 1);
    const name = row.childName || row.parentName;
    const saving = busy.has(row.rowId);
    const stageMeta = REQUEST_STAGES.find(item => item.key === stage)!;
    const note = formatTransferComment(row.transferComment, row.transferCommentBy, row.transferCommentAt);
    const overdue = isRequestOverdue(row, now);
    const days = daysSince(stageSince(row));
    return <article key={row.rowId} className={`request-card${flash === row.rowId ? ' request-card--moved' : ''}${saving ? ' request-card--saving' : ''}${dragging === row.rowId ? ' request-card--dragging' : ''}${overdue ? ' request-card--overdue' : ''}${canEdit ? '' : ' request-card--readonly'}`} style={{ borderLeftColor: overdue ? 'var(--danger)' : stageMeta.color }}
      role="button" tabIndex={0} aria-label={`${name}: открыть карточку семьи`} draggable={canEdit && !saving}
      onAnimationEnd={() => setFlash(current => current === row.rowId ? '' : current)}
      title={canEdit ? 'Перетащите в другую колонку или нажмите, чтобы открыть карточку семьи' : 'Нажмите, чтобы открыть карточку семьи'}
      onDragStart={event => { event.dataTransfer.setData('text/plain', row.rowId); event.dataTransfer.effectAllowed = 'move'; setDragging(row.rowId); }}
      onDragEnd={() => { setDragging(''); setDragOver(null); }}
      onClick={() => onOpen(row)}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(row); }
        if (canEdit && event.key === 'ArrowLeft' && prev) { event.preventDefault(); void move(row, prev); }
        if (canEdit && event.key === 'ArrowRight' && next) { event.preventDefault(); void move(row, next); }
      }}>
      <div className="request-card-top">
        <span className="request-card-school">{row.branchShort || row.branchFilter}</span>
        <TransferNumberBadge number={transferChoiceValue(row.status, row.transferNumber, row.transferMark) || null} note={note} />
      </div>
      <div className="request-card-title">{name}{row.childClass && <span className="request-card-class"> · {row.childClass}</span>}</div>
      <div className="request-card-line"><MapPin size={13} aria-hidden="true" /><span>{row.streetAddress || 'Адрес не указан'}</span></div>
      <div className="request-card-line"><Phone size={13} aria-hidden="true" />{row.phone
        ? <a href={`tel:${row.phone.replace(/[^+\d]/g, '')}`} onClick={event => event.stopPropagation()}>{row.phone}</a>
        : <span>Нет телефона</span>}</div>
      <div className="request-card-foot">
        {canEdit && <button type="button" className="request-arrow" disabled={!prev || saving} title={prev ? `Назад: ${stageLabel(prev)}` : undefined}
          aria-label={prev ? `Назад в «${stageLabel(prev)}»: ${name}` : 'Назад недоступно'} onClick={event => { event.stopPropagation(); if (prev) void move(row, prev); }}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>}
        <span className={`request-card-age${overdue ? ' request-card-age--overdue' : ''}`}
          title={stage === 'new' ? `В «Новых» с даты заявки; красная после ${OVERDUE_DAYS.new} дн.` : `В колонке «${stageLabel(stage)}»; красная после ${OVERDUE_DAYS[stage as 'in_work' | 'waiting']} дн.`}>
          {saving ? 'Сохраняю…' : overdue ? `Просрочено · ${days}` : days}
        </span>
        {canEdit && <button type="button" className="request-arrow" disabled={!next || saving} title={next ? `Вперёд: ${stageLabel(next)}` : undefined}
          aria-label={next ? `Вперёд в «${stageLabel(next)}»: ${name}` : 'Вперёд недоступно'} onClick={event => { event.stopPropagation(); if (next) void move(row, next); }}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>}
      </div>
    </article>;
  };

  // В «Новых заявках» нет полосы показателей — без этой плашки не видно, в какой школе ты.
  const school = schoolKey === 'ALL' ? undefined : schoolTabsForTier(schoolTier).find(item => item.key === schoolKey);

  return <div className="requests-workspace">
    <DashboardTopPanel><div className="requests-toolbar">
      {school && <div className="requests-school"><SchoolKpiChip small schoolKey={school.key} logo={school.logo} label={school.label} color="var(--text-2)" /></div>}
      <ManagerPeriodBar periodKey={day} onPeriodKeyChange={setDay} periods={REQUEST_DAY_PERIODS} allLabel="Все" useLabels periodCounts={counts} periodTitle={period => period.key === '11' ? 'Старше 10 дней' : `День ${period.label} с создания заявки`} />
      <button type="button" className={`requests-overdue-toggle${onlyOverdue ? ' requests-overdue-toggle--on' : ''}`} aria-pressed={onlyOverdue} disabled={!overdueCount && !onlyOverdue}
        title="Красные: больше 2 дней в «Новых», 3 в «В работе», 5 в «Ожидании»" onClick={() => setOnlyOverdue(value => !value)}>
        Просрочено <b>{overdueCount}</b>
      </button>
      <input className="requests-search" type="search" aria-label="Поиск заявок" placeholder="Ребёнок, родитель, телефон, адрес" value={search} onChange={event => setSearch(event.target.value)} />
    </div></DashboardTopPanel>
    {!canEdit && <p className="requests-readonly">Только просмотр: переносить заявки могут логисты.</p>}
    {query.isPending ? <p role="status">Загрузка заявок…</p> : query.isError ? <div role="alert">Не удалось загрузить заявки. <button onClick={() => void query.refetch()}>Повторить</button></div> : <div className={`requests-kanban${dragging ? ' requests-kanban--dragging' : ''}`}>
      {REQUEST_STAGES.map(stage => {
        const isReject = stage.key === 'rejected';
        const cards = isReject ? [] : visible.filter(row => requestStage(row) === stage.key);
        const redCount = cards.filter(row => isRequestOverdue(row, now)).length;
        return <section key={stage.key} className={`requests-column${isReject ? ' requests-column--reject' : ''}${dragOver === stage.key ? ' requests-column--over' : ''}`} aria-label={stage.label}
          onDragOver={event => { if (!canEdit) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragOver !== stage.key) setDragOver(stage.key); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }}
          onDrop={event => {
            event.preventDefault(); setDragOver(null); setDragging('');
            const row = rows.find(item => item.rowId === event.dataTransfer.getData('text/plain')); if (row) void move(row, stage.key);
          }}>
          <h2 style={{ borderTopColor: stage.color }}><span className="requests-column-title"><b style={{ color: stage.color }}>{stage.symbol}</b> {stage.label}</span>{!isReject && <span className="requests-column-counts">{redCount > 0 && <span className="requests-column-red" title="Просрочено">{redCount}</span>}<span className="requests-column-count">{cards.length}</span></span>}</h2>
          <RequestCards scrollKey={`requests:${schoolTier}:${schoolKey}:${stage.key}`}>
            {isReject
              ? <p className="requests-reject-hint">Перетащите карточку сюда — трансфер станет «Х». Нужен комментарий.</p>
              : cards.length === 0 ? <p className="requests-empty">{dragging ? `Отпустите здесь — трансфер «${stage.symbol}»` : 'Нет заявок'}</p> : cards.map(row => renderCard(row, stage.key))}
          </RequestCards>
        </section>;
      })}
    </div>}
  </div>;
}
