import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ExpenseMonths from './ExpenseMonths';

test('starts with summer and then shows two quarters per page', () => {
  const onPeriods = jest.fn();
  render(<ExpenseMonths date="2026-10-30" periods={[]} onPeriods={onPeriods} />);
  expect(screen.getByRole('button', { name: '2026-06' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2026-08' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '2026-09' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Следующие периоды' }));
  expect(screen.getByRole('button', { name: '2026-09' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2027-02' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '2027-02' }));
  expect(onPeriods).toHaveBeenCalledWith(['2027-02']);
  fireEvent.click(screen.getByRole('button', { name: 'Следующие периоды' }));
  expect(screen.getByRole('button', { name: '2027-03' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2027-08' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Следующие периоды' })).toBeDisabled();
});
