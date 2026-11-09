import { parseTransferChoice, TRANSFER_SPECIAL_OPTIONS, transferChoiceValue, transferCommentPrompt } from './constants';

test('special transfers go to the bottom in order !, ?, Х', () => {
  expect(TRANSFER_SPECIAL_OPTIONS.map(option => option.label)).toEqual(['!', '?', 'Х']);
});

test('choice values round-trip for numbers, marks and X', () => {
  expect(parseTransferChoice('3')).toBe(3);
  expect(parseTransferChoice('!')).toBe('!');
  expect(parseTransferChoice('?')).toBe('?');
  expect(parseTransferChoice('Х')).toBe('X');
  expect(parseTransferChoice('')).toBeUndefined();
  expect(transferChoiceValue('new', null, 'in_work')).toBe('!');
  expect(transferChoiceValue('new', null, 'waiting')).toBe('?');
  expect(transferChoiceValue('boarded', '4', 'waiting')).toBe('4');
  expect(transferChoiceValue('rejected', null, 'waiting')).toBe('X');
});

test('comment is required for ?, X and any way out of X, not for ! or numbers', () => {
  expect(transferCommentPrompt('new', '!')).toBeNull();
  expect(transferCommentPrompt('new', 5)).toBeNull();
  expect(transferCommentPrompt('new', undefined)).toBeNull();
  expect(transferCommentPrompt('new', '?')).toBeTruthy();
  expect(transferCommentPrompt('boarded', 'X')).toBeTruthy();
  expect(transferCommentPrompt('rejected', 'X')).toBeNull();
  expect(transferCommentPrompt('rejected', 5)).toBeTruthy();
  expect(transferCommentPrompt('rejected', undefined)).toBeTruthy();
  expect(transferCommentPrompt('rejected', '!')).toBeTruthy();
});

import { optimisticTransferPatch } from './familiesRowHelpers';
test('the table shows the choice instantly, before the database answers', () => {
  expect(optimisticTransferPatch({ status: 'new' }, 3)).toMatchObject({ status: 'boarded', transferNumber: '3', transferMark: null });
  expect(optimisticTransferPatch({ status: 'new' }, '?', 'Ждём', 'Асылбек')).toMatchObject({ status: 'new', transferMark: 'waiting', transferComment: 'Ждём', transferCommentBy: 'Асылбек' });
  expect(optimisticTransferPatch({ status: 'boarded' }, 'X', 'Дорого')).toMatchObject({ status: 'rejected', transferNumber: null });
  expect(optimisticTransferPatch({ status: 'rejected' }, undefined, 'Вернулись')).toMatchObject({ status: 'new', transferNumber: null });
});

import { isRequestOverdue } from './requestWorkflow';
test('red after 2 days in new, 3 in work and 5 in waiting, counted from the move', () => {
  const day = 86400000;
  const now = Date.parse('2026-11-10T12:00:00Z');
  const at = (days: number) => new Date(now - days * day).toISOString();
  const row = (extra: object) => ({ status: 'new', transferNumber: null, transferMark: null, childCreatedAt: at(30), transferMarkAt: null, transferCommentAt: null, ...extra }) as any;
  expect(isRequestOverdue(row({ childCreatedAt: at(1.9) }), now)).toBe(false);
  expect(isRequestOverdue(row({ childCreatedAt: at(2.1) }), now)).toBe(true);
  expect(isRequestOverdue(row({ transferMark: 'in_work', transferMarkAt: at(2.9) }), now)).toBe(false);
  expect(isRequestOverdue(row({ transferMark: 'in_work', transferMarkAt: at(3.1) }), now)).toBe(true);
  expect(isRequestOverdue(row({ transferMark: 'waiting', transferMarkAt: at(4.9) }), now)).toBe(false);
  expect(isRequestOverdue(row({ transferMark: 'waiting', transferMarkAt: at(5.1) }), now)).toBe(true);
  expect(isRequestOverdue(row({ status: 'rejected' }), now)).toBe(false);
  expect(isRequestOverdue(row({ status: 'boarded', transferNumber: '3' }), now)).toBe(false);
});
