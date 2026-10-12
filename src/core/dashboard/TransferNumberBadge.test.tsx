import React from 'react';
import { render, screen } from '@testing-library/react';
import TransferNumberBadge from './TransferNumberBadge';
import { VEHICLE_COLOR } from './TransferCell';

test.each(['microbus', 'minivan', 'sedan'])('uses the vehicle color for %s', vehicleType => {
  render(<TransferNumberBadge number="№7, №12" vehicleType={vehicleType} />);
  expect(screen.getByText('7')).toHaveStyle({ background: VEHICLE_COLOR[vehicleType], color: '#fff' });
  expect(screen.getByText('12')).toHaveStyle({ background: VEHICLE_COLOR[vehicleType], color: '#fff' });
});
test('does not invent a transfer number or vehicle type', () => {
  const { rerender } = render(<TransferNumberBadge number={null} vehicleType="sedan" />);
  expect(screen.getByText('—')).toBeInTheDocument();
  rerender(<TransferNumberBadge number="4" vehicleType="" />);
  expect(screen.getByText('4')).toHaveStyle({ background: '#64748B' });
});
