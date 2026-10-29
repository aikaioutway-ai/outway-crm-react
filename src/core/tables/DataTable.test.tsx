import { downloadTableExcel } from './tableExport';
jest.mock('./tableExport', () => ({ downloadTableExcel: jest.fn().mockResolvedValue(undefined) }));
import { act, fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react';
import { DataTable, type ColumnDef } from './DataTable';

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

type PaymentRow = {
  id: string;
  paymentMethod: string;
};

const columns: ColumnDef<PaymentRow>[] = [
  {
    key: 'paymentMethod',
    label: 'Вид оплаты',
    type: 'select',
    editable: true,
    editOptions: [
      { value: 'cash', label: 'Наличные' },
      { value: 'transfer', label: 'АйКай Мбанк' },
    ],
  },
];

test('passes the selected payment method to the cell save handler', async () => {
  const onCellSave = jest.fn().mockResolvedValue(true);

  await render(
    <DataTable
      columns={columns}
      data={[{ id: 'payment-1', paymentMethod: 'cash' }]}
      rowKey="id"
      onCellSave={onCellSave}
      storageKey="payment-method-test"
    />,
  );

  fireEvent.click(screen.getByText('cash'));
  fireEvent.click(await screen.findByRole('option', { name: /АйКай Мбанк/ }));

  await waitFor(() => {
    expect(onCellSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'payment-1' }),
      'paymentMethod',
      'transfer',
    );
  });
});

test('sorts families by the first child and keeps siblings together', async () => {
  type ChildRow = {
    id: string;
    familyId: string;
    childName: string;
    isFirstChild: boolean;
  };
  const childColumns: ColumnDef<ChildRow>[] = [
    { key: 'childName', label: 'Ребёнок', type: 'text' },
  ];

  await render(
    <DataTable
      columns={childColumns}
      data={[
        { id: 'a-1', familyId: 'family-a', childName: 'Зара', isFirstChild: true },
        { id: 'a-2', familyId: 'family-a', childName: 'Алина', isFirstChild: false },
        { id: 'b-1', familyId: 'family-b', childName: 'Борис', isFirstChild: true },
      ]}
      rowKey="id"
      groupByKey="familyId"
      storageKey="family-sort-test"
    />,
  );

  const table = screen.getAllByRole('table').at(-1)!;
  expect(within(table).getByText('Зара')).toBeInTheDocument();
  fireEvent.click(within(table).getByText('Ребёнок'));

  await waitFor(() => {
    const names = within(table).getAllByRole('row')
      .slice(1)
      .map(row => row.textContent ?? '');
    expect(names[0]).toContain('Борис');
    expect(names[1]).toContain('Зара');
    expect(names[2]).toContain('Алина');
  });
});

test('shows reject next to delete in the row menu', async () => {
  const onRowReject = jest.fn();
  const onRowDelete = jest.fn();

  await render(
    <DataTable
      columns={columns}
      data={[{ id: 'family-1', paymentMethod: 'cash' }]}
      rowKey="id"
      onRowReject={onRowReject}
      onRowDelete={onRowDelete}
      storageKey="family-reject-test"
    />,
  );

  const table = screen.getAllByRole('table').at(-1)!;
  fireEvent.contextMenu(within(table).getAllByRole('row')[1]);

  expect(screen.getByRole('button', { name: /Отказ/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Удалить/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Отказ/ }));
  expect(onRowReject).toHaveBeenCalledWith(expect.objectContaining({ id: 'family-1' }));
  expect(onRowDelete).not.toHaveBeenCalled();
});

test('hides delete in the row menu for rows that cannot be deleted', async () => {
  await render(
    <DataTable
      columns={columns}
      data={[{ id: 'family-1_empty', paymentMethod: 'cash' }]}
      rowKey="id"
      onRowDelete={jest.fn()}
      canRowDelete={row => !String(row.id).endsWith('_empty')}
      storageKey="family-delete-guard-test"
    />,
  );

  const table = screen.getAllByRole('table').at(-1)!;
  fireEvent.contextMenu(within(table).getAllByRole('row')[1]);

  expect(screen.queryByRole('button', { name: /Удалить/ })).not.toBeInTheDocument();
});


test('keeps selections across transfers when selecting and deselecting the current page', async () => {
  const onSelectedKeysChange = jest.fn();
  const props = { columns, rowKey: 'id' as const, selectable: true, onSelectedKeysChange, storageKey: 'cross-transfer-selection-test' };
  const { rerender } = await render(<DataTable {...props} data={[{ id: 'child-1', paymentMethod: 'cash' }]} selectedKeys={new Set()} />);
  fireEvent.click(screen.getByTitle('Выбрать всех на странице'));
  expect(onSelectedKeysChange).toHaveBeenLastCalledWith(new Set(['child-1']));
  rerender(<DataTable {...props} data={[{ id: 'child-2', paymentMethod: 'cash' }]} selectedKeys={new Set(['child-1'])} />);
  fireEvent.click(screen.getByTitle('Выбрать всех на странице'));
  expect(onSelectedKeysChange).toHaveBeenLastCalledWith(new Set(['child-1', 'child-2']));
  rerender(<DataTable {...props} data={[{ id: 'child-2', paymentMethod: 'cash' }]} selectedKeys={new Set(['child-1', 'child-2'])} />);
  fireEvent.click(screen.getByTitle('Выбрать всех на странице'));
  expect(onSelectedKeysChange).toHaveBeenLastCalledWith(new Set(['child-1']));
});


test('restores the read-only cell when dismissed without selecting', async () => {
  const onCellSave = jest.fn();
  await render(<DataTable columns={columns} data={[{ id: 'dismiss-1', paymentMethod: 'cash' }]} rowKey="id" onCellSave={onCellSave} storageKey="dismiss-select-test" />);
  fireEvent.click(screen.getByText('cash'));
  expect(await screen.findByRole('listbox')).toBeInTheDocument();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Наличные/ })).not.toBeInTheDocument();
  expect(screen.getByText('cash')).toBeInTheDocument();
  expect(onCellSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('cash'));
  await screen.findByRole('listbox');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByText('cash')).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('sorts transfer numbers numerically even with a number prefix', async () => {
  await render(<DataTable columns={[{ key: 'transfer', label: 'Трансфер', type: 'text' }]}
    data={[{ id: 'a', transfer: '№1' }, { id: 'b', transfer: '№10' }, { id: 'c', transfer: '№2' }]}
    rowKey="id" storageKey="transfer-numeric-sort-test" />);
  const table = screen.getAllByRole('table').at(-1)!;
  fireEvent.click(within(table).getByText('Трансфер'));
  await waitFor(() => {
    const values = within(table).getAllByRole('row').slice(1).map(row => row.textContent ?? '');
    expect(values[0]).toContain('№1');
    expect(values[1]).toContain('№2');
    expect(values[2]).toContain('№10');
  });
});

test('right click offers task creation with the selected row target',async()=>{
  const listener=jest.fn();window.addEventListener('outway-task-compose',listener);
  await render(<DataTable columns={columns} data={[{id:'one',paymentMethod:'cash'}]} rowKey="id" storageKey="task_context_test" getTaskTarget={()=>({type:'school',id:'TIS',label:'TIS'})}/>);
  fireEvent.contextMenu((await screen.findByText('cash')).closest('tr')!,{clientX:100,clientY:100});
  fireEvent.click(screen.getByRole('button',{name:/Поставить задачу/}));
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail:{type:'school',id:'TIS',label:'TIS'}}));
  window.removeEventListener('outway-task-compose',listener);
});

test('does not start editing a protected row',async()=>{
  await render(<DataTable columns={columns} data={[{id:'system-payment',paymentMethod:'cash'}]} rowKey="id" onCellSave={jest.fn()} canEditCell={()=>false}/>);
  fireEvent.click(screen.getByText('cash'));
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  expect(screen.getByText('cash').closest('td')).not.toHaveClass('dt-td--editable');
});

async function render(ui: Parameters<typeof renderBase>[0]) {
 let result!: ReturnType<typeof renderBase>;
 await act(async()=>{result=renderBase(ui);});
 return result;
}

test('header repeat filter includes matches across pages, excludes blanks and resets', async () => {
  const repeatColumns: ColumnDef<{id: string; transfer: string}>[] = [{key: 'transfer', label: 'Трансфер', type: 'text'}];
  const rows = Array.from({length: 24}, (_, index) => ({id: String(index), transfer: index === 0 || index === 23 ? 'Дубль' : `Уникальный ${index}`}));
  rows.push({id: 'empty1', transfer: ''}, {id: 'empty2', transfer: ''});
  await render(<DataTable columns={repeatColumns} data={rows} rowKey="id" storageKey="repeat-test" />);
  fireEvent.contextMenu(screen.getByText('Трансфер'));
  expect(screen.queryByText('Среднее')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitemcheckbox', {name: 'Повторяющиеся значения'}));
  expect(screen.getAllByText('Дубль')).toHaveLength(2);
  expect(screen.queryByText('Уникальный 1')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('2 строк');
  fireEvent.click(screen.getByRole('button', {name: 'Сбросить'}));
  expect(screen.getByText('Уникальный 1')).toBeInTheDocument();
});

test('Excel download contains all filtered rows across pages with readable select labels', async () => {
  const rows = Array.from({length: 25}, (_, index) => ({id: String(index), paymentMethod: 'cash'}));
  await render(<DataTable columns={columns} data={rows} rowKey="id" storageKey="excel-test" />);
  fireEvent.click(screen.getByRole('button', {name:'Скачать таблицу в Excel'}));
  await waitFor(() => expect(downloadTableExcel).toHaveBeenCalledWith(['Вид оплаты'], Array.from({length:25}, () => ['Наличные'])));
});

test('header menu filter narrows text columns and matches select columns by visible label', async () => {
  const filterColumns: ColumnDef<{id: string; name: string; paymentMethod: string}>[] = [
    {key: 'name', label: 'Имя', type: 'text'},
    {key: 'paymentMethod', label: 'Вид оплаты', type: 'select', editOptions: [{value: 'cash', label: 'Наличные'}, {value: 'transfer', label: 'АйКай Мбанк'}]},
  ];
  const rows = [{id: '1', name: 'Айбек', paymentMethod: 'cash'}, {id: '2', name: 'Бакыт', paymentMethod: 'transfer'}, {id: '3', name: 'Айгуль', paymentMethod: 'transfer'}];
  await render(<DataTable columns={filterColumns} data={rows} rowKey="id" storageKey="header-filter-test" />);
  fireEvent.contextMenu(screen.getByText('Имя'));
  fireEvent.click(screen.getByRole('menuitem', {name: 'Фильтр'}));
  fireEvent.change(screen.getByPlaceholderText('Значение'), {target: {value: 'айг'}});
  expect(screen.getByText('Айгуль')).toBeInTheDocument();
  expect(screen.queryByText('Айбек')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Закрыть фильтры'}));
  expect(screen.getByRole('status')).toHaveTextContent('Фильтр · Имя · 1 строк');
  fireEvent.click(screen.getByRole('button', {name: 'Сбросить'}));
  expect(screen.getByText('Айбек')).toBeInTheDocument();

  fireEvent.contextMenu(screen.getByText('Вид оплаты'));
  fireEvent.click(screen.getByRole('menuitem', {name: 'Фильтр'}));
  fireEvent.change(screen.getByDisplayValue('Выберите…'), {target: {value: 'Наличные'}});
  expect(screen.getByText('Айбек')).toBeInTheDocument();
  expect(screen.queryByText('Бакыт')).not.toBeInTheDocument();
});

test('header filter is remembered per table after a reload', async () => {
  localStorage.clear();
  const nameColumns: ColumnDef<{id: string; name: string}>[] = [{key: 'name', label: 'Имя', type: 'text'}];
  const rows = [{id: '1', name: 'Айбек'}, {id: '2', name: 'Бакыт'}];
  const first = await render(<DataTable columns={nameColumns} data={rows} rowKey="id" storageKey="persist-filter-test" />);
  fireEvent.contextMenu(screen.getByText('Имя'));
  fireEvent.click(screen.getByRole('menuitem', {name: 'Фильтр'}));
  fireEvent.change(screen.getByPlaceholderText('Значение'), {target: {value: 'бак'}});
  first.unmount();
  await render(<DataTable columns={nameColumns} data={rows} rowKey="id" storageKey="persist-filter-test" />);
  expect(screen.getByText('Бакыт')).toBeInTheDocument();
  expect(screen.queryByText('Айбек')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Фильтр · Имя · 1 строк');
  fireEvent.click(screen.getByRole('button', {name: 'Сбросить'}));
  expect(localStorage.getItem('dt_filters:persist-filter-test')).toBeNull();
});

test('date filter accepts the on-screen format as well as the stored one', async () => {
  localStorage.clear();
  const dateColumns: ColumnDef<{id: string; name: string; date: string}>[] = [
    {key: 'name', label: 'Имя', type: 'text'},
    {key: 'date', label: 'Дата', type: 'date'},
  ];
  const rows = [{id: '1', name: 'Сентябрь', date: '2026-09-30'}, {id: '2', name: 'Октябрь', date: '2026-10-15T08:00:00+00:00'}];
  await render(<DataTable columns={dateColumns} data={rows} rowKey="id" storageKey="date-filter-test" />);
  fireEvent.contextMenu(screen.getByText('Дата'));
  fireEvent.click(screen.getByRole('menuitem', {name: 'Фильтр'}));
  const input = screen.getByPlaceholderText('дд.мм.гггг');
  fireEvent.change(input, {target: {value: '10.2026'}});
  expect(screen.getByText('Октябрь')).toBeInTheDocument();
  expect(screen.queryByText('Сентябрь')).not.toBeInTheDocument();
  fireEvent.change(screen.getByDisplayValue('∋ содержит'), {target: {value: 'lt'}});
  fireEvent.change(input, {target: {value: '01.10.2026'}});
  expect(screen.getByText('Сентябрь')).toBeInTheDocument();
  expect(screen.queryByText('Октябрь')).not.toBeInTheDocument();
});

test('reports when a header filter or repeat filter is active so paged pages can load every row', async () => {
  localStorage.clear();
  const onActive = jest.fn();
  const nameColumns: ColumnDef<{id: string; name: string}>[] = [{key: 'name', label: 'Имя', type: 'text'}];
  await render(<DataTable columns={nameColumns} data={[{id: '1', name: 'Айбек'}]} rowKey="id" storageKey="active-filter-test" onClientFiltersActiveChange={onActive} />);
  expect(onActive).toHaveBeenLastCalledWith(false);
  fireEvent.contextMenu(screen.getByText('Имя'));
  fireEvent.click(screen.getByRole('menuitem', {name: 'Фильтр'}));
  expect(onActive).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', {name: 'Очистить'}));
  expect(onActive).toHaveBeenLastCalledWith(false);
  fireEvent.contextMenu(screen.getByText('Имя'));
  fireEvent.click(screen.getByRole('menuitemcheckbox', {name: 'Повторяющиеся значения'}));
  expect(onActive).toHaveBeenLastCalledWith(true);
});

test('next page arrow on the last loaded page loads more rows and moves on', async () => {
  const nameColumns: ColumnDef<{id: string; name: string}>[] = [{key: 'name', label: 'Имя', type: 'text'}];
  const firstBatch = Array.from({length: 20}, (_, index) => ({id: String(index), name: `Ребёнок ${index + 1}`}));
  const secondBatch = Array.from({length: 5}, (_, index) => ({id: String(20 + index), name: `Ребёнок ${21 + index}`}));
  const onLoadMore = jest.fn();
  const view = await render(<DataTable columns={nameColumns} data={firstBatch} rowKey="id" storageKey="load-more-test" hasMoreRows onLoadMoreRows={onLoadMore} />);
  expect(screen.getByText('1 / 1+')).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Загрузить следующие записи'));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  await act(async () => { view.rerender(<DataTable columns={nameColumns} data={[...firstBatch, ...secondBatch]} rowKey="id" storageKey="load-more-test" hasMoreRows={false} onLoadMoreRows={onLoadMore} />); });
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
  expect(screen.getByText('Ребёнок 21')).toBeInTheDocument();
});

test('a table with checkboxes still opens the card from the row button', async () => {
  const onRowOpen = jest.fn();
  await render(
    <DataTable
      columns={columns}
      data={[{ id: 'child-1', paymentMethod: 'cash' }]}
      rowKey="id"
      selectable
      selectedKeys={new Set()}
      onSelectedKeysChange={jest.fn()}
      onRowOpen={onRowOpen}
    />,
  );
  fireEvent.click(screen.getByTitle('Открыть карточку'));
  expect(onRowOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'child-1' }));
});

test('an editable date cell opens a date picker with the day and saves it', async () => {
  const onCellSave = jest.fn().mockResolvedValue(true);
  type DateRow = { id: string; boardedAt: string };
  await render(
    <DataTable<DateRow>
      columns={[{ key: 'boardedAt', label: 'Дата посадки', type: 'date', editable: true }]}
      data={[{ id: 'child-1', boardedAt: '2026-10-12T05:21:20.287+00:00' }]}
      rowKey="id"
      onCellSave={onCellSave}
    />,
  );
  fireEvent.click(screen.getByText('2026-10-12T05:21:20.287+00:00'));
  const input = document.querySelector('input.dt-cell-input') as HTMLInputElement;
  expect(input.type).toBe('date');
  expect(input.value).toBe('2026-10-12');
  fireEvent.change(input, { target: { value: '2026-10-20' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(onCellSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'child-1' }), 'boardedAt', '2026-10-20'));
});
