import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabase } from './supabase';
import { queryClient } from './queryClient';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, isEmployeeSessionExpiredMessage } from './employeeSession';
import type { CrmTask, TaskEmployee, TaskEvent, TaskFilters, TaskSummary, TaskTarget } from '../modules/tasks/taskTypes';

export async function callTaskApi<T>(sessionToken: string | undefined, body: Record<string,unknown>): Promise<T> {
  if (!sessionToken) throw new Error('Войдите в CRM, чтобы работать с задачами');
  const {data,error}=await supabase.functions.invoke('task-api',{body,headers:{'x-employee-session':sessionToken}});
  let message='';
  if (error) {
    message=error.message;
    if (/failed to send a request|failed to fetch/i.test(message)) message='Не удалось подключиться к серверу задач. Проверьте соединение и повторите попытку.';
    try { message=(await error.context?.clone().json())?.error || message; } catch { /* non-JSON response */ }
  } else if (!data?.ok) message=data?.error || 'Не удалось загрузить задачи';
  if (message) {
    if (isEmployeeSessionExpiredMessage(message)) window.dispatchEvent(new Event(EMPLOYEE_SESSION_EXPIRED_EVENT));
    throw new Error(message);
  }
  return data as T;
}
export function useTaskMetadata(token?: string): UseQueryResult<{employees:TaskEmployee[];canViewAll:boolean;targetTypes?:TaskTarget['type'][]}> {
  return useQuery({queryKey:['tasks',token,'metadata'],queryFn:()=>callTaskApi<{employees:TaskEmployee[];canViewAll:boolean;targetTypes?:TaskTarget['type'][]}>(token,{action:'metadata'}),enabled:Boolean(token),staleTime:60000,retry:1});
}
export function useTaskSummary(token?: string): UseQueryResult<TaskSummary> {
  return useQuery({queryKey:['tasks',token,'summary'],queryFn:async()=>(await callTaskApi<{summary:TaskSummary}>(token,{action:'summary'})).summary,enabled:Boolean(token),staleTime:30000,refetchInterval:60000,retry:1});
}
export function useTasks(token: string | undefined,filters:TaskFilters,page:number): UseQueryResult<{rows:CrmTask[];total:number}> {
  return useQuery({queryKey:['tasks',token,'list',filters,page],queryFn:()=>callTaskApi<{rows:CrmTask[];total:number}>(token,{action:'list',filters,page}),enabled:Boolean(token),refetchInterval:60000,retry:1});
}
export function useTaskDetail(token: string | undefined,id:string): UseQueryResult<{task:CrmTask;events:TaskEvent[]}> {
  return useQuery({queryKey:['tasks',token,'detail',id],queryFn:()=>callTaskApi<{task:CrmTask;events:TaskEvent[]}>(token,{action:'detail',taskId:id}),enabled:Boolean(token && id),refetchInterval:30000,retry:1});
}
export async function mutateTask(token: string | undefined,operation:string,input:Record<string,unknown>,taskId?:string):Promise<CrmTask> {
  const {task}=await callTaskApi<{task:CrmTask}>(token,{action:'mutate',operation,input,taskId});
  await queryClient.invalidateQueries({queryKey:['tasks',token]});
  return task;
}
export function useTaskTargets(token: string | undefined,type:string,schoolKey:string,search:string,enabled:boolean,context?:{transferId?:string;group?:'new'|'rejected'}): UseQueryResult<{targets:TaskTarget[]}> {
  return useQuery({queryKey:['tasks',token,'targets',type,schoolKey,search,context],queryFn:()=>callTaskApi<{targets:TaskTarget[]}>(token,{action:'targets',type,schoolKey,search,...context}),enabled:Boolean(token && enabled),retry:1});
}

export function useResolvedTaskTarget(token: string | undefined,target:TaskTarget,enabled:boolean): UseQueryResult<{target:TaskTarget}> {
  return useQuery({queryKey:['tasks',token,'resolve',target.type,target.id,target.transferNumber,target.schoolKey],queryFn:()=>callTaskApi<{target:TaskTarget}>(token,{action:'resolveTarget',target}),enabled:Boolean(token && enabled),staleTime:60000,retry:1});
}
