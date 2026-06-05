/**
 * floor4-dev.tsx — isolated RUNNER for the REAL Floor 4 (the 2D side-scroller).
 *
 * Mounts the SAME component the game uses (Floor4Canvas2D — its own orthographic
 * Canvas + scene + controllable player + touch/keyboard controls). Edit the
 * Floor4* files → shows here AND ships. Only this runner (floor4.html / this file
 * / dev-shot.cjs) is dev-only; the Floor 4 it renders DOES ship.
 *
 * Run:  cd jubileu && npm run dev  →  http://localhost:3000/floor4.html
 * Shot: node dev-shot.cjs floor4.html floor4
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Floor4Canvas2D from './Floor4Canvas2D';

createRoot(document.getElementById('root')!).render(
    <Floor4Canvas2D onExit={() => console.log('[floor4 dev] onExit (would ride back down)')} />,
);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
