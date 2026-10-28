import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TaskDetail from './TaskDetail';
import { mutateTask, useTaskDetail } from '../../services/taskService';
import type { AuthenticatedUser } from '../../services/employeeService';
const task={id:'task',title:'Проверить остановку',description:'Проверить адрес',creator_id:'manager',assignee_id:'logist',status:'new',priority:'normal',due_at:'2099-01-01T12:00:00Z',requires_review:true,target:{type:'child',id:'child',label:'Ребёнок'},result:'',version:2};
jest.mock('../../services/taskService',()=>({useTaskDetail:jest.fn(),mutateTask:jest.fn().mockResolvedValue({})}));
const detail=useTaskDetail as jest.Mock;
const employees=[{id:'manager',full_name:'Менеджер',role:'manager',status:'active'},{id:'logist',full_name:'Логист',role:'logist',status:'active'}] as any;
const user={id:'logist',role:'logist',name:'Логист',sessionToken:'session'} as AuthenticatedUser;
beforeEach(()=>{jest.clearAllMocks();detail.mockReturnValue({data:{task,events:[]},refetch:jest.fn()});});
test('only assignee is offered task acceptance',async()=>{
  render(<TaskDetail id="task" user={user} employees={employees} onClose={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Принять в работу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','accept',expect.objectContaining({version:2}),'task'));
});
test('creator reviews completed work instead of silently accepting own result',()=>{
  detail.mockReturnValue({data:{task:{...task,status:'review',result:'Адрес подтверждён'},events:[]}});
  const {rerender}=render(<TaskDetail id="task" user={user} employees={employees} onClose={jest.fn()}/>);
  expect(screen.queryByRole('button',{name:'Подтвердить выполнение'})).not.toBeInTheDocument();
  rerender(<TaskDetail id="task" user={{...user,id:'manager',role:'manager'}} employees={employees} onClose={jest.fn()}/>);
  expect(screen.getByRole('button',{name:'Подтвердить выполнение'})).toBeInTheDocument();
  expect(screen.getByText('Адрес подтверждён')).toBeInTheDocument();
});

test('assignee cannot delete a task created by another person',()=>{
  render(<TaskDetail id="task" user={user} employees={employees} onClose={jest.fn()}/>);
  expect(screen.queryByRole('button',{name:'Удалить задачу'})).not.toBeInTheDocument();
});

test('creator confirms deletion with a reason and the current task version',async()=>{
  const onClose=jest.fn();
  render(<TaskDetail id="task" user={{...user,id:'manager',role:'manager'}} employees={employees} onClose={onClose}/>);
  fireEvent.click(screen.getByRole('button',{name:'Удалить задачу'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Причина удаления (история сохранится)'}),{target:{value:'Ошибочно создана'}});
  fireEvent.click(screen.getAllByRole('button',{name:'Удалить задачу'}).at(-1)!);
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','delete',expect.objectContaining({version:2,comment:'Ошибочно создана'}),'task'));
  expect(onClose).toHaveBeenCalled();
});


test('secondary participant can accept and sees all participant names',async()=>{
  detail.mockReturnValue({data:{task:{...task,assignee_id:'manager',assignee_ids:['manager','logist']},events:[]},refetch:jest.fn()});
  render(<TaskDetail id="task" user={user} employees={employees} onClose={jest.fn()}/>);
  expect(screen.getByText('Менеджер, Логист')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Принять в работу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','accept',expect.objectContaining({version:2}),'task'));
});

test('secondary participant can send the shared result for review',async()=>{
  detail.mockReturnValue({data:{task:{...task,assignee_id:'manager',assignee_ids:['manager','logist'],status:'in_progress'},events:[]},refetch:jest.fn()});
  render(<TaskDetail id="task" user={user} employees={employees} onClose={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Отправить на проверку'}));
  fireEvent.change(screen.getByLabelText('Что сделано?'),{target:{value:'Совместно проверили маршрут'}});
  fireEvent.click(screen.getByRole('button',{name:'Сохранить результат'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','submit',expect.objectContaining({result:'Совместно проверили маршрут'}),'task'));
});
