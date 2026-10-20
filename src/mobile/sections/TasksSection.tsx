import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { AuthenticatedUser } from '../../services/employeeService';
import { queryClient } from '../../services/queryClient';
import { useTaskMetadata, useTasks, useTaskSummary } from '../../services/taskService';
import TaskComposer from '../../modules/tasks/TaskComposer';
import TaskDetail from '../../modules/tasks/TaskDetail';
import {
  canViewTeamTasks, CrmTask, isTaskOverdue, ROLE_LABELS, TARGET_LABELS, TASK_DEPARTMENTS, TASK_STATUS,
  TaskFilters, TaskStatus, TaskTarget, taskDate, taskDepartment,
} from '../../modules/tasks/taskTypes';
import '../../modules/tasks/TasksModule.css';
import { Screen } from '../nav';
import { Badge, Empty, ErrorBox, SearchField, SelectField, Skeletons } from '../ui';

type ListKey = 'mine' | 'created' | 'watching' | 'review' | 'all';
type StatusKey = TaskFilters['status'];
type DueKey = '' | 'overdue' | 'soon';

const PAGE_SIZE = 50;
const LIST_KEY = 'outway_mobile_task_list';

const LISTS: { value: ListKey; label: string }[] = [
  { value: 'mine', label: 'Мои задачи' },
  { value: 'created', label: 'Поставленные мной' },
  { value: 'watching', label: 'Наблюдаю' },
  { value: 'review', label: 'Ждут моей проверки' },
  { value: 'all', label: 'Все задачи' },
];

const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: 'active', label: 'Открытые' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'review', label: 'На проверке' },
  { value: 'done', label: 'Выполненные' },
  { value: 'cancelled', label: 'Отменённые' },
  { value: 'all', label: 'Все статусы' },
];

const STATUS_TONE: Record<TaskStatus, { bg: string; color: string }> = {
  new: { bg: '#E0EDFF', color: '#1D4ED8' },
  in_progress: { bg: '#E3F2F2', color: '#1C6E70' },
  review: { bg: '#EDE9FE', color: '#5B21B6' },
  done: { bg: '#DCFCE7', color: '#166534' },
  cancelled: { bg: '#ECEFF3', color: '#52606F' },
};

const DUE_LABEL: Record<Exclude<DueKey, ''>, string> = { overdue: 'Только просроченные', soon: 'Срок в течение суток' };

function readList(): ListKey {
  try {
    const saved = sessionStorage.getItem(LIST_KEY);
    return LISTS.some(list => list.value === saved) ? saved as ListKey : 'mine';
  } catch { return 'mine'; }
}

function defaultStatus(list: ListKey): StatusKey {
  if (list === 'review') return 'review';
  return list === 'mine' ? 'active' : 'all';
}

function TaskCard({ task, names, list, onOpen }: { task: CrmTask; names: Map<string, string>; list: ListKey; onOpen: () => void }) {
  const overdue = isTaskOverdue(task);
  const assignee = names.get(task.assignee_id) ?? '—';
  const creator = names.get(task.creator_id) ?? '—';
  // В «Моих задачах» исполнитель — я сам, важнее кто поставил; в остальных списках — кому.
  const people = list === 'mine' ? `от ${creator}` : `${assignee} · от ${creator}`;
  return (
    <button type="button" className="m-card" onClick={onOpen}>
      <div className="m-card-row" style={{ alignItems: 'flex-start' }}>
        <div className="m-card-main">
          <div className="m-card-title">
            {task.priority === 'urgent' && <span className="m-urgent-dot" title="Срочная задача" aria-label="Срочная" />}
            {task.title}
          </div>
          <div className="m-card-sub">{people}</div>
        </div>
        <span className={`m-task-due ${overdue ? 'is-overdue' : ''}`}>{taskDate(task.due_at)}</span>
      </div>
      <div className="m-card-meta">
        <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS[task.status]}</Badge>
        {overdue && <Badge tone={{ bg: '#FCEBEA', color: '#C2352B' }}>Просрочена</Badge>}
        {task.target.type !== 'general' && <Badge>{TARGET_LABELS[task.target.type]}: {task.target.label}</Badge>}
      </div>
    </button>
  );
}

/** Задачи на телефоне: один список с выбором вместо колонок, карточка задачи — на весь экран. */
export default function TasksSection({ user, context, onClearContext, onOpenTarget }: {
  user: AuthenticatedUser;
  context?: TaskTarget;
  onClearContext?: () => void;
  onOpenTarget?: (target: TaskTarget) => void;
}) {
  const metadata = useTaskMetadata(user.sessionToken);
  const summary = useTaskSummary(user.sessionToken);
  const canSeeAll = metadata.data?.canViewAll ?? canViewTeamTasks(user.role);
  const lists = LISTS.filter(list => list.value !== 'all' || canSeeAll);

  const [list, setListState] = useState<ListKey>(readList);
  const [status, setStatus] = useState<StatusKey>(() => defaultStatus(readList()));
  const [due, setDue] = useState<DueKey>('');
  const [scope, setScope] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [creating, setCreating] = useState(false);

  const setList = (next: ListKey, nextStatus: StatusKey = defaultStatus(next), nextDue: DueKey = '') => {
    setListState(next);
    setStatus(nextStatus);
    setDue(nextDue);
    setScope('');
    setPage(0);
    try { sessionStorage.setItem(LIST_KEY, next); } catch { /* приватный режим */ }
  };

  // Задачи, открытые из карточки семьи или школы, показываем во всех списках сразу.
  useEffect(() => { if (context) { setPage(0); } }, [context]);

  const employees = useMemo(() => metadata.data?.employees ?? [], [metadata.data?.employees]);
  const names = useMemo(() => new Map(employees.map(employee => [employee.id, employee.full_name])), [employees]);

  const filters = useMemo<TaskFilters>(() => {
    const view: TaskFilters['view'] = list === 'review' ? 'created' : list;
    const next: TaskFilters = { view, status, due };
    if (list === 'all' && scope.startsWith('dep:')) next.department = scope.slice(4);
    if (list === 'all' && scope.startsWith('emp:')) next.assigneeId = scope.slice(4);
    if (context) {
      next.entityType = context.type;
      next.entityId = context.id;
      next.schoolKey = context.type === 'school' ? context.id : '';
    }
    return next;
  }, [list, status, due, scope, context]);
  const tasks = useTasks(user.sessionToken, filters, page);

  const query = search.trim().toLowerCase();
  const rows = useMemo(
    () => (tasks.data?.rows ?? []).filter(task => !query || [task.title, task.description, task.target.label, names.get(task.assignee_id), names.get(task.creator_id)]
      .some(value => String(value ?? '').toLowerCase().includes(query))),
    [tasks.data?.rows, query, names],
  );
  const total = tasks.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const scopeOptions = useMemo(() => {
    const options = [{ value: '', label: 'Все отделы и сотрудники' }];
    Object.entries(TASK_DEPARTMENTS).forEach(([key, department]) => {
      options.push({ value: `dep:${key}`, label: `Отдел: ${department.label}` });
      employees
        .filter(employee => employee.status === 'active' && taskDepartment(employee.role) === key)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
        .forEach(employee => options.push({ value: `emp:${employee.id}`, label: `${employee.full_name} · ${ROLE_LABELS[employee.role] ?? employee.role}` }));
    });
    return options;
  }, [employees]);

  const quick: { label: string; value: number | undefined; color: string; apply: () => void; active: boolean }[] = [
    { label: 'Нужно принять', value: summary.data?.new, color: '#2563EB', apply: () => setList('mine', 'new'), active: list === 'mine' && status === 'new' && !due },
    { label: 'Просрочены', value: summary.data?.overdue, color: '#C2352B', apply: () => setList('mine', 'active', 'overdue'), active: list === 'mine' && due === 'overdue' },
    { label: 'Срок в течение суток', value: summary.data?.dueSoon, color: '#C9861A', apply: () => setList('mine', 'active', 'soon'), active: list === 'mine' && due === 'soon' },
    { label: 'Ждут моей проверки', value: summary.data?.review, color: '#7C3AED', apply: () => setList('review'), active: list === 'review' },
  ];

  return (
    <Screen
      pageKey="tasks:home"
      title="Задачи"
      subtitle={summary.data ? `Открытых у меня: ${summary.data.open}` : user.name}
      action={(
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="m-icon-btn" aria-label="Обновить задачи" disabled={tasks.isFetching} onClick={() => void queryClient.invalidateQueries({ queryKey: ['tasks', user.sessionToken] })}>
            <RefreshCw size={18} className={tasks.isFetching ? 'm-spin' : undefined} />
          </button>
          <button type="button" className="m-icon-btn m-icon-btn--primary" aria-label="Поставить задачу" onClick={() => setCreating(true)}>
            <Plus size={20} />
          </button>
        </div>
      )}
    >
      <div className="m-kpis">
        {quick.map(item => (
          <button key={item.label} type="button" className={`m-kpi m-kpi--btn ${item.active ? 'is-active' : ''}`} aria-pressed={item.active} onClick={item.apply}>
            <div className="m-kpi-value" style={item.value ? { color: item.color } : undefined}>{item.value ?? '—'}</div>
            <div className="m-kpi-label"><span className="m-kpi-dot" style={{ background: item.color }} />{item.label}</div>
          </button>
        ))}
      </div>

      {context && (
        <div className="m-filter-chip">
          <span>Задачи: <b>{context.label}</b></span>
          <button type="button" aria-label="Убрать привязку" onClick={() => onClearContext?.()}><X size={16} /></button>
        </div>
      )}

      <SelectField label="Список" value={list} onChange={value => setList(value)} options={lists} />
      <div className="m-selects">
        <SelectField label="Статус" value={status} onChange={value => { setStatus(value); setDue(''); setPage(0); }} options={STATUS_OPTIONS} />
        {list === 'all' ? (
          <SelectField label="Кто отвечает" value={scope} onChange={value => { setScope(value); setPage(0); }} options={scopeOptions} />
        ) : (
          <SelectField
            label="Срок"
            value={due}
            onChange={value => { setDue(value); setPage(0); }}
            options={[{ value: '', label: 'Любой' }, { value: 'overdue', label: 'Просроченные' }, { value: 'soon', label: 'В течение суток' }]}
          />
        )}
      </div>
      {list === 'all' && due && (
        <div className="m-filter-chip">
          <span>{DUE_LABEL[due]}</span>
          <button type="button" aria-label="Сбросить фильтр срока" onClick={() => setDue('')}><X size={16} /></button>
        </div>
      )}
      <SearchField value={search} onChange={setSearch} placeholder="Поиск по названию или сотруднику" />

      {(tasks.error || metadata.error) ? (
        <ErrorBox>{tasks.error?.message || metadata.error?.message}</ErrorBox>
      ) : tasks.isLoading ? <Skeletons count={4} /> : rows.length === 0 ? (
        <Empty>{query ? 'Ничего не найдено' : list === 'mine' && status === 'active' && !due ? 'Открытых задач нет' : 'Задач по этим условиям нет'}</Empty>
      ) : (
        <>
          <div className="m-section-title">
            <span>{lists.find(item => item.value === list)?.label}</span>
            <span>{query ? `${rows.length} из ${total}` : total}</span>
          </div>
          <div className="m-list">
            {rows.map(task => <TaskCard key={task.id} task={task} names={names} list={list} onOpen={() => setSelected(task.id)} />)}
          </div>
        </>
      )}
      {pages > 1 && (
        <div className="m-btn-row">
          <button type="button" className="m-btn" disabled={page === 0 || tasks.isFetching} onClick={() => setPage(value => value - 1)}>Назад</button>
          <span className="m-page-count">{page + 1} / {pages}</span>
          <button type="button" className="m-btn" disabled={page + 1 >= pages || tasks.isFetching} onClick={() => setPage(value => value + 1)}>Далее</button>
        </div>
      )}

      {creating && <TaskComposer token={user.sessionToken} target={context} onClose={() => setCreating(false)} />}
      {selected && (
        <TaskDetail
          id={selected}
          user={user}
          employees={employees}
          onClose={() => setSelected('')}
          onOpenTarget={onOpenTarget ? target => { setSelected(''); onOpenTarget(target); } : undefined}
        />
      )}
    </Screen>
  );
}
