import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import AlpineContractApp from './contract/AlpineContractApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AlpineContractApp />
  </StrictMode>
);
