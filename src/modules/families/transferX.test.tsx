import { render, screen } from '@testing-library/react';
import { parseTransferChoice, TRANSFER_X, transferChoiceValue } from './constants';
import TabHistory from './TabHistory';
import TransferNumberBadge from '../../core/dashboard/TransferNumberBadge';

test('transfer picker: Х means refusal, numbers stay numbers, empty means no transfer', () => {
  expect(parseTransferChoice('X')).toBe(TRANSFER_X);
  expect(parseTransferChoice('Х')).toBe(TRANSFER_X);
  expect(parseTransferChoice('7')).toBe(7);
  expect(parseTransferChoice('')).toBeUndefined();
  expect(transferChoiceValue('rejected', '7')).toBe(TRANSFER_X);
  expect(transferChoiceValue('boarded', 7)).toBe('7');
  expect(transferChoiceValue('new', null)).toBe('');
});

test('a refused child shows the Х badge', () => {
  render(<TransferNumberBadge number="X" vehicleType="microbus" />);
  expect(screen.getByTitle('Трансфер Х · отказ')).toHaveTextContent('Х');
});

test('card history shows date, who and "sent to transfer Х" with the old number', () => {
  render(<TabHistory audit={[{
    id: '1', userName: 'Максат', action: 'transfer_x', field: 'child',
    oldValue: JSON.stringify({ child_name: 'Иванов Иван', transfer_number: 7 }),
    newValue: JSON.stringify({ transfer: 'Х' }), createdAt: '2026-10-28T09:00:00Z',
  } as any]} />);
  expect(screen.getByText('Максат')).toBeInTheDocument();
  expect(screen.getByText('Отправлен в трансфер Х')).toBeInTheDocument();
  expect(screen.getByText('Иванов Иван · был № 7')).toBeInTheDocument();
});
