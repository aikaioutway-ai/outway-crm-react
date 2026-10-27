import type { UserRole } from '../../types';
export type TaskStatus = 'new' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskTargetType = 'general' | 'school' | 'transfer' | 'child' | 'family' | 'driver' | 'group';
export interface TaskTarget { type: TaskTargetType; id: string; label: string; schoolKey?: string; schoolKeys?: string[]; group?: 'new' | 'rejected'; transferId?: string; transferNumber?: number; familyId?: string; childId?: string; driverId?: string }
export interface CrmTask {
  id: string; title: string; description: string; creator_id: string; assignee_id: string; assignee_ids?: string[]; assignment_department?: string; observer_id?: string;
  due_at: string; priority: 'normal' | 'urgent'; status: TaskStatus; requires_review: boolean;
  target: TaskTarget; school_key?: string; accepted_at?: string; result: string;
  completed_at?: string; version: number; created_at: string; updated_at: string;
}
export interface TaskEmployee { id: string; full_name: string; role: UserRole; status: string }
export interface TaskEvent { id: string; actor_id: string; action: string; comment: string; created_at: string; old_value?: CrmTask; new_value?: CrmTask }
export interface TaskFilters { view: 'mine' | 'created' | 'watching' | 'all'; status: TaskStatus | 'active' | 'all'; search?: string; schoolKey?: string; assigneeId?: string; department?: string; priority?: string; due?: string; entityType?: string; entityId?: string }
export interface TaskSummary { open: number; new: number; overdue: number; dueSoon: number; review: number; attention: number; watching?: number }
export const TASK_STATUS: Record<TaskStatus,string> = { new:'Новая',in_progress:'В работе',review:'На проверке',done:'Выполнена',cancelled:'Отменена' };
export const TARGET_LABELS: Record<TaskTargetType,string> = {group:'Группа заявок',general:'Общая задача',school:'Школа',transfer:'Трансфер',child:'Ребёнок',family:'Семья',driver:'Водитель'};
export const ROLE_LABELS: Record<string,string> = {admin:'Администратор',gen_director:'Ген. директор',director:'Директор',manager:'Менеджер',logist:'Логист',senior_logist:'Руководитель логистики',cashier:'Кассир',b2b_manager:'Менеджер B2B',b2b_logist:'Логист B2B'};
export const TASK_ACTIONS: Record<string,string> = {delete:'Задача удалена',create:'Задача поставлена',edit:'Задача изменена',accept:'Принята в работу',submit:'Результат отправлен',approve:'Выполнение подтверждено',return:'Возвращена на доработку',cancel:'Задача отменена',reopen:'Задача открыта повторно',comment:'Комментарий'};
export const isTaskOpen = (task: Pick<CrmTask,'status'>) => !['done','cancelled'].includes(task.status);
export const isTaskOverdue = (task: Pick<CrmTask,'status'|'due_at'>, now=Date.now()) => isTaskOpen(task) && new Date(task.due_at).getTime()<now;
export const canLeadTasks = (role: string) => ['admin','gen_director','director'].includes(role);
export function taskLocalDate(value: string) { const date=new Date(value); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
export function taskDate(value: string) { return new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
export const TASK_VIEW_EVENT = 'outway-task-view';
export const TASK_COMPOSER_EVENT = 'outway-task-compose';
export function openTaskComposer(target: TaskTarget) { window.dispatchEvent(new CustomEvent(TASK_COMPOSER_EVENT,{detail:target})); }

export const TASK_DEPARTMENTS: Record<string,{label:string;roles:UserRole[]}> = {
  logistics:{label:'Логистика',roles:['logist','b2b_logist']},
  management:{label:'Менеджеры',roles:['manager','b2b_manager']},
  finance:{label:'Финансы',roles:['cashier']},
  leadership:{label:'Руководство',roles:['admin','gen_director','director','senior_logist']},
};
export const TASK_OBSERVER_ROLES: UserRole[] = ['gen_director','director','senior_logist','cashier'];
export function taskDepartment(role?: UserRole) { return Object.entries(TASK_DEPARTMENTS).find(([,department])=>role && department.roles.includes(role))?.[0] ?? ''; }

export const canViewTeamTasks = (role: string) => ['admin','gen_director','director','senior_logist','cashier'].includes(role);
export interface TaskCounts { total: number; open: number; completed: number; overdue: number; review: number }

export const taskAssigneeIds = (task: Pick<CrmTask,'assignee_id'|'assignee_ids'>): string[] => task.assignee_ids?.length ? task.assignee_ids : [task.assignee_id];
