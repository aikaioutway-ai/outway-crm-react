import type { FamilyListRow } from '../../services/crmV2Service';
export type RequestStage = 'new' | 'in_work' | 'waiting' | 'rejected';
export const REQUEST_STAGES: { key: RequestStage; label: string; color: string }[] = [
  { key: 'new', label: 'Новые', color: '#378ADD' },
  { key: 'in_work', label: 'В работе', color: 'var(--accent)' },
  { key: 'waiting', label: 'Ожидание', color: '#B45309' },
  { key: 'rejected', label: 'Отказ', color: 'var(--danger)' },
];
export const WAITING_REASONS = ['Нет подходящего ТС', 'Группа на ТС не сформирована', 'Ожидаем ответ родителя', 'Ожидаем подтверждение маршрута', 'Другая причина'];
export function requestStage(row: Pick<FamilyListRow, 'status' | 'requestStage'>): RequestStage {
  return row.status === 'rejected' ? 'rejected' : row.requestStage ?? 'new';
}
export function isRequestOnBoard(row: Pick<FamilyListRow, 'status' | 'transferNumber'>): boolean {
  return !row.transferNumber && row.status !== 'boarded' && row.status !== 'paused';
}
export function requestStageUpdates(stage: RequestStage, reason = '', comment = '') {
  if (stage === 'waiting' && (!WAITING_REASONS.includes(reason) || !comment.trim())) throw new Error('Выберите причину и заполните комментарий.');
  return { request_stage: stage, status: stage === 'rejected' ? 'rejected' : 'new', waiting_reason: stage === 'waiting' ? reason : null, waiting_comment: stage === 'waiting' ? comment.trim() : null };
}
