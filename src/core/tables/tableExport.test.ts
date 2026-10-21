import { readTableForExport } from './tableExport';
test('exports displayed text, input values and numbers without nested rows or action columns', () => {
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Имя</th><th>Сумма</th><th>Действия</th></tr></thead><tbody><tr><td>Анна<svg><title>icon</title></svg></td><td><input value="6800" /></td><td><button>Удалить</button></td></tr><tr><td>Борис<table><tbody><tr><td>nested</td></tr></tbody></table></td><td>0</td><td></td></tr><tr><td colspan="3">Ничего не найдено</td></tr></tbody>';
  expect(readTableForExport(table)).toEqual({headers:['Имя','Сумма'], rows:[['Анна','6800'],['Борис','0']]});
});
