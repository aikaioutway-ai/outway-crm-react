import { cellTargetFromElement, cellTargetKey } from './commentIdentity';
function cell(row: string, column: string, context='2026-10') {
  const table=document.createElement('table'); table.dataset.commentTable='families_table_requests_v3';table.dataset.commentContext=context;
  table.innerHTML='<tbody><tr><td>Изменяемое значение</td></tr></tbody>';
  const tr=table.querySelector('tr')!;tr.dataset.commentRow=row;
  const td=table.querySelector('td')!;td.dataset.commentColumn=column;
  return {table,td};
}
test('identity is bound to record and field, independent of displayed value and sorting',()=>{
  const {table,td}=cell('child-a','price');const before=cellTargetFromElement(td)!.target;
  td.textContent='Другая сумма'; table.querySelector('tbody')!.prepend(document.createElement('tr'));
  expect(cellTargetKey(cellTargetFromElement(td)!.target)).toBe(cellTargetKey(before));
  expect(cellTargetKey(cellTargetFromElement(cell('child-b','price').td)!.target)).not.toBe(cellTargetKey(before));
  expect(cellTargetKey(cellTargetFromElement(cell('child-a','price','2026-11').td)!.target)).not.toBe(cellTargetKey(before));
});
test('empty rows and tables without persistent identities cannot receive comments',()=>{
  const {td}=cell('a','name');td.closest('tr')!.removeAttribute('data-comment-row');expect(cellTargetFromElement(td)).toBeNull();
});
test('nested table cells cannot inherit their outer row identity',()=>{
  const {td}=cell('outer','price');td.innerHTML='<table data-comment-table="nested"><tbody><tr><td data-comment-column="price">10</td></tr></tbody></table>';
  expect(cellTargetFromElement(td.querySelector('td')!)).toBeNull();
});
test('column dashboards use the explicit field key of their column',()=>{
  const root=document.createElement('div');root.innerHTML='<div data-comment-table="salary" data-comment-context="2026-10"><div data-comment-column="amount"><div data-comment-row="TIS" data-comment-cell="true">500</div></div></div>';
  expect(cellTargetFromElement(root.querySelector('[data-comment-cell]')!)?.target.column).toBe('amount');
});
