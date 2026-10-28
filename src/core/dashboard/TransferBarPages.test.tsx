import { fireEvent, render, screen } from '@testing-library/react';
import TransferBarPages, { transferCellCount } from './TransferBarPages';

function bar(scopeKey = 'AES', selectedKey = '') {
  return <TransferBarPages scopeKey={scopeKey} selectedKey={selectedKey} counts={Array.from({ length: 45 }, (_, i) => i === 15 ? 2 : i === 30 ? 1 : 0)}>
    {Array.from({ length: 45 }, (_, i) => <button key={i}>#{i + 1}</button>)}
    <button>Все</button>
  </TransferBarPages>;
}

test('shows 15 transfers per page and keeps fixed filters across all pages', () => {
  render(bar());
  expect(screen.getByRole('button', { name: '#1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '#16' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Следующие трансферы' }));
  expect(screen.getByRole('button', { name: '#16' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '#30' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Все' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Следующие трансферы' }));
  expect(screen.getByRole('button', { name: '#31' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Следующие трансферы' })).toBeDisabled();
});

test('opens selected transfer page and resets when the school changes', () => {
  const { rerender } = render(bar('AES', '20'));
  expect(screen.getByRole('button', { name: '#20' })).toBeInTheDocument();
  rerender(bar('ABL', ''));
  expect(screen.getByRole('button', { name: '#1' })).toBeInTheDocument();
});

test('a school always shows transfers 1–15, even if a higher number exists in the base', () => {
  expect(transferCellCount([])).toBe(15);
  expect(transferCellCount(['15', null, 'invalid'])).toBe(15);
  expect(transferCellCount(['16'])).toBe(15);
  expect(transferCellCount(['31'])).toBe(15);
  expect(transferCellCount([], '20')).toBe(15);
});
