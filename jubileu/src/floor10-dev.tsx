/**
 * Entrada de DEV da bancada do Andar 10 (http://localhost:3000/floor10.html).
 *
 * O conteúdo mora em Floor10Bench.tsx porque a mesma tela também precisa
 * existir no jogo publicado: o build single-file emite só o index.html, então
 * na Vercel a bancada é aberta por `?bancada` em vez de por este arquivo.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Floor10Bench from './Floor10Bench';

createRoot(document.getElementById('root')!).render(
    <StrictMode><Floor10Bench /></StrictMode>,
);
