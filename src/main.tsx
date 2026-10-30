import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import './ui/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable');

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
