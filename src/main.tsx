import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

import './styles/tokens.css';
import './styles/base.css';
import './styles/experience.css';
import './styles/tv.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root was not found in the document.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
