import type { FamilyListRow } from '../../services/crmV2Service';
import { TRANSFER_IN_WORK, TRANSFER_WAITING, TRANSFER_X } from './constants';

/**
 * Этап заявки = трансфер ребёнка. Отдельного поля нет:
 * «—» → Новые, «!» → В работе, «?» → Ожидание, «Х» → Отказ.
 */
export type RequestStage = 'new' | 'in_work' | 'waiting' | 'rejected';
export const REQUEST_STAGES: { key: RequestStage; label: string; symbol: string; color: string }[] = [
  { key: 'new', label: 'Новые', symbol: '—', color: '#378ADD' },
  { key: 'in_work', label: 'В работе', symbol: '!', color: '#2563EB' },
  { key: 'waiting', label: 'Ожидание', symbol: '?', color: '#B45309' },
  { key: 'rejected', label: 'Отказ', symbol: 'Х', color: 'var(--danger)' },
];

type StageRow = Pick<FamilyListRow, 'status' | 'transferNumber' | 'transferMark'>;
type TimedRow = StageRow & Pick<FamilyListRow, 'childCreatedAt' | 'transferMarkAt' | 'transferCommentAt'>;

/** На доске только дети без номера трансфера и не в отказе. */
export function isRequestOnBoard(row: StageRow): boolean {
  return !row.transferNumber && row.status !== 'rejected' && row.status !== 'boarded' && row.status !== 'paused';
}

export function requestStage(row: StageRow): RequestStage {
  if (row.status === 'rejected') return 'rejected';
  if (row.transferMark === 'in_work') return 'in_work';
  if (row.transferMark === 'waiting') return 'waiting';
  return 'new';
}

/** Что выбрать в трансфере при переносе карточки в колонку. */
export function stageTransferChoice(stage: RequestStage): typeof TRANSFER_X | typeof TRANSFER_IN_WORK | typeof TRANSFER_WAITING | undefined {
  if (stage === 'in_work') return TRANSFER_IN_WORK;
  if (stage === 'waiting') return TRANSFER_WAITING;
  if (stage === 'rejected') return TRANSFER_X;
  return undefined;
}

export function stageLabel(stage: RequestStage): string {
  return REQUEST_STAGES.find(item => item.key === stage)?.label ?? stage;
}

/** Соседний этап для стрелок «назад / вперёд». */
export function neighborStage(stage: RequestStage, step: -1 | 1): RequestStage | null {
  const index = REQUEST_STAGES.findIndex(item => item.key === stage);
  return REQUEST_STAGES[index + step]?.key ?? null;
}

/** Сколько дней заявка может быть в колонке, потом она красная. */
export const OVERDUE_DAYS: Record<Exclude<RequestStage, 'rejected'>, number> = { new: 2, in_work: 3, waiting: 5 };

/** С какого момента считаем: «Новые» — с даты заявки, «!» и «?» — с переноса в колонку. */
export function stageSince(row: TimedRow): string | null {
  if (requestStage(row) === 'new') return row.childCreatedAt;
  return row.transferMarkAt ?? row.transferCommentAt ?? row.childCreatedAt;
}

/** Красная заявка: больше 2 дней в «Новых», 3 в «В работе», 5 в «Ожидании». */
export function isRequestOverdue(row: TimedRow, now = Date.now()): boolean {
  const stage = requestStage(row);
  if (stage === 'rejected' || !isRequestOnBoard(row)) return false;
  const since = Date.parse(stageSince(row) ?? '');
  return Number.isFinite(since) && now - since > OVERDUE_DAYS[stage] * 86400000;
}
