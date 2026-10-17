import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { FeedbackProvider } from './components/ui/FeedbackProvider';
import { registerSW } from 'virtual:pwa-register';
import './index.css';

// Versão nova não recarrega a página na cara do usuário: aplica quando o app
// vai para segundo plano (troca de aba/app) — na próxima abertura já está atualizado.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const apply = () => {
      if (document.visibilityState !== 'hidden') return;
      document.removeEventListener('visibilitychange', apply);
      void updateSW(true);
    };
    document.addEventListener('visibilitychange', apply);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary area="app">
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
