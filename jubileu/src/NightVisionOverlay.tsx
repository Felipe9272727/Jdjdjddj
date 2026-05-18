/**
 * NightVisionOverlay.tsx — full-screen "night vision" effect.
 *
 * Two pieces:
 *  1. <NightVisionFx> — purely DOM/CSS. Renders a green-tinted layer on top of
 *     the canvas when active. Includes a subtle scanline + grain, plus a
 *     binocular-style vignette (two soft circular masks).
 *  2. <NightVisionLights> — Three.js lights that get mounted ONLY when
 *     active AND the player is on a dark floor. Lifts the ambient + adds a
 *     small green hemisphere fill so the player can actually see.
 *
 * NON-NEGOTIABLES (from MEMORY.md):
 *  - No `<spotLight distance={0}>` while alive (we don't use any here).
 *  - No `useFrame` priority != 0 (we don't use useFrame here).
 *  - Conditional rendering is FINE — lights mount/unmount cleanly.
 *
 * The DOM overlay uses `mix-blend-mode: multiply` so it tints the canvas
 * without obliterating bright spots. The vignette uses radial gradients in
 * an additional layer so the edges fade to black like real NV.
 */

import React from 'react';

interface NightVisionFxProps {
  active: boolean;
}

/**
 * The DOM overlay. Mount this near the top of your fixed HUD tree (above
 * the canvas, below the menus). pointer-events: none.
 */
export const NightVisionFx: React.FC<NightVisionFxProps> = ({ active }) => {
  return (
    <>
      <div
        className="fixed inset-0 z-[18] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          // The green tint. multiply pulls non-green channels down so the
          // image reads as monochrome-green like real Gen-3 NV.
          backgroundColor: 'rgba(0,255,90,0.35)',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        className="fixed inset-0 z-[19] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          // A second pass: small green boost added (not multiplied) so very
          // dark pixels still get a faint glow.
          background:
            'radial-gradient(ellipse at center, rgba(80,255,140,0.18) 0%, rgba(0,140,40,0.12) 45%, rgba(0,60,18,0.45) 85%, rgba(0,30,8,0.85) 100%)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Binocular vignette — two soft circles in the middle, black around */}
      <div
        className="fixed inset-0 z-[20] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background:
            'radial-gradient(ellipse 38% 55% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      {/* Scanlines + grain */}
      {active && (
        <div
          className="fixed inset-0 z-[21] pointer-events-none animate-nv-scan"
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(0,30,15,0.0) 0px, rgba(0,40,15,0.0) 2px, rgba(0,60,25,0.18) 3px, rgba(0,40,15,0.0) 4px)',
            mixBlendMode: 'overlay',
            opacity: 0.6,
          }}
        />
      )}
      {/* Subtle flicker / phosphor breathing */}
      {active && (
        <div
          className="fixed inset-0 z-[22] pointer-events-none animate-nv-breathe"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(120,255,160,0.06) 0%, rgba(0,0,0,0) 60%)',
            mixBlendMode: 'screen',
          }}
        />
      )}
      {/* Top-left HUD chip — "NV ON" indicator */}
      {active && (
        <div
          className="fixed z-[23] pointer-events-none
                     top-[calc(env(safe-area-inset-top,0px)+92px)]
                     left-[calc(env(safe-area-inset-left,0px)+12px)]
                     px-2 py-1 rounded-sm bg-black/70 border border-emerald-400/50
                     text-emerald-300 text-[10px] font-mono tracking-widest
                     shadow-[0_0_12px_rgba(74,222,128,0.45)]"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle animate-pulse" />
          NV ON
        </div>
      )}
      <style>{`
        @keyframes nvScan {
          0%   { transform: translateY(0); }
          100% { transform: translateY(4px); }
        }
        .animate-nv-scan { animation: nvScan 0.25s steps(2) infinite; }
        @keyframes nvBreathe {
          0%, 100% { opacity: 0.6; }
          50%      { opacity: 0.85; }
        }
        .animate-nv-breathe { animation: nvBreathe 3.2s ease-in-out infinite; }
      `}</style>
    </>
  );
};

/**
 * Lights to mount inside the <Canvas> when night vision is on. Boosts
 * ambient + a hemi fill, both tinted green. Designed for Floor 2 (dark
 * underwater cave) — the goal is to make EVERYTHING visible while the
 * green overlay handles the color cast.
 */
interface NightVisionLightsProps {
  active: boolean;
}
export const NightVisionLights: React.FC<NightVisionLightsProps> = ({ active }) => {
  if (!active) return null;
  return (
    <>
      <ambientLight intensity={2.2} color="#a8ffc0" />
      <hemisphereLight intensity={1.0} color="#bfffd0" groundColor="#102a18" />
    </>
  );
};
