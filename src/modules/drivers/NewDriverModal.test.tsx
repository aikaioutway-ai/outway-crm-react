import {StrictMode} from 'react';
import {reserveTemporaryDriverName} from '../../services/expenseService';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import NewDriverModal from './NewDriverModal';
import {createV2Driver} from '../../services/crmV2Service';
jest.mock('../../services/expenseService',()=>({reserveTemporaryDriverName:jest.fn()}));
jest.mock('../../services/crmV2Service',()=>({createV2Driver:jest.fn().mockResolvedValue('new-driver'),createDefaultV2DriverDocuments:()=>[]}));
test('new-driver form exposes status and saves an inactive payment recipient without assignment',async()=>{
  const created=jest.fn();
  render(<NewDriverModal branches={[]} paymentRecipientOnly onClose={jest.fn()} onCreated={created}/>);
  expect(screen.getByLabelText('Статус')).toHaveValue('inactive');
  expect(screen.getByLabelText('Статус')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('ФИО'),{target:{value:'Новый водитель'}});
  fireEvent.change(screen.getByLabelText('Номер'),{target:{value:'0555123456'}});
  fireEvent.click(screen.getByRole('button',{name:'Добавить'}));
  await waitFor(()=>expect(created).toHaveBeenCalledWith('new-driver'));
  expect(createV2Driver).toHaveBeenCalledWith(expect.objectContaining({status:'inactive',branchId:undefined,transferNumber:undefined}));
});
test('ordinary creation permits selecting status',()=>{
  render(<NewDriverModal branches={[]} onClose={jest.fn()} onCreated={jest.fn()}/>);
  fireEvent.change(screen.getByLabelText('Статус'),{target:{value:'inactive'}});
  expect(screen.getByLabelText('Статус')).toHaveValue('inactive');
  expect(screen.getByLabelText('Статус')).not.toBeDisabled();
});

test('prefills the shared server number once in StrictMode and allows editing it',async()=>{
  jest.mocked(reserveTemporaryDriverName).mockResolvedValueOnce('Временный водитель №105');
  render(<StrictMode><NewDriverModal branches={[]} paymentRecipientOnly sessionToken="session" onClose={jest.fn()} onCreated={jest.fn()}/></StrictMode>);
  expect(await screen.findByDisplayValue('Временный водитель №105')).toBeInTheDocument();
  expect(reserveTemporaryDriverName).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('ФИО'),{target:{value:'Адилет'}});
  expect(screen.getByRole('heading',{name:'Адилет'})).toBeInTheDocument();
});
test('a delayed default name does not replace a name already entered by the user',async()=>{
  let resolveName!:(value:string)=>void;
  jest.mocked(reserveTemporaryDriverName).mockImplementationOnce(()=>new Promise(resolve=>{resolveName=resolve;}));
  render(<NewDriverModal branches={[]} sessionToken="session" onClose={jest.fn()} onCreated={jest.fn()}/>);
  fireEvent.change(screen.getByLabelText('ФИО'),{target:{value:'Введённое имя'}});
  resolveName('Временный водитель №106');
  await waitFor(()=>expect(screen.getByLabelText('ФИО')).toHaveValue('Введённое имя'));
});
