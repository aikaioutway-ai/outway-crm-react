import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SchoolRequestsKanban from './SchoolRequestsKanban';
import { updateV2RequestStage } from '../../services/crmV2Service';
jest.mock('../../hooks/useCrmQueries', () => ({ useFamiliesTable: () => ({ data: [
  { rowId: 'child-1', familyId: 'family-1', branchFilter: 'ABL2', childName: 'Заявка', parentName: 'Родитель', phone: '', status: 'new', transferNumber: null, requestStage: 'new' },
  { rowId: 'child-2', branchFilter: 'ABL2', childName: 'Назначен', status: 'boarded', transferNumber: '2' },
], refetch: jest.fn().mockResolvedValue({}), isPending: false, isError: false }) }));
jest.mock('../../services/crmV2Service', () => ({ updateV2RequestStage: jest.fn().mockResolvedValue(undefined) }));
beforeAll(() => { HTMLDialogElement.prototype.showModal = jest.fn(); });
beforeEach(() => jest.clearAllMocks());
test('requires both waiting details before saving and excludes assigned children', async () => {
  render(<SchoolRequestsKanban schoolKey="ABL2" schoolTier="1.0" onOpen={jest.fn()} />);
  expect(screen.queryByText('Назначен')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Этап заявки Заявка'), { target: { value: 'waiting' } });
  expect(updateV2RequestStage).not.toHaveBeenCalled();
  const save = screen.getByRole('button', { name: 'В ожидание', hidden: true });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Причина ожидания'), { target: { value: 'Нет подходящего ТС' } });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'Нужен минивэн' } });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await waitFor(() => expect(updateV2RequestStage).toHaveBeenCalledWith('child-1', 'new', expect.objectContaining({ request_stage: 'waiting', waiting_reason: 'Нет подходящего ТС', waiting_comment: 'Нужен минивэн' })));
});
