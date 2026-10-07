/** floor14-dev.tsx — bancada do ANDAR 14 (`/floor14.html`). `?pular` vai direto para o capacete; `?vitrine` mostra só a entidade. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Floor14 from './Floor14';
import Vitrine from './f14Vitrine';

createRoot(document.getElementById('root')!).render(location.search.includes('vitrine') ? <Vitrine /> : <Floor14 onExit={() => location.reload()} inicio={new URLSearchParams(location.search).get('inicio') ?? undefined} />);
