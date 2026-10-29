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
  expect(screen.getAllByText('TIS')).toHaveLength(2);
  expect(screen.getByText('11')).toBeInTheDocument();
  // Комментарий начинается с меток школы и трансфера.
  expect(document.querySelector('.spending-comment')).toHaveTextContent(/^TIS№11/);
});

test('COGS records show school and transfer first and hide the repeated category', async () => {
  const cogs: SpendingEntry = { id: 'c1', category: 'COGS', subcategory: 'Авансы водителям', amount: 10000, date: '2026-10-15', description: 'Аванс — Алым', recipient: 'Алым', method: 'Безналичные', schoolKey: 'NOVA', transferId: 'transfer-8', driverId: 'driver' };
  const reserve: SpendingEntry = { ...cogs, id: 'c2', transferId: undefined };
  render(<SpendingRecordsTable category="COGS" transferNumbers={{ 'transfer-8': 8 }} rows={[cogs, reserve]} disabled={false} onEdit={jest.fn()} onDelete={jest.fn()} onSave={jest.fn()} />);
  expect(await screen.findAllByText('№8')).toHaveLength(2);
  expect(screen.getByText('Резерв')).toBeInTheDocument();
  const headers = screen.getAllByRole('columnheader').map(header => header.textContent?.trim() || '');
  expect(headers.findIndex(text => text.startsWith('Школа'))).toBeLessThan(headers.findIndex(text => text.startsWith('Сумма')));
  expect(headers.some(text => text.startsWith('Трансфер'))).toBe(true);
  expect(headers.some(text => text.startsWith('Категория'))).toBe(false);
});

test('heading shows the record count with the total and the category column only in All', async () => {
  const rows: SpendingEntry[] = [row, { ...row, id: 'two', amount: 250 }, { ...row, id: 'three', amount: 50 }];
  const { unmount } = render(<SpendingRecordsTable category="CAPEX" rows={rows} disabled={false} onEdit={jest.fn()} onDelete={jest.fn()} onSave={jest.fn()} />);
  expect(await screen.findByText(/3 записи на сумму/)).toHaveTextContent('3 записи на сумму 400 сом');
  expect(screen.getAllByRole('columnheader').some(header => header.textContent?.startsWith('Категория'))).toBe(false);
  unmount();
  render(<SpendingRecordsTable category="ALL" rows={rows} disabled={false} onEdit={jest.fn()} onDelete={jest.fn()} onSave={jest.fn()} />);
  await screen.findByText(/3 записи/);
  expect(screen.getAllByRole('columnheader').some(header => header.textContent?.startsWith('Категория'))).toBe(true);
});

test('COGS records are ordered by school, then transfer, reserve last', async () => {
  const base: SpendingEntry = { id: 'x', category: 'COGS', subcategory: 'Зарплата водителей', amount: 100, date: '2026-10-20', description: 'ЗП', recipient: 'Водитель', method: 'Безналичные', schoolKey: 'GEN4', driverId: 'd' };
  render(<SpendingRecordsTable category="COGS" transferNumbers={{ t3: 3, t1: 1 }} rows={[{ ...base, id: 'r', transferId: undefined }, { ...base, id: 'three', transferId: 't3' }, { ...base, id: 'one', transferId: 't1' }]} disabled={false} onEdit={jest.fn()} onDelete={jest.fn()} onSave={jest.fn()} />);
  await screen.findAllByText('№1');
  const order = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.textContent || '');
  expect(order[0]).toContain('№1');
  expect(order[1]).toContain('№3');
  expect(order[2]).toContain('Резерв');
});
