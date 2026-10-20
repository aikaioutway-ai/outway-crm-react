import { render, screen } from '@testing-library/react';
import TaskTeamOverview from './TaskTeamOverview';
jest.mock('../../services/taskService',()=>({useTaskStatistics:()=>({data:{byEmployee:Object.fromEntries(['manager','logist','cashier','admin'].map(id=>[id,{total:1,open:1,completed:0,overdue:0,review:0}]))}})}));
const employees=['manager','logist','cashier','admin'].map(role=>({id:role,full_name:role,role,status:'active'})) as any;
test.each([['admin',['Логистика','Менеджеры','Финансы','Руководство']],['gen_director',['Логистика','Менеджеры','Финансы','Руководство']],['director',['Менеджеры']],['senior_logist',['Логистика']]])('%s sees only permitted departments',(role,visible)=>{
  render(<TaskTeamOverview token="session" role={role} employees={employees} onSelect={()=>{}}/>);
  for(const department of ['Логистика','Менеджеры','Финансы','Руководство']) {
    expect(Boolean(screen.queryByRole('button',{name:department}))).toBe(visible.includes(department));
  }
});

test('department view shows employee metrics and opens that employee tasks',()=>{
  const select=jest.fn();
  render(<TaskTeamOverview token="session" role="admin" departmentKey="logistics" employees={employees} onSelect={select}/>);
  expect(screen.queryByRole('button',{name:'Менеджеры'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'logist'})).toBeInTheDocument();
  screen.getByRole('button',{name:'logist'}).click();
  expect(select).toHaveBeenCalledWith('logistics','logist');
});
