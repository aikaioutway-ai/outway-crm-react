import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import './index.css';
import App from './App';
import ParentTrackingDemoPage from './modules/parentDemo/ParentTrackingDemoPage';

// Демо-прототип родительского интерфейса живёт на отдельном пути и не заходит
// в основной App (авторизация, sidebar, CRM-разделы) — это самостоятельная
// mobile-first страница для показа макета, без влияния на рабочие модули.
const isParentDemoRoute = window.location.pathname.startsWith('/parent-demo');

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isParentDemoRoute ? <ParentTrackingDemoPage /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>
);
