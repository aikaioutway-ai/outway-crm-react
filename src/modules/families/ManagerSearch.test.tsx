import { act, fireEvent, render, screen } from '@testing-library/react';
import { ManagerSearch } from './ManagerOverview';
import { FamilyListRow } from '../../services/crmV2Service';
import { useFamilySearch } from '../../hooks/useCrmQueries';

jest.mock('../../hooks/useCrmQueries', () => ({ useFamilySearch: jest.fn() }));

beforeEach(() => {
  (useFamilySearch as jest.Mock).mockReturnValue({ data: undefined, isFetching: false, isError: false });
});

const child = (rowId: string, childName: string, status: string, transferNumber: string | null) => ({
  rowId, familyId: 'family-1', branchFilter: 'school-1', childName,
  parentName: 'Родитель', phone: '', secondPhone: '', status, transferNumber,
} as FamilyListRow);

test('keeps siblings selectable and passes the selected child, status and transfer', () => {
  const rows = [child('child-1', 'Иванов Иван', 'active', '1'), child('child-2', 'Иванов Пётр', 'rejected', '2')];
  const onOpenFamily = jest.fn();
  render(<ManagerSearch rows={rows} onOpenFamily={onOpenFamily} />);
  const input = screen.getByPlaceholderText('Поиск: ребёнок, родитель, телефон');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Иванов' } });
  expect(screen.getByText('Иванов Иван')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByText('Иванов Пётр'));
  expect(onOpenFamily).toHaveBeenCalledWith('school-1', 'family-1', 'Иванов Пётр', rows[1]);
});

test('keyboard selection passes the child transfer context', () => {
  const row = child('child-1', 'Иванов Иван', 'active', '1');
  const onOpenFamily = jest.fn();
  render(<ManagerSearch rows={[row]} onOpenFamily={onOpenFamily} />);
  const input = screen.getByPlaceholderText('Поиск: ребёнок, родитель, телефон');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Иван' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onOpenFamily).toHaveBeenCalledWith('school-1', 'family-1', 'Иванов Иван', row);
});

test('without rows the search asks the database and hides schools the employee cannot open', async () => {
  jest.useFakeTimers();
  const allowed = child('child-1', 'Иванов Иван', 'boarded', '1');
  (useFamilySearch as jest.Mock).mockImplementation((text: string) => ({
    data: text === 'иван' ? [{ ...allowed, branchFilter: 'TIS' }, { ...allowed, rowId: 'child-2', branchFilter: 'AES' }] : undefined,
    isFetching: false,
    isError: false,
  }));
  const onOpenFamily = jest.fn();
  render(<ManagerSearch onOpenFamily={onOpenFamily} allowedSchools={['TIS']} />);
  const input = screen.getByPlaceholderText('Поиск: ребёнок, родитель, телефон');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Иван' } });
  expect(screen.getByText('Поиск…')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(250); });
  expect(useFamilySearch).toHaveBeenLastCalledWith('иван', '');
  expect(screen.getAllByText('Иванов Иван')).toHaveLength(1);
  jest.useRealTimers();
});
