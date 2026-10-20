import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeleteChildModal from './DeleteChildModal';

test('requires a reason before deleting', () => {
  const onDelete = jest.fn();
  render(<DeleteChildModal childName="Ганыева" familyId="FAM-001903" onClose={jest.fn()} onDelete={onDelete} />);

  fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

  expect(screen.getByText('Укажите причину')).toBeInTheDocument();
  expect(onDelete).not.toHaveBeenCalled();
});

test('deletes with the trimmed reason and closes', async () => {
  const onDelete = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();
  render(<DeleteChildModal childName="Ганыева" familyId="FAM-001903" onClose={onClose} onDelete={onDelete} />);

  fireEvent.change(screen.getByPlaceholderText(/дубль/), { target: { value: '  дубль FAM-001958 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(onDelete).toHaveBeenCalledWith('дубль FAM-001958');
});

test('shows the server refusal and stays open', async () => {
  const onClose = jest.fn();
  render(
    <DeleteChildModal
      childName="Ганыева"
      familyId="FAM-001903"
      onClose={onClose}
      onDelete={jest.fn().mockRejectedValue(new Error('У ребёнка есть оплаченные начисления'))}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText(/дубль/), { target: { value: 'дубль' } });
  fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

  expect(await screen.findByText('У ребёнка есть оплаченные начисления')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});
