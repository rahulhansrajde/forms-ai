import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { createServices } from './services/forms-ai-services';
import './styles/tokens.css';
import './styles/base.css';
import './styles/motion.css';

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(
    <StrictMode>
      <App services={createServices()} />
    </StrictMode>,
  );
}
