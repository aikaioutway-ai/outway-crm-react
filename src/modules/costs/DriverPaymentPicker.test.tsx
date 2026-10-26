import { fireEvent, render, screen } from '@testing-library/react';
import DriverPaymentPicker from './DriverPaymentPicker';
const drivers=[12,2,10,1].map(number=>({driverId:`driver-${number}`,fullName:`Водитель ${number}`,transfers:[{id:`transfer-${number}`,transferNumber:number,branchShort:'TIS'}]})) as any;
const props={drivers,school:'TIS',initial:[],salary:false,onClose:jest.fn(),onConfirm:jest.fn(),transferSchool:()=> 'TIS'};
test('rows show school, transfer and driver selects in transfer order',()=>{
  render(<DriverPaymentPicker {...props}/>);
  expect(screen.getByRole('combobox',{name:'Школа для Водитель 1'})).toHaveValue('TIS');
  expect(screen.getByRole('combobox',{name:'Трансфер для Водитель 1'})).toHaveValue('transfer-1');
  expect(screen.getByRole('button',{name:'Водитель для Водитель 1'})).toHaveTextContent('Водитель 1');
  expect(screen.queryByRole('button',{name:'Добавить временного водителя'})).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox',{name:'Временный водитель'})).not.toBeInTheDocument();
});
test.each([true,false])('row plus preserves school and transfer for another recipient, salary=%s',(salary)=>{
  const reserve={driverId:'reserve',fullName:'Резервный водитель',status:'reserve',transfers:[]} as any;
  const confirm=jest.fn();
  render(<DriverPaymentPicker {...props} salary={salary} allDrivers={[...drivers,reserve]} onConfirm={confirm}/>);
  fireEvent.click(screen.getByRole('button',{name:'Добавить водителя к TIS · № 2'}));
  fireEvent.click(screen.getByRole('option',{name:'Резервный водитель'}));
  expect(screen.getByRole('combobox',{name:'Школа для Резервный водитель'})).toHaveValue('TIS');
  expect(screen.getByRole('combobox',{name:'Трансфер для Резервный водитель'})).toHaveValue('transfer-2');
  fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма для Резервный водитель'}),{target:{value:'7000'}});
  fireEvent.click(screen.getByRole('button',{name:'Готово'}));
  expect(confirm).toHaveBeenCalledWith([expect.objectContaining({driverId:'reserve',temporary:true,schoolKey:'TIS',transferId:'transfer-2',amount:'7000'})]);
  expect(reserve.transfers).toEqual([]);
});

test('recipient menu has pinned current driver, search and one create action; added row can be removed',()=>{
  const reserve={driverId:'reserve',fullName:'Резервный водитель',status:'reserve',transfers:[]} as any;
  render(<DriverPaymentPicker {...props} salary allDrivers={[...drivers,reserve]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Водитель для Водитель 1'}));
  expect(screen.queryByRole('option',{name:'Добавить водителя'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Добавить нового'})).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox',{name:'Поиск водителя в списке'}),{target:{value:'Резервный'}});
  expect(screen.getByRole('option',{name:'Резервный водитель'})).toBeInTheDocument();
  expect(screen.queryByRole('option',{name:'Водитель 2'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option',{name:'Резервный водитель'}));
  expect(screen.getByRole('button',{name:'Водитель для Водитель 1'})).toHaveTextContent('Водитель 1');
  expect(document.querySelector('.transfer-group-before')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Удалить получателя Резервный водитель'}));
  expect(screen.queryByRole('button',{name:'Водитель для Резервный водитель'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Водитель для Водитель 1'})).toBeInTheDocument();
  expect(screen.getByRole('combobox',{name:'Трансфер для Водитель 1'})).toHaveDisplayValue('№1');
});
