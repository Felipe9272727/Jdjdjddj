/**
 * floor5race-dev.tsx — isolated RUNNER for the REAL Floor 5 (the N64 race).
 *
 * Mounts the SAME component the game uses (Floor5Race3D). Edit the Floor6*
 * files → shows here AND ships. Audio gets its own context on first tap
 * (the game wires the master bus via configureFloor5RaceSfx in App).
 *
 * Run:  cd jubileu && npm run dev  →  http://localhost:3000/floor5race.html
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Floor5Race3D from './Floor5Race3D';
import { configureFloor5RaceSfx } from './floor5RaceSfx';

const arm = () => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctx.resume().catch(() => {});
    configureFloor5RaceSfx(ctx);
    window.removeEventListener('pointerdown', arm);
};
window.addEventListener('pointerdown', arm);

createRoot(document.getElementById('root')!).render(
    <Floor5Race3D onExit={() => console.log('[floor5race dev] onExit (would ride back down)')} />,
);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 200);
