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
  fireEvent.click(await screen.findByRole('button', { name: /АйКай Мбанк/ }));

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
