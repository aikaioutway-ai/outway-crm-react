import { fireEvent, render, screen } from '@testing-library/react';
import DriverPaymentPicker from './DriverPaymentPicker';
const drivers=[12,2,10,1].map(number=>({driverId:`driver-${number}`,fullName:`Водитель ${number}`,transfers:[{id:`transfer-${number}`,transferNumber:number,branchShort:'TIS'}]})) as any;
const props={drivers,school:'TIS',initial:[],salary:false,onClose:jest.fn(),onConfirm:jest.fn(),transferSchool:()=> 'TIS'};
test('rows show school, transfer and driver selects in transfer order',()=>{
  render(<DriverPaymentPicker {...props}/>);
  expect(screen.getByRole('combobox',{name:'Школа для Водитель 1'})).toHaveValue('TIS');
  expect(screen.getByRole('combobox',{name:'Трансфер для Водитель 1'})).toHaveValue('transfer-1');
  expect(screen.getByRole('combobox',{name:'Водитель для Водитель 1'})).toHaveValue('driver-1');
  expect(screen.queryByRole('button',{name:'Добавить временного водителя'})).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox',{name:'Временный водитель'})).not.toBeInTheDocument();
});
test.each([true,false])('row plus preserves school and transfer for another recipient, salary=%s',(salary)=>{
  const reserve={driverId:'reserve',fullName:'Резервный водитель',status:'reserve',transfers:[]} as any;
  const confirm=jest.fn();
  render(<DriverPaymentPicker {...props} salary={salary} allDrivers={[...drivers,reserve]} onConfirm={confirm}/>);
  fireEvent.click(screen.getByRole('button',{name:'Добавить водителя к TIS · № 2'}));
  const added=screen.getAllByRole('combobox').find(element=>element.getAttribute('aria-label')?.startsWith('Водитель для строки'))!;
  fireEvent.change(added,{target:{value:'reserve'}});
  expect(screen.getByRole('combobox',{name:'Школа для Резервный водитель'})).toHaveValue('TIS');
  expect(screen.getByRole('combobox',{name:'Трансфер для Резервный водитель'})).toHaveValue('transfer-2');
  fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма для Резервный водитель'}),{target:{value:'7000'}});
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  expect(confirm).toHaveBeenCalledWith([expect.objectContaining({driverId:'reserve',temporary:true,schoolKey:'TIS',transferId:'transfer-2',amount:'7000'})]);
  expect(reserve.transfers).toEqual([]);
});
