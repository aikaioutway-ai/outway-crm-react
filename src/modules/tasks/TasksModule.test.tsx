import { fireEvent, render, screen, within } from '@testing-library/react';
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


test('personal lists show active tasks and completed lists load only when expanded',()=>{
  (useTasks as jest.Mock).mockClear();
  render(<TasksModule user={user}/>);
  const initial=(useTasks as jest.Mock).mock.calls;
  expect(initial.some(([,filters])=>filters.status==='done')).toBe(false);
  for(const view of ['mine','created','watching'])expect(initial.some(([,filters])=>filters.view===view && filters.status==='active')).toBe(true);
  const toggle=screen.getByRole('button',{name:'Выполненные задачи'});
  expect(toggle).toHaveAttribute('aria-expanded','false');fireEvent.click(toggle);
  const completed=screen.getByLabelText('Выполненные задачи');
  for(const name of ['Мои задачи','Поставленные мной','Наблюдаю'])expect(within(completed).getByRole('heading',{name})).toBeInTheDocument();
  for(const view of ['mine','created','watching'])expect((useTasks as jest.Mock).mock.calls.some(([,filters])=>filters.view===view && filters.status==='done')).toBe(true);
  expect(within(completed).queryByRole('button',{name:/Поставить задачу:/})).not.toBeInTheDocument();
  fireEvent.click(toggle);expect(toggle).toHaveAttribute('aria-expanded','false');expect(screen.queryByLabelText('Выполненные задачи')).not.toBeInTheDocument();
});


test('overdue cards use the full-card warning and completed tasks stay in the completed section',()=>{
  const task={id:'warning',title:'Просроченная проверка',creator_id:'actor',assignee_id:'actor',due_at:'2000-01-01T00:00:00Z',status:'in_progress',priority:'normal'};
  (useTasks as jest.Mock).mockImplementation((_token,filters)=>({data:{rows:filters.status==='done'?[{...task,id:'done',title:'Готовая проверка',status:'done'}]:filters.status==='active'?[task]:[],total:1},refetch:jest.fn()}));
  render(<TasksModule user={user}/>);
  expect(screen.queryByText('Готовая проверка')).not.toBeInTheDocument();
  expect(screen.getAllByText('Просроченная проверка')[0].closest('article')).toHaveClass('tasks-card-overdue');
  fireEvent.click(screen.getByRole('button',{name:'Выполненные задачи'}));
  const completed=screen.getByLabelText('Выполненные задачи');
  expect(within(completed).getAllByText('Готовая проверка')).toHaveLength(3);
  expect(within(completed).getAllByText('Готовая проверка')[0].closest('article')).not.toHaveClass('tasks-card-overdue');
});
