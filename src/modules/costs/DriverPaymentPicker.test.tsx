import { fireEvent, render, screen } from '@testing-library/react';
import DriverPaymentPicker from './DriverPaymentPicker';
const drivers=[12,2,10,1].map(number=>({driverId:`driver-${number}`,fullName:`Водитель ${number}`,transfers:[{id:`transfer-${number}`,transferNumber:number,branchShort:'TIS'}]})) as any;
const props={drivers,school:'TIS',initial:[],salary:false,onClose:jest.fn(),onConfirm:jest.fn(),transferSchool:()=> 'TIS'};
test('current transfers are shown before selecting drivers in numeric order',()=>{
  render(<DriverPaymentPicker {...props}/>);
  expect(screen.getAllByRole('combobox').map(element=>(element as HTMLSelectElement).value)).toEqual(['transfer-1','transfer-2','transfer-10','transfer-12']);
  expect(screen.getByRole('combobox',{name:'Трансфер для Водитель 12'})).toHaveValue('transfer-12');
});
test('a stale transfer is replaced with the current driver assignment',()=>{
  const confirm=jest.fn();
  render(<DriverPaymentPicker {...props} initial={[{driverId:'driver-2',transferId:'old-transfer',schoolKey:'TIS',name:'Водитель 2',amount:'500'}]} onConfirm={confirm}/>);
  expect(screen.getByRole('combobox',{name:'Трансфер для Водитель 2'})).toHaveValue('transfer-2');
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  expect(confirm).toHaveBeenCalledWith([expect.objectContaining({transferId:'transfer-2',amount:'500'})]);
});

test('adds a reserve driver to the selected school without changing assignments',()=>{
  const reserve={driverId:'reserve',fullName:'Резервный водитель',status:'reserve',transfers:[]} as any;
  const confirm=jest.fn();
  render(<DriverPaymentPicker {...props} salary allDrivers={[...drivers,reserve]} onConfirm={confirm}/>);
  expect(screen.queryByText('Резервный водитель')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Добавить временного водителя'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Временный водитель'}),{target:{value:'reserve'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Трансфер для Резервный водитель'}),{target:{value:'transfer-2'}});
  fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма для Резервный водитель'}),{target:{value:'7000'}});
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  expect(confirm).toHaveBeenCalledWith([expect.objectContaining({driverId:'reserve',temporary:true,schoolKey:'TIS',transferId:'transfer-2',amount:'7000'})]);
  expect(reserve.transfers).toEqual([]);
});
