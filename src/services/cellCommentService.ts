import { supabase } from './supabase';
import { EMPLOYEE_SESSION_EXPIRED_EVENT, isEmployeeSessionExpiredMessage } from './employeeSession';
import { CellTarget } from '../core/comments/commentIdentity';
export interface CellComment { id: string; author_id: string; author_name: string; body: string; created_at: string; updated_at?: string; can_edit?: boolean }
export async function callCellComments<T>(token: string, input: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cell-comments-api', { body: input, headers: { 'x-employee-session': token } });
  let message = error?.message;
  if (error) { try { message = (await error.context?.clone().json())?.error || message; } catch { /* non-JSON error */ } }
  if (!error && !data?.ok) message = data?.error || 'Не удалось загрузить комментарии';
  if (message) {
    if (isEmployeeSessionExpiredMessage(message)) window.dispatchEvent(new Event(EMPLOYEE_SESSION_EXPIRED_EVENT));
    throw new Error(message);
  }
  return data as T;
}
export const readCellComments = (token: string, target: CellTarget, before?: string) => callCellComments<{ comments: CellComment[]; hasMore: boolean }>(token, { action: 'list', target, before });
export const addCellComment = (token: string, target: CellTarget, body: string, requestId: string) => callCellComments<{ comment: CellComment }>(token, { action: 'add', target, body, requestId });

export const mutateCellComment = (token: string, target: CellTarget, comment: CellComment, action: 'edit' | 'delete', body?: string) => callCellComments<{ok: boolean; comment?: CellComment}>(token, {action, target, commentId: comment.id, expectedUpdatedAt: comment.updated_at, body});
