import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import OfficePayrollFields from './OfficePayrollFields';

jest.mock('../../hooks/useCrmQueries', () => ({ useEmployees: () => ({ data: [
  { id: 'active', fullName: 'Работающий', status: 'active', role: 'manager' },
  { id: 'dismissed', fullName: 'Уволенный', status: 'dismissed', role: 'manager' },
], isLoading: false }) }));

test('shows and selects dismissed employees when enabled', () => {
  const onPayees = jest.fn();
  render(<OfficePayrollFields date="2026-11-02" mode="recipient" onDepartment={() => undefined} payees={[]} onPayees={onPayees} periods={[]} onPeriods={() => undefined} />);
  expect(screen.queryByText('Уволенный')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Показать уволенных сотрудников'));
  expect(screen.getByText('Уволенный')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Сумма Уволенный'), { target: { value: '1000' } });
  expect(onPayees).toHaveBeenCalledWith([expect.objectContaining({ id: 'dismissed', amount: 1000 })]);
});
