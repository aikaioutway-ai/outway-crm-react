import { fireEvent, render, screen } from '@testing-library/react';
import TabHistory from './TabHistory';

test('deleted receipt can be requested and opened from history', () => {
  render(<TabHistory audit={[
    { id:'deleted', action:'payment_delete', field:'payment', userName:'Кассир', createdAt:'2026-10-19', newValue:'{}', oldValue: JSON.stringify({ payment: { amount:500, payment_date:'2026-10-19', receipt_url:'https://example.com/receipt.png' } }) },
    { id:'other', action:'create_family', field:'family', userName:'Менеджер', createdAt:'2026-10-19', oldValue:'{}', newValue:'{}' },
  ]} />);
  fireEvent.click(screen.getByRole('button', {name:'Удалённые чеки'}));
  expect(screen.queryByText('Создана семья')).not.toBeInTheDocument();
  expect(screen.getByText('Платёж удалён')).toBeInTheDocument();
  expect(screen.getByRole('link', {name:'Открыть удалённый чек'})).toHaveAttribute('href','https://example.com/receipt.png');
});
