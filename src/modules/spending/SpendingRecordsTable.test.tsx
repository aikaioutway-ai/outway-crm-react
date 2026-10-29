import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SpendingRecordsTable, { editSpendingCell } from './SpendingRecordsTable';
import type { SpendingEntry } from './SpendingModule';
jest.mock('../../services/supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})}),upsert:async()=>({error:null})})}}));
const row: SpendingEntry={id:'one',category:'CAPEX',subcategory:'Мебель',amount:100,date:'2026-10-01',description:'Стол',recipient:'Поставщик',method:'Безналичные',unitPrice:50,quantity:2};
test('shared table saves inline changes and exposes edit, delete and Excel actions',async()=>{
  const save=jest.fn().mockResolvedValue(true),edit=jest.fn(),remove=jest.fn();
  render(<SpendingRecordsTable rows={[row]} disabled={false} onEdit={edit} onDelete={remove} onSave={save}/>);
  fireEvent.click(await screen.findByText('Стол'));
  const input=screen.getByDisplayValue('Стол');
  fireEvent.change(input,{target:{value:'Новый стол'}});fireEvent.keyDown(input,{key:'Enter'});
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({id:'one',description:'Новый стол'})));
  fireEvent.click(screen.getByRole('button',{name:'Редактировать Стол'}));expect(edit).toHaveBeenCalledWith(row);
  fireEvent.click(screen.getByRole('button',{name:'Удалить Стол'}));expect(remove).toHaveBeenCalledWith(row);
  expect(screen.getByRole('button',{name:'Скачать таблицу в Excel'})).toBeInTheDocument();
});
test('price and quantity edits recalculate the amount and invalid numbers cannot be saved',()=>{
  expect(editSpendingCell(row,'quantity','3')).toMatchObject({unitPrice:50,quantity:3,amount:150});
  expect(editSpendingCell(row,'amount','300')).toMatchObject({unitPrice:150,quantity:2,amount:300});
  expect(editSpendingCell(row,'amount','1 250,50')).toMatchObject({amount:1250.5});
  expect(editSpendingCell(row,'amount','broken')).toBeNull();
  expect(editSpendingCell(row,'quantity','0')).toBeNull();
});

test('school records show school and transfer number', async () => {
  render(<SpendingRecordsTable showSchoolDetails rows={[{...row, schoolKey:'TIS', transferNumber:11}]} disabled={false} onEdit={jest.fn()} onDelete={jest.fn()} onSave={jest.fn()} />);
  expect(await screen.findByText('Школа')).toBeInTheDocument();
  expect(screen.getByText('№ трансфера')).toBeInTheDocument();
  expect(screen.getByText('TIS')).toBeInTheDocument();
  expect(screen.getByText('11')).toBeInTheDocument();
});
