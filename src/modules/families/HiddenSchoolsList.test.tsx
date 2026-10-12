import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HiddenSchoolsList from './HiddenSchoolsList';
import { SCHOOL_TIER_2_KEYS } from './constants';

test('hidden schools start collapsed and open their school without changing dashboard tier', () => {
  const onSelectSchool = jest.fn();
  render(<HiddenSchoolsList onSelectSchool={onSelectSchool} />);
  const summary = screen.getByLabelText('Скрытые школы');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(screen.queryByRole('button', { name: 'EDI', hidden: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'BJ', hidden: true }));
  expect(onSelectSchool).toHaveBeenCalledWith('BJ');
  expect(SCHOOL_TIER_2_KEYS).not.toContain('EDI');
});

test('hidden list respects permitted schools', () => {
  const { container } = render(<HiddenSchoolsList onSelectSchool={jest.fn()} allowedSchools={['TIS']} />);
  expect(container).toBeEmptyDOMElement();
});
