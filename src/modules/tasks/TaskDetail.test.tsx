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
