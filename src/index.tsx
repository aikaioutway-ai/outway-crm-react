import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,        // данные считаются свежими 30 сек
      gcTime: 5 * 60 * 1000,       // кэш хранится 5 минут
      retry: 1,                     // одна попытка повтора при ошибке
      refetchOnWindowFocus: false,  // не перегружать при переключении вкладок браузера
    },
  },
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
