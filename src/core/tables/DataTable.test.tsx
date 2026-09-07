import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
