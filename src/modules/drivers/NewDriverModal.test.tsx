import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import NewDriverModal from './NewDriverModal';
import {createV2Driver} from '../../services/crmV2Service';
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
