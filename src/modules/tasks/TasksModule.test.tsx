import { fireEvent, render, screen } from '@testing-library/react';
import TasksModule from './TasksModule';
import { useTasks } from '../../services/taskService';
jest.mock('../../services/taskService',()=>({
  useTasks:jest.fn(()=>({data:{rows:[],total:0},refetch:jest.fn()})),
  useTaskMetadata:()=>({data:{employees:[],canViewAll:true},refetch:jest.fn()}),
  useTaskSummary:()=>({data:{},refetch:jest.fn()}),
}));
jest.mock('./TaskComposer',()=>()=>null);
jest.mock('./TaskDetail',()=>()=>null);
jest.mock('./TaskTeamOverview',()=>({onSelect}:any)=> <div>Статистика команды<button onClick={()=>onSelect('logistics','')}>Открыть логистику</button></div>);

test('created tab includes completed tasks instead of inheriting the active filter',()=>{
  render(<TasksModule user={{id:'actor',role:'cashier',name:'Кассир',sessionToken:'session'} as any}/>);
  fireEvent.click(screen.getByRole('tab',{name:'Поставленные мной'}));
  expect(useTasks).toHaveBeenLastCalledWith('session',expect.objectContaining({view:'created',status:'all',due:''}),0);
  expect(screen.getByRole('combobox',{name:'Статус'})).toHaveValue('all');
});

test('all tasks opens department statistics for cashiers',()=>{
  render(<TasksModule user={{id:'actor',role:'cashier',name:'Кассир',sessionToken:'session'} as any}/>);
  fireEvent.click(screen.getByRole('tab',{name:'Все задачи'}));
  expect(screen.getByText('Статистика команды')).toBeInTheDocument();
  expect(useTasks).toHaveBeenLastCalledWith('session',expect.objectContaining({view:'all',status:'all'}),0);
});

test('department overview stays inline and department tasks open in a window',()=>{
  render(<TasksModule user={{id:'actor',role:'cashier',name:'Кассир',sessionToken:'session'} as any}/>);
  fireEvent.click(screen.getByRole('tab',{name:'Все задачи'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Открыть логистику'}));
  expect(screen.getByRole('dialog',{name:'Задачи отдела Логистика'})).toBeInTheDocument();
  expect(useTasks).toHaveBeenLastCalledWith('session',expect.objectContaining({view:'all',department:'logistics',status:'all'}),0);
  fireEvent.click(screen.getByRole('button',{name:'Закрыть все задачи'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('tab',{name:'Все задачи'})).toHaveAttribute('aria-selected','true');
  expect(useTasks).toHaveBeenLastCalledWith('session',expect.objectContaining({view:'all',department:'',status:'all'}),0);
});
