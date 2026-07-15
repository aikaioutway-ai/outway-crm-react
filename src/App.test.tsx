import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import App from './App';

test('renders login form', () => {
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
  expect(screen.getByLabelText(/вход в outway crm/i)).toBeInTheDocument();
  expect(screen.getByText('Логин')).toBeInTheDocument();
  expect(screen.getByText('Пароль')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument();
});
