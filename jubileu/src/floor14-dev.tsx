/** floor14-dev.tsx — bancada do ANDAR 14 (`/floor14.html`). `?pular` vai direto para o capacete. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Floor14 from './Floor14';

createRoot(document.getElementById('root')!).render(<Floor14 onExit={() => location.reload()} />);
