import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  render(
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

  render(
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

test('shows reject next to delete in the row menu', () => {
  const onRowReject = jest.fn();
  const onRowDelete = jest.fn();

  render(
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

test('hides delete in the row menu for rows that cannot be deleted', () => {
  render(
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


test('keeps selections across transfers when selecting and deselecting the current page', () => {
  const onSelectedKeysChange = jest.fn();
  const props = { columns, rowKey: 'id' as const, selectable: true, onSelectedKeysChange, storageKey: 'cross-transfer-selection-test' };
  const { rerender } = render(<DataTable {...props} data={[{ id: 'child-1', paymentMethod: 'cash' }]} selectedKeys={new Set()} />);
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
  render(<DataTable columns={columns} data={[{ id: 'dismiss-1', paymentMethod: 'cash' }]} rowKey="id" onCellSave={onCellSave} storageKey="dismiss-select-test" />);
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
  render(<DataTable columns={[{ key: 'transfer', label: 'Трансфер', type: 'text' }]}
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
