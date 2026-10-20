import { fireEvent, render, screen } from '@testing-library/react';
import TasksModule from './TasksModule';
import { useTasks } from '../../services/taskService';
jest.mock('../../services/taskService',()=>({
  useTasks:jest.fn(()=>({data:{rows:[],total:0},refetch:jest.fn()})),
  useTaskMetadata:()=>({data:{employees:[],canViewAll:true},refetch:jest.fn()}),
  useTaskSummary:()=>({data:{open:2,new:1,overdue:1,dueSoon:0,review:0},refetch:jest.fn()}),
}));
jest.mock('./TaskComposer',()=>()=>null);
jest.mock('./TaskDetail',()=>()=>null);
jest.mock('./TaskTeamOverview',()=>()=> <div>Статистика команды</div>);
const user={id:'actor',role:'cashier',name:'Кассир',sessionToken:'session'} as any;
test('shows dashboard, three task lists and department statistics without filters',()=>{
  render(<TasksModule user={user}/>);
  for(const name of ['Мои задачи','Поставленные мной','Наблюдаю','Все задачи']) expect(screen.getByRole('heading',{name})).toBeInTheDocument();
  expect(screen.getByText('Статистика команды')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Мои открытые 2'})).toBeInTheDocument();
});
test('dashboard filters assigned tasks by overdue date',()=>{
  render(<TasksModule user={user}/>);
  fireEvent.click(screen.getByRole('button',{name:'Просрочены 1'}));
  expect(useTasks).toHaveBeenLastCalledWith('session',expect.objectContaining({view:'mine',status:'active',due:'overdue'}),0);
  fireEvent.click(screen.getByRole('button',{name:'Сбросить фильтр дашборда'}));
  expect(useTasks).toHaveBeenLastCalledWith('session',expect.objectContaining({view:'mine',status:'active',due:''}),0);
});

test('department dashboard can be collapsed and expanded',()=>{
  render(<TasksModule user={user}/>);
  const toggle=screen.getByRole('button',{name:'Все задачи'});
  expect(toggle).toHaveAttribute('aria-expanded','false');
  expect(screen.getByText('Статистика команды')).not.toBeVisible();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded','true');
  expect(screen.getByText('Статистика команды')).toBeVisible();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded','false');
});
