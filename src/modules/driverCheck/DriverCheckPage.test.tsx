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
    saveDriverCheckMarks: jest.fn(),
    submitDriverCheck: jest.fn(),
  };
});

const mockedService = driverCheckService as jest.Mocked<typeof driverCheckService>;

describe('DriverCheckPage', () => {
  const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('toggles child locally and saves to CRM only upon clicking "Сохранить в CRM"', async () => {
    mockedService.fetchDriverCheckList.mockResolvedValue({
      date: '2026-11-20',
      transfer: { id: 't1', transferNumber: 4, schoolLabel: 'TIS', driverName: 'Азамат' },
      submittedAt: null,
      children: [
        { id: 'c1', childName: 'Алия Ахметова', address: 'ул. Чуй 10', stopOrder: 1, present: false, markedAt: null },
        { id: 'c2', childName: 'Тимур Исаев', address: 'мкр. Джал 15', stopOrder: 2, present: true, markedAt: '2026-11-20T02:10:00Z' },
      ],
    });
    mockedService.saveDriverCheckMarks.mockResolvedValue({
      date: '2026-11-20',
      savedCount: 2,
      savedAt: '2026-11-20T08:55:00Z',
    });

    render(<DriverCheckPage token={token} />);

    expect(await screen.findByText('TIS · Трансфер №4')).toBeInTheDocument();
    expect(screen.getByText('Алия Ахметова')).toBeInTheDocument();
    expect(screen.getByText('ул. Чуй 10')).toBeInTheDocument();
    expect(screen.getByText('Есть: 1 из 2')).toBeInTheDocument();

    const firstRow = screen.getByRole('checkbox', { name: /Алия Ахметова/i });
    expect(firstRow).toHaveAttribute('aria-checked', 'false');

    // Кликаем по ребёнку — отметка меняется мгновенно на экране
    fireEvent.click(firstRow);
    expect(firstRow).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Есть: 2 из 2')).toBeInTheDocument();

    // До нажатия на «Сохранить» запрос на сервер НЕ отправляется!
    expect(mockedService.saveDriverCheckMarks).not.toHaveBeenCalled();

    // Нажимаем «Сохранить в CRM»
    const saveButton = screen.getByRole('button', { name: /Сохранить в CRM/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedService.saveDriverCheckMarks).toHaveBeenCalledWith(token, [
        { childId: 'c1', present: true },
        { childId: 'c2', present: true },
      ]);
    });

    expect(await screen.findByText(/Сверка сохранена в CRM/i)).toBeInTheDocument();
  });

  test('shows error state with retry button when link is invalid', async () => {
    mockedService.fetchDriverCheckList.mockRejectedValue(new Error('Ссылка устарела'));

    render(<DriverCheckPage token={token} />);

    expect(await screen.findByText('Список не открылся')).toBeInTheDocument();
    expect(screen.getByText('Ссылка устарела')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
