import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { FeedbackProvider } from './components/ui/FeedbackProvider';
import { initAutoUpdate, isPublicRoute, removeServiceWorker } from './lib/pwaUpdate';
import './index.css';

// Sistema de auto-atualização instantânea para garçons e salão (cliente só abre a tela pelo link)
if (isPublicRoute(window.location.pathname, window.location.hash)) removeServiceWorker();
else initAutoUpdate();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary area="app">
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
