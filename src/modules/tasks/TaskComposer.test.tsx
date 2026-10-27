import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TaskComposer from './TaskComposer';
import { mutateTask, useTaskMetadata } from '../../services/taskService';
import type { CrmTask, TaskTarget } from './taskTypes';

jest.mock('../../services/taskService',()=>({
  useTaskMetadata:jest.fn(()=>({data:{multipleAssignees:true,employees:[
    {id:'employee',full_name:'Логист Тест',role:'logist',status:'active'},
    {id:'manager',full_name:'Менеджер Тест',role:'manager',status:'active'},
    {id:'observer',full_name:'Гендиректор Тест',role:'gen_director',status:'active'},
    {id:'director',full_name:'Директор Тест',role:'director',status:'active'},
    {id:'senior',full_name:'Начальник Тест',role:'senior_logist',status:'active'},
    {id:'cashier',full_name:'Кассир Тест',role:'cashier',status:'active'},
    {id:'admin',full_name:'Администратор Тест',role:'admin',status:'active'},
    {id:'dismissed',full_name:'Уволенный',role:'cashier',status:'dismissed'},
  ]}})),
  useResolvedTaskTarget:()=>({}),
  useTaskTargets:(_token:string,type:string,school:string,_search:string,_enabled:boolean,context?:{transferId?:string;group?:string})=>({data:{targets:school!=='TIS'?[]:type==='transfer'?[{type:'transfer',id:'transfer',label:'TIS · № 3',schoolKey:'TIS',transferNumber:3}]:[
    {type:'child',id:'child',label:'Ребёнок Маршрут',schoolKey:'TIS',transferId:'transfer'},
    {type:'child',id:'new-child',label:'Ребёнок Новый',schoolKey:'TIS',group:'new'},
    {type:'child',id:'rejected-child',label:'Ребёнок Отказ',schoolKey:'TIS',group:'rejected'},
  ].filter(child=>(!context?.transferId || child.transferId===context.transferId) && (!context?.group || child.group===context.group))}}),
  mutateTask:jest.fn().mockResolvedValue({}),
}));
const openRecipients=()=>{const button=screen.getByRole('button',{name:'Ответственный'});if(button.getAttribute('aria-expanded')!=='true')fireEvent.click(button);};
const change=(label:string,value:string)=>{
  if(label==='Ответственный'){openRecipients();fireEvent.click(screen.getByRole('checkbox',{name:value==='employee'?/Логист Тест/:/Менеджер Тест/}));return;}
  if(label==='Школа' && !screen.queryByLabelText('Школа'))fireEvent.click(screen.getByRole('button',{name:'Выбрать школу, трансфер или ребёнка'}));
  fireEvent.change(screen.getByLabelText(label),{target:{value}});
};
function fillResponsible(){change('Отдел ответственного','logistics');change('Ответственный','employee');change('Наблюдатель','observer');}
beforeEach(()=>jest.clearAllMocks());

test('school-only task leaves transfer and child empty and saves observer',async()=>{
  const close=jest.fn();render(<TaskComposer token="session" onClose={close}/>);
  expect(screen.getByLabelText('Привязка')).toHaveValue('general');
  expect(screen.getByLabelText('Ответственный')).toBeDisabled();
  change('Школа','TIS');change('Что нужно сделать','Проверить школу');fillResponsible();
  expect(screen.getByLabelText('Трансфер')).toHaveValue('');expect(screen.getByLabelText('Ребёнок')).toHaveValue('');
  fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));
  expect(mutateTask).toHaveBeenCalledWith('session','create',expect.objectContaining({assigneeId:'employee',observerId:'observer',target:{type:'school',id:'TIS',label:'TIS',schoolKey:'TIS'}}),undefined);
});

test('selects child through school and transfer and resets dependent fields',async()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);change('Школа','TIS');change('Трансфер','transfer');
  expect(within(screen.getByLabelText('Ребёнок')).queryByRole('option',{name:'Ребёнок Новый'})).not.toBeInTheDocument();
  change('Ребёнок','child');change('Что нужно сделать','Назначить остановку');fillResponsible();
  fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','create',expect.objectContaining({target:expect.objectContaining({type:'child',id:'child',transferId:'transfer',schoolKey:'TIS'})}),undefined));
  change('Школа','ERU');expect(screen.getByLabelText('Трансфер')).toHaveValue('');expect(screen.getByLabelText('Ребёнок')).toHaveValue('');
});

test.each([['group:new','new','Ребёнок Новый'],['group:rejected','rejected','Ребёнок Отказ']])('supports group %s without requiring a child',async(route,group,childName)=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);change('Школа','TIS');change('Трансфер',route);
  expect(within(screen.getByLabelText('Ребёнок')).getByRole('option',{name:childName})).toBeInTheDocument();
  expect(within(screen.getByLabelText('Ребёнок')).queryByRole('option',{name:'Ребёнок Маршрут'})).not.toBeInTheDocument();
  change('Что нужно сделать','Обработать заявки');fillResponsible();fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','create',expect.objectContaining({target:expect.objectContaining({type:'group',id:`TIS:${group}`,group,schoolKey:'TIS'})}),undefined));
});

test('department filters checkboxes and preserves selected employees',()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);change('Отдел ответственного','logistics');change('Ответственный','employee');
  expect(screen.queryByRole('checkbox',{name:/Менеджер Тест/})).not.toBeInTheDocument();
  change('Отдел ответственного','management');openRecipients();
  expect(screen.getByRole('button',{name:'Ответственный'})).toHaveTextContent('Логист Тест');
  expect(screen.queryByRole('checkbox',{name:/Логист Тест/})).not.toBeInTheDocument();
});

test('observer choices contain only the four requested active leadership roles',()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);const observer=within(screen.getByLabelText('Наблюдатель'));
  for(const name of ['Гендиректор Тест','Директор Тест','Начальник Тест','Кассир Тест'])expect(observer.getByRole('option',{name})).toBeInTheDocument();
  for(const name of ['Администратор Тест','Менеджер Тест','Логист Тест','Уволенный'])expect(observer.queryByRole('option',{name})).not.toBeInTheDocument();
  expect(screen.getByLabelText('Наблюдатель')).not.toBeRequired();
});

test('rescheduling preserves observer and requires reason',async()=>{
  const task={id:'task',title:'Проверить маршрут',description:'',assignee_id:'employee',observer_id:'observer',due_at:'2026-10-20T12:00:00Z',priority:'normal',requires_review:true,target:{type:'school',id:'TIS',label:'TIS',schoolKey:'TIS'} as TaskTarget,version:4} as CrmTask;
  render(<TaskComposer token="session" task={task} onClose={jest.fn()}/>);
  expect(screen.getByLabelText('Отдел ответственного')).toHaveValue('logistics');
  change('Срок выполнения','2026-10-21T18:00');expect(screen.getByLabelText('Причина переноса срока')).toBeRequired();change('Причина переноса срока','Ждём расписание');
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','edit',expect.objectContaining({version:4,observerId:'observer',comment:'Ждём расписание'}),'task'));
});

test('server error leaves draft available',async()=>{
  (mutateTask as jest.Mock).mockRejectedValueOnce(new Error('Сессия истекла'));render(<TaskComposer token="expired" onClose={jest.fn()}/>);
  change('Школа','TIS');change('Что нужно сделать','Проверить маршрут');fillResponsible();fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Сессия истекла'));expect(screen.getByLabelText('Что нужно сделать')).toHaveValue('Проверить маршрут');
});

test('resolves toolbar transfer number and filters children before saving',async()=>{
  render(<TaskComposer token="session" target={{type:'transfer',id:'',schoolKey:'TIS',transferNumber:3,label:'Трансфер № 3'}} onClose={jest.fn()}/>);
  await waitFor(()=>expect(screen.getByLabelText('Трансфер')).toHaveValue('transfer'));
  expect(screen.getByLabelText('Школа')).toHaveValue('TIS');
  expect(within(screen.getByLabelText('Ребёнок')).queryByRole('option',{name:'Ребёнок Новый'})).not.toBeInTheDocument();
  change('Что нужно сделать','Проверить трансфер');fillResponsible();
  fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','create',expect.objectContaining({target:expect.objectContaining({type:'transfer',id:'transfer',schoolKey:'TIS',transferNumber:3})}),undefined));
});


test('creates a general task without a school or observer',async()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);
  change('Что нужно сделать','Подготовить отчёт');
  change('Отдел ответственного','logistics');change('Ответственный','employee');
  fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','create',expect.objectContaining({observerId:null,target:{type:'general',id:'',label:'Общая задача'}}),undefined));
});

test('school context has no child search and lists transfers before application groups',()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);change('Школа','TIS');
  expect(screen.queryByLabelText('Поиск ребёнка')).not.toBeInTheDocument();
  const labels=within(screen.getByLabelText('Трансфер')).getAllByRole('option').map(option=>option.textContent);
  expect(labels.indexOf('TIS · № 3')).toBeLessThan(labels.indexOf('Новые'));
  expect(labels.indexOf('TIS · № 3')).toBeLessThan(labels.indexOf('Отказные'));
});



test('keeps the original fields and selects people across departments with checkboxes',async()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);
  expect(screen.queryByLabelText('Кому поставить задачу')).not.toBeInTheDocument();
  change('Что нужно сделать','Проверить маршрут вместе');change('Отдел ответственного','management');change('Ответственный','manager');
  change('Отдел ответственного','logistics');change('Ответственный','employee');
  expect(screen.getByRole('button',{name:'Ответственный'})).toHaveTextContent('Менеджер Тест, Логист Тест');
  fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','create',expect.objectContaining({assigneeIds:['manager','employee'],assignmentDepartment:null}),undefined));
});

test('whole department checkbox selects logistics without its head',async()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);change('Что нужно сделать','Проверить маршруты');change('Отдел ответственного','logistics');openRecipients();
  fireEvent.click(screen.getByRole('checkbox',{name:'Весь отдел'}));
  expect(screen.getByRole('checkbox',{name:/Логист Тест/})).toBeChecked();
  expect(screen.queryByRole('checkbox',{name:/Начальник Тест/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','create',expect.objectContaining({assigneeIds:['employee'],assignmentDepartment:'logistics'}),undefined));
});

test('leadership includes the logistics head',()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);change('Отдел ответственного','leadership');openRecipients();
  expect(screen.getByRole('checkbox',{name:/Начальник Тест/})).toBeInTheDocument();
});

test('can remove selections and requires at least one participant',()=>{
  render(<TaskComposer token="session" onClose={jest.fn()}/>);change('Что нужно сделать','Общая задача');change('Отдел ответственного','management');change('Ответственный','manager');
  fireEvent.click(screen.getByRole('checkbox',{name:/Менеджер Тест/}));fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  expect(screen.getByRole('alert')).toHaveTextContent('выберите исполнителей');expect(mutateTask).not.toHaveBeenCalled();
});

test('editing preserves every participant without extra assignment modes',async()=>{
  const task={id:'shared',title:'Общая задача',description:'',assignee_id:'employee',assignee_ids:['employee','manager'],due_at:'2099-01-01T12:00:00Z',priority:'normal',requires_review:true,target:{type:'general',id:'',label:'Общая задача'},version:3} as CrmTask;
  render(<TaskComposer token="session" task={task} onClose={jest.fn()}/>);
  expect(screen.getByRole('button',{name:'Ответственный'})).toHaveTextContent('Логист Тест, Менеджер Тест');
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
  await waitFor(()=>expect(mutateTask).toHaveBeenCalledWith('session','edit',expect.objectContaining({assigneeIds:['employee','manager'],version:3}),'shared'));
});

test('old server never silently saves only the first selected participant',()=>{
  const metadata=useTaskMetadata as jest.Mock;
  const current=metadata();metadata.mockReturnValue({...current,data:{...current.data,multipleAssignees:false}});
  render(<TaskComposer token="session" onClose={jest.fn()}/>);
  change('Что нужно сделать','Общая задача');change('Отдел ответственного','management');change('Ответственный','manager');change('Отдел ответственного','logistics');change('Ответственный','employee');
  fireEvent.click(screen.getByRole('button',{name:'Поставить задачу'}));
  expect(screen.getByRole('alert')).toHaveTextContent('после обновления сервера');expect(mutateTask).not.toHaveBeenCalled();
  metadata.mockReturnValue(current);
});
