import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// Vite's BASE_URL mirrors the `base` build option (e.g. `/fencing-ai-ref/` on
// GitHub Pages, `/` in dev) — BrowserRouter needs that as its basename or it
// matches routes against the full pathname and 404s on every page.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
