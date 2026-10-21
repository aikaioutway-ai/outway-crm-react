import {render, screen} from '@testing-library/react';
import SchoolDashboardTable from './SchoolDashboardTable';

test('overview opens all records and keeps download in the detailed list only',()=>{
  render(<SchoolDashboardTable columns={[{key:'name',label:'Школа',total:1,color:'teal'},{key:'amount',label:'Сумма',total:100,color:'teal'}]} rows={[{key:'a',label:'Доступная школа',values:{amount:100}}]} sortKey="name" ascending onSort={jest.fn()} onSelect={jest.fn()}/>);
  expect(screen.queryByRole('button',{name:'Все записи'})).not.toBeInTheDocument();
  expect(document.querySelector('.table-actions-bar')).toBeNull();
  expect(screen.queryByRole('button',{name:'Скачать таблицу в Excel'})).not.toBeInTheDocument();
});
