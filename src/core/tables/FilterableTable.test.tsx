import { downloadTableExcel } from './tableExport';
jest.mock('./tableExport', () => ({ ...jest.requireActual('./tableExport'), downloadTableExcel: jest.fn().mockResolvedValue(undefined) }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FilterableTable from './FilterableTable';

test('native tables filter rows in fragments and reset without losing row interactions', () => {
  const click = jest.fn();
  render(<FilterableTable><thead><tr><th>Телефон</th><th>Имя</th></tr></thead><tbody><>
    <tr onClick={click}><td>123</td><td>Анна</td></tr>
    <tr><td>456</td><td>Борис</td></tr>
    <tr><td>123</td><td>Вера</td></tr>
  </></tbody></FilterableTable>);
  fireEvent.contextMenu(screen.getByRole('columnheader', { name: 'Телефон' }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Повторяющиеся значения' }));
  expect(screen.queryByText('Борис')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Анна'));
  expect(click).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Вера')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
  expect(screen.getByText('Борис')).toBeInTheDocument();
});

test('native export uses the repeat-filtered table, excluding unique rows', async () => {
  render(<FilterableTable><thead><tr><th>Цена</th></tr></thead><tbody>{[10,20,10].map((value,index)=><tr key={index}><td>{value}</td></tr>)}</tbody></FilterableTable>);
  fireEvent.contextMenu(screen.getByRole('columnheader', {name:'Цена'}));
  fireEvent.click(screen.getByRole('menuitemcheckbox', {name:'Повторяющиеся значения'}));
  fireEvent.click(screen.getByRole('button', {name:'Скачать таблицу в Excel'}));
  expect(downloadTableExcel).toHaveBeenCalledWith(['Цена'], [['10'],['10']]);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Скачать таблицу в Excel'})).toBeEnabled());
});
