export interface CellTarget { table: string; row: string; column: string; context: string }
export const cellTargetKey = (target: CellTarget) => JSON.stringify([target.table, target.row, target.column, target.context]);

/** Identities come from record keys, never from displayed values or row positions. */
export function cellTargetFromElement(element: HTMLElement): { target: CellTarget; label: string } | null {
  const cell = element.closest<HTMLElement>('td, [data-comment-cell]');
  if (!cell || cell.closest('[data-no-comments]')) return null;
  const table = cell.closest<HTMLElement>('[data-comment-table]');
  const row = cell.closest<HTMLElement>('[data-comment-row]');
  if (!table || !row || row.closest('[data-comment-table]') !== table) return null;
  const column = cell.dataset.commentColumn || cell.closest<HTMLElement>('[data-comment-column]')?.dataset.commentColumn;
  const header = cell instanceof HTMLTableCellElement
    ? table.querySelectorAll('thead tr:last-child th')[cell.cellIndex]?.textContent?.trim().replace(/[↑↓]/g, '').trim()
    : undefined;
  const field = column || header;
  if (!field || !row.dataset.commentRow || !table.dataset.commentTable) return null;
  return { target: { table: table.dataset.commentTable, row: row.dataset.commentRow, column: field, context: table.dataset.commentContext || '' }, label: header || field };
}
