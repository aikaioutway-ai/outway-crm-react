import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DriverCheckPage from './DriverCheckPage';
import * as driverCheckService from '../../services/driverCheckService';

jest.mock('../../services/driverCheckService', () => {
  const actual = jest.requireActual('../../services/driverCheckService');
  return {
    ...actual,
    fetchDriverCheckList: jest.fn(),
    toggleDriverCheckMark: jest.fn(),
    submitDriverCheck: jest.fn(),
  };
});

const mockedService = driverCheckService as jest.Mocked<typeof driverCheckService>;

describe('DriverCheckPage', () => {
  const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders children list (name + address + checkbox) and toggles checkmark', async () => {
    mockedService.fetchDriverCheckList.mockResolvedValue({
      date: '2026-11-20',
      transfer: { id: 't1', transferNumber: 4, schoolLabel: 'TIS', driverName: 'Азамат' },
      submittedAt: null,
      children: [
        { id: 'c1', childName: 'Алия Ахметова', address: 'ул. Чуй 10', stopOrder: 1, present: false, markedAt: null },
        { id: 'c2', childName: 'Тимур Исаев', address: 'мкр. Джал 15', stopOrder: 2, present: true, markedAt: '2026-11-20T02:10:00Z' },
      ],
    });
    mockedService.toggleDriverCheckMark.mockResolvedValue({
      date: '2026-11-20',
      childId: 'c1',
      present: true,
      markedAt: '2026-11-20T02:15:00Z',
    });

    render(<DriverCheckPage token={token} />);

    expect(await screen.findByText('TIS · Трансфер №4')).toBeInTheDocument();
    expect(screen.getByText('Алия Ахметова')).toBeInTheDocument();
    expect(screen.getByText('ул. Чуй 10')).toBeInTheDocument();
    expect(screen.getByText('Есть: 1 из 2')).toBeInTheDocument();

    const firstRow = screen.getByRole('checkbox', { name: /Алия Ахметова/i });
    expect(firstRow).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(firstRow);

    await waitFor(() => {
      expect(mockedService.toggleDriverCheckMark).toHaveBeenCalledWith(token, 'c1', true);
    });
    expect(firstRow).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Есть: 2 из 2')).toBeInTheDocument();
  });

  test('shows error state with retry button when link is invalid', async () => {
    mockedService.fetchDriverCheckList.mockRejectedValue(new Error('Ссылка устарела'));

    render(<DriverCheckPage token={token} />);

    expect(await screen.findByText('Список не открылся')).toBeInTheDocument();
    expect(screen.getByText('Ссылка устарела')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
