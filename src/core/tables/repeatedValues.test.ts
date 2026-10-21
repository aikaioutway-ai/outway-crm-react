import { filterRepeatedValues } from './repeatedValues';
test('keeps every repeat, normalizes text, excludes empty placeholders and retains zero', () => {
  const values = [' Foo ', 'foo', 'unique', '', null, undefined, '—', '—', 0, 0];
  expect(filterRepeatedValues(values, value => value)).toEqual([' Foo ', 'foo', 0, 0]);
});
