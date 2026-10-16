import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './monaco';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/editor.css';
import './styles/agents.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
