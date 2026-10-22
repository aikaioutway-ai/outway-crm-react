import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CellComments from './CellComments';
import { addCellComment, readCellComments, callCellComments, mutateCellComment } from '../../services/cellCommentService';
jest.mock('../../services/cellCommentService',()=>({addCellComment:jest.fn(),readCellComments:jest.fn(),callCellComments:jest.fn(),mutateCellComment:jest.fn()}));
beforeEach(()=>{
  jest.clearAllMocks();
  let sequence=0;
  Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`});
  (readCellComments as jest.Mock).mockResolvedValue({comments:[],hasMore:false});
  (callCellComments as jest.Mock).mockResolvedValue({counts:{}});
});
function setup(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 render(<QueryClientProvider client={client}><table data-comment-table="test" data-comment-context="2026-10"><tbody><tr data-comment-row="a"><td data-comment-column="price">100</td></tr><tr data-comment-row="b"><td data-comment-column="price">200</td></tr></tbody></table><CellComments token="session"/></QueryClientProvider>);
 return client;
}
test('a comment opens and saves against the chosen cell without opening the row',async()=>{
 setup();
 fireEvent.keyDown(screen.getByText('200'),{key:'Enter',altKey:true});
 const dialog=await screen.findByRole('dialog');
 await waitFor(()=>expect(within(dialog).getByRole('textbox')).toBeEnabled());
 fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Уточните сумму'}});
 (addCellComment as jest.Mock).mockResolvedValue({comment:{id:'saved'}});
 (readCellComments as jest.Mock).mockResolvedValue({comments:[{id:'saved',author_id:'employee',author_name:'Кассир',body:'Уточните сумму',created_at:'2026-10-22T12:00:00Z'}],hasMore:false});
 fireEvent.click(within(dialog).getByRole('button',{name:'Отправить'}));
 expect(await within(dialog).findByText('Уточните сумму')).toBeInTheDocument();
 expect(addCellComment).toHaveBeenCalledWith('session',{table:'test',row:'b',column:'price',context:'2026-10'},'Уточните сумму',expect.any(String));
 expect(within(dialog).getByRole('textbox')).toHaveValue('');
});
test('failed delivery preserves the draft and reuses the same idempotency key on retry',async()=>{
 setup();fireEvent.keyDown(screen.getByText('100'),{key:'Enter',altKey:true});
 const dialog=await screen.findByRole('dialog');await waitFor(()=>expect(within(dialog).getByRole('textbox')).toBeEnabled());
 fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Проверка'}});
 (addCellComment as jest.Mock).mockRejectedValueOnce(new Error('Нет соединения')).mockResolvedValueOnce({comment:{id:'saved'}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Отправить'}));
 expect(await within(dialog).findByRole('alert')).toHaveTextContent('Нет соединения');
 expect(within(dialog).getByRole('textbox')).toHaveValue('Проверка');
 fireEvent.click(within(dialog).getByRole('button',{name:'Отправить'}));
 await waitFor(()=>expect(addCellComment).toHaveBeenCalledTimes(2));
 expect((addCellComment as jest.Mock).mock.calls[0][3]).toBe((addCellComment as jest.Mock).mock.calls[1][3]);
});

test('comments open and send over local-network HTTP without crypto.randomUUID',async()=>{
 Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
 setup();fireEvent.keyDown(screen.getByText('100'),{key:'Enter',altKey:true});
 const dialog=await screen.findByRole('dialog');
 await waitFor(()=>expect(within(dialog).getByRole('textbox')).toBeEnabled());
 fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Комментарий из локальной сети'}});
 (addCellComment as jest.Mock).mockResolvedValue({comment:{id:'saved'}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Отправить'}));
 await waitFor(()=>expect(addCellComment).toHaveBeenCalled());
 expect((addCellComment as jest.Mock).mock.calls[0][3]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

const authoredComment={id:'own',author_id:'me',author_name:'Я',body:'Исходный текст',created_at:'2026-10-22T12:00:00Z',updated_at:'2026-10-22T12:00:00Z',can_edit:true};
test('authors can edit their comment and confirm soft deletion',async()=>{
 (readCellComments as jest.Mock).mockResolvedValue({comments:[authoredComment],hasMore:false});
 setup();fireEvent.keyDown(screen.getByText('100'),{key:'Enter',altKey:true});
 const dialog=await screen.findByRole('dialog');
 fireEvent.click(await within(dialog).findByRole('button',{name:'Редактировать комментарий'}));
 fireEvent.change(within(dialog).getByRole('textbox',{name:'Изменить комментарий'}),{target:{value:'Новый текст'}});
 const changed={...authoredComment,body:'Новый текст',updated_at:'2026-10-22T13:00:00Z'};
 (mutateCellComment as jest.Mock).mockResolvedValue({ok:true,comment:changed});
 (readCellComments as jest.Mock).mockResolvedValue({comments:[changed],hasMore:false});
 fireEvent.click(within(dialog).getByRole('button',{name:'Сохранить'}));
 await waitFor(()=>expect(within(dialog).getByText('Новый текст',{selector:'p'})).toBeInTheDocument());
 await waitFor(()=>expect(within(dialog).getByRole('button',{name:'Удалить комментарий'})).toBeEnabled());
 expect(mutateCellComment).toHaveBeenCalledWith('session',expect.any(Object),authoredComment,'edit','Новый текст');
 fireEvent.click(within(dialog).getByRole('button',{name:'Удалить комментарий'}));
 expect(mutateCellComment).toHaveBeenCalledTimes(1);
 (mutateCellComment as jest.Mock).mockResolvedValue({ok:true});
 (readCellComments as jest.Mock).mockResolvedValue({comments:[],hasMore:false});
 fireEvent.click(within(dialog).getByRole('button',{name:'Да, удалить'}));
 await waitFor(()=>expect(within(dialog).queryByText('Новый текст')).not.toBeInTheDocument());
 expect(mutateCellComment).toHaveBeenLastCalledWith('session',expect.any(Object),changed,'delete',undefined);
});
test('another author has no edit or delete controls',async()=>{
 (readCellComments as jest.Mock).mockResolvedValue({comments:[{...authoredComment,can_edit:false}],hasMore:false});
 setup();fireEvent.keyDown(screen.getByText('100'),{key:'Enter',altKey:true});
 const dialog=await screen.findByRole('dialog');await within(dialog).findByText('Исходный текст');
 expect(within(dialog).queryByRole('button',{name:'Редактировать комментарий'})).not.toBeInTheDocument();
 expect(within(dialog).queryByRole('button',{name:'Удалить комментарий'})).not.toBeInTheDocument();
});
