import { isRequestOnBoard, requestStage, requestStageUpdates } from './requestWorkflow';
test('assigned children disappear, rejected unassigned children remain', () => {
  expect(isRequestOnBoard({ status: 'boarded', transferNumber: '2' })).toBe(false);
  expect(isRequestOnBoard({ status: 'new', transferNumber: '3' })).toBe(false);
  expect(isRequestOnBoard({ status: 'rejected', transferNumber: null })).toBe(true);
});
test('waiting requires reason from list and nonblank comment', () => {
  expect(() => requestStageUpdates('waiting')).toThrow();
  expect(() => requestStageUpdates('waiting', 'Нет подходящего ТС', '   ')).toThrow();
  expect(() => requestStageUpdates('waiting', 'unknown', 'Комментарий')).toThrow();
  expect(requestStageUpdates('waiting', 'Нет подходящего ТС', '  Нужен минивэн  ')).toMatchObject({ request_stage: 'waiting', status: 'new', waiting_comment: 'Нужен минивэн' });
});
test('workflow stages remain independent of transfer-driven status', () => {
  expect(requestStage({ status: 'new', requestStage: 'in_work' })).toBe('in_work');
  expect(requestStage({ status: 'rejected', requestStage: 'new' })).toBe('rejected');
  expect(requestStageUpdates('new')).toMatchObject({ status: 'new', waiting_reason: null, waiting_comment: null });
});
